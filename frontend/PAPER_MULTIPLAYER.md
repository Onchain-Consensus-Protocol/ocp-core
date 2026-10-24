# Current status (24 October 2026)

The public Market uses the original Simulation interaction component with a server adapter; homepage simulation links lead to this same multiplayer entry point. The earlier three-account standalone homepage is no longer mounted publicly. Email verification is enabled in the interface; Google sign-in remains hidden. This application uses virtual funds and illustrative fixed stock prices, not deployed DLP contracts or real DEX routes.

Application-layer rate limits and proof-of-personhood are not implemented. PostgreSQL transaction tests require an explicit disposable test database; an absent database means skipped coverage. The older implementation and verification notes below are historical where they contradict this header. See [current project status](../docs/CURRENT_STATUS.md).

# Multiplayer PAPER market candidate

This entry replaces only `explore.html` / Market. The homepage three-account offline demo is preserved. No real funds, on-chain transactions, stock trading, or exchange execution occur here.

## Implemented

- Verified email via Clerk: server verifies session signature, authorized origin and verified primary email. No wallet login and no client-selected user ID.
- PostgreSQL shared markets, account wallet, positions, requests and append-only wallet journal. One account receives 100,000 virtual USD once using a unique grant record and atomic wallet update.
- Integer micro-USD global wallet; stock-denominated simulation reuses the existing floating model. Conservative conversion leaves fractional micro-USD dust in the player's market wallet; it is not protocol revenue.
- User row lock before market row lock, atomic wallet/market/request/journal writes, idempotent request IDs with payload binding and persisted replay response, revision and slippage checks.
- Existing Genesis R3.6Q/B.6Q, fees, LP/B conversion, failure refunds and Core rules remain unchanged. Deadlines use server time: Genesis creation+3h, TF=TC−1h, TT=TC, TC>creation+4h. Defaults3/5/6/6h. Formal and Core open only at graduation.
- Public projections hide identities and other positions. Stock quotes are fixed demo assumptions, not live market prices. Three-second shared polling, 350ms quote debounce; no player time advance/reset/account selector.

## Configuration

Set server-only `DATABASE_URL` and `CLERK_SECRET_KEY`, public `VITE_CLERK_PUBLISHABLE_KEY`, and comma-separated exact `PAPER_ALLOWED_ORIGINS`. Never prefix server secrets with VITE_. See `.env.example`. The page shows email sign-in; Google buttons are temporarily hidden. The server requires a verified primary email and does not require a Google account. Email-code first-factor and signup verification are enabled. Configure authorized production redirect URLs before release.

The API is `api/paper.ts`; Vite mounts the same handler for local `/api/paper`. Vercel function packaging must include `server/paper/schema.sql`. Schema creation is transactional and idempotent at startup. For production, use a dedicated database, controlled migration and backups; this server-owned paper ledger is not blockchain consensus.

`npm test` runs normal unit tests. Real PostgreSQL transaction tests run only when `PAPER_TEST_DATABASE_URL` points to an explicitly disposable development database; they never substitute the application DATABASE_URL. Remote tests require `--testTimeout=60000` for round trips. Test rows use unique prefixes and cleanup scoped records.

## Remaining release gates

Email-code delivery and actual browser sign-in round-trip must be tested. Do not call the disabled sign-in screen a successful login integration. Claim or replace any temporary Neon development project before its advertised expiry; do not use expiring resources for production. Verify two real signed-in accounts through browser→API→database→other browser, confirm once-only grant on refresh and retry, and test deployment routing/function packaging. Add production request rate limits/abuse controls and monitoring before public multiplayer release. A user may create multiple email accounts; once-per-account grants are not a proof-of-personhood mechanism.

No production publish is authorized by this implementation task. Existing smart contracts are unchanged.
