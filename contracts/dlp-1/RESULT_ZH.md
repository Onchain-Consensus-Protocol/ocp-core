# DLP-1 v2.0 本轮实施结果

状态：已完成独立合约接入候选版本、离线验证和可复现交付；未部署、未推送，不能当作外部审计或实盘上线批准。

## 本轮补齐

1. `DLPFactory`：零初始做市本金创建，记录话题及三个结果定义，固定1h/2h/3h截止；Adapter、真实Core Vault、Market、LP/B及绑定原子完成。价格和曲线参数不可由单个创建者任意传入。
2. `DLPPriceSnapshot`：双价格源读取ETH/USD及USDC/USD，校验正数、轮次、时间和过期；创建后目标固定。实际网络与feed地址尚未选择，不使用已撤下的旧部署配置。
3. `finalizeMarket()`：到期后无许可一笔交易完成真实Core及市场结算；重复调用幂等，调用人不能指定结果。
4. `claimAll()`：统一领取市场结果份额、LP、B或未毕业退款，正确销毁权利；转账失败整笔回滚。
5. `previewSettlement` / `previewAccount`：三结果预计兑付及已结算可领取金额，与实际整数公式一致，计入未物化LP。
6. 独立部署脚本、显式配置模板、ABI、代码大小记录和差异报告；Market大段创建码拆为两个不可执行载体，满足EVM代码大小限制。

## 验证证据

- Solidity 0.8.20 / viaIR / optimizer200。
- `forge test --offline -vv`：16套件，122项通过，0失败，0跳过；5项原有fuzz测试各256次。
- 包括原有90项回归、新预言机9项、工厂9项、领取/预览/原子结算8项、经济风险/回滚3项、Factory全流程3项。
- 新全流程使用真实OCPVault合约及真实适配器／市场，但ERC20和价格feed为测试mock；不等同实际链USDC或真实Oracle验收。
- `forge build --offline script/DeployDLP.s.sol`：编译成功；未广播，尚无目标链dry-run。
- Market runtime 24,307 bytes，低于24,576限制但仅余269 bytes；后续增加功能必须重新检查。MarketDeployer initcode32,197 bytes、CoreDeployer runtime21,114 bytes。详见CODE_SIZES.json。
- 工厂测试验证载体、市场、工厂代码尺寸与initcode限制；新三结果端到端测试逐账户核对预览/实际领取和总资产守恒。

## 仍与Demo不同

详见 `DEMO_PARITY_AND_RISKS_ZH.md`。主要是USDC六位整数及尾差、LP托管物化、需要链上交易驱动到期操作、真实Oracle替代演示快照、额外的滑点/期限/毕业intent控制，以及Core历史donate入口。Demo隐藏LP/B转让功能，合约仍保留独立ERC20转让能力，无二级交易市场。

## 必须由用户知悉的共同经济性质

- 合法纯买路径，最后支付1000 USDC，毕业时新增LP本金权益加本笔B贡献约522.014743 USDC，即时估值低约47.8%。这是当前Demo和合约共同的转换规则，不是本轮改动或已确定的最终亏损。本轮没有擅自更改。
- 创建者关联账户自买自卖，可在未毕业清算后收回B和自己的创建者费用，外部净成本接近零；不能将刷出的B和成交量视作独立真实需求。
- Core公开资本多数，市场持有人可追加Core资本影响终局；属于已确认规则的博弈风险，不是外部事实保证。

## 实盘前尚需完成

指定链、真实USDC与feed/heartbeat，必要的L2 sequencer状态政策、真实网络gas与部署模拟、所有源码验证、独立审计，以及对毕业价值断层是否保留的产品决定。没有新增后台代替共识或管理者改结果权限。尚未实施任何真实资金操作。
