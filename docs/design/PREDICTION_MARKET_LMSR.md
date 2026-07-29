# OCP 二元 LMSR 预测市场

## 状态

本实现替换了旧的恒定乘积原型，目标是进入独立审计和限额灰度阶段。未经独立审计、
Base 主网分叉测试和小额灰度验证，不应直接开放无限额真实资金交易。

## 定价

市场使用 50/50 初始概率的对数市场评分规则（LMSR）：

```text
C(qYES, qNO)
= b × ln(exp(qYES / b) + exp(qNO / b))
- b × ln(2)
```

`qYES` 和 `qNO` 是未卖回、未赎回的份额总量，`b` 是不可修改的流动性参数。

边际价格：

```text
pYES = exp(qYES / b) / (exp(qYES / b) + exp(qNO / b))
pNO  = 1 - pYES
```

购买精确份额的成本为成本函数增加量；卖出精确份额的退款为成本函数减少量。
购买向上取整、卖出向下取整。手续费按该笔税前 USDC 资金流计算，不按 shares
名义价值计算：

```text
totalFee = ceil(abs(gross USDC cash flow) × 1.2%)
vaultFee = floor(abs(gross USDC cash flow) × 1.0%)
officialFee = totalFee - vaultFee
```

买入时用户支付 `grossCost + totalFee`；卖出时用户收到
`grossPayout - totalFee`。买卖两侧都收费。每笔交易独立计算，最小单位舍入余数归
`officialLiquidityPool`，不使用会改变后续交易归属的跨交易余数。

每笔 `vaultFee` 在交易内原子存入 Vault，并按手续费发生时的质押状态同时记录三套
互斥条件账：

```text
YES 账：     用户 YES 质押 / 当时 YES 总质押
NO 账：      用户 NO 质押 / 当时 NO 总质押
INVALID 账：用户 YES 或 NO 质押 / 当时 YES+NO 总质押
```

最终只兑现与 outcome 对应的一套。INVALID 方向的质押不获得 PM 手续费。新质押只参与
进入后的手续费，不能追溯领取历史手续费；某个候选账在手续费发生时分母为零，则该笔在
该终局下归官方初始流动性池。

手续费权益没有领取截止时间。用户可以自行随 Vault 本金领取，也允许任何地址代为触发
`claimMarketFeesFor(user)`；资金只能发送给原质押者，触发者不能改变接收地址。这样既
保留长期领取权，也不会因为用户不主动发交易而永久阻塞最终手续费尘埃结清。

当两侧净份额差达到约 `41.45 × b` 后，18 位定点数无法继续表示更小一侧的非零概率，
界面价格会饱和为 `0/1`。此时不足一个 USDC 最小单位的极小交易会以 `TradeTooSmall`
拒绝，而不是静默免费成交；这不破坏偿付上界，但属于极端价格下的最小成交限制。

## 补贴与偿付

创建市场时 Factory 必须原子锁定：

```text
requiredSubsidy = ceil(b × ln(2)) + 2 个抵押品最小单位
```

这不是 LP 存款，也不铸造 LP Token。它是协议为该市场预先限定的整个生命周期最坏损失预算。

交易期合约持续强制：

```text
collateralBalance - feeEscrow
>= max(totalYesShares, totalNoShares) + mathBuffer
```

解析后责任固定为：

```text
YES     → 每份 YES 兑付 1
NO      → 每份 NO 兑付 1
INVALID → 每份 YES 或 NO 兑付 0.5
```

抵押品最小单位不可再分割，因此 INVALID 按每个账户合并后的总份额向下取整。每个账户最多产生
0.5 个抵押品最小单位的尘埃；相关份额赎回后，尘埃成为补贴提供方可提取的超额资金。

补贴提供方只能在解析后提取超过剩余固定责任的资金。每笔 1.0% 已进入 Vault 的独立
条件奖励桶，不能混入本金 `settlementPool`；0.2% 继续托管在 Market，不能冒充 LMSR
偿付准备金。终局后只开放选中账本，未分配金额和领取计算尘埃归官方初始流动性池。
本金结算仍沿用“最后一名合格本金领取者吸收本金池最小单位尘埃”的规则；这里归官方的
尘埃仅指 PM 手续费奖励桶。

## 状态机

```text
UNFUNDED
→ Factory 原子注入补贴并 activate
→ OPEN
→ Vault 截止后冻结结果
→ 每笔交易原子存入 1.0% 并更新三套条件账
→ Vault 终局选择唯一手续费账并设置 settlementReady
→ RESOLVED
→ 用户领取 Vault 本金结算与对应手续费，并赎回 PM 持仓
```

市场截止时间直接读取绑定 Vault 的 `resolutionTime`，调用方不能传入第二个截止时间。

用户交易同时携带：

- 精确买入/卖出的份额数量；
- `maxTotalCost` 或 `minPayout`；
- 用户交易 `deadline`。

## 工厂约束

- 唯一生产入口是 `OCPVaultFactory.createMarket`；
- Factory 通过两个轻量部署器在同一笔交易部署并一对一登记 Vault 与 Prediction Market，
  避免 Factory runtime 嵌入两份 creation bytecode 而超过 EIP-170；
- 允许 Vault 在零本金状态与 Prediction Market 同步冷启动；
- 空 Vault 到期固定终局为 `INVALID`；
- 只有官方 Factory owner 可以创建；
- 条件类型固定为 OCP Vault 终局，题面由 Factory 直接读取 Vault 官方元数据并编码；
- 创建、补贴转入和激活在一笔交易内完成；
- 抵押品实际到账必须等于名义转账金额。

市场合约地址可以在部署前预计算，因此 `activate` 接受余额大于最低补贴。第三方提前转入的
额外资金会成为额外补贴，不能用 1 个最小单位卡死 Factory 的后续 CREATE nonce。

## 抵押品限制

当前版本只支持 6 位小数的标准 ERC20，生产目标是 Base 官方 USDC。不支持：

- fee-on-transfer；
- rebasing；
- ERC777 回调语义；
- 任意用户选择的抵押品。

USDC 自身的暂停和黑名单能力仍属于发行方信任边界：被黑名单地址可能暂时无法卖出或赎回。

用户索赔当前没有超时失效规则。未赎回的赢家份额会一直作为固定负债保留，并可能让对应补贴资金
长期锁定；协议不能把未领取用户资金当作可提取余额。

## 结果来源信任边界

Prediction Market 不验证现实世界事实，只复制 OCP Vault 的链上终局。Vault 结果由公开质押资金决定，
因此同时参与 PM 和 Vault 的用户可能进行跨系统策略。LMSR 保证的是市场偿付和协议补贴亏损上界，
不保证 Vault 终局等于链下真实事实，也不消除操纵 Vault 共识结果的经济动机。

## 上线门槛

正式启用前至少需要：

1. 独立智能合约安全审计；
2. LMSR 定点数学差分测试与舍入证明复核；
3. Base 主网分叉上的官方 USDC 集成测试；
4. 统一 Factory、Vault、Market 与前端地址的生产部署和源码验证；
5. 设置单市场 `b`、并发市场补贴总额和 Treasury 风险上限；
6. 小额交易限额灰度；
7. 监控余额、未偿责任、手续费和异常回滚；
8. 明确 Vault 结果可被资金影响的产品披露。
