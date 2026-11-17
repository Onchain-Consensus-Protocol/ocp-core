# Early termination / deadline cross-check (2026-10-30)

Scope: current TopicMarket, VaultCoreAdapter, TopicMarketEarlyTerminationModule and OCPCore. All four implementation sources match the published release checkout. No economic change, deployment, or on-chain transaction in this check. The previously discussed unrestricted post-deadline exit candidate was not implemented.

- Market Formal cutoff TF = Core cutoff TC minus one hour. Default request window is one hour. Requests require remaining time strictly greater than one hour, so proposal < TF and due < TC. Core rechecks due < original cutoff independently.
- At request due, Core stake/exit/fee accrual and Market directional trades/pair redemption reject from the same Core due predicate. Before due, exits remain allowed while original deadlines allow them.
- Rejected request removes only the temporary freeze. It never extends TF or TC. After TF only Core can resume; after TC rejection immediately performs ordinary finalization.
- Late successful request retains its earlier logical due timestamp. Ordinary Core finalize processes a pending earlier request first.
- Direct Core finalization may leave Market phase temporarily FORMAL/WAIT_CORE, but resolved blocks trading. Market finalize or adapter completes Market; premature Market finalize safely rejects.
- Repeated adapter finalization after partial Core, LP and B payouts preserves nonzero remaining budgets. Tests then exhaust all budgets.
- Freeze refers to economic trading permissions, not all writes. closeExpired/LP token materialization are separate operations. With no due request, complete YES+NO pair redemption remains allowed after TC until actual Core resolution, per existing rules; it does not change Core vote weights.

Added six integration tests (10 integration tests total) covering TF-1/TF/TF+1 due boundaries, latest valid proposal, TC/TC+1 delayed failures, pre-due exits and exact due freeze, closeExpired order, direct Core vs Market finalization, and partial-payout idempotence.

Validation: forge test --match-contract 'TopicMarketEarly(Exit|Integration|Module)Test' -vv: 35 passed, 0 failed, 0 skipped across three suites. Local EVM regression tests, not a new fork or live transaction run. Log: /tmp/ocp-early-cross-expanded.log.
