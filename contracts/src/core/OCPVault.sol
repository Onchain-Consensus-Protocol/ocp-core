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

    uint256 private constant FEE_INDEX_PRECISION = 1e30;

    IERC20 public immutable override stakeToken;
    uint256 public immutable override resolutionTime;
    uint256 public immutable override minStake;
    address public immutable factory;
    address public immutable emptySettlementRecipient;
    address public override market;

    struct StakeInfo {
        uint256 yes;
        uint256 no;
        uint256 invalid;
    }
    mapping(address => StakeInfo) private _stakeOf;
    mapping(address => bool) private _claimed;
    mapping(address => bool) private _marketFeeClaimed;
    mapping(address => uint256) private _yesFeeDebt;
    mapping(address => uint256) private _noFeeDebt;
    mapping(address => uint256) private _invalidFeeDebt;
    mapping(address => uint256) private _pendingYesFees;
    mapping(address => uint256) private _pendingNoFees;
    mapping(address => uint256) private _pendingInvalidFees;
    uint256[3] private _totalStakeBySide;
    uint256[3] private _participantCountBySide;
    uint256 private _totalPrincipal;
    uint256 private _totalParticipants;

    uint256 public override totalDonations;
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
    event Donated(address indexed from, uint256 amount);
    event Finalized(Outcome outcome, uint256 totalYes, uint256 totalNo, uint256 totalInvalid);
    event MarketBound(address indexed market);
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

    constructor(
        address factory_,
        address stakeToken_,
        uint256 resolutionTime_,
        uint256 minStake_,
        address emptySettlementRecipient_
    ) {
        require(factory_ != address(0), "Invalid factory");
        require(stakeToken_ != address(0), "Invalid token");
        require(emptySettlementRecipient_ != address(0), "Invalid empty recipient");
        require(resolutionTime_ > block.timestamp, "Invalid resolutionTime");
        require(minStake_ > 0, "Invalid min stake");
        factory = factory_;
        stakeToken = IERC20(stakeToken_);
        resolutionTime = resolutionTime_;
        minStake = minStake_;
        emptySettlementRecipient = emptySettlementRecipient_;
        outcome = Outcome.PENDING;
    }

    function bindMarket(address market_) external override {
        require(msg.sender == factory, "Only factory");
        require(market == address(0), "Market already bound");
        require(market_ != address(0) && market_.code.length > 0, "Invalid market");
        market = market_;
        emit MarketBound(market_);
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
        return resolved || block.timestamp >= resolutionTime;
    }

    function stake(Side side, uint256 amount) external override nonReentrant {
        require(!resolved, "Already finalized");
        require(block.timestamp < resolutionTime, "Staking ended");
        require(amount >= minStake, "Amount below min stake");

        StakeInfo storage info = _stakeOf[msg.sender];
        (Side currentSide, bool hasPosition) = sideOf(msg.sender);
        require(!hasPosition || currentSide == side, "Position is locked to one side");
        _checkpointMarketFees(msg.sender, info);

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
        _updateMarketFeeDebt(msg.sender, info);
        emit Staked(msg.sender, side, amount, newAmount);
    }

    /**
     * @notice 记录某一笔交易产生的 1.0% Vault 手续费。
     * @dev 本函数从 PredictionMarket 原子拉取资金，并按当前质押状态更新三套
     *      互斥条件账。任一步失败都会回滚整笔 PM 交易。
     */
    function depositMarketFee(uint256 amount) external override nonReentrant {
        require(msg.sender == market, "Only market");
        require(!resolved && block.timestamp < resolutionTime, "Fee accrual ended");
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
            amount,
            totalYes,
            totalNo,
            accYesFeePerStake,
            accNoFeePerStake,
            accInvalidFeePerStake
        );
        _assertVaultSolvent();
    }

    function donate(uint256 amount) external override nonReentrant {
        require(!resolved, "Already finalized");
        require(block.timestamp < resolutionTime, "Staking ended");
        require(amount > 0, "Amount must be > 0");
        require(_totalPrincipal > 0, "No principal");
        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        require(stakeToken.balanceOf(address(this)) - balanceBefore == amount, "Transfer mismatch");
        totalDonations += amount;
        emit Donated(msg.sender, amount);
    }

    function finalize() external override nonReentrant {
        require(!resolved, "Already finalized");
        require(block.timestamp >= resolutionTime, "Staking not ended");
        outcome = _deriveOutcome();
        resolved = true;
        emit Finalized(outcome, _totalStakeBySide[0], _totalStakeBySide[1], _totalStakeBySide[2]);

        _snapshotSettlement();
    }

    function withdraw() external override nonReentrant {
        require(resolved, "Not finalized");
        require(settlementReady, "Settlement not ready");
        require(!_claimed[msg.sender], "Already claimed");
        StakeInfo storage info = _stakeOf[msg.sender];
        uint256 principal = _userPrincipal(info);
        require(principal > 0, "No stake");
        _checkpointMarketFees(msg.sender, info);

        (Side userSide,) = sideOf(msg.sender);
        bool principalEligible = outcome == Outcome.INVALID
            || (outcome == Outcome.YES && userSide == Side.YES)
            || (outcome == Outcome.NO && userSide == Side.NO);
        _claimed[msg.sender] = true;

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

        uint256 marketFeePayout = _claimSelectedMarketFees(msg.sender, userSide);
        emit MarketFeesClaimed(msg.sender, marketFeePayout);
        uint256 payout = principalPayout + marketFeePayout;
        if (payout > 0) stakeToken.safeTransfer(msg.sender, payout);
        _assertVaultSolvent();
        emit Withdrawn(msg.sender, principalPayout, marketFeePayout);
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
        amount = _claimSelectedMarketFees(user, userSide);
        if (amount > 0) stakeToken.safeTransfer(user, amount);
        _assertVaultSolvent();
        emit MarketFeesClaimed(user, amount);
    }

    function claimOfficialMarketFees()
        external
        override
        nonReentrant
        returns (uint256 amount)
    {
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
                && officialMarketFeesClaimable == 0,
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
        yesFees = _pendingYesFees[user]
            + Math.mulDiv(info.yes, accYesFeePerStake, FEE_INDEX_PRECISION) - _yesFeeDebt[user];
        noFees = _pendingNoFees[user]
            + Math.mulDiv(info.no, accNoFeePerStake, FEE_INDEX_PRECISION) - _noFeeDebt[user];
        uint256 eligibleStake = info.yes + info.no;
        invalidFees = _pendingInvalidFees[user]
            + Math.mulDiv(eligibleStake, accInvalidFeePerStake, FEE_INDEX_PRECISION)
            - _invalidFeeDebt[user];
    }

    function claimableMarketFees(address user) external view override returns (uint256 amount) {
        if (!resolved || !settlementReady || _marketFeeClaimed[user]) return 0;
        (uint256 yesFees, uint256 noFees, uint256 invalidFees) = conditionalMarketFees(user);
        if (outcome == Outcome.YES) return yesFees;
        if (outcome == Outcome.NO) return noFees;
        if (outcome == Outcome.INVALID) return invalidFees;
        return 0;
    }

    function _snapshotSettlement() private {
        require(!settlementReady, "Settlement ready");
        uint256 balance = stakeToken.balanceOf(address(this));
        require(balance >= totalMarketFeesAccrued, "Reward escrow missing");
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
            remainingMarketFeeClaims =
                _participantCountBySide[0] + _participantCountBySide[1];
        }
        require(selectedDistributedFees <= totalMarketFeesAccrued, "Invalid reward ledger");
        marketFeeUserPoolRemaining = selectedDistributedFees;
        officialMarketFeesClaimable = totalMarketFeesAccrued - selectedDistributedFees;

        if (_totalPrincipal == 0) {
            emptySettlementClaimable = balance - totalMarketFeesAccrued;
            settlementPool = 0;
            remainingSettlementPool = emptySettlementClaimable;
            remainingEligibleClaims = 0;
        } else {
            settlementPool = balance - totalMarketFeesAccrued;
            remainingSettlementPool = settlementPool;
            remainingEligibleClaims = outcome == Outcome.INVALID
                ? _totalParticipants
                : _participantCountBySide[outcome == Outcome.YES ? 0 : 1];
        }
        settlementReady = true;
        _assertVaultSolvent();
        emit SettlementReady(settlementPool, totalMarketFeesAccrued);
    }

    function _claimSelectedMarketFees(address user, Side userSide)
        private
        returns (uint256 payout)
    {
        if (_marketFeeClaimed[user]) return 0;
        bool feeEligible = _isMarketFeeEligible(userSide);
        _marketFeeClaimed[user] = true;
        if (!feeEligible) return 0;

        if (outcome == Outcome.YES) payout = _pendingYesFees[user];
        else if (outcome == Outcome.NO) payout = _pendingNoFees[user];
        else payout = _pendingInvalidFees[user];

        require(payout <= marketFeeUserPoolRemaining, "Reward exceeds pool");
        marketFeeUserPoolRemaining -= payout;
        require(remainingMarketFeeClaims > 0, "No reward claims");
        remainingMarketFeeClaims -= 1;
        if (remainingMarketFeeClaims == 0 && marketFeeUserPoolRemaining > 0) {
            officialMarketFeesClaimable += marketFeeUserPoolRemaining;
            marketFeeUserPoolRemaining = 0;
        }
    }

    function _isMarketFeeEligible(Side userSide) private view returns (bool) {
        return (outcome == Outcome.YES && userSide == Side.YES)
            || (outcome == Outcome.NO && userSide == Side.NO)
            || (outcome == Outcome.INVALID && userSide != Side.INVALID);
    }

    function _checkpointMarketFees(address user, StakeInfo storage info) private {
        uint256 accumulatedYes =
            Math.mulDiv(info.yes, accYesFeePerStake, FEE_INDEX_PRECISION);
        uint256 accumulatedNo = Math.mulDiv(info.no, accNoFeePerStake, FEE_INDEX_PRECISION);
        uint256 accumulatedInvalid = Math.mulDiv(
            info.yes + info.no, accInvalidFeePerStake, FEE_INDEX_PRECISION
        );
        _pendingYesFees[user] += accumulatedYes - _yesFeeDebt[user];
        _pendingNoFees[user] += accumulatedNo - _noFeeDebt[user];
        _pendingInvalidFees[user] += accumulatedInvalid - _invalidFeeDebt[user];
        _yesFeeDebt[user] = accumulatedYes;
        _noFeeDebt[user] = accumulatedNo;
        _invalidFeeDebt[user] = accumulatedInvalid;
    }

    function _updateMarketFeeDebt(address user, StakeInfo storage info) private {
        _yesFeeDebt[user] = Math.mulDiv(info.yes, accYesFeePerStake, FEE_INDEX_PRECISION);
        _noFeeDebt[user] = Math.mulDiv(info.no, accNoFeePerStake, FEE_INDEX_PRECISION);
        _invalidFeeDebt[user] = Math.mulDiv(
            info.yes + info.no, accInvalidFeePerStake, FEE_INDEX_PRECISION
        );
    }

    function _assertVaultSolvent() private view {
        uint256 required;
        if (settlementReady) {
            required = remainingSettlementPool + marketFeeUserPoolRemaining
                + officialMarketFeesClaimable;
        } else {
            required = _totalPrincipal + totalDonations + totalMarketFeesAccrued;
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
