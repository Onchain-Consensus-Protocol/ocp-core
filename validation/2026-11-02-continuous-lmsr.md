# Continuous LMSR source patch

Scope: replace finite pre-minted outcome inventory with continuously issued outcome shares, while keeping b equal to graduation R, LP supply fixed, k=1e-6 and the approved fee/early-settlement rules. No free public pair mint or LP withdrawal. User rejected adding a paired redemption UI; existing redemption panel removed. Existing underlying redeemPairs API remains and is accounted/tested but no new route/writer is added.

Graduate: cash=R exactly once, external YES/NO supply=0, pool inventories=0. Buy mints shares and adds net trading cash; sell burns shares and removes gross cash. Coordinates equal external outstanding shares. Each mutation independently enforces cash >= ceil(max(YES supply, NO supply)/SCALE). Fixed-integer technical uint192 supply domain remains; it is not tied to initial inventory.

Settlement isolates actual external liability for YES, NO or INVALID half-value before allocating residual cash plus LP fees. LP and outcome claims cannot consume each other's budgets. Pair redemption burns equal external shares, reduces cash and liability equally, and does not change the price coordinate difference. No initial capital double counting.

Factory interfaceVersion4 and paper/schema4 reject old finite-inventory state. User subsequently authorized deployment and frontend release; factory 0x2b1e91Cd45eCc51C521FF4b080cf50c70c639cA8 is now deployed with Router 0x277a48840fd9cB417A38a21F879A2CFCA633d2Cb. Market count is zero. Old live contracts are unchanged; no market was created.

Validation: 289 local Solidity tests passed, 0 failed/skipped; 12 targeted tests and the real-EVM parity test passed. 334 frontend tests passed, 9 external integration tests skipped; TypeScript and testnet build passed. Ten actual-EVM snapshots refreshed. Includes 80b one-sided issuance and worst-loss bound, cash solvency through interleaved buys/sells, split-account fractional claims in all outcomes and different claim orders, existing pair redemption beyond initial capital, and early/gas/fee regressions. No new public-network fork run or independent audit claimed.

Runtime sizes in bytes: Market21266, Core22017, Adapter6459, CoreDeployer1756, MarketDeployer1329, TestnetFactory8300; all fit EIP170. Deployment/registration transactions were sent only on Robinhood testnet 46630. No market creation, buy, sell or stake test transactions were sent.
