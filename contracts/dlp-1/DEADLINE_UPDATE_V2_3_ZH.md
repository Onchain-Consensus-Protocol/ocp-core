# DLP-1 v2.3 截止时间更新结果

2026-10-22。实际仓库 `/Users/chen/Desktop/OCP/ocp-core` 已更新本地源码，未推送、未部署。

## 当前规则

- Genesis＝创建后3小时，由合约固定。
- 创建者指定Formal、Core和话题三个绝对截止，要求Genesis < Formal、Formal+1小时 < Core、Core < Topic。
- 按用户原文严格小于，恰好相差1小时拒绝；Demo默认相对创建3/4/6/7小时，后三项可填。
- Formal与Core仍只在毕业时同时开放，截止不重置；Topic不替代Core截止或现有结果机制。
- 原3.6/.6双池毕业、手续费、LP/B资金权益及失败结算均保持。未采用研究中的方向双线或资金重分。

## 实现

Market新增topicCutoff，构造与MarketDeployer接收formalEnd/coreEnd/topicEnd。两个Factory校验时间并在记录与事件公开截止，创建接口为：

```solidity
createMarket(string topic, string yesRule, string noRule, string invalidRule,
             uint64 formalEnd, uint64 coreEnd, uint64 topicEnd)
```

保留Core Adapter原有截止一致性校验。部署脚本initcode检查从8个构造参数改为10个。旧Factory/Deployer与旧调用ABI不能当新版本继续使用；本轮没有部署任何版本。

前端模型TG固定10800秒，TF/TC/TT独立配置。股票Demo透传配置；创建卡校验顺序；四节点展示、市场/Core分别倒计时、How双语和演示参考快照均已同步。Topic只用于顺序约束和展示，不要求等待到Topic才结算。

## 验证

- 合约：25 suites，168通过、0失败、1跳过；跳过项需要显式主网Fork环境。本轮未重跑主网Fork，不把跳过称通过。
- 新增7项合约期限测试：严格间隔、最后一秒毕业、截止同秒拒绝、跨节点失败/结算、uint64范围。
- 前端：实际仓库默认配置运行16文件129测试通过，tsc --noEmit和npm run build通过。
- 浏览器：非法4/5/7组合禁止创建，恢复4/6/7可创建，Genesis倒计时3小时，Core毕业前保持未开启，四截止显示03/04/06/07。
- 实际源码与通过测试的暂存源码逐文件一致；source-manifest.json记录指纹。
- forge build --offline --sizes成功，Market runtime24382/24576字节，余194；含构造参数initcode30404/49152。未来增功能须继续检查大小。

日志和截图位于研究工作区outputs/deadline-update，包含deadline-tests.txt、deadline-sizes.txt、frontend-tests.txt、code-sizes.json、source-manifest.json、preview.png。

复核发现并修正两部署脚本少计64字节构造参数的大小检查；独立只读复核未发现本次截止修改带来的阻塞性资金或权限问题。测试通过不代表第三方审计或生产可上线，既有毕业估值问题未被本轮修改解决。
