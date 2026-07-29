// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UD60x18, ud} from "@prb/math/src/UD60x18.sol";

import {IOCPVault} from "../interfaces/IOCPVault.sol";
import {IPredictionMarket} from "../interfaces/IPredictionMarket.sol";

/**
 * @title PredictionMarket
 * @notice 由协议补贴、无需外部 LP 的 50/50 二元 LMSR 预测市场。
 *
 * @dev 核心成本函数：
 *
 *      C(qY,qN) = b * ln(exp(qY / b) + exp(qN / b)) - b * ln(2)
 *
 *      为避免正指数溢出，实际使用稳定形式：
 *
 *      C = max(qY,qN) + b * ln(1 + exp(-abs(qY-qN) / b)) - b * ln(2)
 *
 *      买入成本向上取整，卖出退款向下取整。市场激活时必须锁定至少
 *      ceil(b * ln(2)) 加数值安全缓冲，因而 YES 或 NO 单边终局的
 *      生命周期最坏做市亏损有界。INVALID 固定按每份 0.5 抵押品兑付。
 *
 *      本版本只支持 6 位小数的标准、非重基准、非转账扣税抵押品。
 *      所有入账转账均检查实际余额增量，拒绝名义金额与实际到账不一致的代币。
 */
contract PredictionMarket is ReentrancyGuard, IPredictionMarket {
    using SafeERC20 for IERC20;

    uint256 private constant WAD = 1e18;
    uint256 private constant BPS = 10_000;
    uint256 private constant TOTAL_FEE_BPS = 120;
    uint256 private constant VAULT_FEE_BPS = 100;
    uint256 private constant PROTOCOL_LP_BPS = 20;
    uint256 private constant MATH_BUFFER = 2;
    uint256 private constant MIN_B = 1e6; // 1 USDC
    uint256 private constant MAX_B = 1e15; // 1 billion USDC
    uint256 private constant EXP_CUTOFF = 42e18;
    uint8 private constant SUPPORTED_DECIMALS = 6;

    IOCPVault public immutable vaultContract;
    IERC20 private immutable _collateral;
    address public immutable factory;
    address public immutable officialLiquidityPool;
    uint256 public immutable override liquidityParameter;
    uint256 public immutable override resolutionTime;
    uint256 public immutable initialCostX18;
    uint256 public immutable requiredSubsidy;

    uint8 public immutable override conditionType;
    bytes public override conditionParams;

    bool public activated;
    bool public override resolved;
    Outcome public override outcome;
    address public subsidyProvider;
    uint256 public override subsidy;
    uint256 public override feeEscrow;
    uint256 public pendingProtocolLpFees;
    uint256 public totalVaultFeesPaid;

    mapping(address => uint256) public yesShares;
    mapping(address => uint256) public noShares;
    uint256 public totalYesShares;
    uint256 public totalNoShares;
    uint256 public override totalTradingVolume;

    event MarketActivated(
        address indexed subsidyProvider, uint256 subsidy, uint256 liquidityParameter
    );
    event Trade(
        address indexed trader,
        bool indexed isYes,
        bool indexed isBuy,
        uint256 shares,
        uint256 collateral,
        uint256 fee
    );
    event Redeemed(address indexed user, uint256 yesShares, uint256 noShares, uint256 payout);
    event FeeAccrued(
        address indexed trader,
        uint256 grossCashFlow,
        uint256 totalFee,
        uint256 vaultFee,
        uint256 protocolLpFee
    );
    event VaultFeeDeposited(address indexed vault, uint256 amount);
    event ProtocolLpFeesClaimed(address indexed recipient, uint256 amount);
    event SubsidyWithdrawn(address indexed provider, uint256 amount);

    error AlreadyActivated();
    error AmountZero();
    error CollateralTransferMismatch();
    error DeadlineExpired();
    error FeeTooLarge();
    error InsufficientShares();
    error InvalidCollateral();
    error InvalidLiquidityParameter();
    error InvalidSubsidy();
    error InvalidVault();
    error MarketClosed();
    error MarketNotActivated();
    error FeesNotSettled();
    error NoFees();
    error NoShares();
    error NoWithdrawableSubsidy();
    error NotFactory();
    error NotResolved();
    error NotSubsidyProvider();
    error PositionTooLarge();
    error Slippage();
    error TradeTooSmall();
    error VaultOutcomePending();
    error Insolvent();

    constructor(
        address factory_,
        address vault_,
        address officialLiquidityPool_,
        uint8 conditionType_,
        bytes memory conditionParams_,
        uint256 liquidityParameter_
    ) {
        if (factory_ == address(0) || vault_ == address(0) || vault_.code.length == 0) {
            revert InvalidVault();
        }
        if (officialLiquidityPool_ == address(0)) revert InvalidCollateral();
        if (liquidityParameter_ < MIN_B || liquidityParameter_ > MAX_B) {
            revert InvalidLiquidityParameter();
        }

        IOCPVault boundVault = IOCPVault(vault_);
        IERC20 boundCollateral = boundVault.stakeToken();
        address collateralAddress = address(boundCollateral);
        if (collateralAddress == address(0) || collateralAddress.code.length == 0) {
            revert InvalidCollateral();
        }
        if (IERC20Metadata(collateralAddress).decimals() != SUPPORTED_DECIMALS) {
            revert InvalidCollateral();
        }

        uint256 vaultDeadline = boundVault.resolutionTime();
        if (vaultDeadline <= block.timestamp) revert MarketClosed();

        vaultContract = boundVault;
        _collateral = boundCollateral;
        factory = factory_;
        officialLiquidityPool = officialLiquidityPool_;
        conditionType = conditionType_;
        conditionParams = conditionParams_;
        liquidityParameter = liquidityParameter_;
        resolutionTime = vaultDeadline;

        uint256 baseCostX18 = liquidityParameter_ * _lnTwoWad();
        initialCostX18 = baseCostX18;
        requiredSubsidy = Math.ceilDiv(baseCostX18, WAD) + MATH_BUFFER;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    modifier onlySubsidyProvider() {
        if (msg.sender != subsidyProvider) revert NotSubsidyProvider();
        _;
    }

    modifier beforeUserDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        _;
    }

    modifier whenTrading() {
        if (!activated) revert MarketNotActivated();
        if (
            resolved || vaultContract.resolved() || block.timestamp >= resolutionTime
                || block.timestamp >= vaultContract.resolutionTime()
        ) {
            revert MarketClosed();
        }
        _;
    }

    function vault() external view override returns (address) {
        return address(vaultContract);
    }

    function collateral() external view override returns (address) {
        return address(_collateral);
    }

    function feeBps() external pure override returns (uint256) {
        return TOTAL_FEE_BPS;
    }

    function vaultFeeBps() external pure override returns (uint256) {
        return VAULT_FEE_BPS;
    }

    function protocolLpFeeBps() external pure override returns (uint256) {
        return PROTOCOL_LP_BPS;
    }

    /// @notice 兼容旧前端/监控；新代码应读取 feeEscrow。
    function accruedFees() external view returns (uint256) {
        return feeEscrow;
    }

    /// @notice 兼容旧监控：新版 1.0% 在每笔交易中已原子存入 Vault，因此永远没有待拉取余额。
    function pendingVaultFees() external pure returns (uint256) {
        return 0;
    }

    /**
     * @notice Factory 在同一笔创建交易中注入补贴后激活市场。
     * @dev 激活前余额必须不少于 requiredSubsidy。CREATE 地址可被预计算，若要求
     *      精确相等，攻击者可提前转入 1 个最小单位永久阻断 Factory 的 nonce。
     *      超额预存款作为额外市场补贴，终局后按同一偿付规则返还 subsidyProvider。
     */
    function activate(address subsidyProvider_) external onlyFactory nonReentrant {
        if (activated) revert AlreadyActivated();
        if (subsidyProvider_ == address(0)) revert InvalidSubsidy();
        uint256 balance = _collateral.balanceOf(address(this));
        if (balance < requiredSubsidy) revert InvalidSubsidy();

        subsidyProvider = subsidyProvider_;
        subsidy = balance;
        activated = true;
        _assertSolvent();

        emit MarketActivated(subsidyProvider_, balance, liquidityParameter);
    }

    function getYesNoPrice() external view override returns (uint256 yesPrice, uint256 noPrice) {
        return _prices(totalYesShares, totalNoShares);
    }

    function quoteBuy(bool isYes, uint256 sharesOut)
        public
        view
        override
        returns (uint256 totalCost, uint256 fee)
    {
        if (sharesOut == 0) revert AmountZero();

        uint256 newYes = totalYesShares;
        uint256 newNo = totalNoShares;
        if (isYes) {
            newYes = _checkedPositionAdd(newYes, sharesOut);
        } else {
            newNo = _checkedPositionAdd(newNo, sharesOut);
        }

        uint256 beforeCost = _costX18(totalYesShares, totalNoShares);
        uint256 afterCost = _costX18(newYes, newNo);
        uint256 grossCost = Math.ceilDiv(afterCost - beforeCost, WAD);
        if (grossCost == 0) revert TradeTooSmall();

        fee = Math.mulDiv(grossCost, TOTAL_FEE_BPS, BPS, Math.Rounding.Ceil);
        totalCost = grossCost + fee;
    }

    function quoteSell(bool isYes, uint256 sharesIn)
        public
        view
        override
        returns (uint256 netPayout, uint256 fee)
    {
        if (sharesIn == 0) revert AmountZero();
        uint256 current = isYes ? totalYesShares : totalNoShares;
        if (sharesIn > current) revert InsufficientShares();

        uint256 newYes = totalYesShares;
        uint256 newNo = totalNoShares;
        if (isYes) {
            newYes -= sharesIn;
        } else {
            newNo -= sharesIn;
        }

        uint256 beforeCost = _costX18(totalYesShares, totalNoShares);
        uint256 afterCost = _costX18(newYes, newNo);
        uint256 grossPayout = (beforeCost - afterCost) / WAD;
        if (grossPayout == 0) revert TradeTooSmall();

        fee = Math.mulDiv(grossPayout, TOTAL_FEE_BPS, BPS, Math.Rounding.Ceil);
        if (fee >= grossPayout) revert FeeTooLarge();
        netPayout = grossPayout - fee;
    }

    function buyYes(uint256 sharesOut, uint256 maxTotalCost, uint256 deadline)
        external
        nonReentrant
        whenTrading
        beforeUserDeadline(deadline)
        returns (uint256 totalCost)
    {
        return _buy(true, sharesOut, maxTotalCost);
    }

    function buyNo(uint256 sharesOut, uint256 maxTotalCost, uint256 deadline)
        external
        nonReentrant
        whenTrading
        beforeUserDeadline(deadline)
        returns (uint256 totalCost)
    {
        return _buy(false, sharesOut, maxTotalCost);
    }

    function sellYes(uint256 sharesIn, uint256 minPayout, uint256 deadline)
        external
        nonReentrant
        whenTrading
        beforeUserDeadline(deadline)
        returns (uint256 netPayout)
    {
        return _sell(true, sharesIn, minPayout);
    }

    function sellNo(uint256 sharesIn, uint256 minPayout, uint256 deadline)
        external
        nonReentrant
        whenTrading
        beforeUserDeadline(deadline)
        returns (uint256 netPayout)
    {
        return _sell(false, sharesIn, minPayout);
    }

    function resolve() external nonReentrant {
        if (!activated) revert MarketNotActivated();
        if (!vaultContract.resolved()) {
            vaultContract.finalize();
        }
        _syncOutcomeFromVault();
    }

    /**
     * @notice 一次性赎回调用者的全部 YES/NO 份额。
     * @dev INVALID 固定按每份 0.5 抵押品兑付；按账户合并后向下取整，
     *      避免分批调用改变同一账户的总兑付。
     */
    function redeem() external nonReentrant returns (uint256 payout) {
        if (!resolved) revert NotResolved();

        uint256 userYes = yesShares[msg.sender];
        uint256 userNo = noShares[msg.sender];
        if (userYes == 0 && userNo == 0) revert NoShares();

        yesShares[msg.sender] = 0;
        noShares[msg.sender] = 0;
        totalYesShares -= userYes;
        totalNoShares -= userNo;

        if (outcome == Outcome.YES) {
            payout = userYes;
        } else if (outcome == Outcome.NO) {
            payout = userNo;
        } else if (outcome == Outcome.INVALID) {
            payout = (userYes + userNo) / 2;
        }

        if (payout > 0) {
            _safeTransferOut(msg.sender, payout);
        }
        _assertSolvent();

        emit Redeemed(msg.sender, userYes, userNo, payout);
    }

    function remainingLiability() public view returns (uint256) {
        if (!resolved) {
            return Math.max(totalYesShares, totalNoShares);
        }
        if (outcome == Outcome.YES) return totalYesShares;
        if (outcome == Outcome.NO) return totalNoShares;
        if (outcome == Outcome.INVALID) {
            return Math.ceilDiv(totalYesShares + totalNoShares, 2);
        }
        return 0;
    }

    function claimProtocolLpFees()
        external
        override
        nonReentrant
        returns (uint256 amount)
    {
        if (!vaultContract.settlementReady()) revert FeesNotSettled();
        _syncOutcomeFromVault();
        amount = pendingProtocolLpFees;
        if (amount == 0) revert NoFees();
        pendingProtocolLpFees = 0;
        feeEscrow -= amount;
        _safeTransferOut(officialLiquidityPool, amount);
        _assertSolvent();
        emit ProtocolLpFeesClaimed(officialLiquidityPool, amount);
    }

    /**
     * @notice 解析后，补贴提供方可取走不影响剩余固定兑付责任的超额资金。
     */
    function withdrawSubsidy() external nonReentrant onlySubsidyProvider returns (uint256 amount) {
        if (!resolved) revert NotResolved();
        uint256 balance = _collateral.balanceOf(address(this));
        uint256 reserved = feeEscrow + remainingLiability();
        if (balance <= reserved) revert NoWithdrawableSubsidy();

        amount = balance - reserved;
        _safeTransferOut(subsidyProvider, amount);
        _assertSolvent();
        emit SubsidyWithdrawn(subsidyProvider, amount);
    }

    function _buy(bool isYes, uint256 sharesOut, uint256 maxTotalCost)
        private
        returns (uint256 totalCost)
    {
        uint256 fee;
        (totalCost, fee) = quoteBuy(isYes, sharesOut);
        if (totalCost > maxTotalCost) revert Slippage();

        uint256 balanceBefore = _collateral.balanceOf(address(this));
        _collateral.safeTransferFrom(msg.sender, address(this), totalCost);
        if (_collateral.balanceOf(address(this)) - balanceBefore != totalCost) {
            revert CollateralTransferMismatch();
        }

        if (isYes) {
            totalYesShares = _checkedPositionAdd(totalYesShares, sharesOut);
            yesShares[msg.sender] += sharesOut;
        } else {
            totalNoShares = _checkedPositionAdd(totalNoShares, sharesOut);
            noShares[msg.sender] += sharesOut;
        }
        _accrueFee(msg.sender, totalCost - fee, fee);
        _assertSolvent();

        emit Trade(msg.sender, isYes, true, sharesOut, totalCost, fee);
    }

    function _sell(bool isYes, uint256 sharesIn, uint256 minPayout)
        private
        returns (uint256 netPayout)
    {
        uint256 userShares = isYes ? yesShares[msg.sender] : noShares[msg.sender];
        if (sharesIn > userShares) revert InsufficientShares();

        uint256 fee;
        (netPayout, fee) = quoteSell(isYes, sharesIn);
        if (netPayout < minPayout) revert Slippage();

        if (isYes) {
            yesShares[msg.sender] = userShares - sharesIn;
            totalYesShares -= sharesIn;
        } else {
            noShares[msg.sender] = userShares - sharesIn;
            totalNoShares -= sharesIn;
        }
        _accrueFee(msg.sender, netPayout + fee, fee);
        _safeTransferOut(msg.sender, netPayout);
        _assertSolvent();

        emit Trade(msg.sender, isYes, false, sharesIn, netPayout, fee);
    }

    function _costX18(uint256 qYes, uint256 qNo) private view returns (uint256) {
        uint256 maxQ = Math.max(qYes, qNo);
        uint256 diff = qYes > qNo ? qYes - qNo : qNo - qYes;
        uint256 softplus = _softplusNegativeWad(diff);
        uint256 unnormalized = maxQ * WAD + liquidityParameter * softplus;
        return unnormalized - initialCostX18;
    }

    function _accrueFee(address trader, uint256 grossCashFlow, uint256 totalFee) private {
        // 手续费基数是本笔 LMSR 税前 USDC 资金腿，而不是 shares 名义价值。
        // 同一 gross cash flow 同时进入累计交易量；买入和卖出均按绝对资金腿累计。
        totalTradingVolume += grossCashFlow;
        // 每笔独立计算 Vault 的 1.0%，不使用跨交易 remainder。否则在“按手续费
        // 发生时质押权重计奖”的模型下，前序微额交易会改变本笔奖励归属。
        // 总手续费仍只 ceil 一次；无法分到 1.0% 的最小单位尘埃归官方池。
        uint256 vaultFee = Math.mulDiv(grossCashFlow, VAULT_FEE_BPS, BPS);
        uint256 protocolLpFee = totalFee - vaultFee;
        pendingProtocolLpFees += protocolLpFee;
        feeEscrow += protocolLpFee;
        if (vaultFee > 0) {
            _collateral.safeIncreaseAllowance(address(vaultContract), vaultFee);
            vaultContract.depositMarketFee(vaultFee);
            totalVaultFeesPaid += vaultFee;
            emit VaultFeeDeposited(address(vaultContract), vaultFee);
        }
        emit FeeAccrued(trader, grossCashFlow, totalFee, vaultFee, protocolLpFee);
    }

    function _syncOutcomeFromVault() private {
        if (resolved) return;
        IOCPVault.Outcome vaultOutcome = vaultContract.outcome();
        if (vaultOutcome == IOCPVault.Outcome.YES) {
            outcome = Outcome.YES;
        } else if (vaultOutcome == IOCPVault.Outcome.NO) {
            outcome = Outcome.NO;
        } else if (vaultOutcome == IOCPVault.Outcome.INVALID) {
            outcome = Outcome.INVALID;
        } else {
            revert VaultOutcomePending();
        }
        resolved = true;
        emit Resolved(address(this), outcome);
    }

    function _prices(uint256 qYes, uint256 qNo)
        private
        view
        returns (uint256 yesPrice, uint256 noPrice)
    {
        if (qYes == qNo) return (WAD / 2, WAD / 2);

        uint256 diff = qYes > qNo ? qYes - qNo : qNo - qYes;
        uint256 expNegative = _expNegativeWad(diff);
        uint256 lowPrice = Math.mulDiv(expNegative, WAD, WAD + expNegative);

        if (qYes > qNo) {
            noPrice = lowPrice;
            yesPrice = WAD - noPrice;
        } else {
            yesPrice = lowPrice;
            noPrice = WAD - yesPrice;
        }
    }

    function _softplusNegativeWad(uint256 diff) private view returns (uint256) {
        uint256 expNegative = _expNegativeWad(diff);
        if (expNegative == 0) return 0;
        return UD60x18.unwrap(ud(WAD + expNegative).ln());
    }

    function _expNegativeWad(uint256 diff) private view returns (uint256) {
        if (diff == 0) return WAD;
        uint256 ratio = Math.mulDiv(diff, WAD, liquidityParameter);
        if (ratio >= EXP_CUTOFF) return 0;
        uint256 expPositive = UD60x18.unwrap(ud(ratio).exp());
        return Math.mulDiv(WAD, WAD, expPositive);
    }

    function _lnTwoWad() private pure returns (uint256) {
        return UD60x18.unwrap(ud(2 * WAD).ln());
    }

    function _checkedPositionAdd(uint256 position, uint256 amount)
        private
        pure
        returns (uint256 result)
    {
        result = position + amount;
        if (result > type(uint128).max) revert PositionTooLarge();
    }

    function _assertSolvent() private view {
        if (!activated) return;
        uint256 balance = _collateral.balanceOf(address(this));
        if (balance < feeEscrow) revert Insolvent();
        uint256 required = remainingLiability();
        // 交易期保留数值缓冲；终局确定后只需覆盖已锁定的固定兑付责任。
        if (!resolved) required += MATH_BUFFER;
        if (balance - feeEscrow < required) revert Insolvent();
    }

    function _safeTransferOut(address recipient, uint256 amount) private {
        uint256 beforeBalance = _collateral.balanceOf(address(this));
        _collateral.safeTransfer(recipient, amount);
        if (beforeBalance - _collateral.balanceOf(address(this)) != amount) {
            revert CollateralTransferMismatch();
        }
    }
}
