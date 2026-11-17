# 最新 OCPCore 主网分叉验证 · 2026-10-29

结果：4套件10项通过，0失败、0跳过。测试使用最新OCPCore、独立提前终止clone及原生产StockFactory，没有生产合约源码改动，没有签名或主网交易。

## 固定状态

Robinhood主网4663，区块 **100858540**，hash `0x54e1f1c3dcea14aca91d001feeebd87ed3b173d5ea1d6847940f6a53811ba763`，区块北京时间 **2026-10-29T19:11:57+08:00**。执行后重新读取区块哈希，一致。证据见block.json、canonical-check.json、fork.log及manifest.json。

旧块100224815的RPC返回historical state unavailable（日志old-block-unavailable.log），未算作合约通过；先编译后固定新块，最终forge退出码0。

## 通过的内容

- 生产源：真实ETH和TSLA/NVDA/AAPL/GOOGL/SPCX官方代理读取、五市场ETH毕业快照、独立500USD向上取整换算、clone绑定及过期拒绝。2项。
- 真实兑换：五股票各自USDG/V3完整生命周期，错误classic router ABI恢复资金。6项。此套仍明确使用毕业门槛夹具。
- 同工厂：五股票交错买卖、质押、结算和领取；另一资产的余额、本金、模块申请、保证金、退款、罚金和手续费状态保持不变。1项。此套仍明确使用毕业门槛夹具。
- 新模块全流程：同工厂两股票采用真实生产源及真实V3，50000USDG进入Genesis达到生产毕业条件；TSLA申请失败→保证金罚没→退出罚10%并废弃旧费→换侧重入→新申请成功→到期冻结→延迟15分钟处理仍采用窗口截止→pull保证金退款→Market/Core稳定币领取。Core领取故意兑换失败后账本回滚、重试成功、重复领取拒绝；NVDA状态独立。1项。

Core每阶段精确核对真实余额与本金、手续费、罚金、未决保证金和退款债务；模块不持币。新增用例仅deal本地USDG，不deal股票、不mock喂价、不替换股票或feed代码。测试中的资金属于分叉模拟，非真实钱包资产。

## 保留的接入边界

股票reader尚未读取发行方oraclePaused；本轮没有补上暂停保护。真实喂价分叉实例显式sequencer=0，主网uptime源接入未验证。这些边界不因本次通过而消失，也不等于整体主网上线批准。

## 复跑

先离线编译，再运行指定块，避免编译期间公共RPC丢弃旧状态：

```sh
forge build --offline
RH_FORK_RPC=https://rpc.mainnet.chain.robinhood.com \
RH_FORK_BLOCK=100858540 RH_ORACLE_FORK_BLOCK=100858540 \
forge test --offline --match-contract 'RH.*ForkTest' -vv
```

公共RPC可能继续裁剪历史状态；将来应使用支持此块的归档节点，或重新固定新块并重新执行，不能以skip冒充通过。
