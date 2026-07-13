// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IOCPVault.sol";

/**
 * @title OCPVault
 * @notice 单一公开质押期。每个地址只能选择一个方向，可同侧追加，不可撤回或换边。
 */
contract OCPVault is ReentrancyGuard, IOCPVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable override stakeToken;
    uint256 public immutable override resolutionTime;
    uint256 public immutable override minStake;
    address public immutable factory;

    struct StakeInfo {
        uint256 yes;
        uint256 no;
        uint256 invalid;
    }
    mapping(address => StakeInfo) private _stakeOf;
    mapping(address => bool) private _claimed;
    uint256[3] private _totalStakeBySide;
    uint256[3] private _participantCountBySide;
    uint256 private _totalPrincipal;
    uint256 private _totalParticipants;

    uint256 public override totalDonations;
    bool public override resolved;
    Outcome public override outcome;
    uint256 public remainingEligibleClaims;
    uint256 public settlementPool;

    event Staked(address indexed user, Side indexed side, uint256 amount, uint256 totalAmount);
    event Donated(address indexed from, uint256 amount);
    event Finalized(Outcome outcome, uint256 totalYes, uint256 totalNo, uint256 totalInvalid);
    event Withdrawn(address indexed user, uint256 payout);

    constructor(address factory_, address stakeToken_, uint256 resolutionTime_, uint256 minStake_) {
        require(factory_ != address(0), "Invalid factory");
        require(stakeToken_ != address(0), "Invalid token");
        require(resolutionTime_ > block.timestamp, "Invalid resolutionTime");
        require(minStake_ > 0, "Invalid min stake");
        factory = factory_;
        stakeToken = IERC20(stakeToken_);
        resolutionTime = resolutionTime_;
        minStake = minStake_;
        outcome = Outcome.PENDING;
    }

    function protocolVersion() external pure override returns (uint256) {
        return 4;
    }

    function totalPrincipal() external view override returns (uint256) {
        return _totalPrincipal;
    }

    function totalStakeYes() external view override returns (uint256) {
        return _totalStakeBySide[0];
    }

    function totalStakeNo() external view override returns (uint256) {
        return _totalStakeBySide[1];
    }

    function totalStakeInvalid() external view override returns (uint256) {
        return _totalStakeBySide[2];
    }

    function stakeOf(address user) external view override returns (uint256, uint256, uint256) {
        StakeInfo storage info = _stakeOf[user];
        return (info.yes, info.no, info.invalid);
    }

    function sideOf(address user) public view override returns (Side side, bool hasPosition) {
        StakeInfo storage info = _stakeOf[user];
        if (info.yes > 0) return (Side.YES, true);
        if (info.no > 0) return (Side.NO, true);
        if (info.invalid > 0) return (Side.INVALID, true);
        return (Side.YES, false);
    }

    function canResolve() public view override returns (bool) {
        return resolved || (block.timestamp >= resolutionTime && _totalPrincipal > 0);
    }

    function stake(Side side, uint256 amount) external override nonReentrant {
        require(!resolved, "Already finalized");
        require(block.timestamp < resolutionTime, "Staking ended");
        require(amount >= minStake, "Amount below min stake");

        StakeInfo storage info = _stakeOf[msg.sender];
        (Side currentSide, bool hasPosition) = sideOf(msg.sender);
        require(!hasPosition || currentSide == side, "Position is locked to one side");

        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 index = uint256(side);
        if (!hasPosition) {
            _participantCountBySide[index] += 1;
            _totalParticipants += 1;
        }
        uint256 newAmount = _userPrincipal(info) + amount;
        _setSideAmount(info, side, newAmount);
        _totalStakeBySide[index] += amount;
        _totalPrincipal += amount;
        emit Staked(msg.sender, side, amount, newAmount);
    }

    function donate(uint256 amount) external override nonReentrant {
        require(!resolved, "Already finalized");
        require(block.timestamp < resolutionTime, "Staking ended");
        require(amount > 0, "Amount must be > 0");
        require(_totalPrincipal > 0, "No principal");
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        totalDonations += amount;
        emit Donated(msg.sender, amount);
    }

    function finalize() external override nonReentrant {
        require(!resolved, "Already finalized");
        require(block.timestamp >= resolutionTime, "Staking not ended");
        require(_totalPrincipal > 0, "Empty vault");
        outcome = _deriveOutcome();
        resolved = true;
        settlementPool = stakeToken.balanceOf(address(this));
        remainingEligibleClaims = outcome == Outcome.INVALID
            ? _totalParticipants
            : _participantCountBySide[outcome == Outcome.YES ? 0 : 1];
        emit Finalized(outcome, _totalStakeBySide[0], _totalStakeBySide[1], _totalStakeBySide[2]);
    }

    function withdraw() external override nonReentrant {
        require(resolved, "Not finalized");
        require(!_claimed[msg.sender], "Already claimed");
        StakeInfo storage info = _stakeOf[msg.sender];
        uint256 principal = _userPrincipal(info);
        require(principal > 0, "No stake");

        (Side userSide,) = sideOf(msg.sender);
        bool eligible = outcome == Outcome.INVALID
            || (outcome == Outcome.YES && userSide == Side.YES)
            || (outcome == Outcome.NO && userSide == Side.NO);
        _claimed[msg.sender] = true;

        uint256 payout;
        if (eligible) {
            require(remainingEligibleClaims > 0, "No eligible claims");
            if (remainingEligibleClaims == 1) {
                payout = stakeToken.balanceOf(address(this));
            } else {
                uint256 denominator = outcome == Outcome.INVALID
                    ? _totalPrincipal
                    : _totalStakeBySide[outcome == Outcome.YES ? 0 : 1];
                payout = Math.mulDiv(settlementPool, principal, denominator);
            }
            remainingEligibleClaims -= 1;
        }
        if (payout > 0) stakeToken.safeTransfer(msg.sender, payout);
        emit Withdrawn(msg.sender, payout);
    }

    function _deriveOutcome() private view returns (Outcome) {
        if (_totalStakeBySide[0] > _totalPrincipal - _totalStakeBySide[0]) return Outcome.YES;
        if (_totalStakeBySide[1] > _totalPrincipal - _totalStakeBySide[1]) return Outcome.NO;
        return Outcome.INVALID;
    }

    function _setSideAmount(StakeInfo storage info, Side side, uint256 amount) private {
        info.yes = side == Side.YES ? amount : 0;
        info.no = side == Side.NO ? amount : 0;
        info.invalid = side == Side.INVALID ? amount : 0;
    }

    function _userPrincipal(StakeInfo storage info) private view returns (uint256) {
        return info.yes + info.no + info.invalid;
    }
}
