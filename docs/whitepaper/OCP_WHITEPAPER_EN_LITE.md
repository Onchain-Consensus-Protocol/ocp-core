# OCP — OnChain Consensus Protocol (Lite)

*A short overview for forum discussion. Full whitepaper and mechanism details are available separately.*

---

## One-liner

**If Bitcoin gave us value OnChain, OCP aims to give us facts OnChain.** The official Factory owner creates propositions; once created, public staking, finalization, and withdrawal are permissionless.

---

## The gap we’re targeting

Real-world questions (“who won?”, “did it happen?”) are hard to get as **trustworthy, programmable finality** OnChain. Oracles add a single point of failure; OnChain courts often decouple consensus from capital; prediction markets still lean on external settlement. The “last mile” of consensus—bringing a dispute OnChain and resolving it irreversibly—is still messy.

---

## Core idea

- **Consensus as a settleable asset.** OCP is a thin protocol layer: an authorized Factory owner defines a proposition; participants finalize it through **stake–lock–finality**.
- **Proof of Commitment (POC).** Authority comes from **verifiable capital at risk**, not identity or claims. We don’t assume people tell the truth; we assume being wrong is expensive.
- **Three outcomes:** YES, NO, or **INVALID**. YES or NO must hold strictly more than half of all principal; otherwise INVALID makes all participants share the settlement pool pro rata by principal.

The official production Factory accepts only Base native USDC. Before the fixed deadline, every address may choose one side and add only to that side; it cannot withdraw or switch. The deadline never extends.

Output is **Finalized Consensus**—one canonical OnChain fact per event that contracts and other apps can read. We frame it as “capital-confidence”: what outcome capital is willing to lock in, not a claim about objective truth.

---

## Why it might matter for Ethereum

- **Oracle-free prediction markets** and other apps that need “fact finality” without a central data source.
- **Fixed-deadline governance**: YES, NO, and INVALID remain open until the same deadline; no proposal passes by default.
- **Sync / L2 context**: as execution gets faster, “is the input true?” remains slow. OCP is designed so consensus can be referenced at “same-speed” for atomic flows (economic pre-finality, INVALID as a circuit breaker when facts are ambiguous).
- **Longer-term**: a programmable layer for “value OnChain”—not only facts but preferences and alignment targets—readable by contracts and agents.

---

## What we’re not claiming

We’re not claiming OCP outputs “truth.” It outputs **a capital-confidence result backed by locked funds**. It works best for **publicly verifiable, time-bounded** events; edge cases such as non-verifiable information, concentrated capital, Sybil addresses, or low participation can produce expensive errors. Public fixed deadlines also create herding and late-entry incentives; those are explicit design boundaries.

---

## Where to go from here

- Full narrative and design goals: **OCP Whitepaper**
- Mechanism, game theory, and settlement rules: **POC Whitepaper**
- First application: **OCP Game Vault** on top of OCP

Happy to discuss design tradeoffs, L2/composability use cases, or integration ideas in the thread.
