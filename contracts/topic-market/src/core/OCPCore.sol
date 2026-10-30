// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../interfaces/IOCPCore.sol";
import "../interfaces/ITopicMarket.sol";
import "../interfaces/IEarlyTerminationModule.sol";

/**
 * @title OCPCore
 * @notice 公开质押、全仓罚没退出，以及有保证金的一小时提前终止申请。
 */
contract OCPCore is ReentrancyGuard, IOCPCore {
    using SafeERC20 for IERC20;

    uint256 private constant FEE_INDEX_PRECISION = 1e30;

    IERC20 public immutable override stakeToken;
    uint256 public immutable originalResolutionTime;
    uint256 public immutable override minStake;
    address public immutable factory;
    address public immutable emptySettlementRecipient;
    address public override market;
    address public override marketCoordinator;
    mapping(address => bool) public override isAuthorizedMarket;
    uint256 public immutable createdAt;
    address public permissionlessCreator;
    uint256 public terminatedEarlyAt;
    bool public earlyTerminationEnabled;
    bytes32 public terminationReasonHash;

    struct StakeInfo {
        uint256 yes;
        uint256 no;
        uint256 invalid;
    }
    mapping(address => StakeInfo) private _stakeOf;
    mapping(address => bool) private _claimed;
    mapping(address => bool) private _marketFeeClaimed;
    // 每套结果条件账独立保存上次指数和已赚的小数余量。不能用新本金乘旧累计指数，
    // 再减向下取整的debt：晚加入/追加会把历史小数误变成新的整数奖励。
    struct FeeHistory {
        uint256 yesIndex;
        uint256 noIndex;
        uint256 invalidIndex;
        uint256 yesRemainder;
        uint256 noRemainder;
        uint256 invalidRemainder;
    }
    mapping(address => FeeHistory) private _feeHistory;
    mapping(address => uint256) private _pendingYesFees;
    mapping(address => uint256) private _pendingNoFees;
    mapping(address => uint256) private _pendingInvalidFees;
    uint256[3] private _totalStakeBySide;
    uint256[3] private _participantCountBySide;
    uint256 private _totalPrincipal;
    uint256 private _totalParticipants;
    // 退出罚金和失败申请保证金没有投票权；不能把这些余额计入totalPrincipal。
    uint256 public exitPenaltyPool;
    uint256 public failedProposalBondPool;
    uint256 public settledPenaltyAmount;
    uint256[3] public forfeitedMarketFees;
    uint256[3] public forfeitedFeeRemainders;
    uint256 public historicalFeePoolRemaining;
    uint256 public forfeitedBonusPool;
    uint256 public forfeitedBonusPoolRemaining;
    address public override earlyTerminationModule;
    // 真实保证金债务由Core独立记账，不从模块余额或其pending字段推算。
    uint256 public pendingBondEscrow;
    uint256 public immutable override earlyTerminationBondAmount;
    mapping(address => uint256) public override claimableEarlyBond;
    uint256 public totalEarlyBondRefunds;

    bool public override resolved;
    Outcome public override outcome;
    uint256 public remainingEligibleClaims;
    uint256 public settlementPool;
    uint256 public remainingSettlementPool;
    bool public override settlementReady;
    uint256 public override marketFeesInSettlementPool;
    uint256 public emptySettlementClaimable;

    uint256 public accYesFeePerStake;
    uint256 public accNoFeePerStake;
    uint256 public accInvalidFeePerStake;
    uint256 public distributedYesMarketFees;
    uint256 public distributedNoMarketFees;
    uint256 public distributedInvalidMarketFees;
    uint256 public override totalMarketFeesAccrued;
    uint256 public override marketFeeUserPoolRemaining;
    uint256 public override officialMarketFeesClaimable;
    uint256 public remainingMarketFeeClaims;

    event Staked(address indexed user, Side indexed side, uint256 amount, uint256 totalAmount);
    event Finalized(Outcome outcome, uint256 totalYes, uint256 totalNo, uint256 totalInvalid);
    event MarketBound(address indexed market);
    event MarketCoordinatorSet(address indexed coordinator);
    event AdditionalMarketAuthorized(address indexed market);
    event PermissionlessConfigurationSet(address indexed creator, bool earlyTerminationEnabled);
    event EarlyTerminationEnabled(address indexed creator);
    event UnlaunchedTopicCancelled(address indexed creator, bytes32 indexed reasonHash);
    event EarlyTerminated(
        address indexed creator,
        uint256 terminatedAt,
        uint256 blockNumber,
        bytes32 indexed reasonHash,
        Outcome outcome,
        uint256 totalYes,
        uint256 totalNo,
        uint256 totalInvalid
    );
    event MarketFeeAccrued(
        uint256 amount,
        uint256 totalYesStake,
        uint256 totalNoStake,
        uint256 accYesFeePerStake,
        uint256 accNoFeePerStake,
        uint256 accInvalidFeePerStake
    );
    event SettlementReady(uint256 settlementPool, uint256 marketFees);
    event EmptySettlementClaimed(address indexed recipient, uint256 amount);
    event MarketFeesClaimed(address indexed user, uint256 amount);
    event OfficialMarketFeesClaimed(address indexed recipient, uint256 amount);
    event SurplusClaimed(address indexed recipient, uint256 amount);
    event Withdrawn(address indexed user, uint256 principalPayout, uint256 marketFeePayout);
    event StakeExited(address indexed user, Side indexed side, uint256 principal, uint256 refund, uint256 penalty);
    event FeeHistoryForfeited(address indexed user, uint256 yesFees, uint256 noFees, uint256 invalidFees);
    event EarlyTerminationProposed(uint256 indexed requestId, address indexed proposer, uint8 requestedOutcome,
        uint256 processAfter, uint256 bond, bytes32 reasonHash);
    event EarlyTerminationProcessed(uint256 indexed requestId, bool accepted, bool regularDeadline,
        Outcome actualOutcome, uint256 refundedBond, uint256 forfeitedBond);
    event EarlyBondClaimed(address indexed user, uint256 amount);
    event EarlyTerminationModuleConfigured(address indexed module);
    event ForfeitedBonusSnapshotted(Outcome outcome, uint256 historicalPool, uint256 bonusPool);

    constructor(
        address factory_,
        address stakeToken_,
        uint256 resolutionTime_,
        uint256 /* legacyMinStake */,
        address emptySettlementRecipient_,
        uint256 earlyBondAmount_
    ) {
        require(factory_ != address(0), "Invalid factory");
        require(stakeToken_ != address(0), "Invalid token");
        require(emptySettlementRecipient_ != address(0), "Invalid empty recipient");
        require(resolutionTime_ > block.timestamp, "Invalid resolutionTime");
        factory = factory_;
        stakeToken = IERC20(stakeToken_);
        originalResolutionTime = resolutionTime_;
        // 保留旧 ABI getter；最低质押机制已移除，任何正数原始单位均可参与。
        minStake = 0;
        // 新第六个构造参数为部署时固定的申请保证金，单位为stakeToken原始单位。
        // 工厂按创建时股票/USD快照换算500U；此处不引入可变价格源或管理员setter。0禁用新申请。
        earlyTerminationBondAmount = earlyBondAmount_;
        emptySettlementRecipient = emptySettlementRecipient_;
        createdAt = block.timestamp;
        outcome = Outcome.PENDING;
    }

    /**
     * @notice Factory 在绑定 Market 前一次性写入 Permissionless 市场的创建者与提前关闭规则。
     * @dev 创建者即时终止路径已禁用；此参数只能为false，提前终止统一走保证金窗口。
     */
    function configurePermissionless(address creator_, bool earlyTerminationEnabled_) external {
        require(msg.sender == factory, "Only factory");
        require(market == address(0), "Market already bound");
        require(permissionlessCreator == address(0), "Already configured");
        require(creator_ != address(0), "Invalid creator");
        permissionlessCreator = creator_;
        require(!earlyTerminationEnabled_, "LEGACY_EARLY_DISABLED");
        earlyTerminationEnabled = false;
        emit PermissionlessConfigurationSet(creator_, false);
    }

    /**
     * @notice 保留旧selector但永久禁用，Factory也不能开启创建者绕过保证金窗口的路径。
     */
    function enableEarlyTermination() external view {
        require(msg.sender == factory, "Only factory");
        revert("LEGACY_EARLY_DISABLED");
    }

    function cancelUnlaunched(bytes32 reasonHash) external nonReentrant {
        require(msg.sender == factory, "Only factory");
        require(permissionlessCreator != address(0), "Not permissionless");
        require(
            market == address(0) || !ITopicMarket(market).isFormalMarket(),
            "Market already launched"
        );
        require(!resolved, "Already finalized");
        require(reasonHash != bytes32(0), "Missing reason");
        outcome = Outcome.INVALID;
        resolved = true;
        emit Finalized(outcome, _totalStakeBySide[0], _totalStakeBySide[1], _totalStakeBySide[2]);
        _snapshotSettlement();
        emit UnlaunchedTopicCancelled(permissionlessCreator, reasonHash);
    }

    /**
     * @notice 旧创建者即时终止接口永久禁用。
     */
    function terminateEarly(bytes32) external pure override {
        revert("LEGACY_EARLY_DISABLED");
    }

    /// @notice 仅创建Adapter在绑定Market之前配置一次；后续无升级或替换入口。
    function configureEarlyTerminationModule(address module) external override {
        require(msg.sender == factory, "Only factory");
        require(market == address(0) && earlyTerminationModule == address(0) && !resolved, "EARLY_MODULE_CONFIG");
        require(module.code.length > 0, "EARLY_MODULE_CODE");
        require(IEarlyTerminationModule(module).core() == address(this), "EARLY_MODULE_CORE");
        require(IEarlyTerminationModule(module).bondAmount() == earlyTerminationBondAmount, "EARLY_MODULE_BOND");
        earlyTerminationModule = module;
        emit EarlyTerminationModuleConfigured(module);
    }

    function pendingEarlyTermination() public view override returns (EarlyTerminationRequest memory request) {
        if (earlyTerminationModule == address(0)) return request;
        return IEarlyTerminationModule(earlyTerminationModule).pending();
    }

    function earlyTerminationRequestCount() external view returns (uint256) {
        if (earlyTerminationModule == address(0)) return 0;
        return IEarlyTerminationModule(earlyTerminationModule).proposalCount();
    }

    function earlyTerminationProcessingDue() public view override returns (bool) {
        EarlyTerminationRequest memory request = pendingEarlyTermination();
        return request.id != 0 && block.timestamp >= request.processAfter;
    }

    function earlyTerminationBondRequired() public view override returns (uint256) {
        return earlyTerminationModule == address(0) ? earlyTerminationBondAmount
            : IEarlyTerminationModule(earlyTerminationModule).bondRequired();
    }

    /// @dev 窗口到期后先锁住所有影响投票/历史费的操作。处理者必须另发process交易，
    /// 不能在stake中先成功结算又revert：那会把结算一并回滚、使申请永远不能落地。
    function _requirePendingProcessed() private view {
        require(!earlyTerminationProcessingDue(), "PROCESS_EARLY_REQUEST");
    }

    function _requireStakingOpen() private view {
        require(!resolved, "Already finalized");
        require(block.timestamp < originalResolutionTime, "Staking ended");
        _requirePendingProcessed();
        require(permissionlessCreator == address(0)
            || (market != address(0) && ITopicMarket(market).isFormalMarket()), "Staking not open");
    }

    function proposeEarlyTermination(uint8 requestedOutcome, bytes32 reasonHash)
        external override nonReentrant returns (uint256 requestId)
    {
        require(earlyTerminationModule != address(0), "EARLY_MODULE_UNCONFIGURED");
        _requireStakingOpen();
        require(pendingBondEscrow == 0, "EARLY_PENDING");
        address proposer = _actor();
        uint256 expectedBond = earlyTerminationBondRequired();
        EarlyTerminationRequest memory request = IEarlyTerminationModule(earlyTerminationModule).propose(
            proposer, requestedOutcome, reasonHash
        );
        // 模块负责申请规则；Core再次核对返回的资金/时间边界，不接受模块指定的终局结果。
        require(request.id != 0 && request.proposer == proposer && request.requestedOutcome == requestedOutcome
            && request.reasonHash == reasonHash && request.proposedAt == block.timestamp
            && request.processAfter > block.timestamp
            && request.processAfter < originalResolutionTime, "EARLY_REQUEST_CONFIG");
        require(request.bond > 0 && request.bond == expectedBond, "EARLY_BOND_CONFIG");
        uint256 beforeBalance = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(msg.sender, address(this), request.bond);
        require(stakeToken.balanceOf(address(this)) - beforeBalance == request.bond, "Transfer mismatch");
        pendingBondEscrow = request.bond;
        requestId = request.id;
        _assertVaultSolvent();
        emit EarlyTerminationProposed(requestId, proposer, requestedOutcome,
            request.processAfter, request.bond, reasonHash);
    }

    /// @notice Permissionless执行到期申请；Keeper延迟不改变窗口到期的逻辑截止或票数快照。
    function processEarlyTermination() external override nonReentrant returns (bool finalized) {
        require(!resolved, "Already finalized");
        require(earlyTerminationModule != address(0), "EARLY_MODULE_UNCONFIGURED");
        return _processEarlyRequest();
    }

    function _processEarlyRequest() private returns (bool finalized) {
        EarlyTerminationRequest memory request = pendingEarlyTermination();
        require(request.id != 0, "NO_EARLY_REQUEST");
        require(block.timestamp >= request.processAfter, "EARLY_PENDING_WINDOW");
        require(request.processAfter > request.proposedAt
            && request.processAfter < originalResolutionTime, "EARLY_REQUEST_CONFIG");
        require(request.requestedOutcome == 1 || request.requestedOutcome == 2, "EARLY_OUTCOME");
        require(request.proposer != address(0) && request.bond > 0
            && request.bond == pendingBondEscrow, "EARLY_ESCROW_CONFIG");
        EarlyTerminationRequest memory consumed = IEarlyTerminationModule(earlyTerminationModule).consume();
        require(keccak256(abi.encode(consumed)) == keccak256(abi.encode(request)), "EARLY_REQUEST_CHANGED");
        pendingBondEscrow = 0;
        Outcome actual = _deriveOutcome();
        if (uint8(actual) == request.requestedOutcome) {
            // 原子冻结票数和资金；保证金使用独立pull退款债务，避免收款方阻断公共结算。
            claimableEarlyBond[request.proposer] += request.bond;
            totalEarlyBondRefunds += request.bond;
            terminatedEarlyAt = request.processAfter;
            terminationReasonHash = request.reasonHash;
            _finalizeNow();
            emit EarlyTerminated(request.proposer, request.processAfter, block.number, request.reasonHash,
                outcome, _totalStakeBySide[0], _totalStakeBySide[1], _totalStakeBySide[2]);
            emit EarlyTerminationProcessed(request.id, true, false, outcome, request.bond, 0);
            return true;
        }
        failedProposalBondPool += request.bond;
        emit EarlyTerminationProcessed(request.id, false, block.timestamp >= originalResolutionTime,
            actual, 0, request.bond);
        if (block.timestamp >= originalResolutionTime) {
            _finalizeNow();
            return true;
        }
        _assertVaultSolvent();
        return false;
    }

    function claimEarlyTerminationBond() external override nonReentrant returns (uint256 amount) {
        address user = _actor();
        amount = claimableEarlyBond[user];
        require(amount > 0, "NO_BOND_REFUND");
        claimableEarlyBond[user] = 0;
        totalEarlyBondRefunds -= amount;
        stakeToken.safeTransfer(msg.sender, amount);
        _assertVaultSolvent();
        emit EarlyBondClaimed(user, amount);
    }

    function effectiveResolutionTime() public view override returns (uint256) {
        return terminatedEarlyAt == 0 ? originalResolutionTime : terminatedEarlyAt;
    }

    /**
     * 兼容旧接口，但 Permissionless 市场返回实际生效的截止时间。
     */
    function resolutionTime() external view override returns (uint256) {
        return effectiveResolutionTime();
    }

    function bindMarket(address market_) external override {
        require(msg.sender == factory, "Only factory");
        require(!resolved, "Already finalized");
        require(market == address(0), "Market already bound");
        require(market_ != address(0) && market_.code.length > 0, "Invalid market");
        market = market_;
        emit MarketBound(market_);
    }

    /**
     * @notice Factory 可为已毕业 Topic 一次性绑定多池协调器。
     * @dev 协调器只能增加同 Topic 的手续费付款池；它不能修改结果、质押账本或提款。
     */
    function setMarketCoordinator(address coordinator) external override {
        require(msg.sender == factory, "Only factory");
        require(market != address(0), "Market not bound");
        require(marketCoordinator == address(0), "Coordinator already set");
        require(coordinator != address(0) && coordinator.code.length > 0, "Invalid coordinator");
        marketCoordinator = coordinator;
        emit MarketCoordinatorSet(coordinator);
    }

    /**
     * @notice Topic 协调器登记额外 MakerPool，使其可原子缴纳同一 Topic 的 Vault 手续费。
     */
    function authorizeAdditionalMarket(address market_) external override {
        require(msg.sender == marketCoordinator, "Only coordinator");
        require(!resolved, "Already finalized");
        require(market_ != address(0) && market_.code.length > 0, "Invalid market");
        require(market_ != market && !isAuthorizedMarket[market_], "Market already authorized");
        isAuthorizedMarket[market_] = true;
        emit AdditionalMarketAuthorized(market_);
    }

    function protocolVersion() external pure override returns (uint256) {
        return 5;
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
        return resolved || block.timestamp >= effectiveResolutionTime() || earlyTerminationProcessingDue();
    }

    address public trustedForwarder;

    /// @dev Only the creating adapter can configure the router, before market binding.
    function setTrustedForwarder(address forwarder) external {
        require(msg.sender == factory && market == address(0) && trustedForwarder == address(0), "FORWARDER_CONFIG");
        require(forwarder.code.length > 0, "FORWARDER_CODE");
        require(forwarder != emptySettlementRecipient, "FORWARDER_RECIPIENT");
        trustedForwarder = forwarder;
    }

    function isTrustedForwarder(address forwarder) external view returns (bool) {
        return forwarder != address(0) && forwarder == trustedForwarder;
    }

    /// @dev Identity only: token payer and withdrawal receiver remain raw msg.sender.
    function _actor() private view returns (address actor) {
        actor = msg.sender;
        if (actor == trustedForwarder && msg.data.length >= 20) {
            assembly { actor := shr(96, calldataload(sub(calldatasize(), 20))) }
            require(actor != address(0), "ACTOR");
        }
    }

    function stake(Side side, uint256 amount) external override nonReentrant {
        address actor = _actor();
        _requireStakingOpen();
        require(amount > 0, "Amount must be > 0");
        StakeInfo storage info = _stakeOf[actor];
        (Side currentSide, bool hasPosition) = sideOf(actor);
        require(!hasPosition || currentSide == side, "Position is locked to one side");
        _checkpointMarketFees(actor, info);

        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        require(stakeToken.balanceOf(address(this)) - balanceBefore == amount, "Transfer mismatch");
        uint256 index = uint256(side);
        if (!hasPosition) {
            _participantCountBySide[index] += 1;
            _totalParticipants += 1;
        }
        uint256 newAmount = _userPrincipal(info) + amount;
        _setSideAmount(info, side, newAmount);
        _totalStakeBySide[index] += amount;
        _totalPrincipal += amount;
        emit Staked(actor, side, amount, newAmount);
    }

    function previewExitStake(address user) public view override returns (uint256 refund, uint256 penalty) {
        uint256 principal = _userPrincipal(_stakeOf[user]);
        penalty = Math.ceilDiv(principal, 10);
        refund = principal - penalty;
    }

    /// @notice 仅全仓退出。本金90%直接退回；罚没部分留池，不投票，也不再叠加项目提现费草稿。
    function exitStake() external override nonReentrant returns (uint256 refund, uint256 penalty) {
        _requireStakingOpen();
        address user = _actor();
        StakeInfo storage info = _stakeOf[user];
        uint256 principal = _userPrincipal(info);
        require(principal > 0, "No stake");
        (Side side,) = sideOf(user);
        _checkpointMarketFees(user, info);
        _forfeitUserFees(user);
        (refund, penalty) = previewExitStake(user);
        _totalStakeBySide[uint256(side)] -= principal;
        _participantCountBySide[uint256(side)] -= 1;
        _totalPrincipal -= principal;
        _totalParticipants -= 1;
        exitPenaltyPool += penalty;
        delete _stakeOf[user];
        delete _feeHistory[user];
        _claimed[user] = false;
        _marketFeeClaimed[user] = false;
        if (refund > 0) stakeToken.safeTransfer(msg.sender, refund);
        _assertVaultSolvent();
        emit StakeExited(user, side, principal, refund, penalty);
    }

    function _addForfeited(uint256 index, uint256 whole, uint256 fraction) private {
        uint256 fractions = forfeitedFeeRemainders[index] + fraction;
        forfeitedMarketFees[index] += whole + fractions / FEE_INDEX_PRECISION;
        forfeitedFeeRemainders[index] = fractions % FEE_INDEX_PRECISION;
    }

    function _forfeitUserFees(address user) private {
        FeeHistory storage history = _feeHistory[user];
        // 三个结果账互斥：只在终局选择其中一个，绝不能把三套放弃金额相加当真钱。
        _addForfeited(0, _pendingYesFees[user], history.yesRemainder);
        _addForfeited(1, _pendingNoFees[user], history.noRemainder);
        _addForfeited(2, _pendingInvalidFees[user], history.invalidRemainder);
        emit FeeHistoryForfeited(user, _pendingYesFees[user], _pendingNoFees[user], _pendingInvalidFees[user]);
        delete _pendingYesFees[user];
        delete _pendingNoFees[user];
        delete _pendingInvalidFees[user];
    }

    /**
     * @notice 记录某一笔交易产生的 1.0% Vault 手续费。
     * @dev 本函数从 TopicMarket 原子拉取资金，并按当前质押状态更新三套
     *      互斥条件账。任一步失败都会回滚整笔 PM 交易。
     */
    function depositMarketFee(uint256 amount) external override nonReentrant {
        require(msg.sender == market || isAuthorizedMarket[msg.sender], "Only market");
        require(!resolved && block.timestamp < effectiveResolutionTime(), "Fee accrual ended");
        _requirePendingProcessed();
        if (amount == 0) return;

        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        require(stakeToken.balanceOf(address(this)) - balanceBefore == amount, "Transfer mismatch");

        uint256 totalYes = _totalStakeBySide[0];
        uint256 totalNo = _totalStakeBySide[1];
        uint256 totalEligible = totalYes + totalNo;
        totalMarketFeesAccrued += amount;

        if (totalYes > 0) {
            accYesFeePerStake += Math.mulDiv(amount, FEE_INDEX_PRECISION, totalYes);
            distributedYesMarketFees += amount;
        }
        if (totalNo > 0) {
            accNoFeePerStake += Math.mulDiv(amount, FEE_INDEX_PRECISION, totalNo);
            distributedNoMarketFees += amount;
        }
        if (totalEligible > 0) {
            accInvalidFeePerStake += Math.mulDiv(amount, FEE_INDEX_PRECISION, totalEligible);
            distributedInvalidMarketFees += amount;
        }

        emit MarketFeeAccrued(
            amount, totalYes, totalNo, accYesFeePerStake, accNoFeePerStake, accInvalidFeePerStake
        );
        _assertVaultSolvent();
    }

    function finalize() external override nonReentrant {
        require(!resolved, "Already finalized");
        require(block.timestamp >= originalResolutionTime, "Staking not ended");
        // 申请窗口早于原截止，且窗口后所有变权操作被锁。必须先处理这一更早的快照，
        // 不能由晚执行regular finalize的Keeper抹去原已成立的提前终止。
        if (pendingBondEscrow != 0) {
            if (_processEarlyRequest()) return;
        }
        _finalizeNow();
    }

    function _finalizeNow() private {
        // Genesis 尚未毕业时即使统一 Market 已绑定，也不能执行赢家通吃，
        // 否则最后区块的少量质押就能决定一个从未启动的正式市场；统一按
        // INVALID 退款模式结算本金。普通市场在创建时已经绑定，不受影响。
        bool unlaunched = permissionlessCreator != address(0)
            && (market == address(0) || !ITopicMarket(market).isFormalMarket());
        outcome = unlaunched ? Outcome.INVALID : _deriveOutcome();
        resolved = true;
        emit Finalized(outcome, _totalStakeBySide[0], _totalStakeBySide[1], _totalStakeBySide[2]);

        _snapshotSettlement();
    }

    function withdraw() external override nonReentrant {
        address actor = _actor();
        require(resolved, "Not finalized");
        require(settlementReady, "Settlement not ready");
        require(!_claimed[actor], "Already claimed");
        StakeInfo storage info = _stakeOf[actor];
        uint256 principal = _userPrincipal(info);
        require(principal > 0, "No stake");
        _checkpointMarketFees(actor, info);

        (Side userSide,) = sideOf(actor);
        bool principalEligible = outcome == Outcome.INVALID
            || (outcome == Outcome.YES && userSide == Side.YES)
            || (outcome == Outcome.NO && userSide == Side.NO);
        _claimed[actor] = true;

        uint256 principalPayout;
        if (principalEligible) {
            require(remainingEligibleClaims > 0, "No eligible claims");
            if (remainingEligibleClaims == 1) {
                principalPayout = remainingSettlementPool;
            } else {
                uint256 denominator = outcome == Outcome.INVALID
                    ? _totalPrincipal
                    : _totalStakeBySide[outcome == Outcome.YES ? 0 : 1];
                principalPayout = Math.mulDiv(settlementPool, principal, denominator);
            }
            remainingSettlementPool -= principalPayout;
            remainingEligibleClaims -= 1;
        }

        uint256 marketFeePayout = _claimSelectedMarketFees(actor, userSide);
        emit MarketFeesClaimed(actor, marketFeePayout);
        uint256 payout = principalPayout + marketFeePayout;
        _payWithdrawal(actor, msg.sender, payout);
        _assertVaultSolvent();
        emit Withdrawn(actor, principalPayout, marketFeePayout);
    }

    // 原有结算出金不叠加提现费；中途退出罚金在exitStake独立计算。
    function _payWithdrawal(address, address recipient, uint256 gross) private returns (uint256) {
        if (gross > 0) stakeToken.safeTransfer(recipient, gross);
        return gross;
    }

    function claimEmptySettlement() external override nonReentrant returns (uint256 amount) {
        require(resolved && settlementReady, "Settlement not ready");
        require(_totalPrincipal == 0, "Vault has principal");
        amount = remainingSettlementPool;
        require(amount > 0, "Nothing to claim");
        remainingSettlementPool = 0;
        emptySettlementClaimable = 0;
        stakeToken.safeTransfer(emptySettlementRecipient, amount);
        _assertVaultSolvent();
        emit EmptySettlementClaimed(emptySettlementRecipient, amount);
    }

    /**
     * @notice 任何人都可替合格质押者触发手续费领取，但接收方永远是该质押者。
     * @dev 这保留无限期领取权，同时避免某个不活跃地址阻塞奖励尘埃最终归官方。
     */
    function claimMarketFeesFor(address user)
        external
        override
        nonReentrant
        returns (uint256 amount)
    {
        require(resolved && settlementReady, "Settlement not ready");
        require(!_marketFeeClaimed[user], "Fees already claimed");
        StakeInfo storage info = _stakeOf[user];
        require(_userPrincipal(info) > 0, "No stake");
        (Side userSide,) = sideOf(user);
        require(_isMarketFeeEligible(userSide), "Not fee eligible");

        _checkpointMarketFees(user, info);
        uint256 gross = _claimSelectedMarketFees(user, userSide);
        amount = _payWithdrawal(user, user, gross);
        _assertVaultSolvent();
        emit MarketFeesClaimed(user, gross);
    }

    /// @notice 官方费用仅为既有Core未分配费用，不是市场固定0.3%协议费。
    /// Failed transfers remain claimable and cannot unwind Core/Market finalization.
    function flushOfficialPayments() external override nonReentrant {
        if (!resolved || !settlementReady || gasleft() < 250000) return;
        uint256 amount = officialMarketFeesClaimable;
        if (amount > 0) {
            officialMarketFeesClaimable = 0;
            try this.executeOfficialTransfer{gas: 100000}(amount) {
                emit OfficialMarketFeesClaimed(emptySettlementRecipient, amount);
            } catch { officialMarketFeesClaimable = amount; }
        }
        if (_totalPrincipal == 0 && remainingSettlementPool > 0) {
            amount = remainingSettlementPool;
            remainingSettlementPool = 0;
            emptySettlementClaimable = 0;
            try this.executeOfficialTransfer{gas: 100000}(amount) {
                emit EmptySettlementClaimed(emptySettlementRecipient, amount);
            } catch { remainingSettlementPool = amount; emptySettlementClaimable = amount; }
        }
        _assertVaultSolvent();
    }

    function executeOfficialTransfer(uint256 amount) external {
        require(msg.sender == address(this), "SELF_ONLY");
        uint256 beforeBalance = stakeToken.balanceOf(address(this));
        uint256 beforeRecipient = stakeToken.balanceOf(emptySettlementRecipient);
        stakeToken.safeTransfer(emptySettlementRecipient, amount);
        require(stakeToken.balanceOf(address(this)) + amount == beforeBalance && stakeToken.balanceOf(emptySettlementRecipient) == beforeRecipient + amount, "FEE_EXACT");
    }

    function claimOfficialMarketFees() external override nonReentrant returns (uint256 amount) {
        require(resolved && settlementReady, "Settlement not ready");
        amount = officialMarketFeesClaimable;
        require(amount > 0, "Nothing to claim");
        officialMarketFeesClaimable = 0;
        stakeToken.safeTransfer(emptySettlementRecipient, amount);
        _assertVaultSolvent();
        emit OfficialMarketFeesClaimed(emptySettlementRecipient, amount);
    }

    /**
     * @notice 全部已记录负债清零后，将终局快照之后误转入的代币送往固定官方地址。
     */
    function claimSurplus() external override nonReentrant returns (uint256 amount) {
        require(resolved && settlementReady, "Settlement not ready");
        require(
            remainingSettlementPool == 0 && marketFeeUserPoolRemaining == 0
                && remainingEligibleClaims == 0 && remainingMarketFeeClaims == 0
                && officialMarketFeesClaimable == 0 && totalEarlyBondRefunds == 0,
            "Outstanding liabilities"
        );
        amount = stakeToken.balanceOf(address(this));
        require(amount > 0, "Nothing to claim");
        stakeToken.safeTransfer(emptySettlementRecipient, amount);
        _assertVaultSolvent();
        emit SurplusClaimed(emptySettlementRecipient, amount);
    }

    function conditionalMarketFees(address user)
        public
        view
        override
        returns (uint256 yesFees, uint256 noFees, uint256 invalidFees)
    {
        StakeInfo storage info = _stakeOf[user];
        FeeHistory storage history = _feeHistory[user];
        (uint256 earnedYes,) = _feeGrowth(info.yes, accYesFeePerStake - history.yesIndex, history.yesRemainder);
        (uint256 earnedNo,) = _feeGrowth(info.no, accNoFeePerStake - history.noIndex, history.noRemainder);
        (uint256 earnedInvalid,) = _feeGrowth(
            info.yes + info.no, accInvalidFeePerStake - history.invalidIndex, history.invalidRemainder
        );
        return (_pendingYesFees[user] + earnedYes, _pendingNoFees[user] + earnedNo,
            _pendingInvalidFees[user] + earnedInvalid);
    }

    function claimableMarketFees(address user) external view override returns (uint256 amount) {
        if (!resolved || !settlementReady || _marketFeeClaimed[user]) return 0;
        (Side userSide, bool hasPosition) = sideOf(user);
        if (!hasPosition || !_isMarketFeeEligible(userSide)) return 0;
        // 保留原尾差规则：最后一名合格领取者收走剩余手续费，不转给项目方。
        // 非最后者仍严格按已修复的历史权益领取，合计不会超过实收池。
        if (remainingMarketFeeClaims == 1) return marketFeeUserPoolRemaining;
        (uint256 yesFees, uint256 noFees, uint256 invalidFees) = conditionalMarketFees(user);
        uint256 bonus = _feeBonus(user);
        if (outcome == Outcome.YES) return yesFees + bonus;
        if (outcome == Outcome.NO) return noFees + bonus;
        if (outcome == Outcome.INVALID) return invalidFees + bonus;
        return 0;
    }

    function _feeBonus(address user) private view returns (uint256) {
        if (forfeitedBonusPool == 0) return 0;
        uint256 denominator = outcome == Outcome.INVALID
            ? _totalStakeBySide[0] + _totalStakeBySide[1]
            : _totalStakeBySide[outcome == Outcome.YES ? 0 : 1];
        if (denominator == 0) return 0;
        return Math.mulDiv(forfeitedBonusPool, _userPrincipal(_stakeOf[user]), denominator);
    }

    function _snapshotSettlement() private {
        require(!settlementReady, "Settlement ready");
        uint256 balance = stakeToken.balanceOf(address(this));
        require(pendingBondEscrow == 0, "EARLY_ESCROW_PENDING");
        require(balance >= totalMarketFeesAccrued + totalEarlyBondRefunds, "Reward escrow missing");
        marketFeesInSettlementPool = totalMarketFeesAccrued;

        uint256 selectedDistributedFees;
        if (outcome == Outcome.YES) {
            selectedDistributedFees = distributedYesMarketFees;
            remainingMarketFeeClaims = _participantCountBySide[0];
        } else if (outcome == Outcome.NO) {
            selectedDistributedFees = distributedNoMarketFees;
            remainingMarketFeeClaims = _participantCountBySide[1];
        } else {
            selectedDistributedFees = distributedInvalidMarketFees;
            remainingMarketFeeClaims = _participantCountBySide[0] + _participantCountBySide[1];
        }
        require(selectedDistributedFees <= totalMarketFeesAccrued, "Invalid reward ledger");
        uint256 forfeited = forfeitedMarketFees[uint256(outcome) - 1];
        require(forfeited <= selectedDistributedFees, "Invalid forfeited ledger");
        // 放弃的费用来自原手续费池，独立分成按最终本金比例分配的bonus；不重复加钱。
        // INVALID的费用只属于YES/NO，罚没本金/失败bond则属于所有剩余本金。
        if (remainingMarketFeeClaims == 0) {
            selectedDistributedFees = 0;
            forfeited = 0;
        }
        marketFeeUserPoolRemaining = selectedDistributedFees;
        historicalFeePoolRemaining = selectedDistributedFees - forfeited;
        forfeitedBonusPool = forfeited;
        forfeitedBonusPoolRemaining = forfeited;
        officialMarketFeesClaimable = totalMarketFeesAccrued - selectedDistributedFees;
        settledPenaltyAmount = exitPenaltyPool + failedProposalBondPool;
        exitPenaltyPool = 0;
        failedProposalBondPool = 0;
        uint256 principalFunds = balance - totalMarketFeesAccrued - totalEarlyBondRefunds;

        if (_totalPrincipal == 0) {
            emptySettlementClaimable = principalFunds;
            settlementPool = 0;
            remainingSettlementPool = emptySettlementClaimable;
            remainingEligibleClaims = 0;
        } else {
            settlementPool = principalFunds;
            remainingSettlementPool = settlementPool;
            remainingEligibleClaims = outcome == Outcome.INVALID
                ? _totalParticipants
                : _participantCountBySide[outcome == Outcome.YES ? 0 : 1];
        }
        settlementReady = true;
        _assertVaultSolvent();
        emit SettlementReady(settlementPool, totalMarketFeesAccrued);
        emit ForfeitedBonusSnapshotted(outcome, historicalFeePoolRemaining, forfeitedBonusPool);
    }

    function _claimSelectedMarketFees(address user, Side userSide)
        private
        returns (uint256 payout)
    {
        if (_marketFeeClaimed[user]) return 0;
        bool feeEligible = _isMarketFeeEligible(userSide);
        _marketFeeClaimed[user] = true;
        if (!feeEligible) return 0;

        if (remainingMarketFeeClaims == 1) {
            payout = marketFeeUserPoolRemaining;
            historicalFeePoolRemaining = 0;
            forfeitedBonusPoolRemaining = 0;
        } else if (outcome == Outcome.YES) {
            payout = _pendingYesFees[user];
        } else if (outcome == Outcome.NO) {
            payout = _pendingNoFees[user];
        } else {
            payout = _pendingInvalidFees[user];
        }

        if (remainingMarketFeeClaims > 1) {
            require(payout <= historicalFeePoolRemaining, "Historical reward exceeds pool");
            historicalFeePoolRemaining -= payout;
            uint256 bonus = _feeBonus(user);
            require(bonus <= forfeitedBonusPoolRemaining, "Bonus exceeds pool");
            forfeitedBonusPoolRemaining -= bonus;
            payout += bonus;
        }

        require(payout <= marketFeeUserPoolRemaining, "Reward exceeds pool");
        marketFeeUserPoolRemaining -= payout;
        require(remainingMarketFeeClaims > 0, "No reward claims");
        remainingMarketFeeClaims -= 1;
        require(
            remainingMarketFeeClaims > 0 || marketFeeUserPoolRemaining == 0, "Reward dust remains"
        );
    }

    function _isMarketFeeEligible(Side userSide) private view returns (bool) {
        return (outcome == Outcome.YES && userSide == Side.YES)
            || (outcome == Outcome.NO && userSide == Side.NO)
            || (outcome == Outcome.INVALID && userSide != Side.INVALID);
    }

    /// @dev 完整精度计算本段收益，再合并同一用户已赚的小数；本金追加前调用。
    /// mulDiv/mulmod避免stake*indexDelta溢出；全体本段缩放收益不超过实收费用。
    function _feeGrowth(uint256 principal, uint256 indexDelta, uint256 oldRemainder)
        private pure returns (uint256 earned, uint256 remainder)
    {
        earned = Math.mulDiv(principal, indexDelta, FEE_INDEX_PRECISION);
        uint256 fractions = mulmod(principal, indexDelta, FEE_INDEX_PRECISION) + oldRemainder;
        earned += fractions / FEE_INDEX_PRECISION;
        remainder = fractions % FEE_INDEX_PRECISION;
    }

    function _checkpointMarketFees(address user, StakeInfo storage info) private {
        FeeHistory storage history = _feeHistory[user];
        uint256 earned;
        (earned, history.yesRemainder) =
            _feeGrowth(info.yes, accYesFeePerStake - history.yesIndex, history.yesRemainder);
        _pendingYesFees[user] += earned;
        (earned, history.noRemainder) =
            _feeGrowth(info.no, accNoFeePerStake - history.noIndex, history.noRemainder);
        _pendingNoFees[user] += earned;
        (earned, history.invalidRemainder) = _feeGrowth(
            info.yes + info.no, accInvalidFeePerStake - history.invalidIndex, history.invalidRemainder
        );
        _pendingInvalidFees[user] += earned;
        history.yesIndex = accYesFeePerStake;
        history.noIndex = accNoFeePerStake;
        history.invalidIndex = accInvalidFeePerStake;
    }

    function _assertVaultSolvent() private view {
        uint256 required;
        if (settlementReady) {
            required =
                remainingSettlementPool + marketFeeUserPoolRemaining + officialMarketFeesClaimable
                    + totalEarlyBondRefunds;
        } else {
            required = _totalPrincipal + totalMarketFeesAccrued + exitPenaltyPool + failedProposalBondPool
                + pendingBondEscrow + totalEarlyBondRefunds;
        }
        require(stakeToken.balanceOf(address(this)) >= required, "Vault insolvent");
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
