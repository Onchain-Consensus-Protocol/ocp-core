# Live testnet fund-flow audit (2026-11-02)

Fixed block: 146907088, hash 0x79a56b74473179187881cf9c743506120ca2c99e065e8242f1cbb3de270eee1b.
Market: 0x79C556847D7F14c61D7AF6aD27d2f25e97b87849.
Core: 0x3392c48E9BE8fcE4117EF21Fe7ed6FE9bf7C88dA.
Scope: all current-factory markets (1), 54 events, 49 token transfers and 17 successful receipts since deployment. Read-only; no transactions sent.

Result: exact-integer replay of Market buckets matches events, getters and actual transfers. Core cash equals outstanding obligations. No unexplained diversion observed within this scope. This is not a complete security audit or source/runtime equivalence proof.

| Item | TSLA | Status |
|---|---:|---|
| Creator fees | 0.000102020968169232 | Paid to configured 1556...1be7 |
| Fixed protocol fees | 0.000565729677761604 | Paid to configured 1556...1be7 |
| Unallocated Core fees | 0.001218014946607847 | Paid to configured 1556...1be7 |
| LP settlement | 0.006615678493646900 | Paid to LP holder 1556...1be7 |
| NO outcome payout | 0.100000000000000000 | Paid to b9C5...28F2 |
| Core winning principal pool | 1.111864520145267287 | Paid to b9C5...28F2 |
| Successful early-proposal bond refund | 1.250000000000000000 | Claimable only by b9C5...28F2, not claimed |
| Market rounding dust | 0.000000000000000009 | Still in Market |

Market total input 0.148134581896452973 minus output 0.148134581896452964 equals 9 raw units, exactly accountedBalance and dust. Core input 2.363082535091875134 minus output 1.113082535091875134 equals 1.25, exactly totalEarlyBondRefunds and the proposer's claimableEarlyBond. Router, Exchange, Adapter and proposal module hold zero TSLA and USDG.

All four Core fee deposits preceded the first stake. Later stakes do not receive historical fees; these fees correctly went to the fixed official recipient. The YES principal 0.111864520145267287 formed part of the NO winning principal payout. Historical stakeOf/totalPrincipal persist after settlement and are not outstanding debt.

LP initial capital was 0.014428679783934282. Its settlement loss of 0.007813001290287382 (approximately 54.15 percent) is market-making PnL, not an unpaid claim.

Two routed buys refunded surplus stock 0.000403923279535845 and 0.000403866265344729 to the original buyer. The routed sell paid 0.289315 USDG, above its original minimum.

Evidence: .local/audits/20261102-live-funds/snapshot.json and summary.json. No code change, publication, deployment or payment executed.
