# Fee allocation, settlement delivery and source cleanup — 2026-10-30

This is a source release. The immutable deployment in `contracts/topic-market/deployments/46630.json` remains the older release. Updating the website does not change existing contract fee allocations; no replacement contract or migration transaction was sent for this change.

## Confirmed rules

| Gross transaction amount | Trading / reserve | B | LP fees | Core fees | Creator | Protocol |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Genesis | 94.5% | 4.5% | — | — | 0.7% | 0.3% |
| Formal | 98% | 0.5% | 0.5% | 0.7% | — | 0.3% |

Each fee component is rounded down separately in collateral-native units. Remaining units are recorded as dust; computing 7:3 from a previously rounded 1% would produce incorrect small-amount allocations and is not used.

Core's existing history-based conditional user rewards, forfeited-fee rules and final eligible claimant's remainder are retained. Any historical Core fees unallocated under those rules still go to the fixed official recipient. Those funds are separate from the fixed 0.3% protocol trading fee.

## One user transaction and failed payments

`VaultCoreAdapter.finalizeMarket()` processes a due early request if necessary, finalizes Core and Market, and attempts fixed-recipient creator/protocol and unallocated Core payments in one transaction. Failed early requests before the final deadline resume the existing market; they do not force settlement. The caller cannot set the outcome or change payment recipients.

Optional token transfers use isolated self-calls capped at 100,000 gas. Reverts, false returns or incorrect balance deltas roll back that transfer; the corresponding fee debt is restored. A beneficiary failure does not revert settlement or erase the other beneficiary's debt. Insufficient optional payment gas leaves the fee pending. The frontend estimates the call and adds 600,000 gas for the coordinated settlement entry, and 350,000 gas for Market close/retry calls; unused gas is not spent. Chain/session checks still run immediately before signing.

Anyone can retry Market fees or Adapter delivery to the same fixed beneficiaries. `batchClaimFees` accepts up to 20 adapters, caps each call at 600,000 gas and stops below 650,000 remaining gas. A successful batch transaction is not proof that every payment succeeded: check emitted events and remaining debts. No Keeper is required or deployed.

## Player claims, residual balances and UI

Market `collectDust` requires the terminal phase and every applicable player right to be burned: Genesis supply and B on failure; LP, YES, NO and B after settlement. Pending creator/protocol fees are excluded from the sweep. Core surplus additionally requires zero remaining principal claims, user fee claims, official fees and bond refunds. Unclaimed player money never becomes protocol dust just because time elapsed.

Contract addresses sit below the matching activity records inside the shared detail card. Genesis/Formal show their Market address; Core shows the actual Core address. Both include copy and explorer actions. Old markets are detected without assuming the new `automaticFeePayout` getter exists and keep their legacy manual-claim UI.

## Source and compatibility

- Active Core and interfaces moved to `contracts/topic-market/src/core` and `src/interfaces`; the `ocp/` remapping points to `src/`.
- Shared deployers and inert creation-code stores moved to `src/deployers`; factory-only authorization is preserved.
- Legacy single-asset factory/oracle/deployment fixtures live under `test/legacy`, outside the production dependency graph. They are not reproducible historical bytecode archives.
- Removed disabled LP add/exit and nontransferable-share ABI entries and unused `mergedPairs`. Real LP/B ERC20 transfers and user pair redemption remain.
- Audit-only `checkInvariants` moved to `test/MarketInvariantCheck.sol`, with equivalent public-getter assertions. This is not an execution guard; production money-path checks remain in place.
- Dedicated chain-46630 test graduation configuration stays separate from the production snapshot path.

## Validation

- Local Foundry: 272 passed, 0 failed, 0 skipped across 37 suites. Fuzz cases use 256 runs; the stateful invariant suite uses 128 runs and depth 64.
- Automatic-payment coverage includes exact raw fee splits, one coordinated settlement, a bounded 800,000-gas call, failed/reverting/false/mutate-then-false token transfers, a gas-burning beneficiary, fixed-recipient retries, an out-of-gas batch item followed by a no-code address and then a valid adapter, protected outstanding player claims, and failed-launch dust.
- Release frontend: 282 passed, 9 skipped across 37 files; TypeScript and production Vite build passed. The skipped integration cases require external test services and are not counted as passes.
- Ten actual EVM checkpoints regenerated the fixture with source SHA-256 provenance. The parity scenario now selects the existing graduation-capital depth policy rather than the obsolete fixed-depth test default. Single-state money tolerance stays 5 micro collateral units; cumulative terminal wallet tolerance is 10 micro (the prior 8 plus at most one raw-unit floor for each of two new protocol-fee components). Observed maximum is about 8.234 micro. This floating simulation check does not establish raw-integer equality; Solidity accounting tests assert native-unit balances directly.
- Browser: confirmed legacy fee balances and manual-claim explanation, Market address below trade records, and actual Core address below stake records. No wallet transaction was signed.

| Production contract | Runtime bytes | Creation + fixed arguments bytes |
| --- | ---: | ---: |
| TopicMarket | 24,287 | 30,226 |
| OCPCore | 21,938 | 22,979 |
| VaultCoreAdapter | 6,459 | 33,353 |
| TopicMarketDeployer | 1,329 | 32,576 |
| TopicMarketCoreDeployer | 1,756 | 39,052 |
| TopicMarketStockFactory | 8,390 | 9,390 |
| TopicMarketTestnetStockFactory | 8,477 | 9,539 |

All listed runtimes are below 24,576 bytes and constructor inputs below 49,152 bytes. The bytecode-store helper additionally tests exact byte reconstruction at 0, 1, 31, 32, 33, 23,999, 24,000, 24,001, 47,999 and 48,000 payload bytes, with rejection at 48,001. Production money-path guards and deployment restrictions remain enabled.

Mainnet-fork verification: 10 passed, 0 failed, 0 skipped across four suites at block **101711310**, chain **4663**, using the official Robinhood RPC. Coverage includes five real stock/USDG swap roundtrips and complete lifecycles, rejected incompatible router calls with rollback, five official price-feed snapshots and stale-feed rejection, five concurrent stock lifecycles in one factory with cross-market isolation, and early-resolution/exit integration. Only local fork balances and local deployments are changed; no public-chain transaction was sent.

The initial historical defaults (94363412 / 99917547 / 100224815) could not be replayed through that public RPC: it returned `historical state ... is not available`. Those attempts are not counted as passes. The fresh fixed block above was selected explicitly, without changing assertions or replacing real feeds/pools. Replaying that block later may require an archival endpoint. The price-source compatibility tests explicitly disable the sequencer guard; they do not certify a production sequencer-feed configuration.

Commands used:

```sh
forge test --offline --no-match-path 'test/RH*' -vv
RH_FORK_RPC=https://rpc.mainnet.chain.robinhood.com \
RH_FORK_BLOCK=101711310 RH_ORACLE_FORK_BLOCK=101711310 \
forge test --offline --match-path 'test/RH*' -vv
```

The RPC/network values were checked against the [official network documentation](https://docs.robinhood.com/chain/add-network-to-wallet/) and `eth_chainId`. Compilation alone is not evidence that funds or claims are correct. No independent audit or mainnet deployment is claimed.
