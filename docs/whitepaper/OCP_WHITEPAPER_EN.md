# OnChain Consensus Protocol (OCP)

## 共识上链协议 · Proof of Commitment (POC)

> **OCP Master Whitepaper**. For mechanism details see the [POC Whitepaper](./POC_WHITEPAPER_EN.md).

---

## Design Goals

**OCP’s fundamental purpose is to improve the accuracy with which consensus reflects the real world and digital space—without a single external signal source, “council of elders,” or oracle.** All protocol design choices serve this end.

---

## Abstract

If the Bitcoin protocol solved “value OnChain,” the OnChain Consensus Protocol (OCP) aims to solve “**facts OnChain**.” The official Factory owner creates propositions; once created, staking, finalization, and withdrawal are permissionless.

This document presents the **OnChain Consensus Protocol (OCP)**. Its core thesis: blockchains can carry not only money and contracts but **consensus about the external world**. Through a minimal “stake–lock–finalize” game, the official Factory owner creates a proposition and opens it to public participation, ultimately producing **Finalized Consensus**. The underlying logic is **Proof of Commitment (POC)**: the authority of consensus comes from **verifiable capital lock-up**, not identity or claims. The protocol does not produce “truth”; it outputs **capital-confidence outcomes**.

The protocol uses a **three-outcome game**: YES (fact holds), NO (fact reversed), and INVALID (fact broken / premise absent / unverifiable). When an event is cancelled, truth is unknowable, or the proposition is ambiguous, INVALID acts as a circuit breaker and triggers full refunds, avoiding unfair binary outcomes for either side.

This whitepaper describes OCP as a base layer and presents its first application: a fully endogenous prediction market.

**Keywords**: consensus OnChain, facts OnChain, Proof of Commitment (POC), stake, lock, three-outcome game, finalized consensus, capital confidence, prediction market, oracle-free

---

## 1. Introduction: The Last Mile of Consensus

### 1.1 The Problem

Real-world consensus—who won the match? which proposal is better?—is hard to turn into **trustworthy, programmable finality** in the digital world. How can decentralized systems make irreversible, manipulation-resistant collective commitments about external facts or subjective choices?

### 1.2 Existing Approaches

- **Oracles** (Chainlink, UMA, etc.): Depend on off-chain authorities or complex governance; centralization and bribeability risks
- **OnChain courts** (Kleros): Majority voting, but consensus is decoupled from capital
- **Prediction markets** (Polymarket, Augur): Depend on external settlement sources or reporter games; truth relies on external referees

Common issue: **the last mile of consensus**—how to bring off-chain disputes OnChain and resolve them irreversibly—has not been solved in an elegant way.

### 1.3 Our Approach

**OCP**: A protocol layer that treats consensus itself as a **settleable asset**. Proposition creation is controlled by the Factory owner; participation and finalization are permissionless. At its core is **Proof of Commitment (POC)**—the authority of consensus is proved by verifiable capital lock-up.

---

## 2. OCP Protocol Design: Two Actions, Three Outcomes

### 2.1 Objectives

Define how a dispute over a **binary proposition** is “moved” OnChain and resolved. The protocol’s only output is **Finalized Consensus**—a programmable, irreversible “OnChain fact” asset.

**Three outcomes**: The protocol outputs three possible results—YES (fact holds), NO (fact reversed), INVALID (fact broken / premise absent / unverifiable). When a match is cancelled, truth is unknowable, or the proposition is ambiguous, a binary verdict is unfair to one side; INVALID must be introduced as a circuit breaker. If neither YES nor NO has a strict majority at the fixed staking deadline, the Vault resolves INVALID.

**Important**: OCP outputs **capital-confidence results**—the maximum commitment capital is willing to bear for an outcome—not an objective “truth” verdict. Under typical conditions the two are highly correlated; in edge cases they may diverge (see §5.1).

### 2.2 Core Three Elements

| Element | Action / Output | Definition |
|---|---|---|
| **Stake** | `stake(position, amount)` | Capital enters YES, NO, or INVALID and remains locked until settlement |
| **Lock** | Contract-enforced state | The first stake fixes an address to one side; it may add there but cannot withdraw or switch |
| **Finalized Consensus** | OnChain readable | The unique irreversible output formed after the fixed deadline |

### 2.3 Minimum Stake b

Only the official Factory `owner` may create propositions. At deployment, that Factory fixes Base native USDC as the sole stake token. The creator sets each Vault's minimum stake b; USDC uses six decimals and b is an absolute USDC-denominated participation threshold.

Fund availability therefore also depends on Circle's USDC contract. Circle's pause, blacklist, and upgrade powers may temporarily prevent staking or withdrawal; OCP cannot bypass issuer controls.

### 2.4 One-Side Lock

YES, NO, and INVALID remain open during one public staking period. An address chooses its side with its first stake and may only add to that side. It cannot withdraw or switch, so commitment cannot become a free option to follow the visible leader.

### 2.5 Flow and Finality

- One public staking period ends at a deadline $t_0$ fixed at creation.
- All three sides accept stake until $t_0$.
- No transaction or leadership change can extend the deadline.
- At $t_0$, staking closes and any address may trigger one-shot finality.

| Condition | Result | Settlement |
|---|---|---|
| YES principal > 50% of total | YES | YES capital shares the vault pool pro rata |
| NO principal > 50% of total | NO | NO capital shares the vault pool pro rata |
| Otherwise, including exactly 50% | INVALID | Every participant recovers funds pro rata |

```
Creation → public YES / NO / INVALID staking until t₀
         → one-side lock; same-side additions only
t₀       → staking closes → anyone may finalize
```

### 2.6 INVALID Settlement

INVALID is both an active position and the fallback when neither binary side has a strict majority. If INVALID wins, every participant receives a pro-rata share based on principal. If YES or NO wins, INVALID principal is part of the losing pool.

### 2.7 Parent–Child Events and Root Events

Parent–child references may be built at the application layer above Vaults; the current core contracts do not implement automatic parent–child behavior. For example:

- **Parent event**: A precondition proposition (e.g. “The match on May 1, 2026 proceeded normally”)
- **Child event**: A proposition that depends on the parent (e.g. “Lakers won”)

Future applications may make a child refund when its parent finalizes INVALID, but an additional contract must implement that behavior. The current Vault does not do so automatically.

A root event is one with no parent. Parent relationships, depth limits, and refund propagation remain future extensions.

### 2.8 History and Ledger

OnChain events allow applications to reconstruct each Vault’s stakes and finality. Cross-Vault participant reputation, cumulative winning-stake scores, and reputation-weighted voting are not implemented in the current core contracts and do not affect settlement.

### 2.9 Application-Layer Flexibility: Chaining Rounds

Unlike parent–child events in §2.7, here each round is an independent OCP event; the previous round’s consensus is only input to the next round’s proposition, with no protocol-layer automatic refund propagation. Applications that need to model multi-round games (e.g. complex arbitration, multi-stage governance) can **chain multiple OCP events**: use the previous round’s Finalized Consensus as input to a new event in the next round. Each OCP event itself still follows the one-shot finality rules above.

### 2.10 Relation to Proof of Commitment (POC)

OCP is the **goal** (consensus OnChain, programmable finality); **POC** (Proof of Commitment) is the **mechanism** (stake–lock–finalize–consensus). The POC whitepaper details mechanism, game theory, and philosophical metaphor. The two are the same protocol’s goal and mechanism descriptions.

---

## 3. Why It Works: Game Theory and “Expensive Consensus”

### 3.1 Loss Rather Than Speech

OCP relies on wrong positions bearing real principal loss. No withdrawal or switching makes each stake a verifiable commitment rather than a revisable statement.

### 3.2 Rational Participation

For stake $x$, subjective correctness probability $q$, winning principal $W$, pool $P$, and cost $c$:

$$
\mathbb{E}[U_{stake}] = q\left(\frac{x}{W}P-x\right) - (1-q)x-c
$$

The contract verifies amount, side, and time, but cannot verify whether $q$ comes from independent information.

### 3.3 Fixed Deadline and One-Side Lock

The fixed deadline prevents indefinite extension. One-side locking prevents costless late switching. INVALID prevents a forced binary answer without strict majority support. Transparency enables auditing but also permits herding, whale influence, and late participation.

### 3.4 Difference from Ordinary Voting

OCP adds verifiable capital lock-up to voting. More capital expresses stronger commitment and bears greater loss when wrong, but does not solve identity linkage, capital concentration, or correlated information.

## 4. Utility Evolution: From Native Apps to AI Alignment

OCP is not merely a gambling tool but a **general-purpose consensus engine**. As adoption grows, its utility evolves along: native applications → infrastructure → value alignment.

### 4.1 Primary Utility: Native Consensus Applications (Prediction & Governance)

At this stage, OCP directly serves as the core consensus layer for decentralized applications (DApps), addressing the pain of “decisions and settlement depending on third parties.”

#### 4.1.1 Oracle-Free Prediction Markets

This is a direct mapping of the OCP mechanism. Traditional prediction markets rely on external oracles to establish outcomes, introducing centralization and data-bribe risk.

- **Endogenous settlement**: OCP’s “stake–lock–finalize” game puts settlement in the hands of market participants. Any long-tail event (e.g. “tomorrow’s rainfall in a given community”) can form and settle consensus as long as there is counter-party stake—no need to wait for an authoritative data feed.
- **Manipulation boundary**: Changing the outcome requires enough capital to change the strict-majority distribution; the protocol does not promise nonlinear cost growth or Sybil resistance.

#### 4.1.2 Optimistic Governance & Dispute Arbitration

DAO governance today suffers from “voter apathy” and “low execution efficiency.” OCP enables an **optimistic governance** pattern:

- **Proposal as stake**: Any proposer can initiate a governance action via OCP (stake YES).
- **Fixed-deadline capital vote**: YES, NO, and INVALID remain open until the fixed deadline. A binary result requires a strict majority of all principal.
- **Public KPI voting**: For OnChain protocol performance (e.g. “Did the grant recipient complete the development milestone?”), OCP turns the question into a publicly staked proposition without relying on a single admin’s subjective signature.

### 4.2 Infrastructure Utility: “Consensus-as-a-Service” in the Sync Era

As Ethereum moves toward Based Rollups and real-time proving, OnChain execution reaches second-scale sync, but **external facts** (oracle data, cross-chain state, real-world events) remain at minute- or hour-scale confirmation. OCP introduces an **Infrastructure-as-Consensus** view, bridging “technical finality” and “fact finality.”

#### 4.2.1 Truth Synchronicity

ZK-Rollups answer “is the computation correct?”; OCP aims to answer “is the input true?” In a synchronous composability setting, OCP does not pursue “slower but more accurate” facts but **“same-speed and committable”** facts, enabling true end-to-end atomic operations.

#### 4.2.2 Economic Pre-finality

To match L2’s millisecond execution, OCP offers a layered finality model:

- **Non-final observation signal**: Applications can read the public capital distribution before the deadline. Changing the leader requires enough capital to alter the strict-majority distribution, but cost is not guaranteed to grow non-linearly.
- **Finality boundary**: State observed before the fixed deadline is not protocol finality and may still change. Only the finalized outcome is safe for irreversible downstream execution.

#### 4.2.3 INVALID as a Sync Circuit Breaker

Binary logic alone cannot handle ambiguity. On INVALID, the current Vault guarantees only that its own settlement pool is shared pro rata by principal. A downstream application may separately configure refund or rollback behavior, but OCP does not automatically revert external systems.

### 4.3 Ultimate Utility: AI Value Alignment & Consensus Market

When AI agents begin to manage assets and decisions autonomously, the core question is: “Align to whose values?” Current AI alignment is often defined by a few centralized labs—inherently fragile and closed. OCP offers a decentralized alternative.

#### 4.3.1 Value-OnChain

OCP allows subjective disputes over value preferences, safety boundaries, and acceptable behavior to be brought OnChain.

- **From “fact” to “value”**: One can stake not only “who won the match” but “whether this AI’s behavior is ethical.”
- **Decentralized alignment target**: Global participants express positions with capital commitment; the capital lock makes each position costly and irreversible. The resulting Finalized Consensus becomes a **“alignment target”** that AI systems can read and execute.

#### 4.3.2 Expensive Consensus as an Anchor for Human Will

What if AI’s values are not hard-coded but continuously shaped by a global consensus market? OCP provides a continuously running consensus market. In it, only collective will that has passed expensive play (skin-in-the-game) becomes input to AI. This does not replace technical alignment but supplies decentralized, verifiable value input—alignment target shifts from a single principal’s instructions to human collective will refined by expensive consensus. In the long run, OCP can serve as infrastructure for “value OnChain”: not only facts but values can be finalized; not only money but alignment targets can be programmed.

---

## 5. Discussion: Boundaries, Parameters, and Future

### 5.1 Applicability Boundaries

OCP is best suited for **publicly verifiable, time-bounded** events. Protocol output may diverge from truth when:

- Information is not publicly verifiable
- Capital is dominated by ideology
- Truth exists but informed capital does not participate or is too small

In such cases the output is “expensive error”—a capital-confidence result, not objective truth. This defines the protocol’s domain of applicability.

### 5.2 Key Parameters

The protocol defines finality rules and the **definition** of b (b = vault minimum deposit). The following are set at vault or application layer:

| Parameter | Set by | Too small | Too large |
|-----------|--------|-----------|-----------|
| $b$ (minimum stake) | Vault creator | More small transactions and noise | Participation barrier too high |
| Staking duration | Application layer | Insufficient information aggregation | Longer capital lock-up |

---

## 6. Conclusion

The OnChain Consensus Protocol (OCP) turns **real-world disputes** into **OnChain programmable finalized consensus**. Its mechanism is Proof of Commitment (POC): stake–lock–finalize–consensus. The output is a capital-confidence result—a measure of social epistemic hardness—not absolute truth.

**Blockchains can carry not only money and contracts but consensus about the external world.** OCP is the protocol-layer implementation of this vision.

---

## 7. Appendix: Terminology and Document Index

| Term | Definition |
|------|------------|
| OCP | OnChain Consensus Protocol; goal is to bring consensus OnChain and form Finalized Consensus; fundamental purpose is to improve how accurately consensus reflects the real world |
| **POC (Proof of Commitment)** | Consensus authority is proved by verifiable capital lock-up, not identity or claims |
| Facts OnChain | Relative to “value OnChain”; the core problem OCP solves: turning external-world disputes into OnChain programmable Finalized Consensus |
| **Three-outcome game** | Finalized Consensus has three results: YES, NO, INVALID |
| **b (minimum stake)** | Official Factory owner sets the minimum USDC participation amount |
| **INVALID** | Fact broken / premise absent / unverifiable; triggers full refund for all |
| **Finalized Consensus** | The protocol’s unique, authoritative output; programmable, irreversible OnChain fact asset |
| **Fixed deadline** | Set at creation; closes staking and cannot be extended |
| **One-side lock** | An address may add only to its first side and cannot withdraw or switch |
| **Participant history** | Vault events can be reconstructed; cross-Vault reputation and weighting are future application-layer work and do not affect current settlement; see §2.8 |
| Capital confidence | Maximum commitment capital is willing to bear for an outcome |
| Creator | Official Factory owner; creates the proposition and sets its minimum USDC deposit |

| Document | Content |
|----------|---------|
| [OCP Whitepaper](./OCP_WHITEPAPER_EN.md) | This document; narrative framework for consensus OnChain |
| [POC Whitepaper](./POC_WHITEPAPER_CN.md) | Mechanism details, game theory, stake–lock–finalize–consensus philosophy |

---

*Document version: 1.0 | OnChain Consensus Protocol (OCP) Whitepaper | Three-outcome game, b = minimum deposit, future application-layer extensions*
