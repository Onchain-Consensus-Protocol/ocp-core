// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TopicMarketMath} from "./TopicMarketMath.sol";
import {TopicMarketRightsToken} from "./TopicMarketRightsToken.sol";

interface IToken6 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function decimals() external view returns (uint8);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface ITopicMarketCore {
    function depositMarketFee(uint256 amount) external;
    function open(uint64 deadline) external;
    function openedAt() external view returns (uint64);
    function deadline() external view returns (uint64);
    function finalOutcome() external view returns (uint8); // 0 pending,1 YES,2 NO,3 INVALID
}

/// @notice Isolated locked-liquidity prototype with independent transferable LP/B ERC20 rights.
/// @dev No owner upgrades/rescue. Snapshot supplied at construction, NOT an authenticated oracle.
/// Genesis/outcomes remain nontransferable internal ledgers; LP/B are market-specific ERC20s.
contract TopicMarket {
    using Math for uint256;
    address public immutable trustedForwarder;
    uint256 public SCALE; // collateral native units -> outcome WAD
    uint256 public LIMIT; // 1e12 whole collateral-token research bound
    uint256 private curveScale; // native R -> WAD quadratic-curve normalization
    enum Phase {
        GENESIS,
        FORMAL,
        WAIT_CORE,
        SETTLED,
        FAILED
    }
    IToken6 public immutable token;
    ITopicMarketCore public immutable core;
    TopicMarketRightsToken public immutable lpToken;
    TopicMarketRightsToken public immutable bToken;
    uint256 public unmaterializedLP;
    uint256 public bSnapshotWad;
    address public immutable creator;
    address public immutable protocol;
    uint64 public immutable topicCutoff;
    uint64 public immutable coreCutoff;
    uint64 public immutable formalCutoff;
    uint64 public immutable genesisCutoff;
    uint256 public immutable rTarget;
    uint256 public immutable bTarget;
    uint256 public immutable k;
    Phase public phase;
    uint256 private entered = 1;
    uint256 public R;
    uint256 public B;
    uint256 public S;
    mapping(address => uint256) public shares; // Genesis余额；毕业后仅作为尚未物化的LP分配记录
    mapping(address => uint256) public contribution;
    uint256 public totalContribution;
    uint256 public protocolFees;
    uint256 public creatorFees;
    uint256 public dust;
    uint256 public graduationSupply;
    uint256 public initialCollateral;
    uint256 public collateralCash;
    uint256 public liquiditySupply;
    uint256 public poolBasisWad;
    uint256 public bWad;
    uint256 public inventoryY;
    uint256 public inventoryN;
    uint256 public cash;
    uint256 public lpFees;
    uint256 public coreFeesSent;
    uint256 public formalBAccrued; // Formal只增加B资金，不增加Genesis Btoken权重
    uint256 public mergedPairs; // collateral native units: AMM内部merge，双方各烧数量=本值*SCALE
    uint256 public redeemedPairs; // collateral native units: 用户主动完整组合赎回
    struct LiquidityReference {
        uint256 lp; uint256 basis; uint256 depth; uint256 y; uint256 n; uint256 money; uint256 fees;
    }
    struct AddQuote {
        uint256 money; uint256 cashIn; uint256 lpFeeIn; uint256 yesIn; uint256 noIn;
        uint256 basisIn; uint256 depthIn; bool restart;
    }
    LiquidityReference public restartLiquidity;
    bool public liquidityClosed;
    mapping(address => uint256) public yes;
    mapping(address => uint256) public no;
    uint256 public yesSupply;
    uint256 public noSupply;
    uint8 public outcome;
    uint256 public coverPaid;
    uint256 public lpSnapshot;
    uint256 public lpBudgetInitial;
    uint256 public lpBudgetRemaining;
    uint256 public bBudgetInitial;
    uint256 public bBudgetRemaining;
    uint256 public failedRInitial;
    uint256 public failedRRemaining;
    uint256 public failedSupply;
    event LPMaterialized(address indexed account, uint256 amount);
    event GenesisTrade(address indexed user, bool buy, uint256 base, uint256 quantity);
    event Graduated(address indexed trigger, bool buy, uint256 collateral, uint256 reserve);
    event FormalTrade(address indexed user, bool buy, bool isYes, uint256 amount, uint256 base);
    event LiquidityAdded(address indexed user,uint256 lp,uint256 money,uint256 yesIn,uint256 noIn,bool restart);
    event Exited(address indexed user, uint256 lp, uint256 money, uint256 yesOut, uint256 noOut);
    event Closed(Phase phase);
    event PairsMerged(uint256 cashReleased, uint256 tokensBurned);
    event PairsRedeemed(address indexed user, uint256 cashReleased, uint256 tokensBurned);
    event CoreFeeSent(uint256 amount);
    event Finalized(uint8 result, uint256 cover, uint256 lpBudget, uint256 bBudget);
    event Claimed(address indexed user, bytes32 kind, uint256 amount); // gross entitlement
    modifier lock() {
        _lockBefore();
        _;
        _lockAfter();
    }
    function _lockBefore() private {
        require(entered == 1, "REENTER");
        entered = 2;
    }
    function _lockAfter() private { entered = 1; }

    constructor(
        IToken6 token_,
        ITopicMarketCore core_,
        address creator_,
        address protocol_,
        uint64 coreEnd_,
        uint256 ethPrice6, // legacy name: collateral native units per ETH, not necessarily 6 decimals
        uint256 kWad
    ) {
        require(
            address(token_) != address(0) && address(core_) != address(0) && creator_ != address(0)
                && protocol_ != address(0),
            "ADDRESS"
        );
        uint8 decimals_ = token_.decimals();
        require(decimals_ >= 6 && decimals_ <= 18, "DECIMALS");
        uint256 scale_ = 10 ** (18 - decimals_);
        SCALE = scale_;
        LIMIT = 1e30 / scale_;
        curveScale = 1e36 * scale_;
        require(block.timestamp <= type(uint64).max - 4 hours, "TIME");
        require(uint256(coreEnd_) > block.timestamp + 4 hours, "DEADLINES");
        bool fixedTestTargets = ethPrice6 == 0;
        if (fixedTestTargets) {
            require(block.chainid == 46630
                && address(token_) == 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E && decimals_ == 18,
                "PRICE");
        } else require(ethPrice6 <= (1e30 / scale_) / 4, "PRICE");
        require(kWad >= 1e12 && kWad <= 1e24, "PARAMS");
        (bool ok, bytes memory data) = address(core_).staticcall(abi.encodeWithSignature("trustedForwarder()"));
        trustedForwarder = ok && data.length == 32 ? abi.decode(data,(address)) : address(0);
        require(trustedForwarder != protocol_, "FEE_RECIPIENT_FORWARDER");
        token = token_;
        lpToken = new TopicMarketRightsToken("Topic Market LP", "TOPIC-LP");
        bToken = new TopicMarketRightsToken("Topic Market B Contribution", "TOPIC-B");
        core = core_;
        creator = creator_;
        protocol = protocol_;
        topicCutoff = coreEnd_;
        coreCutoff = coreEnd_;
        formalCutoff = coreEnd_ - 1 hours;
        genesisCutoff = coreEnd_ - 2 hours;
        rTarget = fixedTestTargets ? 36e14 : Math.mulDiv(ethPrice6, 36, 10);
        bTarget = fixedTestTargets ? 6e14 : Math.mulDiv(ethPrice6, 6, 10);
        require(bTarget > 0, "TINY_TARGET");
        k = kWad;
    }

    function isTrustedForwarder(address forwarder) external view returns (bool) {
        return forwarder != address(0) && forwarder == trustedForwarder;
    }

    function _actor() private view returns (address account) {
        if (msg.sender == trustedForwarder && msg.data.length >= 20) {
            assembly { account := shr(96, calldataload(sub(calldatasize(),20))) }
        } else account = msg.sender;
    }

    function _send(address to, uint256 amount) private {
        if (amount > 0) require(token.transfer(to, amount), "TRANSFER");
    }

    function _receive(uint256 amount) private {
        uint256 beforeBal = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM");
        require(token.balanceOf(address(this)) == beforeBal + amount, "NOT_EXACT_TOKEN");
    }

    function _splitGen(uint256 base)
        private
        pure
        returns (uint256 net, uint256 reserve, uint256 fee, uint256 remainder)
    {
        net = Math.mulDiv(base, 945, 1000);
        reserve = Math.mulDiv(base, 45, 1000);
        fee = base / 100;
        remainder = base - net - reserve - fee;
    }

    function _accrueGen(uint256 reserve, uint256 fee, uint256 remainder) private {
        address user = _actor();
        B += reserve;
        contribution[user] += reserve;
        totalContribution += reserve;
        // 权重只来自实际进入Genesis B的抵押代币；Formal手续费或LP转让不产生新B权益。
        if (reserve > 0) bToken.mint(user, reserve * SCALE);
        creatorFees += fee;
        dust += remainder;
    }

    function _checkIntent(bool hit, uint8 intent) private pure {
        require(intent <= 2, "INTENT");
        require(intent != 1 || hit, "MUST_GRADUATE");
        require(intent != 2 || !hit, "MUST_NOT_GRADUATE");
    }

    function quoteGenesisBuy(uint256 paid) public view returns (uint256 minted) {
        require(paid > 0 && paid <= LIMIT, "AMOUNT");
        (uint256 net,,,) = _splitGen(paid);
        require(net > 0 && R + net <= LIMIT, "AMOUNT");
        uint256 next = TopicMarketMath.sqrt((R + net) * curveScale / k);
        require(next > S, "TINY");
        return next - S;
    }

    function genesisBuy(uint256 paid, uint256 minTokens, uint64 expiry, uint8 intent) external lock {
        address user = _actor();
        require(
            phase == Phase.GENESIS && block.timestamp < genesisCutoff && block.timestamp <= expiry, "GENESIS_CLOSED"
        );
        uint256 minted = quoteGenesisBuy(paid);
        require(minted >= minTokens, "SLIPPAGE");
        (uint256 net, uint256 reserve, uint256 fee, uint256 rem) = _splitGen(paid);
        bool hit = R + net >= rTarget && B + reserve >= bTarget;
        _checkIntent(hit, intent);
        _receive(paid);
        R += net;
        S += minted;
        shares[user] += minted;
        _accrueGen(reserve, fee, rem);
        emit GenesisTrade(user, true, paid, minted);
        if (hit) _graduate(true);
    }

    function quoteGenesisSell(uint256 quantity) public view returns (uint256 gross, uint256 seller) {
        require(quantity > 0 && quantity <= S, "AMOUNT");
        uint256 left = S - quantity;
        gross = Math.mulDiv(k, S * S - left * left, curveScale);
        require(gross > 0 && gross <= R, "TINY");
        seller = Math.mulDiv(gross, 945, 1000);
    }

    function genesisSell(uint256 quantity, uint256 minOut, uint64 expiry, uint8 intent) external lock {
        address user = _actor();
        require(
            phase == Phase.GENESIS && block.timestamp < genesisCutoff && block.timestamp <= expiry, "GENESIS_CLOSED"
        );
        require(shares[user] >= quantity, "HOLDINGS");
        (uint256 gross, uint256 seller) = quoteGenesisSell(quantity);
        require(seller >= minOut, "SLIPPAGE");
        (, uint256 reserve, uint256 fee, uint256 rem) = _splitGen(gross);
        bool hit = R - gross >= rTarget && B + reserve >= bTarget;
        _checkIntent(hit, intent);
        R -= gross;
        S -= quantity;
        shares[user] -= quantity;
        _accrueGen(reserve, fee, rem);
        if (S == 0) {
            dust += R; // isolate only when all Genesis supply has been burned
            R = 0;
        }
        emit GenesisTrade(user, false, gross, quantity);
        if (hit) _graduate(false);
        _send(msg.sender, Math.mulDiv(gross, 945, 1000));
    }

    /// @notice 本版Demo无转让操作；筹资、LP均不开放转让，保留ABI以明确拒绝。
    function transferShares(address, uint256) external pure {
        revert("TRANSFER_NOT_IN_DEMO");
    }

    function _graduate(bool buy) private {
        phase = Phase.FORMAL;
        graduationSupply = S;
        liquiditySupply = S;
        unmaterializedLP = S;
        // 一次性把全部毕业LP放到市场托管，当前ERC20总量永远包含未物化权益。
        lpToken.mint(address(this), S);
        initialCollateral = R;
        collateralCash = R;
        R = 0;
        poolBasisWad = initialCollateral * SCALE;
        inventoryY = poolBasisWad;
        inventoryN = poolBasisWad;
        yesSupply = poolBasisWad;
        noSupply = poolBasisWad;
        // 深度取毕业时实际进入正式市场的抵押本金，统一为18位份额单位。
        // 不计入B准备金，也不增加现金/抵押/结果份额；此后买卖不改变b。
        bWad = poolBasisWad;
        core.open(coreCutoff);
        require(core.deadline() == coreCutoff && core.openedAt() == block.timestamp, "CORE_OPEN");
        emit Graduated(_actor(), buy, initialCollateral, B);
    }

    function isFormalMarket() external view returns (bool) {
        return phase == Phase.FORMAL || phase == Phase.WAIT_CORE || phase == Phase.SETTLED;
    }

    function coordinates() public view returns (uint256 qY, uint256 qN) {
        return (poolBasisWad - inventoryY, poolBasisWad - inventoryN);
    }

    function priceYes() external view returns (uint256) {
        require(!liquidityClosed && bWad > 0, "NO_LIQUIDITY");
        (uint256 y, uint256 n) = coordinates();
        return TopicMarketMath.priceYes(y, n, bWad);
    }

    function _requireCoreTrading() private view {
        // 测试/旧结果适配器无此扩展时沿用固定截止；真实新Adapter明确检查到期申请。
        (bool ok, bytes memory data) = address(core).staticcall(abi.encodeWithSignature("tradingAllowed()"));
        if (ok && data.length == 32) require(abi.decode(data,(bool)), "CORE_FROZEN");
    }

    function _formalOpen() private view {
        _requireCoreTrading();
        require(phase == Phase.FORMAL && block.timestamp < formalCutoff && !liquidityClosed, "FORMAL_CLOSED");
    }

    function _splitFormal(uint256 base)
        private pure returns (uint256 net, uint256 lpFee, uint256 coreFee, uint256 reserve, uint256 rem)
    {
        net = Math.mulDiv(base, 98, 100);
        lpFee = base / 200;
        reserve = base / 200;
        coreFee = base / 100;
        rem = base - net - lpFee - reserve - coreFee;
    }

    /// @dev 扩展深度至1e30 WAD后，误差保护随深度保守放大；普通资金规模仍至少为1e-6整枚C。
    function _formalGuard() private view returns (uint256) {
        return Math.ceilDiv(Math.max(1e12, bWad / 1e14 + 100), SCALE);
    }

    function quoteFormalBuy(bool isYes, uint256 amount) public view returns (uint256 gross) {
        require(amount > 0 && amount <= (isYes ? inventoryY : inventoryN), "INVENTORY");
        require(bWad > 0, "NO_LIQUIDITY");
        (uint256 y, uint256 n) = coordinates();
        uint256 beforeCost = TopicMarketMath.cost(y, n, bWad);
        uint256 afterCost = TopicMarketMath.cost(y + (isYes ? amount : 0), n + (isYes ? 0 : amount), bWad);
        require(afterCost >= beforeCost, "NUMERIC");
        uint256 requiredNet = Math.ceilDiv(afterCost - beforeCost, SCALE) + _formalGuard();
        gross = Math.mulDiv(requiredNet, 100, 98, Math.Rounding.Ceil);
    }

    function formalBuy(bool isYes, uint256 amount, uint256 maxPaid, uint64 expiry) external lock {
        address user = _actor();
        _formalOpen();
        require(block.timestamp <= expiry, "EXPIRED");
        uint256 gross = quoteFormalBuy(isYes, amount);
        require(gross <= maxPaid && gross <= LIMIT, "SLIPPAGE");
        (uint256 net, uint256 lpFee, uint256 coreFee, uint256 reserve, uint256 rem) = _splitFormal(gross);
        _receive(gross);
        cash += net;
        lpFees += lpFee;
        // 正式交易给原Genesis B持有人增加风险资金/余资收益，不为交易者新铸Btoken。
        B += reserve;
        formalBAccrued += reserve;
        dust += rem;
        if (isYes) {
            inventoryY -= amount;
            yes[user] += amount;
        } else {
            inventoryN -= amount;
            no[user] += amount;
        }
        _sendCoreFee(coreFee);
        emit FormalTrade(user, true, isYes, amount, gross);
    }

    /// @dev 底层LP已锁定且没有外部结果增发：q_i=外部持仓_i+已兑完整组合D。
    /// 因此合法持有人卖量永不超q_i；仍保留明确容量、现金和数值边界保护。
    function quoteFormalSellDetailed(bool isYes, uint256 amount)
        public view returns (uint256 gross, uint256 seller, uint256 merge6)
    {
        require(amount > 0 && bWad > 0 && !liquidityClosed, "AMOUNT");
        (uint256 y, uint256 n) = coordinates();
        require(amount <= (isYes ? y : n), "CAPACITY");
        uint256 beforeCost = TopicMarketMath.cost(y, n, bWad);
        uint256 afterCost = TopicMarketMath.cost(y - (isYes ? amount : 0), n - (isYes ? 0 : amount), bWad);
        require(beforeCost >= afterCost, "NUMERIC");
        uint256 raw = (beforeCost - afterCost) / SCALE;
        uint256 guard = _formalGuard();
        require(raw > guard, "TINY");
        gross = raw - guard;
        require(gross <= cash, "CASH");
        seller = Math.mulDiv(gross, 98, 100);
        merge6 = 0; // 保留旧报价ABI，本版没有池内merge路径。
    }

    function quoteFormalSell(bool isYes, uint256 amount) public view returns (uint256 gross, uint256 seller) {
        (gross, seller,) = quoteFormalSellDetailed(isYes, amount);
    }

    function _sendCoreFee(uint256 amount) private {
        if (amount == 0) return;
        // Core失败回滚整笔交易，绝不先支付卖家、留下未入账手续费。
        require(token.approve(address(core), 0) && token.approve(address(core), amount), "APPROVE_CORE");
        uint256 beforeBalance = token.balanceOf(address(this));
        core.depositMarketFee(amount);
        require(token.balanceOf(address(this)) + amount == beforeBalance, "CORE_FEE_TRANSFER");
        require(token.approve(address(core), 0), "APPROVE_CORE");
        coreFeesSent += amount;
        emit CoreFeeSent(amount);
    }

    function formalSell(bool isYes, uint256 amount, uint256 minOut, uint64 expiry) external lock {
        address user = _actor();
        _formalOpen();
        require(block.timestamp <= expiry, "EXPIRED");
        require((isYes ? yes[user] : no[user]) >= amount, "HOLDINGS");
        (uint256 gross, uint256 seller) = quoteFormalSell(isYes, amount);
        require(seller >= minOut, "SLIPPAGE");
        (, uint256 lpFee, uint256 coreFee, uint256 reserve, uint256 rem) = _splitFormal(gross);
        if (isYes) {
            yes[user] -= amount;
            inventoryY += amount;
        } else {
            no[user] -= amount;
            inventoryN += amount;
        }
        cash -= gross;
        lpFees += lpFee;
        // 正式交易给原Genesis B持有人增加风险资金/余资收益，不为交易者新铸Btoken。
        B += reserve;
        formalBAccrued += reserve;
        dust += rem;
        _sendCoreFee(coreFee);
        emit FormalTrade(user, false, isYes, amount, gross);
        _send(msg.sender, Math.mulDiv(gross, 98, 100));
    }

    /// @notice 免交易费完整组合兑换；参数为collateral native units金额，两侧各烧amount6*SCALE份。
    /// @dev 不依赖做市深度，全LP退出/等待Core时仍可用；终局快照之后禁止此入口。
    function redeemPairs(uint256 amount6) external lock {
        _requireCoreTrading();
        address user = _actor();
        require(phase == Phase.FORMAL || phase == Phase.WAIT_CORE, "PHASE");
        require(amount6 > 0 && amount6 <= collateralCash, "AMOUNT");
        uint256 burn = amount6 * SCALE;
        require(yes[user] >= burn && no[user] >= burn, "HOLDINGS");
        yes[user] -= burn;
        no[user] -= burn;
        yesSupply -= burn;
        noSupply -= burn;
        collateralCash -= amount6;
        redeemedPairs += amount6;
        emit PairsRedeemed(user, amount6, burn);
        _send(msg.sender, amount6);
    }

    /// @notice 研究原型公开核对资金桶和未终局完整组合覆盖，不替代全域数学审计。
    function checkInvariants() external view returns (bool) {
        require(token.balanceOf(address(this)) >= accountedBalance(), "ACCOUNTING");
        if (phase == Phase.GENESIS) {
            require(bToken.totalSupply() == totalContribution * SCALE, "B_SUPPLY");
        }
        if (phase == Phase.FORMAL || phase == Phase.WAIT_CORE || phase == Phase.SETTLED) {
            require(lpToken.totalSupply() == liquiditySupply, "LP_SUPPLY");
            require(lpToken.balanceOf(address(this)) >= unmaterializedLP, "LP_ESCROW");
        }
        if (phase == Phase.FORMAL || phase == Phase.WAIT_CORE) {
            require(bToken.totalSupply() == totalContribution * SCALE, "B_SUPPLY");
            require(B == totalContribution + formalBAccrued, "B_FUNDING");
            require(mergedPairs == 0, "MERGE_DISABLED");
            require(yesSupply == collateralCash * SCALE && noSupply == collateralCash * SCALE, "PAIR_SUPPLY");
            require(collateralCash + mergedPairs + redeemedPairs == initialCollateral, "COLLATERAL_LEDGER");
            require(inventoryY <= poolBasisWad && inventoryN <= poolBasisWad, "COORDINATES");
            require(inventoryY <= yesSupply && inventoryN <= noSupply, "INVENTORY_SUPPLY");
        }
        return true;
    }

    /// @notice 同Demo本版不开放YES/NO转让，不引入额外资产行为。
    function transferOutcome(address, bool, uint256) external pure {
        revert("TRANSFER_NOT_IN_DEMO");
    }

    /// @notice 旧ABI明确关闭；中途只能转让LP ERC20，不能提取底层或新增LP。
    function quoteAddLP(uint256) public pure returns (AddQuote memory) { revert("LP_LOCKED"); }
    function addLP(uint256, uint256, uint256, uint256, uint64) external pure { revert("LP_LOCKED"); }
    function quoteExit(uint256) public pure returns (uint256, uint256, uint256) { revert("LP_LOCKED"); }
    function exitLP(uint256, uint256, uint256, uint256) external pure { revert("LP_LOCKED"); }

    /// @notice 任意人可代触发，但托管LP只交给原始筹资权益人，不能指定第三方收款。
    function materializeLP(address account) external lock returns (uint256 amount) {
        return _materializeLP(account);
    }

    function _materializeLP(address account) private returns (uint256 amount) {
        require(phase == Phase.FORMAL || phase == Phase.WAIT_CORE || phase == Phase.SETTLED, "PHASE");
        amount = shares[account];
        if (amount == 0) return 0;
        shares[account] = 0;
        unmaterializedLP -= amount;
        require(lpToken.transfer(account, amount), "LP_TRANSFER");
        emit LPMaterialized(account, amount);
    }

    function closeExpired() external lock {
        if (phase == Phase.GENESIS) {
            require(block.timestamp >= genesisCutoff, "EARLY");
            phase = Phase.FAILED;
            failedRInitial = R;
            failedRRemaining = R;
            R = 0;
            failedSupply = S;
            bBudgetInitial = B;
            bBudgetRemaining = B;
            bSnapshotWad = bToken.totalSupply();
            require(bSnapshotWad == totalContribution * SCALE, "B_SNAPSHOT");
            B = 0;
        } else {
            require(phase == Phase.FORMAL && block.timestamp >= formalCutoff, "EARLY");
            phase = Phase.WAIT_CORE;
        }
        emit Closed(phase);
    }

    function _value(uint256 y, uint256 n, uint8 result) private view returns (uint256) {
        if (result == 1) return y / SCALE;
        if (result == 2) return n / SCALE;
        return (y + n) / (2 * SCALE);
    }

    function finalize() external lock {
        require(phase == Phase.FORMAL || phase == Phase.WAIT_CORE, "CORE_PENDING");
        uint8 result = core.finalOutcome();
        require(result >= 1 && result <= 3, "CORE_PENDING");
        outcome = result;
        phase = Phase.SETTLED;
        uint256 inventoryValue = _value(inventoryY, inventoryN, result);
        // Burn the pool's outcome rights BEFORE crediting the same value to LP cash.
        yesSupply -= inventoryY;
        noSupply -= inventoryN;
        inventoryY = 0;
        inventoryN = 0;
        collateralCash -= inventoryValue;
        uint256 nav = cash + lpFees + inventoryValue;
        cash = 0;
        lpFees = 0;
        uint256 basis = poolBasisWad / SCALE;
        uint256 loss = basis > nav ? basis - nav : 0;
        coverPaid = Math.min(B, loss);
        B -= coverPaid;
        // 固定原始毕业总份额，不能因物化、转让或已领取销毁而缩小分母。
        lpSnapshot = graduationSupply;
        lpBudgetInitial = nav + coverPaid;
        lpBudgetRemaining = lpBudgetInitial;
        bBudgetInitial = B;
        bBudgetRemaining = B;
        bSnapshotWad = bToken.totalSupply();
        require(bSnapshotWad == totalContribution * SCALE, "B_SNAPSHOT");
        B = 0;
        emit Finalized(result, coverPaid, lpBudgetInitial, bBudgetInitial);
    }

    function claimOutcome() external lock returns (uint256 pay) {
        return _claimOutcome();
    }

    function _claimOutcome() private returns (uint256 pay) {
        address user = _actor();
        require(phase == Phase.SETTLED, "PHASE");
        uint256 y = yes[user];
        uint256 n = no[user];
        require(y + n > 0, "CLAIMED");
        yes[user] = 0;
        no[user] = 0;
        yesSupply -= y;
        noSupply -= n;
        pay = _value(y, n, outcome);
        collateralCash -= pay;
        emit Claimed(user, "OUTCOME", pay);
        _send(msg.sender, pay);
    }

    function claimLP() external lock returns (uint256 pay) {
        address user = _actor();
        require(phase == Phase.SETTLED, "PHASE");
        _materializeLP(user);
        return _claimLP(lpToken.balanceOf(user));
    }

    function claimLP(uint256 amountWad) external lock returns (uint256 pay) {
        require(phase == Phase.SETTLED, "PHASE");
        _materializeLP(_actor());
        return _claimLP(amountWad);
    }

    function _claimLP(uint256 amountWad) private returns (uint256 pay) {
        address user = _actor();
        require(amountWad > 0 && lpSnapshot > 0 && lpToken.balanceOf(user) >= amountWad, "CLAIMED");
        // 权利以当前token持有人为准。正数份额即使舍入到0，也允许烧毁避免dust权利卡死。
        lpToken.burn(user, amountWad);
        liquiditySupply -= amountWad;
        pay = Math.mulDiv(lpBudgetInitial, amountWad, lpSnapshot);
        lpBudgetRemaining -= pay;
        emit Claimed(user, "LP", pay);
        _send(msg.sender, pay);
    }

    function claimB() external lock returns (uint256 pay) {
        return _claimB(bToken.balanceOf(_actor()));
    }

    function claimB(uint256 amountWad) external lock returns (uint256 pay) {
        return _claimB(amountWad);
    }

    function _claimB(uint256 amountWad) private returns (uint256 pay) {
        address user = _actor();
        require(phase == Phase.SETTLED || phase == Phase.FAILED, "PHASE");
        require(amountWad > 0 && bSnapshotWad > 0 && bToken.balanceOf(user) >= amountWad, "CLAIMED");
        bToken.burn(user, amountWad);
        pay = Math.mulDiv(bBudgetInitial, amountWad, bSnapshotWad);
        bBudgetRemaining -= pay;
        emit Claimed(user, "B", pay);
        _send(msg.sender, pay);
    }

    function claimFailed() external lock returns (uint256 pay) {
        return _claimFailed();
    }

    function _claimFailed() private returns (uint256 pay) {
        address user = _actor();
        require(phase == Phase.FAILED, "PHASE");
        uint256 amount = shares[user];
        require(amount > 0 && failedSupply > 0, "CLAIMED");
        shares[user] = 0;
        S -= amount;
        pay = Math.mulDiv(failedRInitial, amount, failedSupply);
        failedRRemaining -= pay;
        emit Claimed(user, "FAILED", pay);
        _send(msg.sender, pay);
    }

    /// @notice Frozen/current-state budgets in collateral native units, excluding future trades and fees.
    /// @dev Uses the same integer settlement arithmetic; no state or entitlement is changed.
    function previewSettlement(uint8 result) public view returns (uint256 lpBudget, uint256 bBudget, uint256 cover) {
        require(result >= 1 && result <= 3, "RESULT");
        if (phase == Phase.SETTLED) {
            require(result == outcome, "FINAL_RESULT");
            return (lpBudgetInitial, bBudgetInitial, coverPaid);
        }
        require(phase == Phase.FORMAL || phase == Phase.WAIT_CORE, "PHASE");
        uint256 nav = cash + lpFees + _value(inventoryY, inventoryN, result);
        uint256 basis = poolBasisWad / SCALE;
        cover = Math.min(B, basis > nav ? basis - nav : 0);
        return (nav + cover, B - cover, cover);
    }

    /// @notice Account payout, including escrowed LP rights.
    /// @dev Failed launches ignore result because no YES/NO market ever opened.
    function previewAccount(address account, uint8 result)
        external view returns (uint256 outcomePay, uint256 lpPay, uint256 bPay, uint256 failedPay)
    {
        if (phase == Phase.FAILED) {
            if (failedSupply > 0) failedPay = Math.mulDiv(failedRInitial, shares[account], failedSupply);
            if (bSnapshotWad > 0) bPay = Math.mulDiv(bBudgetInitial, bToken.balanceOf(account), bSnapshotWad);
            return (0, 0, bPay, failedPay);
        }
        (uint256 lpBudget, uint256 bBudget,) = previewSettlement(result);
        outcomePay = _value(yes[account], no[account], result);
        uint256 denominator = phase == Phase.SETTLED ? lpSnapshot : graduationSupply;
        if (denominator > 0) lpPay = Math.mulDiv(lpBudget, shares[account] + lpToken.balanceOf(account), denominator);
        uint256 bDenominator = phase == Phase.SETTLED ? bSnapshotWad : bToken.totalSupply();
        if (bDenominator > 0) bPay = Math.mulDiv(bBudget, bToken.balanceOf(account), bDenominator);
    }

    /// @notice Same single market claim action as the demo, never claiming on another wallet's behalf.
    function claimAll() external lock returns (uint256 total) {
        address user = _actor();
        require(phase == Phase.SETTLED || phase == Phase.FAILED, "PHASE");
        bool hasRights;
        if (phase == Phase.FAILED && shares[user] > 0) {
            hasRights = true;
            total += _claimFailed();
        }
        if (phase == Phase.SETTLED) {
            _materializeLP(user);
            uint256 lp = lpToken.balanceOf(user);
            if (lp > 0) { hasRights = true; total += _claimLP(lp); }
            if (yes[user] + no[user] > 0) { hasRights = true; total += _claimOutcome(); }
        }
        uint256 b = bToken.balanceOf(user);
        if (b > 0) { hasRights = true; total += _claimB(b); }
        require(hasRights, "CLAIMED");
    }

    function claimFees() external lock {
        address user = _actor();
        uint256 projectPay;
        uint256 creatorPay;
        if (user == protocol) {
            projectPay = protocolFees;
            protocolFees = 0;
        }
        if (user == creator) {
            creatorPay = creatorFees;
            creatorFees = 0;
        }
        require(projectPay + creatorPay > 0, "NO_FEES");
        // 创建者及项目领取已记账的交易费，不叠加尚未采用的提现费。
        _send(msg.sender, projectPay);
        _send(msg.sender, creatorPay);
    }

    /// @notice Retained liabilities, excluding unsolicited donations. No dust/surplus rescue exists.
    function accountedBalance() public view returns (uint256) {
        return R + B + protocolFees + creatorFees + dust + collateralCash + cash + lpFees + lpBudgetRemaining
            + bBudgetRemaining + failedRRemaining;
    }
}
