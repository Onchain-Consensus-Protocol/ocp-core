# Single R and mandatory fee-payment attempts — 2026-11-01

Scope: exactly two requested changes on the existing codebase. Market, Core fee-payment gas handling and the two existing factory files receive local patches; Core voting, exit penalties and early-resolution rules retain their behavior.

- Genesis: 99% R, 0.7% creator, 0.3% protocol; independently floored raw units and explicit dust.
- Formal: 98% trading, 1% LP, 0.7% Core, 0.3% protocol. There is no B allocation, mint or first-loss cover.
- Graduation: R target 4.2 ETH equivalent; dedicated chain-46630 TSLA profile 0.0042 TSLA. Original proportional gToken-to-LP conversion, fixed b=R at graduation and no subsequent LP issuance remain. Price inputs are bounded so the target fits the existing LIMIT.
- New singlePool getter identifies these markets. Legacy B getters remain zero for ABI compatibility; bToken is address(0), and claimB reverts B_REMOVED. Legacy deployed markets retain their original rights and frontend path.
- Successful coordinated settlement must attempt Market creator/protocol fees and Core's unallocated official fees. Pending fees require at least 300,000 remaining gas in each payment method; insufficient gas reverts the transaction instead of silently skipping payment. No-fee calls remain idempotent.
- Transfers still use isolated 100,000-gas self-calls. A token rejection restores the fixed-recipient debt instead of reverting completed settlement. Such rejection is distinct from insufficient outer gas.
- Frontend settlement, expired-phase close and fee retries estimate the actual call and add 600,000 gas. Unused gas is not charged.

Validation completed:

- 281 Solidity tests passed, 0 failed, 0 skipped across 38 suites; fuzz uses 256 runs and stateful invariants 128 runs/depth 64. Existing staking/early-resolution cases remain covered. The five retained failure cases were corrected in test setup/expectations, not by weakening production guards or skipping suites.
- The historical 410,714-gas close regression requires either complete rollback or two successful fixed-recipient payout events and zero pending fees.
- 293 frontend tests passed, 9 external-service integration cases skipped; TypeScript and testnet production build passed.
- Ten EVM checkpoints regenerated the single-R fixture from actual contract execution (including no-B/deprecated-B-claim steps), with source SHA-256 provenance.
- Actual JSON-RPC estimation and mined local transactions were tested on Anvil, with no arbitrary extra gas: failed Genesis estimated 427,016 / used 170,708 gas, paid creator 700 raw and protocol 300 raw with two successful events; Formal settlement estimated 754,621 / used 394,959 gas, paid creator 98,000 raw, protocol 43,558 raw and unallocated Core fees 3,635 raw in the same transaction. All corresponding fee debts became zero. These are local test amounts, not public-chain payments.

This patch is a source/frontend update, not a new onchain deployment. The existing deployment manifest and historical balances remain intact; those immutable double-pool markets retain their legacy display and claim paths. New single-R contract behavior requires a new deployment. No public-chain transaction was sent for this patch. No independent audit is claimed.

Runtime and constructor-input sizes from the final build:

| Contract | Runtime bytes | Creation + arguments bytes |
| --- | ---: | ---: |
| TopicMarket | 21894 | 27522 |
| OCPCore | 22017 | 23058 |
| VaultCoreAdapter | 6459 | 33432 |
| TopicMarketCoreDeployer | 1756 | 39131 |
| TopicMarketDeployer | 1329 | 29872 |
| TopicMarketTestnetStockFactory | 8315 | 9377 |
