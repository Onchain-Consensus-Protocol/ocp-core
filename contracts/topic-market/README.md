> 2026-10-29: Latest OCPCore/module release is deployed on Robinhood testnet 46630 with fixed TSLA test targets and a separate testnet website. Live 0.1 USDG routing, graduation and Core exit passed. Some source verification is confirmed and some remains pending; see deployments/46630.json. Historical local-only notes below are superseded for this testnet deployment. No mainnet deployment.

# Topic Market contracts

Development implementation of Genesis, a stock-collateral binary market, LP/B rights, Core staking and V3 asset routing. The deployment manifest describes the older immutable testnet release; current source changes do not upgrade that deployment. No mainnet deployment or independent audit is claimed.

## Build and test

Requires Foundry and Solidity0.8.20. Dependencies and their licenses are included under `lib/`. The current Foundry configuration enables viaIR and optimizer runs1.

```sh
forge test --offline
forge build --offline --sizes
```

Install Solidity0.8.20 before using offline mode. RPC-dependent fork tests require an explicitly configured RPC and otherwise skip.

## Configuration

Use `.env.example` as a reference for deployment variables. Supply your own verified asset, feed and router addresses and a configured wallet; never commit secrets. Deployment scripts are in `script/`. No deployment is performed by the build or test commands.

Collateral supports validated6–18 decimal assets. Genesis and YES/NO positions are internal contract balances; LP and B are market-specific ERC20 rights. The web application's paper ledger is separate from these contracts.


## Current source: fixed fee allocation and settlement payments

- Genesis gross: 94.5% reserve, 4.5% B capital, 0.7% creator fees, 0.3% protocol fees.
- Formal gross: 98% trading value, 0.5% LP fee, 0.5% B capital, 0.7% Core fee, 0.3% protocol fee. Every component uses collateral-native integer units; unallocated rounding units are explicitly accounted as dust.
- `VaultCoreAdapter.finalizeMarket()` is the single-transaction user settlement entry: finalize Core, finalize Market and attempt fixed-beneficiary fee payments. It never lets the executor choose outcomes or recipients. A rejected early request before the original deadline continues to return without forcing settlement.
- `automaticFeePayout()` identifies new markets. Old immutable markets do not acquire this behavior from a frontend update.
- Market `claimFees()`/`flushFees()` and Adapter `claimFees()` retry delivery to the fixed beneficiaries. Adapter `batchClaimFees()` accepts at most 20 adapters, caps each call at 600,000 gas, and stops when gas is insufficient; a successful transaction does not prove every pending payment was delivered. Check events and remaining balances.
- Core's pre-existing unallocated historical-fee policy remains separate from the fixed 0.3% protocol trading fee. It is not used to calculate or satisfy that fixed fee.
- Market `collectDust()` only permits sweep after all player rights for the terminal phase have been burned. Pending creator/protocol fees remain separate debts. Core keeps its existing final-eligible-claimer rounding policy and guards surplus against outstanding claims/refunds.

## Source layout and compatibility

Active Core is `src/core/OCPCore.sol`; its interfaces are in `src/interfaces`, with Foundry `ocp/` mapped to `src/`. There is one active Core implementation; `lib/ocp-snapshot` is no longer a source dependency.

The shared creation-code stores and factory-restricted deployers are in `src/deployers`. Legacy single-collateral Factory/oracle and the old deployment recipe are retained under `test/legacy` as fixtures, outside the production dependency graph. These fixtures are not a reproducible archive of historical deployed bytecode. Historical deployment manifests are unchanged.

Locked `addLP`/`exitLP`, disabled Genesis `transferShares`, and the unused internal `mergedPairs` state are removed from the new ABI. Transferable LP/B tokens and player `redeemPairs()` are retained. Existing old contracts still expose their original ABI.

Testnet graduation constants remain in the dedicated chain-46630-only factory; production stock factories retain the live snapshot path. No Keeper is introduced.

Audit-only `checkInvariants()` now lives in `test/MarketInvariantCheck.sol`, with the same assertions over public getters. Production execution guards remain in the market. The UI adds explicit optional-payment gas above wallet estimates; low-gas callers retain the retry path. See [fee and settlement validation](../../validation/2026-10-30-fees-and-settlement.md).
