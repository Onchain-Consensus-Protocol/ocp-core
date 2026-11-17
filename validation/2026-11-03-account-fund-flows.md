# 测试网逐账户资金流核对

固定区块 **147585990**；北京时间 **2026-11-03 16:34:37**。区块哈希 `0x0051c4d97d4e720247ad31469c9b6ab8863dd277f2dd961cac13982d1e739fbf`。

范围：当前工厂全部两个市场，33 笔成功业务交易；只读核对。地址大小写归一后实际为 **2 个钱包**。股票为 TSLA（18 位小数），USDG 为 6 位小数。

结论：实际资金转账、费用和结算账本相符，未发现错转。两个 Core 及 Router/Exchange/Adapter/申请模块余额均为零；市场剩余分别为 9、12 个最小 TSLA 单位，与舍入账本一致。

## 合约与账户

- M1：Market `0x79C556847D7F14c61D7AF6aD27d2f25e97b87849`；Core `0x3392c48E9BE8fcE4117EF21Fe7ed6FE9bf7C88dA`；最终结果 **NO**。
- M2：Market `0x5566A462948f5d124820f3946D361724eC3a5a8b`；Core `0xc139d7b39dAe95258f3A86880DA93cDe44592dEF`；最终结果 **YES**。
- 账户 A `0x1556a9a5c01ecc4ef11e751cacc847dd36971be7`。
- 账户 B `0xb9c5a10abd15e5583da8ab67eba3d51092db28f2`。

## 账户净收支（限定本次业务交易）

| 账户 | TSLA 实付 | TSLA 实收 | TSLA 净变化 | USDG 实付 | USDG 实收 | USDG 净变化 |
|---|---:|---:|---:|---:|---:|---:|
| 账户 A | 0.003941185561537085 | 0.015404055154134208 | 0.011462869592597123 | 2.713124 | 2.303070 | -0.410054 |
| 账户 B | 2.313226530612244899 | 2.462765651707038938 | 0.149539121094794039 | 1.103386 | 0.172344 | -0.931042 |

**两种币的净变化不能直接相加作为盈亏**。此表包含兑换、退款、费用收入和本金返还；不含钱包其他转账和独立授权／失败交易 gas。兑换剩余股票退回钱包会同时计入实收，逐笔明细明确列示。

## 账户 A：`0x1556a9a5c01ecc4ef11e751cacc847dd36971be7`

| 交易 / 区块 | 动作 | 钱包支出 | 钱包收入 | 本账户支付的 ETH gas |
|---|---|---|---|---|
| [0x53ad0a4a…](https://explorer.testnet.chain.robinhood.com/tx/0x53ad0a4a6c85a2f5aab0f037ed21f749a2f7f03c8ebcb56c61ebd5be36839dfa)<br>146795100 | 合约业务交互 | — | — | 0.000019148090000000 |
| [0x610285b9…](https://explorer.testnet.chain.robinhood.com/tx/0x610285b931b512f66e501532226b99f0066a33a53d7d528393e937530d92ccb2)<br>146795190 | 合约业务交互 | — | — | 0.000001827620000000 |
| [0x6e8fe221…](https://explorer.testnet.chain.robinhood.com/tx/0x6e8fe22171bed179d3832c4cfb746a1fd2315ff1492101609604893af6774bed)<br>146822122 | 创建 M1 | — | — | 0.000115328380000000 |
| [0xfdef3611…](https://explorer.testnet.chain.robinhood.com/tx/0xfdef3611621cc7e8bc5a3c0b35363c05c94c3d22e41727054aa689a06012f1f6)<br>146839710 | M1 Genesis 买入 gToken | 0.100000 USDG → Router | — | 0.000007329390000000 |
| [0xeea7e564…](https://explorer.testnet.chain.robinhood.com/tx/0xeea7e564513a60ce42376c794773ac4efd70a7e77d92eaead29c5921f353632b)<br>146844223 | M1 买入 YES | 0.305285 USDG → Router | 0.000403923279535845 TSLA ← Router | 0.000007283600000000 |
| [0xd122b3f1…](https://explorer.testnet.chain.robinhood.com/tx/0xd122b3f157a4b9c5734f81e31df5a25a5f7a3e18300734037c800a4c532bf50c)<br>146845421 | M1 卖出 YES | — | 0.289315 USDG ← Router | 0.000005979270000000 |
| [0xd89fa93a…](https://explorer.testnet.chain.robinhood.com/tx/0xd89fa93aacded13eabd411016f07ef48e574ce0719b08d0a40ef61da5703add9)<br>146846893 | M1 买入 YES | 0.306839 USDG → Router | 0.000403866265344729 TSLA ← Router | 0.000006736290000000 |
| [0x19eec41d…](https://explorer.testnet.chain.robinhood.com/tx/0x19eec41dc6114f64a768d50e26d6a67cea03265253ac00a1271e8178616f8013)<br>146853840 | Core 质押 YES | 1.000000 USDG → Router | — | 0.000005038800000000 |
| [0xd6772ccd…](https://explorer.testnet.chain.robinhood.com/tx/0xd6772ccd53a4576072a579d1d76bf81e53a229e7765793f5bb9edf7546498aba)<br>146856464 | 合约业务交互 | — | — | 0.000000594160000000 |
| [0xcc534fb2…](https://explorer.testnet.chain.robinhood.com/tx/0xcc534fb20e51e7a0f51f4f4d9e88a6c97830196a1cda172bb856ec08ade4922d)<br>146877349 | 执行结算；自动发放市场手续费；发放 Core 未分配手续费 | — | 0.000102020968169232 TSLA ← M1 Market<br>0.000565729677761604 TSLA ← M1 Market<br>0.001218014946607847 TSLA ← M1 Core | 0.000006193880000000 |
| [0x4d9b49df…](https://explorer.testnet.chain.robinhood.com/tx/0x4d9b49df445b6473e852488227411cf5d05fe1e500715d91001b1aeeeeeeb221)<br>146905035 | 领取 Core 结算款 | — | — | 0.000001373240000000 |
| [0xaaac5218…](https://explorer.testnet.chain.robinhood.com/tx/0xaaac5218ac93585487f044af0cb70013424b83af7b5b75f7c53acb0a64a2ced6)<br>146905184 | M1 领取 LP；M1 领取 结果份额 | — | 0.006615678493646900 TSLA ← M1 Market | 0.000001067540000000 |
| [0xcb0a64eb…](https://explorer.testnet.chain.robinhood.com/tx/0xcb0a64eb2d6c691fb48588e448dfb0363a776da379370dbbf01ae8fefcc5f96b)<br>147367387 | M2 Genesis 买入 gToken | 0.001000 USDG → Router | — | 0.000004248860000000 |
| [0xbf711291…](https://explorer.testnet.chain.robinhood.com/tx/0xbf71129129a7c0895e73a1ab1a26118d2abc337e3634862f9abceef54ffaabc2)<br>147393564 | M2 Genesis 买入 gToken | 0.003000000000000000 TSLA → M2 Market | — | 0.000003794600000000 |
| [0xa1df1e30…](https://explorer.testnet.chain.robinhood.com/tx/0xa1df1e3050d0b22eaff2eab7c3334e0d628e2e12b7104e03dad67f230b0b0b47)<br>147394533 | Core 质押 YES | 1.000000 USDG → Router | — | 0.000005448810000000 |
| [0x1c3fc707…](https://explorer.testnet.chain.robinhood.com/tx/0x1c3fc707120200b770bc32b3103ebcab52c22f5fb96d3c10c527dac965b5b6a9)<br>147401463 | M2 买入 NO | 0.000941185561537085 TSLA → M2 Market | — | 0.000003769510000000 |
| [0x1f2d06ef…](https://explorer.testnet.chain.robinhood.com/tx/0x1f2d06efce5e2bc423b5ad39fa9496aa8c51d221e51775a8c41d2ae6fd23f012)<br>147555186 | 执行结算；自动发放市场手续费 | — | 0.000073897219924092 TSLA ← M2 Market | 0.000005435720000000 |
| [0xedcfdd59…](https://explorer.testnet.chain.robinhood.com/tx/0xedcfdd59daeffc0b07dfbd56dc287dc7fbf0ee00962c2bd11b4e51157f214455)<br>147568665 | M2 领取 LP；M2 领取 结果份额 | — | 0.006020924303143959 TSLA ← M2 Market | 0.000001359810000000 |
| [0x8c97bc96…](https://explorer.testnet.chain.robinhood.com/tx/0x8c97bc96add86b8bf8f78d69ea2a6067a420b3f6582de72cbe22ad18011cf582)<br>147569078 | 领取 Core 结算款 | — | 2.013755 USDG ← Router | 0.000005668080000000 |

### 各市场最终权益

| 市场 | gToken／未物化 LP 权益 | YES | NO | 钱包 LP | Core 可领取手续费 | 成功申请保证金 |
|---|---:|---:|---:|---:|---:|---:|
| M1 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| M2 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

已抓取成功业务交易 gas 合计：**0.000207625650000000 ETH**（不是钱包全部 gas）。

快照时钱包余额：0.162933532759469264 TSLA，12.571647 USDG，0.007598968864944000 ETH；钱包余额含其他来源，不等同于本次盈亏。

## 账户 B：`0xb9c5a10abd15e5583da8ab67eba3d51092db28f2`

| 交易 / 区块 | 动作 | 钱包支出 | 钱包收入 | 本账户支付的 ETH gas |
|---|---|---|---|---|
| [0x4fff6390…](https://explorer.testnet.chain.robinhood.com/tx/0x4fff6390044cd48e2812f045822eabdc648d2c4416fe614e11006c2181e9620f)<br>146848334 | M1 买入 NO | 0.051021428571428572 TSLA → M1 Market | — | 0.000003692230000000 |
| [0xdf729e18…](https://explorer.testnet.chain.robinhood.com/tx/0xdf729e183ebd670e7e91cb31766299e7eb3338df2ca2e027f588479567644896)<br>146848621 | Core 质押 NO | 1.000000000000000000 TSLA → M1 Core | — | 0.000002579330000000 |
| [0xf3ce60fa…](https://explorer.testnet.chain.robinhood.com/tx/0xf3ce60fa6dfde9df43bd61690881e666166430d2a397c76c0ac883ad28ded7d0)<br>146850883 | 提交提前结算申请 | 1.250000000000000000 TSLA → M1 Core | — | 0.000003086390000000 |
| [0x8720c3c8…](https://explorer.testnet.chain.robinhood.com/tx/0x8720c3c8a219a8984a47c71a28adbffe8103e4fbbc62435a6835f48b50939e22)<br>146905443 | 领取 Core 结算款 | — | 1.111864520145267287 TSLA ← M1 Core | 0.000001716260000000 |
| [0x9656c6ff…](https://explorer.testnet.chain.robinhood.com/tx/0x9656c6ffce3b543cd6fcb82b6f7b727ddf0eda7bce41721d10c1b3091a1c916a)<br>146905547 | M1 领取 结果份额 | — | 0.100000000000000000 TSLA ← M1 Market | 0.000000902210000000 |
| [0x6edd8cd5…](https://explorer.testnet.chain.robinhood.com/tx/0x6edd8cd5896ce32427c04093f47f4f8c2279fadac24d7d439ac9a937442536b4)<br>146907939 | 退回提前结算保证金 | — | 1.250000000000000000 TSLA ← M1 Core | 0.000000767820000000 |
| [0xf75d1da1…](https://explorer.testnet.chain.robinhood.com/tx/0xf75d1da10a06e306780902e13fe60430fc61fc0d265f8030e43af75486590bfe)<br>147086187 | 创建 M2 | — | — | 0.000115158100000000 |
| [0x1b70d24c…](https://explorer.testnet.chain.robinhood.com/tx/0x1b70d24c884eafbeb643108d0d27e3cd2fab94f3ea3042520147ca30474b1f2d)<br>147099794 | M2 Genesis 买入 gToken | 0.000100 USDG → Router | — | 0.000005017000000000 |
| [0x22bbc507…](https://explorer.testnet.chain.robinhood.com/tx/0x22bbc5076e065e1ea19ad66d1b60060c2f0ac1bd3e55ca5813191c0ca413f780)<br>147101078 | M2 Genesis 买入 gToken | 0.002000000000000000 TSLA → M2 Market | — | 0.000001126800000000 |
| [0x42045bd9…](https://explorer.testnet.chain.robinhood.com/tx/0x42045bd997e4523d01b9647281520b48ab945c555a9529589478dd9f23d3f3c3)<br>147110158 | M2 Genesis 卖出 gToken | — | 0.000784158305521353 TSLA ← M2 Market | 0.000001071470000000 |
| [0x31d3015d…](https://explorer.testnet.chain.robinhood.com/tx/0x31d3015d457d75bc781247200466e48cb7c5dc6be0e7a0d7826f9e80f842b940)<br>147396687 | M2 买入 YES | 0.103286 USDG → Router | 0.000075684163781186 TSLA ← Router | 0.000007826440000000 |
| [0xd9bb55a9…](https://explorer.testnet.chain.robinhood.com/tx/0xd9bb55a944249ec98685e2c5402b389a5cc6d8b1da906052b6add52ebf03456c)<br>147398589 | Core 质押 NO | 1.000000 USDG → Router | — | 0.000005357020000000 |
| [0x142221c7…](https://explorer.testnet.chain.robinhood.com/tx/0x142221c7007e9cbf8b12ddf6aadb46d147ebb7792604317ab9594ea56629c5b2)<br>147399890 | M2 买入 NO | 0.010205102040816327 TSLA → M2 Market | — | 0.000004282840000000 |
| [0x1f2d06ef…](https://explorer.testnet.chain.robinhood.com/tx/0x1f2d06efce5e2bc423b5ad39fa9496aa8c51d221e51775a8c41d2ae6fd23f012)<br>147555186 | 执行结算；自动发放市场手续费 | — | 0.000041289092469112 TSLA ← M2 Market | 由触发者支付 |
| [0x15df8366…](https://explorer.testnet.chain.robinhood.com/tx/0x15df8366ecdc45a90ecd5103a20a30b124a3f393025e38673c8417af17c755b7)<br>147569888 | M2 领取 LP；M2 领取 结果份额 | — | 0.172344 USDG ← Router | 0.000004429590000000 |

### 各市场最终权益

| 市场 | gToken／未物化 LP 权益 | YES | NO | 钱包 LP | Core 可领取手续费 | 成功申请保证金 |
|---|---:|---:|---:|---:|---:|---:|
| M1 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| M2 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

已抓取成功业务交易 gas 合计：**0.000157013500000000 ETH**（不是钱包全部 gas）。

快照时钱包余额：4.149539121094794039 TSLA，4.068958 USDG，0.009832024290000000 ETH；钱包余额含其他来源，不等同于本次盈亏。

## 费用与赔付关键核对

| 项目（TSLA） | M1：NO 结算 | M2：YES 结算 |
|---|---:|---:|
| 创建者手续费 | 0.000102020968169232 → A | 0.000041289092469112 → B |
| 固定协议手续费 | 0.000565729677761604 → A | 0.000073897219924092 → A |
| Core 交易手续费 | 0.001218014946607847 → A（产生时尚无人质押） | 0.000131137754020443 → A（YES 胜方） |
| LP 累计手续费（已包含在 LP 最终预算，不重复加算） | 0.001740021352296923 | 0.000187339648600633 |
| A 实领 LP 结算款 | 0.006615678493646900 | 0.006020924303143959 |
| B 实领 LP 结算款 | 0 | 0.006788920869800081 |
| 结果份额赔付 | B：0.100000000000000000 | B：0.010000000000000000 |
| Core 赢家本金池（含其本人本金） | B：1.111864520145267287 | A：0.150832660156779279 |
| 提前申请成功保证金退回 | B：1.250000000000000000 | 无申请 |

M2 A 的 Core 本金池及手续费合计 **0.150963797910799722 TSLA**，经 Router 兑换，A 实收 **2.013755 USDG**。M2 B 的 LP 与 YES 合计 **0.016788920869800081 TSLA**，经 Router 兑换，B 实收 **0.172344 USDG**。股票输入和 USDG 输出是同一笔兑换的两条腿，不是两次赔付。

M2 A 的 Core YES 本金为 **0.085240113405270103 TSLA**，B 的 NO 本金为 **0.065592546751509176 TSLA**。YES 严格多数，A 领取全部本金池，B 的 Core 本金最终赔付为零；LP 和市场 YES 权益独立，因此 B 仍可领取自己的 LP 和 YES 份额结算款。

## 合约余额与未付债务

| 合约 | TSLA 余额 | USDG 余额 | 归属 |
|---|---:|---:|---|
| Router `0x277a48840fd9cb417a38a21f879a2cfca633d2cb` | 0.000000000000000000 | 0.000000 | 无残留 |
| Exchange `0x3b277dfda0851bbb2888d07d1ec4bd059b805300` | 0.000000000000000000 | 0.000000 | 无残留 |
| M1 Market `0x79c556847d7f14c61d7af6ad27d2f25e97b87849` | 0.000000000000000009 | 0.000000 | 费用舍入尾差 9 个最小单位 |
| M1 Core `0x3392c48e9be8fce4117ef21fe7ed6fe9bf7c88da` | 0.000000000000000000 | 0.000000 | 无残留 |
| M1 Adapter `0x71031178c7ef89cb7623bc9d365861f8a4858200` | 0.000000000000000000 | 0.000000 | 无残留 |
| M1 申请模块 `0x44da38fefd2ded9bc8b9fa9263d4679842c54b6b` | 0.000000000000000000 | 0.000000 | 无残留 |
| M2 Market `0x5566a462948f5d124820f3946d361724ec3a5a8b` | 0.000000000000000012 | 0.000000 | 费用舍入 11 + LP 分配舍入 1 个最小单位 |
| M2 Core `0xc139d7b39dae95258f3a86880da93cde44592def` | 0.000000000000000000 | 0.000000 | 无残留 |
| M2 Adapter `0xff33c5231c444ed0c9b83ad0f435b4eca0afd917` | 0.000000000000000000 | 0.000000 | 无残留 |
| M2 申请模块 `0x20ca41fe32f9d6f55d7a56ca835aac2a55670f86` | 0.000000000000000000 | 0.000000 | 无残留 |

## 核对边界

- 所有金额按链上原始整数核对，不用浮点数判断守恒。业务对应的完整 TSLA/USDG 转账见同名 CSV，包含兑换池中间腿。
- 两个 Core 本金及费用、成功申请保证金已经领取完毕；历史 stakeOf / conditionalMarketFees 不是尚欠金额。
- 市场合计余量 0.000000000000000021 TSLA，属于已识别舍入，不能描述为完全零余额。
- 未涵盖独立授权、无事件的失败调用或钱包所有历史；本次未触发退出罚金和失败申请罚没，不能称这些路径已实盘验证。
- 部分旧 ABI 中废弃 getter 读取失败，不作为零值。已用实际部署版本 Market ABI 补齐毕业、最终结算及费用事件；previewAccount 在固定历史区块仍返回 missing revert data，保持读取失败，不以它证明零债务。零权益由独立 shares/YES/NO/LP getter、实际领取、剩余负债与余额交叉证明。
- 本轮不包含完整部署字节码等价证明，也不代表主网安全审计。
