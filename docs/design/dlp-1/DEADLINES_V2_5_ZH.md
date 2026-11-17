# 截止时间规则 v2.5（2026-10-26）

取代 v2.4 的 Genesis 固定创建后 3 小时截止。用户曾提出 Genesis 与话题同时截止，随后明确纠正为 Genesis 比 Formal 提前 1 小时；以本版本为准。

创建者仍只设置最终截止 TC（Core 截止）：

- Genesis：TG = TF − 1 小时 = TC − 2 小时。
- 正式市场：TF = TC − 1 小时。
- Core 与话题同时截止：TT = TC。
- 原创建下限保留：TC 必须晚于创建后 4 小时。
- 例如最终截止为创建后 6 小时，Genesis / Formal / Core / Topic 截止为 4 / 5 / 6 / 6 小时；最终截止为 12 小时则为 10 / 11 / 12 / 12 小时。
- Formal 和 Core 仅在毕业后开启。提前毕业不重置任何截止时间。
- Genesis 截止当秒起禁止 Genesis 买卖；未毕业则按原规则进入失败清算。
- Genesis 最后一秒毕业后，正式交易仍有 1 小时加 1 秒，Core 仍有 2 小时加 1 秒；不需要新增状态分支。
- Formal 截止当秒停止正式交易，Core 继续接受合规质押至最终截止；最终截止起按原规则结算。
- 新建市场采用新期限；存量多人市场保留创建时保存的截止，不迁移、不复活 FAILED、不重置结算预算。

其他规则保持：Genesis 94.5% / 4.5% / 1%；双池 3.6 / 0.6 ETH 等值门槛，买卖均可触发；毕业 gToken 转 LP；正式市场 2% 分配与 Core、LP/B 的现有结算及销毁规则均不变。

1% 领取费仍仅为讨论方案，不接入合约或前端。本次不部署合约，不自动发布前端或推送代码。

## Calendar input (2026-10-26)

The creator selects a local calendar date and time. The UI shows the device time zone and selected UTC offset, then sends coreDeadline as fixed UTC epoch seconds. The server checks remaining duration >4 hours inside the transaction lock. Genesis and Formal are derived from that fixed final timestamp. Legacy coreHours API requests remain accepted, but cannot be combined with coreDeadline.
