# OCP Market frontend and paper-trading server

Current public application: [market.ocp-protocol.org](https://market.ocp-protocol.org/). The main OCP domain hosts protocol information; the Market hostname rewrites `/` to `explore.html`. Homepage simulation links now lead to this same multiplayer market, using the shared `Simulation` interaction component.

**This is a virtual-money application.** No real stock trades, deposits, withdrawals or DEX swaps are executed. Account balances are held in PostgreSQL, not onchain. See [current project status](../docs/CURRENT_STATUS.md).

## Local setup

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set your own `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL` and `PAPER_ALLOWED_ORIGINS`. The exact local origin must match the dev server URL and authentication configuration. Server secrets must never have a `VITE_` prefix. Environment examples contain placeholders, not deployable production configuration.

Clerk handles email verification. Google buttons are currently hidden while OAuth branding verification remains unresolved. Each authenticated Clerk subject receives 100,000 virtual USD once. That rule is per account, not proof that each person has only one account.

Public application information (`public/about.html`) and privacy policy (`public/privacy.html`) are static HTML, require no sign-in and do not depend on Clerk or the database.

## Current simulation rules

- Genesis buys: 94.5% purchases gToken, 4.5% contributes to B, 1% creator fee; sells apply the same split to curve gross proceeds.
- Graduation requires both R and B targets. gToken converts into LP rights; B remains separate.
- Formal trading fees total 2%: Core 1%, LP 0.5%, B 0.5%.
- Only the final Core cutoff is configured. Genesis ends at creation + 3h; Formal ends one hour before Core; topic cutoff equals Core. Core must be later than creation + 4h. Default cutoffs are 3h / 5h / 6h.
- Market and Core open only after graduation. Time progression does not reset fixed deadlines.
- Stock prices and stablecoin conversions are illustrative fixed-price simulation inputs. They are not real exchange quotes.

## Checks

```sh
npm test
npx tsc --noEmit
npm run build
```

PostgreSQL integration tests require `PAPER_TEST_DATABASE_URL` pointing to a disposable test database. They never fall back to the production `DATABASE_URL`. Without that variable, eight database tests are skipped, not passed. Do not load production credentials into a test run.

[Server implementation notes](PAPER_MULTIPLAYER.md) describe transactions, request replay and trust boundaries. Public competitions still need production rate limits, account-abuse controls and end-to-end database concurrency validation.

## Historical routes

The repository retains older admin, vault and permissionless UI experiments for reference. They are not the current multiplayer entry point, and older Base deployments, wallet/X flows, fee splits and independent-deadline instructions must not be used as current configuration. The current chain candidate lives in `../contracts/dlp-1/`; source publication is not deployment approval.
