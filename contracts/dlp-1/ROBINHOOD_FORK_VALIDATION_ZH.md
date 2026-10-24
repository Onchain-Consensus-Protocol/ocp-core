# Robinhood主网只读报价与本地分叉验证

日期：2026-10-22。已完成两步：只读主网报价，以及本地主网分叉上的真实股票/DEX与本地业务合约串联。没有主网交易、没有真实资金投入、没有部署OCP到公链。

## 测量基线

- Robinhood Chain：4663。固定区块 **94654506**（十六进制0x5a4502a）。
- 区块hash：0x7540d20abf2b538d97110674172e2cfb36bac27e7398193fa54d3e9b50375e4d。
- 区块时间：2026-10-22 07:11:12（Asia/Shanghai）。这是固定快照，不是永久最佳报价。
- 官方资产：TSLA、NVDA、AAPL、GOOGL、SPCX，均18位；稳定币USDG为6位。谷歌不是GOOG，SpaceX正式代码为SPCX；初始按SPACEX名称未检索到的判断已撤回。
- 地址来源：Robinhood官方合约页及其官方assets API；Uniswap官方部署文档与官方源码。第三方索引仅用于发现V4候选，随后由官方PoolManager初始化日志、PoolId重算及StateView验证。

## 第一步：只读报价

- 检查五股票/USDG的V3费率100、500、3000、10000共20组，发现19个非零pool地址；当前有效报价路径16条。
- 每条测试100、1000、10000 USDG规模，双向共96条V3报价，全部返回。
- 验证5个V4候选PoolKey（四股票，含AAPL额外费率池），共30条报价，26返回、4条不可执行报价。不是全部V4池扫描，也未比较所有RFQ/propAMM/多跳/拆单路径。
- 买入比较相同USDG输入；卖出为每个股票固定相同raw股票输入，美元规模仅参考。跨池比较以实际out数量为准。QUOTE_COMPARISON.csv保留30组较优候选，完整原始RPC在RUN_94654506内。
- 结果未包含完整交易gas和L1数据费用；Quoter输出不是最终签名交易保证。

本次样本中，1000和10000 USDG买入以V3路径较优：TSLA费率0.3%，其余0.05%。TSLA的100USDG小单以V3 0.05%池较优，证明不能把“最优池”永久固定成一个费率。其他区块/V4覆盖范围变化可能改变结果。

## 第二步：本地分叉执行

FORK_TESTS.txt：**6通过、0失败**。

- 五股票均通过真实Router02/真实池双向兑换；初始USDG仅由Foundry deal写入本地测试余额，未修改股票code、未mock真实DEX调用或转账返回。
- 每股票1000USDG买入后立即全部卖回：TSLA返回994.009423；NVDA999.000261；AAPL999.000347；GOOGL999.000332；SPCX999.000285 USDG。仅为即时往返兑换损耗，不含OCP阶段手续费、网络费用，也不是持有收益预测。
- 本地部署真实DLPStockFactory/Router/Market/Vault，完成稳定币买gToken→毕业→Core质押→正式买卖→结算→LP/B烧毁兑换稳定币→Core领取及重复领取拒绝。
- 强制最终兑换滑点失败，核验LP/B/g权益、YES/NO、结算预算、各方股票/稳定币余额与授权整体回滚。
- 第6项实际复现旧classic SwapRouter ABI绑定Router02失败，并验证资金恢复；新增正确Router02 ABI参考适配器已通过上述五资产路径。

**边界：** ForkOnlySnapshot是明确标注的本地阈值配置，用于完整生命周期测试，不是真实Chainlink生产价格源；本轮不证明生产ETH/C快照或停盘策略已经验证。V4仅完成只读报价，没有完成V4兑换+业务执行。公司行动uiMultiplier由官方股票代币机制影响，生产价格源需避免重复应用倍率。

## RPC失败与重现

早期区块94363412：四股票通过，SPCX存储读取遇historical state unavailable。后续94644373公共RPC无法提供状态，分叉启动失败。两次失败均保留，不计作合约失败或通过。将取块、启动Anvil、执行与报价连贯化后，94654506五资产全通过。

公共RPC可能不保留后续可重放历史状态；长期重现需要支持该固定区块的archive RPC。不能把旧区块不可用时自动换latest后仍标同一个pin。run_fresh_fork.py会记录新块/hash并输出独立RUN目录。脚本不广播，测试节点只监听127.0.0.1并在finally停止。

离线回归另跑：161项通过、0失败；分叉套件未提供RPC时按设计跳过，不混算进六项真实分叉结果。

## 文件与后续

- VERIFIED_V3_PATHS.json：实际执行过的V3基线池与官方Router02地址，不代表每笔金额的永久最佳路径。
- QUOTE_COMPARISON.csv：已检查候选中的按金额/方向输出排序。
- RUN_94654506：固定区块、原始报价、池状态、执行日志。
- contracts/DLPV3Router02Exchange.sol：正确Router02 ABI适配器；旧DLPV3Exchange保留为legacy参考，不能绑定该Router02。
- 股票实际业务费制、Core资本多数、毕业即时权益折价均未改变；本轮没有发布网站或合约。

官方来源：https://docs.robinhood.com/chain/contracts/ ；https://docs.robinhood.com/chain/building-with-stock-tokens/ ；https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments ；https://raw.githubusercontent.com/Uniswap/swap-router-contracts/main/contracts/interfaces/IV3SwapRouter.sol 。完整来源链见assets_agent.md与dex_agent.md。
