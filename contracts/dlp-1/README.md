# DLP-1 — current contract development candidate

**Status: 24 October 2026. Not publicly deployed, not independently audited, and not approved for real-fund launch.** The live OCP Market is a server-ledger simulation, not this contract deployment. See [current project status](../../docs/CURRENT_STATUS.md).

Current deadlines are v2.4: Genesis creation + 3h, Formal = Core − 1h, Topic = Core, and Core > creation + 4h. Only Core cutoff is supplied at creation; default simulation cutoffs are 3h / 5h / 6h. This supersedes the archived v2.3 independent-deadline reports.

Current graduation depth is b = actual R entering Formal, excluding B, then fixed during trading. [Depth correction](GRADUATION_DEPTH_CORRECTION_ZH.md) explains finite inventory and numerical guards. Historical v2.1/v2.2/v2.3 reports in this directory are dated evidence, not current deployment instructions.

## Implemented
- Genesis: R=kS², integrated buys/sells, 94.5% R/seller, 4.5% B contribution, 1% creator fee. R loses the entire sell gross amount.
- R=3.6Q / B=.6Q; full order then atomic dual-threshold graduation, with both buy and sell triggers.
- Creation supplies only Core cutoff. Genesis is fixed at creation+3h; Formal=Core−1h; Topic=Core; Core must be later than creation+4h. Formal and Core open together only after graduation; early graduation never resets a cutoff. See ../../docs/design/dlp-1/DEADLINES_V2_4_ZH.md.
- Formal: 98% trading/seller; .5% LP; .5% B (no additional B token mint); 1% historical conditional Core fees.
- LP locked during trading; B first-loss cover; fixed-budget LP/B burn claims and independent outcome collateral.
- Failed Genesis: frozen R/gToken and B/B-token refunds, creator fees not refunded.
- Atomic zero-principal factory creation, metadata registration, immutable token/Genesis curve/price source and graduation-capital depth, two deployers and inert code stores.
- Immutable ETH/USD ÷ USDC/USD oracle reader with independent freshness and round validation. Price is stored at market creation, never refreshed for that market.
- `VaultCoreAdapter.finalizeMarket()` atomically finalizes real Core then Market; already-completed steps are skipped.
- `DLPMarket.claimAll()` claims current caller market entitlements; Core claims remain separate just as in the demo.
- `previewSettlement(result)` and `previewAccount(account,result)` mirror integer settlement math, include escrowed/unmaterialized LP and use original denominators after burns.

## Reproduce
Use Solidity 0.8.20, viaIR, optimizer 1, self-contained vendored dependencies:

    forge test --offline -vv
    forge build --offline --sizes

If local Foundry proxy discovery fails, set HTTP_PROXY/HTTPS_PROXY/ALL_PROXY=http://127.0.0.1:9 and NO_PROXY=* for these offline commands. Never use these proxy settings for live RPC deployment.

## Deployment plan (not executed)
`script/DeployDLP.s.sol` reads only explicit variables listed in `.env.example`; no private key is written or read by the source. Use a configured keystore/wallet. First simulate with the intended RPC, verified USDC and two real feeds. An L2 sequencer-uptime check is not supplied: select/validate the network policy before using this reader on a sequencer-based network.

    forge script script/DeployDLP.s.sol:DeployDLP --rpc-url <RPC> --sender <DEPLOYER>

Only after review and explicit deployment authorization: broadcast with source verification (`--broadcast --verify`) and validate every deployed address. The script creates no topic and does not stake or trade funds.

Oracle is deployed first; then predict the Factory address from the EOA nonce+2; deploy CoreDeployer, MarketDeployer, Factory in that exact nonce sequence. Each deployer is forever restricted to the predicted Factory; Factory checks these references. A failed/interleaved nonce sequence must be reconciled rather than blindly retried. Each future topic's Adapter/Market/binding/metadata registration is atomic in one transaction.

## Client units and invocation
The original USDC fixture uses 6 decimals; the stock-collateral implementation supports validated 6–18 decimal assets. Native collateral values and normalized WAD quantities must not be confused. Genesis internal shares, LP, B and YES/NO quantities use WAD (1e18). The demo displays 10,000,000 gToken for one internal share, so displayed gToken must be divided by 10,000,000 before WAD encoding. `previewAccount` includes both `shares(account)` escrow rights and `lpToken.balanceOf(account)`; do not add its preview to a second separate LP preview. Supply all three hypothetical results only before settlement; after settlement the preview rejects results other than the frozen outcome. Failed-state previews ignore the result because no formal outcomes were created.

LP may be materialized permissionlessly only to its rightful account; claims materialize automatically. LP/B ERC20 transfer capabilities remain in the contracts, while the demo intentionally does not expose transfer or a secondary exchange. `intent=0` is the unconditioned graduation behavior shown in the demo; optional must-graduate/must-not-graduate intent and deadline/slippage protections are additional contract controls.

## Differences and unresolved economic decisions
1. Integer microUSDC rounding and tiny-trade guards differ from the floating-point demo. LP/B and failed-R payouts floor each claim and can leave locked dust. Core's last eligible claimant can receive its integer remainder. No administrator sweep exists.
2. Chain time does not automatically execute transactions: users/automation must call closeExpired, finalizeMarket and claim functions. Trading/staking deadlines are still enforced even before a close call.
3. Factory uses a verified live price snapshot; the demo lets users configure a simulated fixed ETH price. Factory metadata limits are bytes (topic512; result definitions2048), not JS character limits.
4. The underlying legacy Core has an optional donation entry not shown in the demo. It increases the payout pool but not majority voting principal. This behavior is preserved, not newly added.
5. Neither the demo nor this implementation solves graduation valuation discontinuity: a late buyer can receive LP principal rights substantially below its curve purchase cost. Economic regression tests demonstrate this rather than conceal it.
6. Creator-associated round trips can recover creator fees and B after a failed launch, creating apparent volume/participation at nearly zero external cost. Core remains a public capital-majority mechanism; a market holder may attempt to influence the final result with additional Core capital. These are shared mechanism properties, not a difference silently changed here.

Not an independent audit or a claim of production readiness. Target-chain feeds/heartbeat/sequencer policy/token characteristics/transaction gas and the graduation-value decision must be resolved before real-fund deployment.

## Graduation depth (2026-10-22 correction)

Formal depth is derived at graduation: `bWad = initialCollateral * SCALE = poolBasisWad`. It excludes B and does not count as another asset. It stays fixed during trading; liquidity add/exit remain locked. Fixed depth was removed from both Factory constructors, Market, Deployer and deployment environment variables. Market now has seven constructor parameters; its initcode argument tail is224 bytes.

The formal numerical guard in native token units is `ceil(max(1e12,bWad/1e14+100)/SCALE)`. It is added to buy costs and subtracted from gross sale proceeds. This conservatively covers the enlarged numerical range; tests and source-level analysis are not a formal full-domain accuracy certificate.

Finite inventory remains: at opening each side has M0 shares and b=M0, so one-side exhaustion occurs near73.11% (opposite26.89%). Larger b reduces impact; it does not create cash, stock tokens or infinite capacity. No mint, fee, B-protection or Core result rule changed.

Existing deployed immutable contracts cannot receive this source correction. No deployment is performed by this patch. Passing this patch's tests does not establish overall mainnet readiness.
