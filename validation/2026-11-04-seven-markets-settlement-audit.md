# Seven test markets: settlement audit

Fixed block 148255726; `0x039388a8134ac7880875daf57221f4313c6923c7e1620683f50af52fe514da68`.
Shanghai time: 2026-11-04 17:07:48.

Scope: seven markets, 67 successful business receipts, 129 full TSLA/USDG transfers. Read-only. No claims or transfers initiated by the auditor.

Result: all seven markets settled; all checked funds reconcile. Two unclaimed LP payouts remain. Other market residues are rounding only. Core and intermediary token balances are zero.

## Market results and remaining funds

| Market | Result | LP initial budget (TSLA) | Contract balance (TSLA) | Remaining rights |
|---|---|---:|---:|---|
| [1. exit](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x38bcff2976Fd4F6Be93a605c57D9F37fF2De6638) | INVALID | 0.005185408602560435 | 0.000000000000000012 | No player rights; rounding only |
| [2. early](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x421e0d1147DB6ccEa8429B20E08C16f3e43cDb88) | YES | 0.004257000000000000 | 0.004257000000000000 | 1556: unclaimed LP payout 0.004257000000000000 TSLA |
| [3. empty](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x6497946e865646852717a5887f281479Ca869147) | INVALID | 0.006891839136168395 | 0.000000000000000002 | No player rights; rounding only |
| [4. tie](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x98c311827874080a6830bF444D661fa70f289d0d) | INVALID | 0.008580035588372107 | 0.000000000000000006 | No player rights; rounding only |
| [5. minority](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x44773B51832BaDa0DEc1D36A35C8b1C6dD0d7d6A) | INVALID | 0.005148000000000000 | 0.000000000000000001 | No player rights; rounding only |
| [6. claims](https://market.ocp-protocol.org/testnet.html?lang=en&market=0xd99C6685ebAaccE7a1cA8e407C84E787931AC718) | NO | 0.041894772094547745 | 0.000000000000000007 | No player rights; rounding only |
| [7. swap](https://market.ocp-protocol.org/testnet.html?lang=en&market=0x0bd2f7947385a72f2b31000717622467D268689a) | INVALID | 0.004257000000000000 | 0.004257000000000000 | 1556: unclaimed LP payout 0.004257000000000000 TSLA |

The early and swap market each owe 0.004257 TSLA to 0x1556a9a5c01ecc4ef11e751cacc847dd36971be7. The LP rights remain in escrow: wallet ERC20 balance being zero does not mean no entitlement. Use Claim market payout to collect; receiving LP into the wallet first is not required. Total unclaimed LP: 0.008514 TSLA.

Other five markets retain 28 raw TSLA units in total: exit 12, empty 2, tie 6, minority 1, claims 7. Minority is final LP division rounding; the rest are fee rounding.

## Fee allocation (TSLA)

| Market | Creator, paid | Fixed protocol, paid | LP fees, included in LP budget | Core fees, paid to protocol |
|---|---:|---:|---:|---:|
| exit | 0.000036400000000000 | 0.000025022580768129 | 0.000031408602560435 | 0.000021986021792304 |
| early | 0.000030100000000000 | 0.000012900000000000 | 0.000000000000000000 | 0.000000000000000000 |
| empty | 0.000031500000000000 | 0.000036035876170207 | 0.000075119587234024 | 0.000052583711063816 |
| tie | 0.000030100000000000 | 0.000111196319964763 | 0.000327654399882544 | 0.000229358079917781 |
| minority | 0.000036400000000000 | 0.000015600000000000 | 0.000000000000000000 | 0.000000000000000000 |
| claims | 0.000030170000000000 | 0.000187559915438021 | 0.000582099718126744 | 0.000407469802688720 |
| swap | 0.000030100000000000 | 0.000012900000000000 | 0.000000000000000000 | 0.000000000000000000 |

All 14 creator/protocol fee payments succeeded to the fixed creator/protocol address 0x1556a9a5c01ecc4ef11e751cacc847dd36971be7. All Core fees in these seven markets ended up in protocol allocation and were paid. LP fees are already included in LP settlement budgets; do not add them again to payouts.

## Exit, restaking and failed proposal evidence

- exit: 0.010000000000000000 TSLA principal; 0.009000000000000000 refunded, 0.001000000000000000 penalized. No final Core participants remained; the penalty and unallocated fees went to the fixed protocol recipient.
- claims: exited YES principal 0.000750409401032975; refund 0.000675368460929677, penalty 0.000075040940103298. The same account later staked NO principal 0.001263288331884325. Final NO principal payout was 0.001338329271987623 including that penalty. Old YES fee eligibility was not restored after restaking.
- early: requested NO but YES won. The 1.250000000000000000 TSLA bond was forfeited into the Core principal pool. The proposer was also the sole YES winner and therefore received 1.260000000000000000 TSLA including their own 0.010000000000000000 stake. This is permitted by the current mechanism, not a separate bond refund.
- Fees have outcome-conditional histories. FeeHistoryForfeited YES and INVALID columns can represent the same underlying fee under different possible outcomes; adding them would double count.

## What this run does not prove

- The failed early request was processed after the original final deadline (regularDeadline=true). This verifies bond forfeiture and final settlement, not reopening trading before the final deadline or submitting a second request.
- The swap market has no successful swap business transaction in this snapshot. Successful receipts alone cannot establish that a failed swap reverted correctly. A failed receipt and before/after balances are needed.
- This run does not exercise failed automatic token transfers, successful early-bond refunds, or redistribution of a nonzero forfeited-fee bonus to eligible users.
- There are two independent interacting wallets, not a broad many-user stress test. Different claim orders observed here are not an exhaustive permutation test.
- Independent approvals and failed transaction gas are outside this successful-business-receipt collector. This is not a full source/runtime equivalence or mainnet readiness audit.

## Addresses and per-account claims

### exit

Market `0x38bcff2976Fd4F6Be93a605c57D9F37fF2De6638`; Core `0x196a3f9b64E488B9C0a4B72DB0b02e1526384D1F`; LP token `0x1e5CA06B5306E082bBdd1a209b1d6ECAD9b44825`.

| Account | Current escrow LP rights | Current wallet LP | Market payout preview (TSLA) | Claimable Core fees | Claimable bond |
|---|---:|---:|---:|---:|---:|
| `0x1556a9a5c01ecc4ef11e751cacc847dd36971be7` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| `0xb9c5a10abd15e5583da8ab67eba3d51092db28f2` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

Historical stakeOf persists after Core withdrawal and must not be treated as an unpaid debt.

### early

Market `0x421e0d1147DB6ccEa8429B20E08C16f3e43cDb88`; Core `0x6250c17ba57B7ba852688846Bf0857506285Dc2B`; LP token `0xB071857a24b33E7eE0a1DCC3d72A7E98cA0361dC`.

| Account | Current escrow LP rights | Current wallet LP | Market payout preview (TSLA) | Claimable Core fees | Claimable bond |
|---|---:|---:|---:|---:|---:|
| `0x1556a9a5c01ecc4ef11e751cacc847dd36971be7` | 65.245689512794636416 | 0.000000000000000000 | 0.004257000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| `0xb9c5a10abd15e5583da8ab67eba3d51092db28f2` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

Historical stakeOf persists after Core withdrawal and must not be treated as an unpaid debt.

### empty

Market `0x6497946e865646852717a5887f281479Ca869147`; Core `0xC194B0df2e503893D8cD22B7646E52a65d994B00`; LP token `0xb3c627E7Dd9f57179633CF2773794D9787bE4F56`.

| Account | Current escrow LP rights | Current wallet LP | Market payout preview (TSLA) | Claimable Core fees | Claimable bond |
|---|---:|---:|---:|---:|---:|
| `0x1556a9a5c01ecc4ef11e751cacc847dd36971be7` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| `0xb9c5a10abd15e5583da8ab67eba3d51092db28f2` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

Historical stakeOf persists after Core withdrawal and must not be treated as an unpaid debt.

### tie

Market `0x98c311827874080a6830bF444D661fa70f289d0d`; Core `0x223Fd4bFe5082711A43855462759983c791E48ec`; LP token `0x37Dc74a0Ae90b1Feb9cf8e959F8AAead6175FB30`.

| Account | Current escrow LP rights | Current wallet LP | Market payout preview (TSLA) | Claimable Core fees | Claimable bond |
|---|---:|---:|---:|---:|---:|
| `0x1556a9a5c01ecc4ef11e751cacc847dd36971be7` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| `0xb9c5a10abd15e5583da8ab67eba3d51092db28f2` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

Historical stakeOf persists after Core withdrawal and must not be treated as an unpaid debt.

### minority

Market `0x44773B51832BaDa0DEc1D36A35C8b1C6dD0d7d6A`; Core `0x8A17c39503d3F65A6994A848942AC619ea8ad8B6`; LP token `0x3fa359603A02dc011ebA771117D86acDc15E3c16`.

| Account | Current escrow LP rights | Current wallet LP | Market payout preview (TSLA) | Claimable Core fees | Claimable bond |
|---|---:|---:|---:|---:|---:|
| `0x1556a9a5c01ecc4ef11e751cacc847dd36971be7` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| `0xb9c5a10abd15e5583da8ab67eba3d51092db28f2` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

Historical stakeOf persists after Core withdrawal and must not be treated as an unpaid debt.

### claims

Market `0xd99C6685ebAaccE7a1cA8e407C84E787931AC718`; Core `0x8C5fB3E1bB61F2F2DD86E228659c65759315Af05`; LP token `0xB75751d5aB73D4FcEa68CC30682e49f7c55b8E82`.

| Account | Current escrow LP rights | Current wallet LP | Market payout preview (TSLA) | Claimable Core fees | Claimable bond |
|---|---:|---:|---:|---:|---:|
| `0x1556a9a5c01ecc4ef11e751cacc847dd36971be7` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| `0xb9c5a10abd15e5583da8ab67eba3d51092db28f2` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

Historical stakeOf persists after Core withdrawal and must not be treated as an unpaid debt.

### swap

Market `0x0bd2f7947385a72f2b31000717622467D268689a`; Core `0x2830F5fe8e84A96b0676246140fAF60A4CF33852`; LP token `0x2C4a1416aB981740f421f7fbdfe7afE0cd198Dde`.

| Account | Current escrow LP rights | Current wallet LP | Market payout preview (TSLA) | Claimable Core fees | Claimable bond |
|---|---:|---:|---:|---:|---:|
| `0x1556a9a5c01ecc4ef11e751cacc847dd36971be7` | 65.245689512794636416 | 0.000000000000000000 | 0.004257000000000000 | 0.000000000000000000 | 0.000000000000000000 |
| `0xb9c5a10abd15e5583da8ab67eba3d51092db28f2` | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 | 0.000000000000000000 |

Historical stakeOf persists after Core withdrawal and must not be treated as an unpaid debt.
