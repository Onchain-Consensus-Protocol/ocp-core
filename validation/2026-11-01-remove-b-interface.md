# Remove B interfaces and compatibility (2026-11-01)

Scope: remove B capital/rights/getters/claims, Router action and legacy double-pool model/UI support. Keep the shared asset Router for USDG exchange, trading and Core operations. No economic changes to the approved single-R allocation.

- Genesis: 99% R, 0.7% creator, 0.3% protocol. Formal: 98% trade, 1% LP, 0.7% Core, 0.3% protocol.
- Remove B contribution, budget, snapshot and loss-cover fields; settlement previews/events expose only remaining LP rights. Lowercase pricing parameter b remains fixed at graduation R.
- Router enum: ClaimFailed=8, ClaimCore=9, RedeemPairs=10. No placeholder B action.
- Factory interfaceVersion=2 is required before frontend reads or writes. Historical factories are rejected, preventing new action numbers being sent to an old router. No legacy ABI/market selection fallback.
- Browser history caches and paper/share persistence use version2 and reject previous records. Historical deployment manifests and validation reports remain archives.
- Source only: no public-chain deployment, no website switch, no funds moved. Current public testnet contracts are immutable and unchanged.

Validation: 283 Solidity tests passed, zero failed/skipped; 286 frontend tests passed, 9 external integration tests skipped. TypeScript and testnet build passed. ABI refreshed from compiled artifacts, no B selectors remain. Ten real-EVM parity checkpoints regenerated. Runtime bytes: Market 21227, Core 22017, Router 6403, stock Factory 8453. No new mainnet-fork run claimed.

Final incremental validation: 22 Router/integration/boundary tests passed; cached real-EVM parity test passed with ten checkpoints.
