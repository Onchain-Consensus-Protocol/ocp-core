> 2026-10-30: Fee release deployed on Robinhood testnet 46630. New factory `0xCef7fCb7e4B3d5A273A9e5c6D84C2886cE93C3Aa`; fresh Genesis market `0xb11B7A34E540B6a66701C281408F510fF556078C`. See deployments/46630.json for verification status and the archived legacy deployment.

> 2026-10-29: Latest OCPCore/module release is deployed on Robinhood testnet 46630 with fixed TSLA test targets and a separate testnet website. Live 0.1 USDG routing, graduation and Core exit passed. Some source verification is confirmed and some remains pending; see deployments/46630.json. Historical local-only notes below are superseded for this testnet deployment. No mainnet deployment.

# Topic Market contracts

Development implementation of Genesis, a stock-collateral binary market, LP rights, Core staking and V3 asset routing. The deployment manifest describes the older immutable testnet release; current source changes do not upgrade that deployment. No mainnet deployment or independent audit is claimed.

## Build and test

Requires Foundry and Solidity0.8.20. Dependencies and their licenses are included under `lib/`. The current Foundry configuration enables viaIR and optimizer runs1.

```sh
forge test --offline
forge build --offline --sizes
```

Install Solidity0.8.20 before using offline mode. RPC-dependent fork tests require an explicitly configured RPC and otherwise skip.

## Configuration

Use `.env.example` as a reference for deployment variables. Supply your own verified asset, feed and router addresses and a configured wallet; never commit secrets. Deployment scripts are in `script/`. No deployment is performed by the build or test commands.

Collateral supports validated6–18 decimal assets. Genesis and YES/NO positions are internal contract balances; LP is a market-specific ERC20 right. The web application's paper ledger is separate from these contracts.


## Current source: fixed fee allocation and settlement payments

- New single-R source: Genesis gross is 99% R, 0.7% creator fees and 0.3% protocol fees; no B capital or B token is created.
- Formal gross: 98% trading value, 1% LP fee, 0.7% Core fee, 0.3% protocol fee. Every component uses collateral-native integer units; unallocated rounding units are explicitly accounted as dust.
- `VaultCoreAdapter.finalizeMarket()` is the single-transaction user settlement entry: finalize Core, finalize Market and attempt fixed-beneficiary fee payments. It never lets the executor choose outcomes or recipients. A rejected early request before the original deadline continues to return without forcing settlement.
- `automaticFeePayout()` identifies new markets. Old immutable markets do not acquire this behavior from a frontend update.
- Market `claimFees()`/`flushFees()` and Adapter `claimFees()` retry delivery to the fixed beneficiaries. Adapter `batchClaimFees()` accepts at most 20 adapters, caps each call at 600,000 gas, and stops when gas is insufficient; a successful transaction does not prove every pending payment was delivered. Check events and remaining balances.
- Core's pre-existing unallocated historical-fee policy remains separate from the fixed 0.3% protocol trading fee. It is not used to calculate or satisfy that fixed fee.
- Market `collectDust()` only permits sweep after all player rights for the terminal phase have been burned. Pending creator/protocol fees remain separate debts. Core keeps its existing final-eligible-claimer rounding policy and guards surplus against outstanding claims/refunds.

## Source layout and compatibility

Active Core is `src/core/OCPCore.sol`; its interfaces are in `src/interfaces`, with Foundry `ocp/` mapped to `src/`. There is one active Core implementation; `lib/ocp-snapshot` is no longer a source dependency.

The shared creation-code stores and factory-restricted deployers are in `src/deployers`. Legacy single-collateral Factory/oracle and the old deployment recipe are retained under `test/legacy` as fixtures, outside the production dependency graph. These fixtures are not a reproducible archive of historical deployed bytecode. Historical deployment manifests are unchanged.

Locked `addLP`/`exitLP`, disabled Genesis `transferShares`, and the unused internal `mergedPairs` state are removed from the new ABI. Transferable LP tokens and player `redeemPairs()` are retained. Existing old contracts still expose their original ABI.

Testnet graduation constants remain in the dedicated chain-46630-only factory; production stock factories retain the live snapshot path. No Keeper is introduced.

Audit-only `checkInvariants()` now lives in `test/MarketInvariantCheck.sol`, with the same assertions over public getters. Production execution guards remain in the market. The UI adds 600,000 gas above wallet estimates for settlement/payment paths. With pending fees, insufficient payment gas now reverts the whole call rather than confirming settlement and silently skipping delivery. Both Market and Core use this rule; rejected token transfers remain isolated retryable debts. See [fee and settlement validation](../../validation/2026-10-30-fees-and-settlement.md).

## Single-R patch (2026-11-01)

Only existing Market, Core payment gas handling and factory graduation settings change. The launch threshold is 4.2 ETH equivalent (0.0042 TSLA in the dedicated testnet profile); the creation price domain is bounded so the target fits the existing market limit. Genesis gToken converts proportionally into the same LP token at graduation, with b fixed to the graduated R amount and no later LP issuance. Formal LP receives actual remaining pool NAV without B cover. A failed launch refunds remaining R only. B fields, claim methods, Router actions and frontend compatibility paths are removed. No B token is deployed or minted. Historical immutable contracts are not changed; the current frontend targets the new single-R interface and does not support historical double-pool markets.

See validation/2026-11-01-single-r-fee-payment.md for targeted acceptance evidence.
