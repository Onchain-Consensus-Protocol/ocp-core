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
    /// @notice LMSR 流动性参数 b（单位与抵押品最小单位一致）
    function liquidityParameter() external view returns (uint256);
    /// @notice 市场激活时锁定的最坏损失补贴
    function subsidy() external view returns (uint256);

    /// @notice 条件类型（由上层协议定义）
    function conditionType() external view returns (uint8);
    /// @notice 条件参数（ABI 编码，便于链上存证）
    function conditionParams() external view returns (bytes memory);
    /// @notice 解析时间戳（到期后可解析/赎回）
    function resolutionTime() external view returns (uint256);

    /// @notice 是否已解析
    function resolved() external view returns (bool);
    /// @notice 解析结果
    function outcome() external view returns (Outcome);
    /// @notice 当前仍托管在市场内、等待官方池领取的 0.2% 手续费
    function feeEscrow() external view returns (uint256);
    /// @notice 生命周期累计交易量，按每笔手续费前的实际抵押品现金流绝对值累计
    function totalTradingVolume() external view returns (uint256);

    // ======= 可选：隐含价格/概率 =======
    /// @notice 读取 YES/NO 价格（以 1e18 为基准的比例，yesPrice+noPrice≈1e18）
    function getYesNoPrice() external view returns (uint256 yesPrice, uint256 noPrice);

    /// @notice 精确购买 sharesOut 份结果份额所需的总抵押品（含手续费）
    function quoteBuy(bool isYes, uint256 sharesOut)
        external
        view
        returns (uint256 totalCost, uint256 fee);

    /// @notice 精确卖出 sharesIn 份结果份额可收到的净抵押品（已扣手续费）
    function quoteSell(bool isYes, uint256 sharesIn)
        external
        view
        returns (uint256 netPayout, uint256 fee);

    /// @notice Vault 完成结算快照后，任何人可触发向固定官方池划转 0.2% 手续费
    function claimProtocolLpFees() external returns (uint256 amount);

    // ======= 事件 =======
    /// @notice 市场解析事件（由金库终局驱动）
    event Resolved(address indexed market, Outcome outcome);
}
