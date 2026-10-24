# Current implementation status — 24 October 2026

## Public application

OCP Market is a multiplayer paper-trading game. Email-verified accounts receive 100,000 virtual USD once per authenticated subject. The React interface uses server-authoritative PostgreSQL wallets, shared markets, quotes, revision checks and atomic mutations. Account grants and settlement claims have replay protections. Virtual balances cannot be withdrawn as real funds.

The homepage links to the same Market application. Public application and privacy pages are available without login. Google sign-in is hidden while OAuth review remains unresolved. The database and authentication services need separate configuration; no production credentials or private account exports belong in this repository.

## Current chain candidate

`contracts/dlp-1/` is the isolated, undeployed implementation. It vendors its own tested Core snapshot, OpenZeppelin, PRB Math and forge-std; root `contracts/` experiments are not substituted at build time.

- Selected target: Robinhood Chain. No current DLP production deployment is claimed.
- Genesis: quadratic reserve curve R=kS²; 94.5% R/seller, 4.5% B, 1% creator; R/B targets 3.6/0.6 ETH-equivalent fixed at creation.
- Only final Core cutoff is supplied; Genesis +3h, Formal=Core−1h, Topic=Core, Core>creation+4h. Market and Core open at graduation.
- Graduation converts gToken to LP rights; LP and B are separate market-specific ERC20s. Genesis gToken and YES/NO are currently nontransferable internal contract balances, not independently issued ERC20s. Paper-game balances are database records.
- Formal: fees 2% (Core1%, LP0.5%, B0.5%). Depth b=M0=actual graduation R, excludes B, stays fixed. Initial finite inventory limits opening odds to approximately26.89%–73.11% at one-side exhaustion; this does not promise unlimited liquidity.
- LP add/exit functions are locked. Transferable LP/B source code does not mean a secondary market has been launched.
- Stock collateral and stablecoin V3 routing exist as local candidates. The Router02 adapter differs from the legacy classic V3 adapter. Historical mainnet observations and fork tests must not be interpreted as guaranteed current liquidity, testnet availability, or production oracle approval.

## Verification for this source publication

On 24 October 2026, the exact candidate contract source, tests, scripts and vendored dependencies were compared byte-for-byte with the tested snapshot: 28 suites,183 passed,0 failed,1 RPC-dependent test skipped. No mainnet transactions were sent.

The publication checkout passed173 frontend tests across22 files, TypeScript checks and a production build;8 real PostgreSQL tests were skipped without a disposable test database. Database integration tests require a disposable test DB and must be reported as skipped when absent. Existing finite-sample economic and numerical checks are not a formal proof or an independent audit.

## Remaining work before a funded competition or real-fund deployment

- Public-game rate limits, account-abuse/competition eligibility rules and full real-database concurrency tests.
- Production database least-privilege/backup review and complete reproducible trade audit records; the visible market event buffer keeps only200 entries.
- Target-chain contract addresses, stock-token transfer behavior, price feeds, router/pool liquidity, deployment gas and explorer verification.
- Independent security review and unresolved economic acceptance, including the documented graduation valuation discontinuity. Publishing code does not resolve those issues.

Earlier versioned reports and whitepapers are historical references. Current source plus this status note and v2.4/depth corrections take precedence over outdated fee, deadline or network summaries.
