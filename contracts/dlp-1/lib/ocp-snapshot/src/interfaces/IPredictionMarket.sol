// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IPredictionMarket
 * @dev 预测市场标准接口，方便外部协议集成
 *
 * 设计目标：
 * - 让外部协议不依赖具体实现，只依赖接口
 * - 提供最核心的市场参数和解析结果
 */
interface IPredictionMarket {
    /// @notice 市场解析结果（INVALID 时份额按 0.5 兑付，但交易手续费仍正常分配）
    enum Outcome {
        PENDING,
        YES,
        NO,
        INVALID
    }

    // ======= 基本只读信息 =======
    /// @notice 关联的 OCP 金库地址（市场解析依赖该金库的终局结果）
    function vault() external view returns (address);
    /// @notice 抵押品（交易币种）地址
    function collateral() external view returns (address);

    /// @notice 总交易手续费（bps）
    function feeBps() external view returns (uint256);
    /// @notice Vault 手续费（bps）
    function vaultFeeBps() external view returns (uint256);
    /// @notice 官方初始流动性池手续费（bps）
    function protocolLpFeeBps() external view returns (uint256);
    /// @notice 创建者在本市场获得的手续费比例（bps）
    function creatorFeeBps() external view returns (uint256);
    /// @notice LMSR 流动性参数 b（单位与抵押品最小单位一致）
    function liquidityParameter() external view returns (uint256);
    /// @notice 抵押品的最小单位比例，即 10 ** decimals。
    function collateralScale() external view returns (uint256);
    /// @notice 市场激活时锁定的最坏损失补贴
    function subsidy() external view returns (uint256);
    /// @notice 市场剩余补贴的终局接收方
    function subsidyProvider() external view returns (address);
    /// @notice 创建者手续费的固定接收方
    function creatorFeeRecipient() external view returns (address);

    /// @notice 条件类型（由上层协议定义）
    function conditionType() external view returns (uint8);
    /// @notice 条件参数（ABI 编码，便于链上存证）
    function conditionParams() external view returns (bytes memory);
    /// @notice 解析时间戳（到期后可解析/赎回）
    function resolutionTime() external view returns (uint256);
    /// @notice 若创建者提前终止则为终止交易时间，否则为原定截止时间
    function effectiveResolutionTime() external view returns (uint256);

    /// @notice 是否已解析
    function resolved() external view returns (bool);
    /// @notice 解析结果
    function outcome() external view returns (Outcome);
    /// @notice 当前仍托管在市场内、等待创建者与协议领取的手续费
    function feeEscrow() external view returns (uint256);
    function pendingCreatorFees() external view returns (uint256);
    /// @notice 生命周期累计交易量，按每笔手续费前的实际抵押品现金流绝对值累计
    function totalTradingVolume() external view returns (uint256);
    /// @notice 统一 Genesis 市场是否已跨过募集阈值并进入正式交易阶段。
    function isFormalMarket() external view returns (bool);

    // ======= 可选：隐含价格/概率 =======
    /// @notice 读取 YES/NO 价格（以 1e18 为基准的比例，yesPrice+noPrice≈1e18）
    function getYesNoPrice() external view returns (uint256 yesPrice, uint256 noPrice);

    /// @notice 精确购买 sharesOut 份结果份额所需的总抵押品（含手续费）
    function quoteBuy(bool isYes, uint256 sharesOut)
        external
        view
        returns (uint256 totalCost, uint256 fee);

    /// @notice Genesis 最后一笔若会越过毕业线，返回实际部分成交的份额。
    /// @dev 正式阶段不截断，actualShares 等于 requestedShares。
    function previewGenesisBuy(bool isYes, uint256 requestedShares)
        external
        view
        returns (uint256 actualShares);

    /// @notice Genesis 跨线买入：最多购买 maxSharesOut，实际只成交到毕业门槛。
    function buyToGraduation(
        bool isYes,
        uint256 maxSharesOut,
        uint256 minSharesOut,
        uint256 maxTotalCost,
        uint256 expectedPhaseEpoch,
        uint256 deadline
    ) external returns (uint256 totalCost, uint256 actualShares);

    /// @notice 精确卖出 sharesIn 份结果份额可收到的净抵押品（已扣手续费）
    function quoteSell(bool isYes, uint256 sharesIn)
        external
        view
        returns (uint256 netPayout, uint256 fee);

    /// @notice 给定 Genesis 初始仓位时，安全启动 LMSR 所需的最小资金。
    function requiredGenesisFunding(uint256 initialYes, uint256 initialNo)
        external
        view
        returns (uint256);

    /// @notice 共享 Router 付款，份额直接记入 recipient。
    function buyFor(
        address recipient,
        bool isYes,
        uint256 sharesOut,
        uint256 maxTotalCost,
        uint256 deadline
    ) external returns (uint256 totalCost);

    function buyForSubsidyProvider(
        address recipient,
        bool isYes,
        uint256 sharesOut,
        uint256 maxTotalCost,
        uint256 deadline
    ) external returns (uint256 totalCost);

    /// @notice 共享 Router 扣减 owner 的本池份额，并把现金腿发送给 recipient。
    function sellFor(
        address owner,
        address recipient,
        bool isYes,
        uint256 sharesIn,
        uint256 minPayout,
        uint256 deadline
    ) external returns (uint256 netPayout);

    function configureSharedLiquidity(
        address controller,
        address router,
        address retirementRecipient
    ) external;
    function activateShared(
        address subsidyProvider,
        address creatorFeeRecipient,
        uint256 initialYes,
        uint256 initialNo
    ) external;
    function retireAndRelease() external returns (uint256 amount);
    function setRouterApproval(bool approved) external;

    /// @notice 任何人可代已结算用户赎回；兑付款固定发送给 user。
    function redeemFor(address user) external returns (uint256 payout);
    function redeemForMany(address[] calldata users) external returns (uint256 totalPayout);

    /// @notice Vault 完成结算快照后，任何人可触发向固定官方池划转 0.2% 手续费
    function claimProtocolLpFees() external returns (uint256 amount);
    function claimCreatorFees() external returns (uint256 amount);

    // ======= 事件 =======
    /// @notice 市场解析事件（由金库终局驱动）
    event Resolved(address indexed market, Outcome outcome);
}
