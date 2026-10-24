/** Independent Genesis v2 numerical demo. No chain or custody.
 * Each side has its own reversible potential; capital never reprices shares.
 * User accepts turnover-funded graduation and paths which never graduate.
 */
export type Side = "YES" | "NO";
export type Outcome = Side | "INVALID";
export type MarketPhase = "CREATE" | "GENESIS" | "FORMAL" | "WAIT_CORE" | "FAILED" | "SETTLED";
export type Pair = [number, number];
export interface Trader {
  name: string; wallet: number; shares: Pair; credit: number;
  reward: number; paid: number; received: number; claimed: boolean;
}
export interface Payout { shares: number; capital: number; reward: number; total: number }
export interface MarketEvent {
  id: number; at: number; kind: "CREATE" | "BUY" | "SELL" | "GRADUATE" | "CLOSE" | "RESULT" | "CLAIM";
  actor?: number; side?: Outcome; cash?: number; quantity?: number; q?: Pair; principal?: number;
}
export interface LifecycleMarket {
  /** 首页同一钱包转入独立 Core 金库的真实模拟现金；不计入市场毕业资金。 */
  externalCash?: number;
  phase: MarketPhase; b: number; now: number; deadline: number;
  q: Pair; R: number; T: number; L: number; formalSurplus: number | null;
  fees: { core: number; capital: number; protocol: number };
  accounts: Trader[]; events: MarketEvent[]; result: Outcome | null;
  payouts: Payout[] | null; frozen: { R: number; T: number; L: number; q: Pair } | null;
}
export interface TradePreview {
  next: LifecycleMarket; actual: number; quantity: number; fee: number;
  contribution: number; unused: number; average: number; graduated: boolean;
}

export const GENESIS_SLOPE = .009; // Demo calibration: .01 all-in initial ask.
const sideIndex = (side: Side) => side === "YES" ? 0 : 1;
const finitePositive = (x: number) => Number.isFinite(x) && x > 0;
export const isTrading = (m: LifecycleMarket) => (m.phase === "GENESIS" || m.phase === "FORMAL") && m.now < m.deadline;

export function cost(q: Pair, b: number): number {
  const hi = Math.max(q[0], q[1]);
  return hi + b * Math.log1p(Math.exp(-Math.abs(q[0] - q[1]) / b));
}
export const genesisPotential = (q: number, b: number) => GENESIS_SLOPE * b * Math.expm1(q / b);
export function graduationStatus(m: Pick<LifecycleMarket, "q" | "R" | "b">) {
  const required = cost(m.q, m.b);
  const protectionFactor = GENESIS_SLOPE * (Math.exp(m.q[0] / m.b) + Math.exp(m.q[1] / m.b));
  return { required, ratio: m.R / required, protectionFactor,
    fundingReady: m.R >= required, protectionReady: protectionFactor <= 1 };
}
function eligible(q: Pair, R: number, b: number) {
  const g = graduationStatus({ q, R, b }); return g.fundingReady && g.protectionReady;
}
// 中文安全说明：毕业保护与账户拆分无关。aE<=1保证任意减仓E→E'时，
// b ln(E/E') >= ab(E-E')；买卖两端同为1%卖出费，故净卖款同样不下降。
// 资金足额但保护未满足时仍留在Genesis，不为制造毕业而改变任一侧报价。
function quantityAtCost(m: LifecycleMarket, C: number, side: number): Pair {
  const q = [...m.q] as Pair;
  const gap = m.q[1 - side] / m.b - C;
  if (gap >= 0) throw new Error("QUOTE_LIMIT");
  q[side] = m.b * (C + Math.log(-Math.expm1(gap)));
  return q;
}
function clone(m: LifecycleMarket): LifecycleMarket {
  return { ...m, q: [...m.q], fees: { ...m.fees }, events: [...m.events],
    accounts: m.accounts.map(a => ({ ...a, shares: [...a.shares] })) };
}
function event(m: LifecycleMarket, e: Omit<MarketEvent, "id" | "at">) {
  m.events = [...m.events, { ...e, id: (m.events.at(-1)?.id ?? 0) + 1, at: m.now }].slice(-120);
}
function fee(m: LifecycleMarket, grossFee: number, formal: boolean) {
  if (!formal) { m.fees.protocol += grossFee; return; }
  m.fees.core += .7 * grossFee; m.fees.capital += .2 * grossFee; m.fees.protocol += .1 * grossFee;
  const Z = m.accounts.reduce((n, a) => n + a.credit, 0);
  if (Z <= 0) throw new Error("MODEL_STATE");
  m.accounts.forEach(a => { a.reward += .2 * grossFee * a.credit / Z; });
}
function graduate(m: LifecycleMarket) {
  if (!eligible(m.q, m.R, m.b)) throw new Error("GRADUATION");
  m.formalSurplus = m.R - cost(m.q, m.b);
  m.phase = "FORMAL"; m.L = 0; m.T = m.R;
  event(m, { kind: "GRADUATE", q: [...m.q], principal: m.R });
}

export function newMarket(b = 150): LifecycleMarket {
  if (!Number.isFinite(b) || b < 1 || b > 1000) throw new Error("DEPTH");
  return { phase: "CREATE", b, now: 0, deadline: 300, q: [0, 0], R: 0, T: 0, L: 0, formalSurplus: null,
    fees: { core: 0, capital: 0, protocol: 0 }, result: null, payouts: null, frozen: null,
    accounts: ["You", "Trader A", "Trader B"].map(name => ({ name, wallet: 10000, shares: [0, 0],
      credit: 0, reward: 0, paid: 0, received: 0, claimed: false })), events: [] };
}
export function createMarket(m: LifecycleMarket): LifecycleMarket {
  if (m.phase !== "CREATE") throw new Error("PHASE");
  const n = clone(m); n.phase = "GENESIS"; event(n, { kind: "CREATE" }); return n;
}
export function prices(m: LifecycleMarket): { ask: Pair; bid: Pair; probability: Pair } {
  const C = cost(m.q, m.b) / m.b;
  const pi: Pair = [Math.exp(m.q[0] / m.b - C), Math.exp(m.q[1] / m.b - C)];
  if (m.phase !== "CREATE" && m.phase !== "GENESIS") return {
    ask: pi.map(p => p / .99) as Pair, bid: pi.map(p => .99 * p) as Pair, probability: pi,
  };
  const p = m.q.map(q => GENESIS_SLOPE * Math.exp(q / m.b));
  return { ask: p.map(v => v / .9) as Pair, bid: p.map(v => .99 * v) as Pair, probability: pi };
}
export function trade(m: LifecycleMarket, owner: number, side: Side, mode: "BUY" | "SELL", amount: number): TradePreview {
  if (!isTrading(m)) throw new Error("CLOSED");
  if (!Number.isInteger(owner) || !m.accounts[owner] || !finitePositive(amount)
    || !["YES", "NO"].includes(side) || !["BUY", "SELL"].includes(mode)) throw new Error("AMOUNT");
  const s = sideIndex(side), n = clone(m), a = n.accounts[owner];
  const formalAtStart = n.phase === "FORMAL", beforeFee = n.fees.core + n.fees.capital + n.fees.protocol;
  let actual = amount, qty = 0, contribution = 0, reachesGate = false;
  if (mode === "BUY") {
    if (amount > a.wallet) throw new Error("BALANCE");
    let q: Pair;
    if (formalAtStart) q = quantityAtCost(n, (cost(n.q, n.b) + .99 * amount) / n.b, s);
    else {
      const at = (paid: number): Pair => {
        const result = [...n.q] as Pair;
        result[s] = n.b * Math.log(Math.exp(n.q[s] / n.b) + .9 * paid / (GENESIS_SLOPE * n.b));
        return result;
      };
      const E = Math.exp(n.q[0] / n.b) + Math.exp(n.q[1] / n.b);
      // 只在保护区域内查找第一次资金达标；之后继续买入不能重新进入保护区域。
      const protectedBudget = Math.max(0, (1 / GENESIS_SLOPE - E) * GENESIS_SLOPE * n.b / .9);
      const probe = Math.min(amount, protectedBudget * (1 - 1e-12));
      if (probe > 0 && eligible(at(probe), n.R + .99 * probe, n.b)) {
        let lo = 0, hi = probe;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (eligible(at(mid), n.R + .99 * mid, n.b)) hi = mid; else lo = mid;
        }
        actual = hi; reachesGate = true;
      }
      q = at(actual);
    }
    qty = q[s] - n.q[s];
    if (!finitePositive(qty) || actual > amount + 1e-6) throw new Error("QUOTE_LIMIT");
    n.q = q; a.shares[s] += qty; a.wallet -= actual; a.paid += actual;
    n.R += .99 * actual;
    if (formalAtStart) n.T += .99 * actual;
    else { n.T += .9 * actual; contribution = .09 * actual; n.L += contribution; a.credit += contribution; }
    fee(n, .01 * actual, formalAtStart);
    event(n, { kind: "BUY", actor: owner, side, cash: actual, quantity: qty });
    if (reachesGate) graduate(n);
  } else {
    if (amount > a.shares[s] + 1e-9) throw new Error("SHARES");
    qty = Math.min(amount, a.shares[s]);
    if (!finitePositive(qty)) throw new Error("SHARES");
    const qEnd = [...n.q] as Pair; qEnd[s] = Math.max(0, qEnd[s] - qty);
    let gross = 0;
    if (formalAtStart) {
      gross = cost(n.q, n.b) - cost(qEnd, n.b); n.q = qEnd;
      n.R -= gross; n.T -= gross; fee(n, .01 * gross, true);
    } else {
      const oldPotential = genesisPotential(n.q[s], n.b);
      const at = (sold: number) => {
        const q = [...n.q] as Pair; q[s] = Math.max(0, q[s] - sold);
        const cash = Math.max(0, oldPotential - genesisPotential(q[s], n.b));
        return { q, cash, R: n.R - cash };
      };
      const end = at(qty); let genQty = qty;
      // 卖出进入aE<=1区域后，继续卖出只会改善两项毕业条件，故可二分首次触发。
      if (eligible(end.q, end.R, n.b)) {
        let lo = 0, hi = qty;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2, p = at(mid);
          if (eligible(p.q, p.R, n.b)) hi = mid; else lo = mid;
        }
        genQty = hi; reachesGate = true;
      }
      const gen = at(genQty);
      if (gen.cash > n.T + 1e-7) throw new Error("MODEL_STATE");
      gross = gen.cash; n.R -= gen.cash; n.T -= gen.cash;
      fee(n, .01 * gen.cash, false); n.q = gen.q;
      if (reachesGate) {
        graduate(n);
        const rest = Math.max(0, cost(n.q, n.b) - cost(qEnd, n.b));
        n.R -= rest; n.T -= rest; gross += rest; fee(n, .01 * rest, true); n.q = qEnd;
      }
    }
    a.shares[s] = Math.max(0, a.shares[s] - qty); actual = .99 * gross;
    a.wallet += actual; a.received += actual;
    event(n, { kind: "SELL", actor: owner, side, cash: actual, quantity: qty });
  }
  assertLedger(n);
  return { next: n, actual, quantity: qty, contribution, unused: mode === "BUY" ? Math.max(0, amount - actual) : 0,
    fee: n.fees.core + n.fees.capital + n.fees.protocol - beforeFee,
    average: actual / qty, graduated: !formalAtStart && n.phase === "FORMAL" };
}
function terminalPayouts(m: LifecycleMarket, outcome: Outcome | null): Payout[] {
  const Q = m.q[0] + m.q[1], Z = m.accounts.reduce((n, a) => n + a.credit, 0);
  const debt = outcome === "YES" ? m.q[0] : outcome === "NO" ? m.q[1] : outcome === "INVALID" ? Q / 2 : 0;
  if (outcome && debt > m.R + 1e-6 * m.b) throw new Error("MODEL_STATE");
  return m.accounts.map(a => {
    const shares = outcome === null ? (Q > 0 ? m.T * (a.shares[0] + a.shares[1]) / Q : 0)
      : outcome === "YES" ? a.shares[0] : outcome === "NO" ? a.shares[1] : (a.shares[0] + a.shares[1]) / 2;
    const capital = outcome === null ? (Z > 0 ? m.L * a.credit / Z : 0)
      : (Z > 0 ? Math.max(0, m.R - debt) * a.credit / Z : 0);
    const reward = outcome === null ? 0 : a.reward;
    return { shares, capital, reward, total: shares + capital + reward };
  });
}
export function advanceTime(m: LifecycleMarket, seconds: number): LifecycleMarket {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("TIME");
  if (m.phase === "CREATE") return m;
  const n = clone(m); n.now += seconds;
  if ((n.phase === "GENESIS" || n.phase === "FORMAL") && n.now >= n.deadline) {
    n.now = n.deadline; n.frozen = { R: n.R, T: n.T, L: n.L, q: [...n.q] };
    if (n.phase === "GENESIS") { n.phase = "FAILED"; n.payouts = terminalPayouts(n, null); }
    else n.phase = "WAIT_CORE";
    event(n, { kind: "CLOSE" });
  }
  return n;
}
export function publishResult(m: LifecycleMarket, outcome: Outcome): LifecycleMarket {
  if (m.phase !== "WAIT_CORE" || !["YES", "NO", "INVALID"].includes(outcome)) throw new Error("PHASE");
  const n = clone(m); n.result = outcome; n.now += 30;
  n.payouts = terminalPayouts(n, outcome); n.phase = "SETTLED"; event(n, { kind: "RESULT", side: outcome });
  return n;
}
export function claimPayout(m: LifecycleMarket, owner: number): LifecycleMarket {
  if ((m.phase !== "SETTLED" && m.phase !== "FAILED") || !m.payouts || !m.accounts[owner]) throw new Error("PHASE");
  if (m.accounts[owner].claimed) throw new Error("CLAIMED");
  const n = clone(m), a = n.accounts[owner], p = m.payouts[owner];
  a.claimed = true; a.wallet += p.total; a.received += p.total;
  if (n.phase === "FAILED") { n.T = Math.max(0, n.T - p.shares); n.L = Math.max(0, n.L - p.capital); }
  else n.T = Math.max(0, n.T - p.shares - p.capital);
  n.R = Math.max(0, n.R - p.shares - p.capital); n.fees.capital = Math.max(0, n.fees.capital - p.reward);
  event(n, { kind: "CLAIM", actor: owner, cash: p.total }); assertLedger(n); return n;
}
export function assertLedger(m: LifecycleMarket) {
  const total = m.accounts.reduce((n, a) => n + a.wallet, 0) + m.R + m.fees.core + m.fees.capital + m.fees.protocol + (m.externalCash ?? 0);
  if (!Number.isFinite(total) || Math.abs(total - 30000) > 1e-5 || Math.min(m.R, m.T, m.L, m.externalCash ?? 0) < -1e-6) throw new Error("MODEL_STATE");
  if (Math.abs(m.R - m.T - m.L) > 1e-6) throw new Error("MODEL_STATE");
  if (m.phase === "GENESIS" && Math.abs(m.T - m.q.reduce((sum, q) => sum + genesisPotential(q, m.b), 0)) > 1e-5) throw new Error("MODEL_STATE");
  if (m.phase === "FORMAL" && (m.formalSurplus === null || m.formalSurplus < 0 ||
    Math.abs(m.R - cost(m.q, m.b) - m.formalSurplus) > 1e-5)) throw new Error("MODEL_STATE");
}
export function scenario(kind: "GENESIS" | "FORMAL" | "FAILURE" | "BALANCED"): LifecycleMarket {
  let m = createMarket(newMarket());
  if (kind === "GENESIS") return m;
  if (kind === "BALANCED") {
    m = trade(m, 0, "YES", "BUY", 500).next;
    return trade(m, 1, "NO", "BUY", 500).next;
  }
  if (kind === "FAILURE") {
    m = trade(m, 0, "YES", "BUY", 2).next;
    return trade(m, 1, "YES", "BUY", 100).next;
  }
  // 真实周转：每笔买入都支付费用并形成9%出资，不伪造本金或直接设置毕业。
  for (let i = 0; i < 30 && m.phase === "GENESIS"; i++) {
    const owner = i % 3, side: Side = i % 2 ? "NO" : "YES", index = sideIndex(side);
    m = trade(m, owner, side, "BUY", 100).next;
    if (m.phase === "GENESIS") m = trade(m, owner, side, "SELL", m.accounts[owner].shares[index]).next;
  }
  if (m.phase !== "FORMAL") throw new Error("MODEL_STATE");
  m = trade(m, 0, "YES", "BUY", 25).next;
  return trade(m, 1, "NO", "BUY", 15).next;
}
