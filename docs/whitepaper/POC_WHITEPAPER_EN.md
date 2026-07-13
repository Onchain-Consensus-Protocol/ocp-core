# Proof of Commitment (POC): A Scheme for Costly Social Consensus

> **Implementation Status**: This document defines the mechanism layer (POC) of OCP. The OnChain consensus narrative framework is in the [OCP Whitepaper](./OCP_WHITEPAPER_EN.md).

---

## Abstract

This paper proposes a **triadic OnChain protocol** to form anti-manipulation capital consensus over external propositions. The protocol runs in three phases:

1. **Staking**: participants choose YES, NO, or INVALID and lock capital until finality.
2. **Locking**: each address remains on its first side and may only add to that side before the fixed deadline.
3. **Finality**: after the deadline, YES or NO wins only with a strict majority of all principal; otherwise the outcome is INVALID.

This protocol does not produce truth; it is a **stress-testing furnace for consensus**, serving as a trust-minimized base layer for prediction, arbitration, and governance. Its core logic is **Proof of Commitment (POC)**: the authority of consensus is proven by verifiable capital lock-in.

**Keywords**: staking, capital lock, fixed finality, Proof of Commitment (POC), three-state settlement, game theory

---

## 1. Introduction: The Cost of Consensus

### 1.1 Problem

How can decentralized systems make **irreversible, anti-manipulation collective commitments** on external facts or subjective choices?

Oracles rely on off-chain authorities or heavy governance. OnChain courts (e.g., Kleros) rely on majority voting. Prediction markets (e.g., Polymarket, Augur) rely on external settlement sources. The common issue is that **truth or final judgment depends on external arbiters**, creating trust and manipulation risk.

### 1.2 Core Thesis

The strongest form of credible commitment is the willingness to bear **large, verifiable financial risk**. This protocol encodes that principle: no external judge is introduced; **capital itself** forms consensus under a fixed deadline. Its weight comes from irreversible capital lock-up and the loss borne by an incorrect side.

### 1.3 Protocol Philosophy

**The protocol does not produce truth; it produces the most costly consensus.**

How to use it—event prediction, dispute resolution, governance voting, or belief signaling—is an application-layer choice.

**This protocol converts staking into finality through one-side lock, a fixed deadline, and a strict-majority rule.**

---

## 2. Mechanism Design: Staking — Lock — Finality

### 2.1 Staking

Participants may stake YES, NO, or INVALID until a fixed deadline $t_0$. One address may use only one side and may add to that side.

### 2.2 One-Side Lock and Fixed Deadline

The first stake fixes the address's direction. Funds cannot be withdrawn or switched before settlement. The deadline is known at creation and cannot be extended.

### 2.3 Consensus Formation

After $t_0$, any address may finalize. YES or NO wins only if its principal is strictly more than 50% of total YES + NO + INVALID principal. Otherwise, including exactly 50%, the result is INVALID. A binary winner shares the pool pro rata; INVALID returns funds to all participants pro rata.

### 2.4 Parent-Child Events and History

Parent-child references and historical analysis may be built above the vault. The current core contracts do not implement them, and they do not affect stake weight or settlement.

### 2.5 Terminology Mapping

| Expression | Category |
|---|---|
| deposit, voting weight, capital signal | **Staking** |
| immutable side, no withdrawal, no switching | **Lock** |
| strict majority, INVALID, settlement | **Finality** |

### 2.6 Key Properties

| Property | Meaning |
|---|---|
| Minimality | Stake, finalize, and withdraw |
| Three-state finality | YES, NO, or INVALID |
| Fixed deadline | No extension or extra round |
| Capital verifiability | Amount, side, and time are OnChain |

---

## 3. Theoretical Analysis: Irreversible Commitment

### 3.1 Expected Utility

For stake $x$, subjective correctness probability $q$, winning principal $W$, distributable pool $P$, and cost $c$:

$$
\mathbb{E}[U_{stake}] = q\left(\frac{x}{W}P-x\right) - (1-q)x-c
$$

The contract cannot verify whether $q$ comes from independent information, so the result is capital confidence rather than objective truth.

### 3.2 Security Philosophy

No withdrawal prevents costless exit; no switching prevents following the visible leader as a free option; a fixed deadline prevents indefinite games; INVALID prevents a forced binary result without strict majority support.

### 3.3 Transparent Capital Flow

Transparency makes the distribution auditable but can create herding, whale influence, and late participation. The protocol accepts these limits instead of hiding them behind extra phases or time-bucket rewards.

### 3.4 Schelling Comparison

| Schelling Game | OCP / POC |
|---|---|
| voting weight | staked principal |
| coordination cost | lock-up and wrong-side loss |
| coordination failure | direct capital loss |
| focal point | capital support at the fixed deadline |

Equivalent framing: **Capital-Weighted Schelling Game with Fixed Finality**.

## 4. Protocol Properties and Security Model

### 4.1 Oracle-Free

Consensus and settlement are fully endogenous and decided by OnChain capital distribution.

### 4.2 Trust Minimization

Trust only code and participant incentive alignment. No centralized admin and no off-chain committee.

### 4.3 Security Boundary

When capital is systemically misled (e.g., ideology-dominated events, unverifiable information, highly correlated signals), output can be **costly error** rather than truth. The protocol claims costly-tested consensus, not guaranteed truth.

---

## 5. Application Scenarios

All applications are concrete instantiations of the same Staking–Lock–Finality flow.

### 5.1 Prediction Markets

- **Staking**: users lock USDC on YES, NO, or INVALID until the fixed deadline
- **Locking**: each address may only add to its original side
- **Finality**: a binary side needs a strict majority; otherwise the outcome is INVALID

### 5.2 Decentralized Arbitration

- **Staking**: participants collateralize YES, NO, or INVALID positions
- **Locking**: positions cannot be withdrawn or switched before the deadline
- **Finality**: the strict-majority rule produces the final capital vote

### 5.3 High-Stakes Governance

- **Staking**: capital is locked for approve, reject, or INVALID
- **Public period**: every side remains open until the same fixed deadline
- **Finality**: downstream execution should use only the finalized result

### 5.4 Belief Signaling and Commitment

The core value is the observed commitment hardness created by public staking and irreversible side lock, even when payout itself is secondary.

---

## 6. Discussion, Limits, and Future Work

### 6.1 Parameter Effects

| Parameter | Set by | Too small | Too large |
|---|---|---|---|
| $b$ (= minimum vault deposit) | vault creator | small transactions and noise increase | participation is suppressed |
| Staking duration | application layer | insufficient information aggregation | longer capital lock-up |

### 6.2 Limitations

- **Low liquidity**: weak consensus hardness under sparse participation
- **Highly ambiguous events**: output may diverge from truth
- **Truth exists but informed capital does not participate**: the capital-confidence result may diverge from the best available evidence

### 6.3 Future Work

- Cross-chain implementations
- Whale influence and capital concentration analysis
- Richer governance/arbitration application specs

---

## 7. Conclusion

POC provides a base primitive to **capitalize social belief and stress-test it**. Its output measures hardness of collective commitment, not absolute truth.

**The protocol is a game machine that converts staking into consensus, and irreversible lock is its commitment boundary.**

If Bitcoin formalized trustless value transfer, POC formalizes **trustless costly commitment** for broader social coordination.

---

## Appendix A: Glossary (Staking–Lock–Finality)

| Term | Precise definition |
|---|---|
| **Staking** | unilateral capital binding to one proposition during a period; belief signal plus explicit cost |
| **Lock** | first stake fixes one side; funds cannot withdraw or switch |
| **Consensus** | irreversible outcome formed by strict majority at the fixed deadline |
| **POC** | authority of consensus proven by verifiable capital lock-in, not identity claims |
| **Staking phase** | until $t_0$, users stake to YES/NO/INVALID with full lock-up |
| **Fixed deadline** | closes staking at the precommitted time |
| **One-side lock** | same-side additions only; no withdrawal or switching |
| **One-shot finality** | immutable protocol-level rule for globally consistent final consensus |
| **Capital confidence** | maximum commitment capital can bear for an outcome |
| **INVALID** | broken premise / absent fact / unverifiable proposition; all refunded |
| **$b$** | vault minimum stake amount |

---

## Appendix B: References

- Schelling, *The Strategy of Conflict*
- Wolfers & Zitzewitz (2004), “Prediction Markets,” NBER w10504
- Marx, *Das Kapital*, Vol. 1
- Polymarket / UMA dispute mechanism literature

---

*Document Version: 1.0 | POC Mechanism Whitepaper | Three-state game, $b$ as minimum deposit, future application-layer extensions*
