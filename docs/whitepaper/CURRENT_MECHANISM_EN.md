# Current Implementation Supplement

> 2026-11-04 · Additions to the [OCP](./OCP_WHITEPAPER_EN.md) and [POC](./POC_WHITEPAPER_EN.md) papers, retaining their structure and vision. [中文](./CURRENT_MECHANISM_CN.md). These rules describe the current stock-collateral implementation, not future applications as deployed capabilities.

## 1. Assets and markets

The shared stock Factory owner registers assets and their snapshot, curve, and router configuration. Anyone may create a topic for an enabled stock with only gas. Disabling a stock restricts new creation, not existing registration or claims. Registered configurations are append-only rather than replacements for old markets.

Each topic has its own Market, OCPCore, VaultCoreAdapter, early-settlement module, and LP ERC20. Router and Exchange may be shared; the adapter coordinates Market and Core. A bound early-settlement module cannot be arbitrarily replaced. Creators cannot select results or terminate topics unilaterally.

## 2. Genesis, LP, and Formal trading

- **Genesis:** in whole-token units, the reserve curve is `R=kS²`, with marginal price `p=2kS`. Current k is 10⁻⁶ (`kWad=10¹²`); frontend and contract share units agree. R is net market-making capital; fees do not count toward graduation.
- **Graduation:** the whole threshold-crossing trade is accounted first, then all net capital enters Formal. gToken quantities map 1:1 to LP rights; unmaterialized rights already count in issuance. Every market has an independent LP token.
- **Single pool:** there is no B pool or B token. Formal does not issue additional LP, permit interim LP capital withdrawal, or expose subsequent capital/depth expansion. LP is transferable; current holders claim and burn their rights at settlement using the fixed graduation-supply denominator.
- **Continuous LMSR:** `C(qY,qN)=b·ln(exp(qY/b)+exp(qN/b))`, with b fixed from actual graduation capital in normalized units. Both outcome supplies start at zero and prices at 0.5 collateral/share. Buys issue and sells burn outcome shares; no pre-minted inventory caps purchases. Quotes include integer rounding, numerical protection, and execution limits.
- **Pair redemption:** equal YES/NO quantities can be burned for one collateral unit per complete pair, without a market trading fee. Phase and Core-freeze conditions apply; redemption closes after the settlement snapshot. There is no separate pair-mint entry point.

Anyone may process failed graduation after the Genesis cutoff. Remaining net capital is refunded using the failed-supply snapshot; creator/protocol fees are handled separately and Core never opens.

Per-share YES/NO settlement pays `(1,0)` for YES, `(0,1)` for NO, and `(0.5,0.5)` for INVALID, in collateral units. Outcome payments are reserved first; `cash + LP fees − outcome liability` becomes the LP budget. Contracts check trading cash covers the greatest outstanding outcome liability. Initial capital b exceeds the classical binary LMSR subsidy bound `b·ln(2)`, without guaranteeing LP profits. gToken and YES/NO are nontransferable internal positions; LP is a transferable ERC20.

## 3. Deadlines and early settlement

Let T be the original final cutoff. Current creation requires more than four hours until T. Genesis closes at `T−2 hours`, Formal trading at `T−1 hour`; Core opens at graduation and closes at T. Contracts enforce time limits without first advancing a stored phase. Processing and payments still require someone to send a transaction and pay gas; no privileged Keeper is required.

Anyone may request YES or NO when Core has active principal, no request is pending, and other conditions are met. The requested side need not lead. The bond is a stock quantity fixed at creation from **500 USD**. The one-hour window must satisfy `request time + 1 hour < T`; equality is rejected. Consequently, no new request is allowed at or after `T−1 hour`. Genesis early settlement is unavailable.

During the window, original trade/stake/exit cutoffs still apply. At expiry, Core and Market freeze affected operations until anyone processes the request:

- A matching strict majority settles early and credits an independently claimable bond refund; **it does not automatically transfer the bond to the wallet**.
- A mismatch, including a tie or INVALID, forfeits the bond to the Core principal pool and clears the request. Only operations still within original deadlines resume; another request is allowed if its complete window fits.
- A rejected request processed at or after original T forfeits the bond and finalizes normally, without reopening. For a matching request processed late, the logical cutoff remains the window's expiry.

Reasons may be displayed but are not fact-checked by contracts. Core principal determines the result; creators, processors, and modules cannot override it.

## 4. Core principal and fee history

Only remaining active principal across all three sides votes. Exit penalties, request bonds, and fees do not vote. A full exit while open incurs `ceil(principal/10)`, returns the remainder, and forfeits all accrued conditional fees. Re-entry can select another side but cannot restore old fee history.

YES/NO winners share the principal pool, including accrued exit penalties and failed bonds, in proportion to active winning principal. For INVALID, all three active sides share it pro rata. With no active principal, the remaining principal pool follows the fixed protocol-recipient path. Successful refundable bonds remain separate liabilities.

Historical fees follow indexes built from eligible principal when fees arrive and the index increment during a position's holding period, retaining account fractions. Newly added capital cannot earn prior history. YES selects the YES conditional ledger; NO selects NO; the INVALID fee ledger distributes only among YES/NO stakers. **INVALID stakes do not earn trading fees.**

Forfeited rewards from the selected conditional ledger become a bonus shared by final eligible principal, without counting funds twice. Re-entrants may share that bonus through new positions but do not recover personal old history. With no eligible fee claimant, fees belong to the protocol. Otherwise, unallocated amounts remain separate from the user fee pool. The last eligible Core claimant receives the corresponding principal/user-fee pool remainder.

## 5. Rates and payments

Percentages below apply to the transaction base, not another fee:

| Stage | Total trading fee | LP | Core | Creator | Protocol |
|---|---:|---:|---:|---:|---:|
| Genesis buys/sells | 1% | — | — | 0.7% | 0.3% |
| Formal buys/sells | 2% | 1% | 0.7% | — | 0.3% |

LP fees stay in Market; Core fees move to Core as trades occur. They are not counted again as principal or bonds. Normal claims have no extra 1% withdrawal fee. The 10% exit penalty is a separate rule.

Standard Adapter finalization attempts creator/protocol market payments and payable Core protocol amounts. Direct Core finalization alone does not complete Market coordination or every payment. Failed transfers remain liabilities retryable to fixed recipients; triggers cannot redirect funds. Users claim principal, outcomes, LP, and bonds through the corresponding paths. Market surplus can be collected only after all player rights burn; unpaid rights and bond refunds cannot be swept.

## 6. Test parameters and external dependencies

The production design fixes a stock graduation quantity equivalent to 4.2 ETH using a creation-time ETH/stock snapshot; later prices do not reset it. The current Robinhood testnet profile (46630) independently fixes **0.0042 TSLA**, with a **400 USD/TSLA** creation fixture giving a **1.25 TSLA** bond. This is not an exchange execution price or proof of production-feed verification.

“Oracle-free” concerns the Core outcome, not every dependency. Production creation snapshots, token issuers, and real exchange pools remain external dependencies. Router converts USDG to stock for actions and reverses the route for proceeds; underlying rights and bonds stay stock-denominated. A successful bond refund need not convert back to 500 USDG. Approximately 1% slippage protection limits deterioration from the obtained quote, not price impact already in it.

Governance, parent/child topics, reputation, AI, cross-chain synchronization, shared liquidity, and subsequent depth expansion remain future directions, not current contract guarantees. Existing tests establish version-specific coverage rather than mainnet safety.

## Implementation index

[Market](../../contracts/topic-market/src/TopicMarket.sol) · [OCPCore](../../contracts/topic-market/src/core/OCPCore.sol) · [Factory](../../contracts/topic-market/src/TopicMarketStockFactory.sol) · [Early-settlement module](../../contracts/topic-market/src/TopicMarketEarlyTerminationModule.sol) · [Adapter](../../contracts/topic-market/src/VaultCoreAdapter.sol) · [Router](../../contracts/topic-market/src/TopicMarketAssetRouter.sol)
