# DLP-1 contracts

Development implementation of Genesis, a stock-collateral binary market, LP/B rights, Core staking and V3 asset routing. Not publicly deployed or independently audited.

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
