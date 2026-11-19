// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DrandEvmnet} from "./DrandEvmnet.sol";

/// @notice 交易协议费抽奖。市场和 Core 不调用此合约，奖池故障不影响交易、退款或结算。
/// @dev Keeper 提交可公开复算的历史账本承诺；仅验签和抽取由合约独立验证。
contract ProtocolFeeLottery is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant WEEK = 7 days;
    uint64 public constant REPORT_WINDOW = 12 hours;
    // Unix epoch 是周四零点 UTC。周日 12:00 UTC = 周日 20:00 北京时间。
    uint64 public constant CUTOFF_OFFSET = 3 days + 12 hours;
    uint64 public constant BEACON_LEAD = 15 minutes;
    uint256 public constant MAX_ASSETS = 32;
    uint256 public constant MAX_PROOF_DEPTH = 64;

    struct Round {
        uint64 cutoff;
        uint64 drandRound;
        bytes32 root;
        uint256 totalWeight;
    }

    struct Prize {
        address winner;
        uint64 cutoff;
        uint64 claimDeadline;
    }

    address public immutable keeper;
    address[] public assets;
    mapping(address => bool) public supportedAsset;
    mapping(address => uint256) public unallocated;
    mapping(address => uint256) public prize;
    mapping(address => uint256) public pendingPrize;
    uint64 public lastCutoff;
    Round public pendingRound;
    Prize public activePrize;

    event Deposited(address indexed sender, address indexed token, uint256 amount);
    event DepositSynced(address indexed token, uint256 amount);
    event RoundLocked(uint64 indexed cutoff, uint64 drandRound, bytes32 root, uint256 totalWeight, bytes32 auditDigest);
    event RoundFunded(uint64 indexed cutoff, address indexed token, uint256 amount);
    event RoundExpired(uint64 indexed cutoff);
    event Drawn(uint64 indexed cutoff, address indexed winner, uint64 claimDeadline, uint256 index);
    event Claimed(uint64 indexed cutoff, address indexed winner, address indexed token, uint256 amount);

    constructor(address keeper_, address[] memory assets_) {
        require(keeper_ != address(0), "KEEPER");
        require(assets_.length != 0 && assets_.length <= MAX_ASSETS, "ASSETS");
        keeper = keeper_;
        for (uint256 i; i < assets_.length; ++i) {
            address asset = assets_[i];
            require(asset.code.length != 0 && !supportedAsset[asset], "ASSET");
            supportedAsset[asset] = true;
            assets.push(asset);
        }
    }

    function assetCount() external view returns (uint256) {
        return assets.length;
    }

    /// @notice 使用授权转入，并确认实际到账后记作待分配。
    function deposit(address token, uint256 amount) external nonReentrant {
        require(supportedAsset[token] && amount != 0, "DEPOSIT");
        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        require(asset.balanceOf(address(this)) == beforeBalance + amount, "DEPOSIT_AMOUNT");
        unallocated[token] += amount;
        emit Deposited(msg.sender, token, amount);
    }

    /// @notice 协议费收款方也可直接转入代币，任何人都可以把该到账余额同步到待分配账本。
    function syncDeposits(address token) external nonReentrant returns (uint256 amount) {
        require(supportedAsset[token], "ASSET");
        uint256 accounted = unallocated[token] + prize[token] + pendingPrize[token];
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance >= accounted, "INSOLVENT");
        amount = balance - accounted;
        if (amount != 0) {
            unallocated[token] += amount;
            emit DepositSynced(token, amount);
        }
    }

    function lockRound(
        uint64 cutoff,
        bytes32 root,
        uint256 totalWeight,
        address[] calldata tokens,
        uint256[] calldata fees,
        bytes32 auditDigest
    ) external nonReentrant {
        require(msg.sender == keeper, "KEEPER");
        require(pendingRound.cutoff == 0 && cutoff > lastCutoff, "ROUND");
        require(cutoff % WEEK == CUTOFF_OFFSET && cutoff <= block.timestamp, "CUTOFF");
        require(block.timestamp >= cutoff + REPORT_WINDOW && block.timestamp < _claimDeadline(cutoff), "WINDOW");
        require(root != bytes32(0) && totalWeight != 0 && auditDigest != bytes32(0), "SNAPSHOT");
        require(tokens.length != 0 && tokens.length <= assets.length && tokens.length == fees.length, "FUNDING");

        // 预留确认时间。轮次由锁定交易的链上时间确定，Keeper 无法传入任意轮次后挑结果。
        uint64 drandRound = DrandEvmnet.roundAtOrAfter(uint64(block.timestamp) + BEACON_LEAD);
        require(DrandEvmnet.publicationTime(drandRound) < _claimDeadline(cutoff), "LATE");
        address previous;
        for (uint256 i; i < tokens.length; ++i) {
            address token = tokens[i];
            uint256 fee = fees[i];
            require(token > previous && supportedAsset[token] && fee != 0 && fee <= unallocated[token], "FUNDING");
            previous = token;
            unallocated[token] -= fee;
            pendingPrize[token] = fee;
            emit RoundFunded(cutoff, token, fee);
        }
        lastCutoff = cutoff;
        pendingRound = Round({cutoff: cutoff, drandRound: drandRound, root: root, totalWeight: totalWeight});
        emit RoundLocked(cutoff, drandRound, root, totalWeight, auditDigest);
    }

    /// @notice 方便任何人用公开账本定位证明。真正开奖时仍需验签。
    function drawIndex(bytes calldata signature) external view returns (uint256) {
        Round memory round = pendingRound;
        require(round.cutoff != 0 && signature.length == 64, "ROUND");
        return _drawIndex(round, signature);
    }

    function draw(
        bytes calldata signature,
        address winner,
        uint256 weight,
        bytes32[] calldata siblingHashes,
        uint256[] calldata siblingWeights,
        bool[] calldata siblingOnLeft
    ) external nonReentrant {
        Round memory round = pendingRound;
        require(round.cutoff != 0, "ROUND");
        require(block.timestamp >= DrandEvmnet.publicationTime(round.drandRound), "BEACON_PENDING");
        uint64 deadline = _claimDeadline(round.cutoff);
        require(block.timestamp < deadline, "EXPIRED");
        require(DrandEvmnet.verify(signature, round.drandRound), "SIGNATURE");
        uint256 index = _drawIndex(round, signature);
        _verifyWinner(round, index, winner, weight, siblingHashes, siblingWeights, siblingOnLeft);

        // 这里只转移应领奖权。上一轮已经领出的资产余额为零，未领资产全部交给新得主。
        _mergePendingPrize();
        activePrize = Prize({winner: winner, cutoff: round.cutoff, claimDeadline: deadline});
        delete pendingRound;
        emit Drawn(round.cutoff, winner, deadline, index);
    }

    /// @notice 随机源长期不可用时本轮不能重抽。已经封存的奖金留待下一位得主。
    function expirePending() external nonReentrant {
        uint64 cutoff = pendingRound.cutoff;
        require(cutoff != 0 && block.timestamp >= _claimDeadline(cutoff), "NOT_EXPIRED");
        _mergePendingPrize();
        delete pendingRound;
        emit RoundExpired(cutoff);
    }

    /// @notice 一次可领取部分或全部未领代币，领取失败的资产仍留在账中。
    function claim(address[] calldata tokens) external nonReentrant {
        Prize memory current = activePrize;
        require(msg.sender == current.winner && block.timestamp < current.claimDeadline, "CLAIM");
        require(tokens.length != 0 && tokens.length <= assets.length, "ASSETS");
        for (uint256 i; i < tokens.length; ++i) {
            address token = tokens[i];
            uint256 amount = prize[token];
            require(amount != 0, "PRIZE");
            prize[token] = 0;
            IERC20(token).safeTransfer(current.winner, amount);
            emit Claimed(current.cutoff, current.winner, token, amount);
        }
    }

    function _claimDeadline(uint64 cutoff) private pure returns (uint64) {
        return cutoff + REPORT_WINDOW + WEEK;
    }

    function _mergePendingPrize() private {
        for (uint256 i; i < assets.length; ++i) {
            address token = assets[i];
            prize[token] += pendingPrize[token];
            delete pendingPrize[token];
        }
    }

    function _drawIndex(Round memory round, bytes calldata signature) private view returns (uint256) {
        uint256 word = uint256(keccak256(abi.encode(
            block.chainid, address(this), round.cutoff, round.drandRound, sha256(signature)
        )));
        // 拒绝采样消除简单取模造成的概率偏差。后续样本只由已验证的随机值派生。
        uint256 threshold = (type(uint256).max - round.totalWeight + 1) % round.totalWeight;
        while (word < threshold) {
            word = uint256(keccak256(abi.encode(word)));
        }
        return word % round.totalWeight;
    }

    function _verifyWinner(
        Round memory round,
        uint256 index,
        address winner,
        uint256 weight,
        bytes32[] memory siblingHashes,
        uint256[] memory siblingWeights,
        bool[] memory siblingOnLeft
    ) private pure {
        uint256 depth = siblingHashes.length;
        require(winner != address(0) && weight != 0 && depth <= MAX_PROOF_DEPTH, "PROOF");
        require(depth == siblingWeights.length && depth == siblingOnLeft.length, "PROOF");

        bytes32 node = keccak256(abi.encode(round.cutoff, winner, weight));
        uint256 sum = weight;
        uint256 start;
        for (uint256 i; i < depth; ++i) {
            uint256 siblingWeight = siblingWeights[i];
            require(siblingWeight != 0, "PROOF");
            if (siblingOnLeft[i]) {
                node = keccak256(abi.encode(siblingHashes[i], siblingWeight, node, sum));
                start += siblingWeight;
            } else {
                node = keccak256(abi.encode(node, sum, siblingHashes[i], siblingWeight));
            }
            sum += siblingWeight;
        }
        require(node == round.root && sum == round.totalWeight, "PROOF");
        require(index >= start && index - start < weight, "WINNER");
    }
}
