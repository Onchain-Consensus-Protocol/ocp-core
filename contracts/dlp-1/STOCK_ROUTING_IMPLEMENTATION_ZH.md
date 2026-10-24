## 2026-10-22 主网只读与本地分叉增量验证

新增DLPV3Router02Exchange，实际适配官方Robinhood SwapRouter02无deadline结构（入口仍检查deadline）；旧DLPV3Exchange仅legacy参考，不能绑定Router02。固定主网区块94654506上5股票TSLA/NVDA/AAPL/GOOGL/SPCX真实DEX与本地完整业务6测试通过；主网广播0笔。只读96条V3报价、V4候选30条（4失败），不代表全市场/所有金额最佳。生产oracle未验证，完整业务阈值用明确testfixture。见ROBINHOOD_FORK_VALIDATION_ZH.md；研究原始证据存研究workspace outputs/RH_MAINNET_RESEARCH。161离线回归通过，需单独配置RPC才执行分叉套件。

# DLP-1 v2.2 股票代币本位与路由实现候选

日期：2026-10-21。仅本地代码与测试，不代表真实股票资产、Robinhood DEX、预言机或部署已经接通。旧v2.1交付包为历史证据，不能用于证明本轮股票路由。

## 实现范围

- DLPMarket支持6–18位、无转账税/非rebase、标准bool返回ERC20抵押资产；金额用其原生单位，内部份额WAD。SCALE/LIMIT/曲线归一化在构造时设置，无运行时修改接口。
- 每个股票配置部署一个DLPStockFactory及配套DLPAssetRouter；Factory固定token、C本位k/b、价格源和router。创建市场无需用户初始本金，固定1h/2h/3h截止。
- DLPStockPriceSnapshot使用ETH/USD除以股票/USD，返回每ETH对应的C原生单位；保留ethPrice6旧selector仅兼容调用，不代表六位。Factory验证oracle.unit与token.decimals一致，创建后冻结阈值。价格源陈旧、未来时间、零价、失效轮次拒绝；可显式配置sequencer与恢复宽限期。股票停盘处理依赖经审核的heartbeat，不能默许过期报价。
- 费制不变：Genesis94.5/4.5/1，Formal98/.5LP/.5B/1Core，均按C计账；Core本金、投票权重、费用历史索引及支付均用C。
- Market与本模块冻结版OCPVault增加受信转发身份，只接受创建时绑定Router。权益归Router原始调用者，资金付款/路由领取地址保留Router。普通调用附加别人的地址不能伪造身份；没有任意actor/target/calldata转发入口。
- 稳定币输入用固定exchange兑换C后执行。输出先领取C再兑换稳定币；输入/兑换/交易/输出任何步骤失败整笔回滚。仍支持原生C直接买卖、质押与领取。
- 本笔余额差核对、精确授权后清零、历史赠送余额隔离、重入保护、截止时间、最小兑换C、业务限价和最小稳定币到账各自约束。
- DLPV3Exchange为经典Uniswap V3 SwapRouter exactInputSingle参考适配器（参数含deadline），固定DEX、股票、稳定币与费率，仅双向单池；不是多跳/聚合器，也不能直接假定兼容SwapRouter02或实际Robinhood部署。

## 调用参数与差异

Router.execute(Request)动作包括Genesis/Formal买卖、Core质押/withdraw、市场统一领取、Outcome/LP/B/失败领取以及成对兑换。market必须由同一Factory登记，用户只能操作自己的权益。paymentAsset为抵押C或构造白名单稳定币。

- 资金输入：inputAmount是所选支付资产原生金额；minCollateral是兑换后最少C；businessLimit在GenesisBuy为最少gToken，在FormalBuy为最大支付C（同时不超过实际funded）；CoreStake全部实际C形成质押。
- 输出：inputAmount必须0；quantity为所需出售或赎回份额；businessLimit为业务最少C，minOutput为最终所选收款资产最少原生数量。
- Formal是精确份额买入，不是稳定币固定预算买入。少用的C直接退玩家股票代币，第一版不擅自再次兑换退款；这点与Demo仅兑换精确净额不同，前端需明确显示退款资产。
- 不同股票需要不同Factory/Router配置；第一版一个Router只信任一个Factory，参考exchange只支持一个C/U交易对。五种股票不是在一个固定token Factory中随意切换。
- k是C本位曲线参数；正式深度b在毕业时取实际入池R×SCALE，排除B，之后不随交易或股票市价重设。已移除固定150及部署深度输入，不能将固定美元值误用为股票数量。
- 结果份额每1 WAD的兑付面额为1枚C，INVALID各0.5C；不是固定1美元。股票价格变化会改变稳定币折算价值。
- 股票暂停/冻结、转账许可、拆股/rebase、发行方升级等并未因路由实现而消失。仅经验证的token可配置；本模块不声称支持全部Robinhood股票（尤其SpaceX演示占位）。

## 编译与部署

使用Solidity0.8.20、viaIR、optimizer runs=1；本轮改变优化参数以满足EIP170，必须使用交付构建参数，不能拿旧runs=200验证新字节码。部署/验证需同时固定依赖与构造参数。

DeployDLPStock脚本按Oracle→Router→CoreDeployer→MarketDeployer→StockFactory五次CREATE规划，Router先保存预测Factory地址，Factory再验证router.factory与deployer反向绑定。中途失败或nonce插入必须对账，不可盲目重跑。脚本没有自动选择私钥或真实链资产地址，不会创建用户市场/质押。

部署前仍须验证：真实Robinhood chainId/RPC、股票/稳定币规范地址及资产行为、对应价格源和市场时段政策、sequencer策略、DEX合约的精确ABI/池费率/流动性、实网gas和独立安全审计。编译及本地mock通过不等于真实兑换可执行。

## 证据

最终测试数量、代码大小、日志与尚未覆盖项见随包RESULT_ZH.md/TESTS.txt/CODE_SIZES.json。若这些文件尚未生成，不得把本说明当作测试通过声明。
