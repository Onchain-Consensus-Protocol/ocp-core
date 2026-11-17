# 2026-10-29 生产价格源与统一工厂分叉核验

仅只读RPC和本地主网状态分叉，没有公共链部署或交易广播。

## 最终结果

最终组合命令退出码0，两个测试套件合计3通过、0失败、0跳过，详见fork-final.log。生产源2项通过；单工厂五股票交错生命周期1项通过（内部覆盖全部5股票）。没有生产合约源码改动，只增加分叉测试和核验材料。

## 固定环境和价格源证据

- Robinhood主网4663；固定块100224815，hash `0xcc4d2b228a629feab47ca0e66c0c3aedb5dc2172d98d0e693f5b5865a0ea8198`。
- 区块时间北京时间2026-10-29 00:50:15。
- 官方目录：https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood
- 原始目录：https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json
- Robinhood说明：https://docs.robinhood.com/chain/oracles-and-price-feeds/
- Chainlink标的/倍率/休市说明：https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood
- Sequencer支持范围：https://docs.chain.link/data-feeds/l2-sequencer-feeds

`selected-feeds.json`保存所用6个主代理和目录参数；`oracle-onchain.json`和`oracle-rpc-raw.json`保存同一固定块上的decimals、description、round和股票oraclePaused/uiMultiplier读取。所有6源8位精度、正报价、轮次完整，全部读取成功；五股票oraclePaused=false。股票源已经包含uiMultiplier，消费者不能再乘一次。

## 生产源消费测试

`RHProductionOracleFork.t.sol`直接使用真实ETH与5股票生产代理，不mock feed、不修改feed存储、不替换feed代码。测试：
- 同工厂登记5股并创建5市场，真实ETH/USD÷股票代币/USD换算值进入市场快照和R/B毕业门槛。
- 时间推进后拒绝过期组合快照，并用测试专用更长ETH时限单独验证每只股票过期拒绝。测试使用vm.getBlockTimestamp固定恢复点，避免编译器对block.timestamp在单交易内不变的假设干扰warp恢复。

此处使用目录86400秒作为验证配置，不代表已批准生产最大报价年龄。股票休市不保证heartbeat；陈旧时当前实现拒绝创建新市场，不自动沿用过期值。

## 仍有的接入边界

- 当前生产快照reader未读股票oraclePaused()。公司行动刚暂停、旧报价尚未过期时仍可能创建市场；本轮发现并记录，没有修改生产reader。
- 未找到Chainlink官方Robinhood sequencer uptime代理。分叉实例显式seq=0，没有该保护；不是已经验证防停机。不能把其他链地址或WebSocket sequencer接口冒充AggregatorV3。
- 价格源在createMarket时取快照，不负责Formal每笔交易定价或最终投票结果。
- 五股票交错生命周期独立使用明确固定阈值fixture；它验证真实V3资产交互、统一工厂和账本隔离，不把fixture称作生产喂价。

## 复跑

```sh
RH_FORK_RPC=https://rpc.mainnet.chain.robinhood.com \
RH_FORK_BLOCK=100224815 RH_ORACLE_FORK_BLOCK=100224815 \
forge test --offline --match-contract 'RH(SharedFactory|ProductionOracle)ForkTest' -vv
```

公共RPC对旧区块99917547返回historical state unavailable，本轮改用上述固定新块。未来该块也可能失去公共RPC历史读取支持，需要归档RPC或重新钉住新块，不能通过跳过测试冒充通过。
