# OCP — OnChain Consensus Protocol

OCP explores capital-based consensus and topic markets. Players launch a topic, trade gToken during Genesis, and unlock a binary market and Core staking after graduation. Settlement uses the outcome produced by Core; capital consensus does not guarantee objective truth.

**Development status — 24 October 2026:** the public multiplayer paper-trading application is live. The current chain implementation is an undeployed development candidate, not an audited or mainnet-ready release. Publishing this source does not authorize real-fund deployment.

- [OCP website](https://ocp-protocol.org/)
- [OCP Market — virtual funds only](https://market.ocp-protocol.org/)
- [Public app information](https://market.ocp-protocol.org/about.html) · [Privacy policy](https://market.ocp-protocol.org/privacy.html)
- [Current implementation status and limitations](docs/CURRENT_STATUS.md)

## Current components

| Directory | Purpose | Status |
|---|---|---|
| `frontend/` | React/Vite website, shared market interface and server-side virtual-money ledger | Public paper-trading application |
| `contracts/dlp-1/` | Isolated Genesis, stock-collateral market, LP/B rights, Core adapter and V3 routing candidate | Local tests; not publicly deployed |
| `docs/design/dlp-1/` | Current design supplements | Read with implementation status |
| Other `contracts/`, older scripts and whitepapers | Earlier Vault/market experiments | Historical; not the current launch configuration |

The selected target chain is Robinhood Chain. Mainnet pool observations and local fork tests are not evidence of testnet liquidity or a production deployment. Earlier Base network instructions are historical.

## Run the web application

```sh
cd frontend
npm ci
npm run dev
```

The public information pages need no account. Multiplayer accounts and trading require your own Clerk configuration and PostgreSQL database; see [frontend setup](frontend/README.md). Never commit real environment files or credentials.

## Test the current contracts

```sh
cd contracts/dlp-1
forge test --offline
forge build --offline --sizes
```

The DLP candidate includes vendored dependencies and a frozen Core source snapshot. It does not require uncommitted changes to the older root contracts project. Solidity 0.8.20 must already be installed for offline builds. See [contract README](contracts/dlp-1/README.md).

## Design and history

- [Current deadlines](docs/design/dlp-1/DEADLINES_V2_4_ZH.md)
- [Stock collateral and routing](docs/design/dlp-1/STOCK_COLLATERAL_AND_ROUTING_SPEC_ZH.md)
- [Graduation depth correction](docs/design/dlp-1/GRADUATION_DEPTH_CORRECTION_ZH.md)
- [OCP whitepaper — 中文](docs/whitepaper/OCP_WHITEPAPER_CN.md) · [English](docs/whitepaper/OCP_WHITEPAPER_EN.md)

Historical reports retain their original dates, assumptions and test results. They do not override current source or establish release readiness.
