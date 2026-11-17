# Latest market funds audit: 2026-11-04

Market: `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c`.
Block: 148077576; hash `0x6564f006f010c79a96f7585370c7ac40af275f6a8476e09ea6b67eb6cba11abc`. Shanghai time: 2026-11-04 10:28:30.

Result: FAILED. Transfers and integer accounting reconcile. No outstanding player rights. Nine successful business receipts contain 19 full TSLA/USDG transfers.

| Item | TSLA |
|---|---:|
| Four buys, gross total | 0.003497647578093926 |
| One sale, gross | 0.001779908254950193 |
| Sale net, converted to 0.017628 USDG for b9 | 0.001762109172400691 |
| Failed refund pool | 0.001682762847362793 |
| Refund to b9 | 0.001004911333831393 |
| Refund to 1556 | 0.000677851513531399 |
| Creator fee paid to b9 | 0.000036942890831308 |
| Protocol fee paid to 1556 | 0.000015832667499131 |
| Market residue: fee dust 3 + refund rounding 1 raw units | 0.000000000000000004 |

Failed supply: 41.021492505304984331 gToken. b9 held 24.497190922573977692; 1556 held 16.524301582731006639. Refunds equal floor(fixed refund pool * shares / fixed supply). All shares are now burned; both previewAccount calls successfully returned [0,0,0].

Core, Router, Exchange, Adapter and early module have zero TSLA/USDG balances. This market never graduated, issued LP or opened Core staking. No Core payout is due.

## Actual cash flow per transaction

### [0x99d90c38673260c496f198a8cdc5b430a8fa44bd4628ddc368190595d0df86bd](https://explorer.testnet.chain.robinhood.com/tx/0x99d90c38673260c496f198a8cdc5b430a8fa44bd4628ddc368190595d0df86bd)

Block 147741836; caller `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2`.

| Token | From | To | Amount |
|---|---|---|---:|
| - | - | - | No token transfers |

### [0x4f8d957e3f7990c306274a7eafee0cbb3b17fa31763ce7dc5b4fd03478715630](https://explorer.testnet.chain.robinhood.com/tx/0x4f8d957e3f7990c306274a7eafee0cbb3b17fa31763ce7dc5b4fd03478715630)

Block 147743756; caller `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2`.

| Token | From | To | Amount |
|---|---|---|---:|
| TSLA | `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2` | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | 0.001000000000000000 |

### [0x11134ca24a44ef2fbbc9a221dff01129ac805b06165f67a5b62516ec5afb9f2a](https://explorer.testnet.chain.robinhood.com/tx/0x11134ca24a44ef2fbbc9a221dff01129ac805b06165f67a5b62516ec5afb9f2a)

Block 147744090; caller `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2`.

| Token | From | To | Amount |
|---|---|---|---:|
| TSLA | `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2` | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | 0.001000000000000000 |

### [0xd1d281ae807d11edaa65737382d5f38d1d75f543c22055c7861c0f307b67c8f4](https://explorer.testnet.chain.robinhood.com/tx/0xd1d281ae807d11edaa65737382d5f38d1d75f543c22055c7861c0f307b67c8f4)

Block 147744817; caller `0x1556a9A5C01ecc4eF11e751CacC847DD36971be7`.

| Token | From | To | Amount |
|---|---|---|---:|
| TSLA | `0x1556a9A5C01ecc4eF11e751CacC847DD36971be7` | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | 0.001000000000000000 |

### [0xb98ab3249410d31703c1cfaef47eb5e319961d4b9a38520b750a938c7a102a48](https://explorer.testnet.chain.robinhood.com/tx/0xb98ab3249410d31703c1cfaef47eb5e319961d4b9a38520b750a938c7a102a48)

Block 147746065; caller `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2`.

| Token | From | To | Amount |
|---|---|---|---:|
| TSLA | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | `0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb` | 0.001762109172400691 |
| TSLA | `0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb` | `0x3B277DfdA0851bBb2888d07D1EC4BD059b805300` | 0.001762109172400691 |
| USDG | `0x8cC4de04B1a61c25ad7b4a3Cf23D15547aC670DB` | `0x3B277DfdA0851bBb2888d07D1EC4BD059b805300` | 0.017628 |
| TSLA | `0x3B277DfdA0851bBb2888d07D1EC4BD059b805300` | `0x8cC4de04B1a61c25ad7b4a3Cf23D15547aC670DB` | 0.001762109172400691 |
| USDG | `0x3B277DfdA0851bBb2888d07D1EC4BD059b805300` | `0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb` | 0.017628 |
| USDG | `0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb` | `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2` | 0.017628 |

### [0x8152ec86c99a658597c82554f42d29760f5df7121e78c0c7f679dc89e1e077fc](https://explorer.testnet.chain.robinhood.com/tx/0x8152ec86c99a658597c82554f42d29760f5df7121e78c0c7f679dc89e1e077fc)

Block 147770859; caller `0x1556a9A5C01ecc4eF11e751CacC847DD36971be7`.

| Token | From | To | Amount |
|---|---|---|---:|
| USDG | `0x1556a9A5C01ecc4eF11e751CacC847DD36971be7` | `0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb` | 0.005000 |
| USDG | `0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb` | `0x3B277DfdA0851bBb2888d07D1EC4BD059b805300` | 0.005000 |
| TSLA | `0x8cC4de04B1a61c25ad7b4a3Cf23D15547aC670DB` | `0x3B277DfdA0851bBb2888d07D1EC4BD059b805300` | 0.000497647578093926 |
| USDG | `0x3B277DfdA0851bBb2888d07D1EC4BD059b805300` | `0x8cC4de04B1a61c25ad7b4a3Cf23D15547aC670DB` | 0.005000 |
| TSLA | `0x3B277DfdA0851bBb2888d07D1EC4BD059b805300` | `0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb` | 0.000497647578093926 |
| TSLA | `0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb` | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | 0.000497647578093926 |

### [0x331d389375e7d5ac67e74e90f07946cb0628011ec4b4be1ea21539b78f04bb09](https://explorer.testnet.chain.robinhood.com/tx/0x331d389375e7d5ac67e74e90f07946cb0628011ec4b4be1ea21539b78f04bb09)

Block 148075465; caller `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2`.

| Token | From | To | Amount |
|---|---|---|---:|
| TSLA | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2` | 0.000036942890831308 |
| TSLA | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | `0x1556a9A5C01ecc4eF11e751CacC847DD36971be7` | 0.000015832667499131 |

### [0xe3e7af9a06f2e47c6ed43f903933e6eee55db56339f4433532445c4cf4fb1a5a](https://explorer.testnet.chain.robinhood.com/tx/0xe3e7af9a06f2e47c6ed43f903933e6eee55db56339f4433532445c4cf4fb1a5a)

Block 148075805; caller `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2`.

| Token | From | To | Amount |
|---|---|---|---:|
| TSLA | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | `0xb9C5A10Abd15e5583Da8Ab67EBA3D51092db28F2` | 0.001004911333831393 |

### [0x498e21996f221e8d3049bd6b62fd722c8cd7892e294226df6715d2911645d4f6](https://explorer.testnet.chain.robinhood.com/tx/0x498e21996f221e8d3049bd6b62fd722c8cd7892e294226df6715d2911645d4f6)

Block 148076025; caller `0x1556a9A5C01ecc4eF11e751CacC847DD36971be7`.

| Token | From | To | Amount |
|---|---|---|---:|
| TSLA | `0x6e79FFd6AD7A15A7CAF8BDE49448F0036BcbC99c` | `0x1556a9A5C01ecc4eF11e751CacC847DD36971be7` | 0.000677851513531399 |

## Scope

Read-only fixed-block audit of this market. Token cash flows are not combined into P&L. Swap price optimality, standalone approvals and failed transaction gas are outside scope. No transactions, deployments or code changes were made.
