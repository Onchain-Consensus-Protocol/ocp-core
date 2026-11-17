/** 原首页的 Core 与市场共用模拟钱包；Core 本金不进入市场筹资分母或可用资金。 */
import { advanceTime, assertLedger, claimPayout, createMarket, newMarket, publishResult, scenario, trade,
  type LifecycleMarket, type Outcome, type Side, type TradePreview } from "./marketLifecycleModel";

export type Outcomes = Record<Outcome, number>;
export interface CoreAccount { side: Outcome | null; stake: number; fees: Outcomes; claimed: boolean }
export interface HomepageState { market: LifecycleMarket; core: CoreAccount[]; result: Outcome | null }
const zeros = (): Outcomes => ({ YES: 0, NO: 0, INVALID: 0 });
const copy = (s: HomepageState): HomepageState => ({ ...s, market: { ...s.market,
  accounts: s.market.accounts.map(a => ({ ...a, shares: [...a.shares] })), fees: { ...s.market.fees } },
  core: s.core.map(a => ({ ...a, fees: { ...a.fees } })) });
export function coreStakes(s: HomepageState): Outcomes {
  return s.core.reduce((sum, a) => { if (a.side) sum[a.side] += a.stake; return sum; }, zeros());
}
export function coreOutcome(s: HomepageState): Outcome {
  const v = coreStakes(s), total = v.YES + v.NO + v.INVALID;
  return v.YES > total / 2 ? "YES" : v.NO > total / 2 ? "NO" : "INVALID";
}
function indexCoreFees(s: HomepageState, fee: number) {
  const totals = coreStakes(s), eligible = totals.YES + totals.NO;
  s.core.forEach(a => {
    if (a.side === "YES" || a.side === "NO") {
      a.fees[a.side] += totals[a.side] ? fee * a.stake / totals[a.side] : 0;
      a.fees.INVALID += eligible ? fee * a.stake / eligible : 0;
    }
  });
}
export function homepageInitial(kind?: "FORMAL" | "FAILURE" | "BALANCED", b = 150): HomepageState {
  const market = kind ? scenario(kind) : newMarket(b);
  // 原首页已有的40 YES / 30 NO由两个模拟交易员实际支付，不能凭空增资。
  market.accounts[1].wallet -= 40; market.accounts[2].wallet -= 30; market.externalCash = 70;
  const s: HomepageState = { market, result: null, core: [
    { side: null, stake: 0, fees: zeros(), claimed: false },
    { side: "YES", stake: 40, fees: zeros(), claimed: false },
    { side: "NO", stake: 30, fees: zeros(), claimed: false },
  ] };
  indexCoreFees(s, market.fees.core); assertHomepage(s); return s;
}
export function homepageCreate(s: HomepageState): HomepageState {
  return { ...s, market: createMarket(s.market) };
}
export function homepageStake(s: HomepageState, owner: number, side: Outcome, amount: number): HomepageState {
  if (!["GENESIS", "FORMAL"].includes(s.market.phase) || s.market.now >= s.market.deadline) throw Error("CLOSED");
  if (!s.core[owner] || !["YES", "NO", "INVALID"].includes(side) || !Number.isFinite(amount) || amount < 1) throw Error("AMOUNT");
  if (s.core[owner].side && s.core[owner].side !== side) throw Error("SIDE_LOCKED");
  if (amount > s.market.accounts[owner].wallet) throw Error("BALANCE");
  const n = copy(s); n.market.accounts[owner].wallet -= amount;
  n.market.externalCash = (n.market.externalCash ?? 0) + amount;
  n.core[owner].side = side; n.core[owner].stake += amount; assertHomepage(n); return n;
}
export function homepageTrade(s: HomepageState, owner: number, side: Side, mode: "BUY" | "SELL", amount: number): TradePreview & { homepage: HomepageState } {
  const q = trade(s.market, owner, side, mode, amount), n = copy(s);
  n.market = q.next;
  indexCoreFees(n, n.market.fees.core - s.market.fees.core);
  assertHomepage(n); return { ...q, homepage: n };
}
export function homepageAdvance(s: HomepageState, seconds: number): HomepageState {
  return { ...s, market: advanceTime(s.market, seconds) };
}
export function homepageFinalize(s: HomepageState): HomepageState {
  if (s.market.now < s.market.deadline || s.result) throw Error("PHASE");
  const n = copy(s); n.result = coreOutcome(n);
  // Core 结算在市场停盘之后；未毕业市场只走失败清算，不按结果承诺面额。
  n.market = n.market.phase === "WAIT_CORE" ? publishResult(n.market, n.result) : advanceTime(n.market, 30);
  assertHomepage(n); return n;
}
export function corePayout(s: HomepageState, owner: number) {
  const a = s.core[owner], totals = coreStakes(s), total = totals.YES + totals.NO + totals.INVALID;
  if (!s.result) return { principal: 0, fees: 0, total: 0 };
  const principal = s.result === "INVALID" ? a.stake : a.side === s.result ? total * a.stake / totals[s.result] : 0;
  const fees = a.fees[s.result]; return { principal, fees, total: principal + fees };
}
export function homepageClaimCore(s: HomepageState, owner: number): HomepageState {
  if (!s.result || !s.core[owner]) throw Error("PHASE");
  if (s.core[owner].claimed) throw Error("CLAIMED");
  const n = copy(s), p = corePayout(s, owner); n.core[owner].claimed = true;
  n.market.accounts[owner].wallet += p.total;
  n.market.externalCash = Math.max(0, (n.market.externalCash ?? 0) - p.principal);
  n.market.fees.core = Math.max(0, n.market.fees.core - p.fees); assertHomepage(n); return n;
}
export function homepageClaimMarket(s: HomepageState, owner: number): HomepageState {
  const n = { ...s, market: claimPayout(s.market, owner) }; assertHomepage(n); return n;
}
export function assertHomepage(s: HomepageState) {
  assertLedger(s.market);
  const remaining = s.core.reduce((sum, a, i) => sum + (a.claimed ? 0 : s.result ? corePayout(s, i).principal : a.stake), 0);
  if (Math.abs(remaining - (s.market.externalCash ?? 0)) > 1e-5) throw Error("CORE_LEDGER");
}
