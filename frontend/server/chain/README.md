# Shared on-chain chart history

The Vercel GET endpoint `/api/chain-history?market=0x…&factory=0x…&chainId=46630`
serves a public display cache. It does not sign transactions, hold keys, decide
outcomes, or replace executable wallet quotes.

## Deployment

- Uses the existing server-only `DATABASE_URL` and `pg` pool. No `VITE_` database secret.
- Creates only the additive table `ocp_chain_history_v1`; paper accounts, balances,
  and journals are untouched.
- Uses the current factory constant and its verified deployment block from
  `shared/testnetDeployment.ts`, and the fixed Robinhood testnet RPC.
- `api/chain-history.ts` is a Vercel Function with a 60-second duration limit.
- `@vercel/functions.waitUntil` runs a bounded incremental sync after serving
  committed data. No Cron schedule or always-running process is required.
- No new database, paid plan upgrade, or external server is provisioned by this change.

## Reading and catch-up

Existing checkpoints return immediately with `200`, three-second CDN caching,
`throughTimestamp`, and the scanned block. Missing data returns `202` with retry
information and starts a sync. Frontends poll a warming index and retain browser
history; an unavailable/invalid backend falls back to the original chain reader.

Each sync has a 20-second work budget, checks the registered market, and scans at
most 250,000 market blocks in adaptive requests of at most 50,000 blocks. The
current factory's indexed creation event avoids repeated full timestamp searches.
The global lease serializes indexer RPC work; per-market leases and token compare-
and-swap prevent late workers from replacing newer results. Lease expiry permits
recovery after a function stops. Public query values cannot select RPC endpoints.

A checkpoint is complete only from creation through its `latestBlock`, not
necessarily the target chain head. `targetBlock` and `syncing` expose this
separation. Each prefix requires exact creation evidence, real block timestamps,
log replay, and canonical block/head hashes. The public RPC may prune old contract
state: a historical `CALL_EXCEPTION` can leave a validated-log prefix while
`syncing=true`; reaching the captured chain head always requires same-block
Genesis supply validation. An observed mismatch is never accepted.

Reorged checkpoints are cleared before choosing the next range. Cached responses
may briefly show a previously verified snapshot while a new check is pending;
labels retain their block and shared-cache provenance. The frontend replay checks
shape/scope, while the backend performs RPC verification. These records never
set frontend transaction `viewLive` status.

## Boundaries

Only Market history is indexed here. Core staking history and LP-transfer holder
queries retain their existing paths. The first backfill can need multiple passes;
no history is invented to fill gaps. Bodies over 3.5 MB fail safely so the direct
reader remains available; larger datasets would require paginated storage/API.

Unit tests cover leases, stale tokens, registration and scope checks, precise scan
bounds, reorg reset, source supply mismatches, safe HTTP failures, warming polls,
and fallback behavior. Real deployment verification also requires a database row,
HTTP response, and browser chart to agree.
