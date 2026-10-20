/** DLP-1 浮点演示账本。无链上调用；不代表整数合约或生产定价证明。 */
export type Side = "YES" | "NO";
export type Outcome = Side | "INVALID";
export type DlpPhase = "CREATE" | "GENESIS" | "FORMAL" | "WAIT_CORE" | "FAILED" | "SETTLED";
export type DlpScenario = "GENESIS" | "BUY_GRADUATE" | "SELL_READY" | "SELL_GRADUATE" | "FAILURE";
export interface DlpConfig { Q?: number; k?: number; b?: number; TC?: number; creatorAccount?: number; protocolAccount?: number }
export interface DlpAccount {
  name: string; wallet: number; g: number; lp: number; z: number; yes: number; no: number;
  coreSide: Outcome | null; coreStake: number; coreRewards: [number, number, number]; claimed: boolean; coreClaimed: boolean; paid: number; received: number;
}
export interface DlpPayout { outcomes: number; lp: number; B: number; failed: number; total: number }
export interface DlpEvent { id: number; at: number; kind: string; actor?: number; amount?: number; quantity?: number; detail?: string }
export interface DlpLiquidityReference { lpSupply:number; basis:number; b:number; cash:number; lpFees:number; inventory:[number,number] }
export interface DlpAddQuote { lp:number; money:number; cash:number; lpFee:number; yes:number; no:number; basis:number; b:number; restart:boolean }
export interface DlpState {
  phase: DlpPhase; now: number; TG: number; TF: number; TC: number; Q: number; k: number;
  rTarget: number; bTarget: number; R: number; B: number; S: number; M0: number; redeemedPairs: number;
  collateral: number; cash: number; lpFees: number; lpFeesEarned:number; formalVolume:number; creatorFees: number; protocolFees: number;
  basis: number; b: number; lpSupply: number; inventory: [number, number]; liquidityClosed: boolean; restartLiquidity:DlpLiquidityReference|null;
  accounts: DlpAccount[]; core: { openedAt: number | null; yes: number; no: number; invalid: number; cash: number; fees: number; feeTotal: number; officialRewards: [number, number, number]; result: Outcome | null };
  result: Outcome | null; cover: number; lpBudget: number; bBudget: number; outcomeBudget: number;
  lpClaimSupply:number; bClaimSupply:number; lpBudgetInitial:number; bBudgetInitial:number; failedSupply:number; failedBudgetInitial:number;
  failedBudget: number; coreBudget: number; coreOfficialBudget: number; payouts: DlpPayout[] | null; corePayouts: number[];
  events: DlpEvent[]; config: { creatorAccount: number; protocolAccount: number };
}
export interface DlpTradeQuote {
  quantity: number; gross: number; net: number; R: number; B: number; lpFee: number;
  creatorFee: number; protocolFee: number; coreFee: number; wouldGraduate: boolean; average: number; mergePairs?: number;
  actual: number; contribution: number; fees: { creator: number; lp: number; protocol: number; core: number; B:number }; unused?: number;
}
export interface DlpExitQuote { money: number; cash: number; lpFee: number; yes: number; no: number; fraction: number }
const EPS = 1e-7;
const positive = (x: number) => Number.isFinite(x) && x > 0;
const sideIndex = (s: Side): 0 | 1 => { if (s !== "YES" && s !== "NO") throw new Error("SIDE"); return s === "YES" ? 0 : 1; };
const outcomeValue = (y: number, n: number, r: Outcome) => r === "YES" ? y : r === "NO" ? n : (y + n) / 2;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
function copy(s: DlpState): DlpState {
  return { ...s, inventory: [...s.inventory], accounts: s.accounts.map(a => ({ ...a, coreRewards: [...a.coreRewards] })),
    restartLiquidity:s.restartLiquidity?{...s.restartLiquidity,inventory:[...s.restartLiquidity.inventory]}:null,
    core: { ...s.core, officialRewards: [...s.core.officialRewards] }, events: [...s.events], config: { ...s.config },
    payouts: s.payouts?.map(p => ({ ...p })) ?? null, corePayouts: [...s.corePayouts] };
}
function account(s: DlpState, id: number): DlpAccount {
  if (!Number.isInteger(id) || !s.accounts[id]) throw new Error("ACCOUNT"); return s.accounts[id];
}
function record(s: DlpState, kind: string, actor?: number, amount?: number, quantity?: number, detail?: string) {
  s.events.push({ id: (s.events.at(-1)?.id ?? 0) + 1, at: s.now, kind, actor, amount, quantity, detail });
  if (s.events.length > 200) s.events.splice(0, s.events.length - 200);
}
function result(s: DlpState): DlpState { dlpAssertLedger(s); return s; }
function requireGen(s: DlpState) { if (s.phase !== "GENESIS" || s.now >= s.TG) throw new Error("GENESIS_CLOSED"); }
function requireFormal(s: DlpState) {
  if (s.phase !== "FORMAL" || s.now >= s.TF || s.liquidityClosed) throw new Error("FORMAL_CLOSED");
}
function pay(s: DlpState, id: number, amount: number) {
  const a = account(s, id); if (!positive(amount) || amount > a.wallet) throw new Error("BALANCE");
  a.wallet -= amount; a.paid += amount;
}
function receive(s: DlpState, id: number, amount: number) {
  const a = account(s, id); a.wallet += amount; a.received += amount;
}
function accrueGenesis(s: DlpState, id: number, gross: number) {
  const reserve = .045 * gross; s.B += reserve; s.accounts[id].z += reserve;
  s.creatorFees += .01 * gross;
}
/** 沿用OCPVault：三套条件奖励只在终局择一兑现；手续费不加入质押本金或多数分母。 */
function accrueCoreFee(s: DlpState, amount: number) {
  s.core.fees += amount; s.core.feeTotal += amount;
  const bases = [s.core.yes, s.core.no, s.core.yes + s.core.no];
  for (let i = 0; i < 3; i++) {
    if (bases[i] === 0) { s.core.officialRewards[i] += amount; continue; }
    for (const a of s.accounts) {
      const eligible = i === 0 ? a.coreSide === "YES" : i === 1 ? a.coreSide === "NO" : a.coreSide === "YES" || a.coreSide === "NO";
      if (eligible) a.coreRewards[i] += amount * a.coreStake / bases[i];
    }
  }
}
function graduate(s: DlpState, id: number, kind: string) {
  // 不用epsilon补足门槛，也不截断本笔订单。
  if (!(s.R >= s.rTarget && s.B >= s.bTarget)) return;
  s.phase = "FORMAL"; s.M0 = s.R; s.collateral = s.R; s.basis = s.R; s.R = 0;
  s.inventory = [s.M0, s.M0]; s.lpSupply = s.S;
  s.accounts.forEach(a => { a.lp = a.g; a.g = 0; });
  s.core.openedAt = s.now;
  record(s, "GRADUATE", id, s.M0, s.lpSupply, kind);
}

export function createDlpDemo(config: DlpConfig = {}): DlpState {
  const Q = config.Q ?? 2000, k = config.k ?? 1, b = config.b ?? 150, TC = config.TC ?? 10800;
  if (![Q, k, b].every(positive) || !Number.isFinite(TC) || TC <= 7200) throw new Error("CONFIG");
  // -1表示演示账户以外的独立费用收款桶；不向账户1/2/3赋予收款角色。
  const creatorAccount = config.creatorAccount ?? 1, protocolAccount = config.protocolAccount ?? 2;
  if (![creatorAccount, protocolAccount].every(x => Number.isInteger(x) && x >= -1 && x < 3)) throw new Error("ACCOUNT");
  return { phase: "CREATE", now: 0, TG: TC - 7200, TF: TC - 3600, TC, Q, k,
    rTarget: 3.6 * Q, bTarget: .6 * Q, R: 0, B: 0, S: 0, M0: 0, redeemedPairs: 0, collateral: 0,
    cash: 0, lpFees: 0, lpFeesEarned:0,formalVolume:0, creatorFees: 0, protocolFees: 0, basis: 0, b, lpSupply: 0,
    inventory: [0, 0], liquidityClosed: false, restartLiquidity:null,
    accounts: ["You", "Trader A", "Trader B"].map(name => ({ name, wallet: 10000, g: 0, lp: 0, z: 0,
      yes: 0, no: 0, coreSide: null, coreStake: 0, coreRewards: [0, 0, 0], claimed: false, coreClaimed: false, paid: 0, received: 0 })),
    core: { openedAt: null, yes: 0, no: 0, invalid: 0, cash: 0, fees: 0, feeTotal: 0, officialRewards: [0, 0, 0], result: null }, result: null, cover: 0,
    lpBudget: 0, bBudget: 0, outcomeBudget: 0, lpClaimSupply:0,bClaimSupply:0,lpBudgetInitial:0,bBudgetInitial:0,failedSupply:0,failedBudgetInitial:0,
    failedBudget: 0, coreBudget: 0, coreOfficialBudget: 0,
    payouts: null, corePayouts: [], events: [], config: { creatorAccount, protocolAccount } };
}
export function dlpCreate(state: DlpState): DlpState {
  if (state.phase !== "CREATE") throw new Error("PHASE");
  const s = copy(state); s.phase = "GENESIS"; record(s, "CREATE"); return result(s);
}
export function dlpCost(y: number, n: number, b: number): number {
  if (![y, n].every(x => Number.isFinite(x) && x >= -EPS) || !positive(b)) throw new Error("NUMERIC");
  return Math.max(y, n) + b * Math.log1p(Math.exp(-Math.abs(y - n) / b));
}
export function dlpCoordinates(s: DlpState): [number, number] { return [s.basis - s.inventory[0], s.basis - s.inventory[1]]; }
export function dlpPrices(s: DlpState) {
  const genesis = 2 * s.k * s.S;
  if (!s.lpSupply || s.liquidityClosed) return { genesis, probability: null as [number, number] | null };
  const [y, n] = dlpCoordinates(s), d = (y - n) / s.b;
  const p = d >= 0 ? 1 / (1 + Math.exp(-d)) : Math.exp(d) / (1 + Math.exp(d));
  return { genesis, probability: [p, 1 - p] as [number, number] };
}
export function dlpQuoteBuy(s: DlpState, paid: number): DlpTradeQuote {
  if (!positive(paid)) throw new Error("AMOUNT");
  const quantity = Math.sqrt((s.R + .945 * paid) / s.k) - s.S;
  return { quantity, gross: paid, net: .945 * paid, R: .945 * paid, B: .045 * paid, lpFee: 0,
    creatorFee: .01 * paid, protocolFee: 0, coreFee: 0,
    wouldGraduate: s.R + .945 * paid >= s.rTarget && s.B + .045 * paid >= s.bTarget,
    average: paid / quantity, actual: paid, contribution: .045 * paid,
    fees: { creator: .01 * paid, lp: 0, protocol: 0, core: 0, B:0 } };
}
export function dlpQuoteSell(s: DlpState, tokens: number): DlpTradeQuote {
  if (!positive(tokens) || tokens > s.S) throw new Error("HOLDINGS");
  const gross = tokens === s.S ? s.R : s.k * tokens * (2 * s.S - tokens);
  return { quantity: tokens, gross, net: .945 * gross, R: -gross, B: .045 * gross, lpFee: 0,
    creatorFee: .01 * gross, protocolFee: 0, coreFee: 0,
    wouldGraduate: s.R - gross >= s.rTarget && s.B + .045 * gross >= s.bTarget,
    average: .945 * gross / tokens, actual: .945 * gross, contribution: .045 * gross,
    fees: { creator: .01 * gross, lp: 0, protocol: 0, core: 0, B:0 } };
}
export function dlpBuy(state: DlpState, id: number, paid: number): DlpState {
  requireGen(state); const q = dlpQuoteBuy(state, paid), s = copy(state); pay(s, id, paid);
  s.R += q.R; s.S += q.quantity; s.accounts[id].g += q.quantity; accrueGenesis(s, id, paid);
  record(s, "GENESIS_BUY", id, paid, q.quantity); graduate(s, id, "BUY"); return result(s);
}
export function dlpSell(state: DlpState, id: number, tokens: number): DlpState {
  requireGen(state); if (tokens > account(state, id).g) throw new Error("HOLDINGS");
  const q = dlpQuoteSell(state, tokens), s = copy(state);
  s.R -= q.gross; s.S -= tokens; s.accounts[id].g -= tokens; accrueGenesis(s, id, q.gross); receive(s, id, q.net);
  record(s, "GENESIS_SELL", id, q.net, tokens); graduate(s, id, "SELL"); return result(s);
}
export function dlpQuoteFormalBuy(s: DlpState, side: Side, tokens: number): DlpTradeQuote {
  const i = sideIndex(side); if (!positive(tokens) || tokens > s.inventory[i] || !positive(s.b)) throw new Error("INVENTORY");
  const q = dlpCoordinates(s), end: [number, number] = [...q]; end[i] += tokens;
  const net = Math.max(0, dlpCost(...end, s.b) - dlpCost(...q, s.b));
  const gross = net / .98;
  return { quantity: tokens, gross, net, R: 0, B: .005*gross, lpFee: .005 * gross,
    creatorFee: 0, protocolFee: 0, coreFee: .01 * gross, wouldGraduate: false, average: gross / tokens,
    actual: gross, contribution: 0, fees: { creator: 0, lp: .005 * gross, protocol: 0, core: .01 * gross, B:.005*gross } };
}
export function dlpQuoteFormalSell(s: DlpState, side: Side, tokens: number): DlpTradeQuote {
  const i = sideIndex(side), q = dlpCoordinates(s);
  if (!positive(tokens) || !positive(s.b) || s.liquidityClosed) throw new Error("CAPACITY");
  // 用户只交付卖侧份额；池内部提供对侧库存合并，释放抵押，不能要求用户自己持有另一侧。
  const mergePairs = Math.max(0, tokens - q[i]);
  if (mergePairs > Math.min(s.inventory[i] + tokens, s.inventory[1-i], s.collateral) + EPS) throw new Error("CAPACITY");
  const end: [number, number] = [q[0] + mergePairs, q[1] + mergePairs]; end[i] -= tokens;
  // C(q+m·1)=C(q)+m：坐标平移只改变抵押形态，不改变单边LMSR成交价。
  const gross = Math.max(0, dlpCost(...q, s.b) + mergePairs - dlpCost(...end, s.b));
  if (gross > s.cash + mergePairs + EPS) throw new Error("CASH");
  return { quantity: tokens, gross, net: .98 * gross, mergePairs, R: 0, B: .005*gross, lpFee: .005 * gross,
    creatorFee: 0, protocolFee: 0, coreFee: .01 * gross, wouldGraduate: false, average: .98 * gross / tokens,
    actual: .98 * gross, contribution: 0, fees: { creator: 0, lp: .005 * gross, protocol: 0, core: .01 * gross, B:.005*gross } };
}
export function dlpFormalBuy(state: DlpState, id: number, side: Side, tokens: number): DlpState {
  requireFormal(state); const q = dlpQuoteFormalBuy(state, side, tokens), s = copy(state), i = sideIndex(side);
  pay(s, id, q.gross); s.cash += q.net; s.B+=q.B;s.lpFees += q.lpFee;s.lpFeesEarned+=q.lpFee;s.formalVolume+=q.gross; s.creatorFees += q.creatorFee; accrueCoreFee(s, q.coreFee);
  s.inventory[i] -= tokens; if (i === 0) s.accounts[id].yes += tokens; else s.accounts[id].no += tokens;
  record(s, "FORMAL_BUY", id, q.gross, tokens, side); return result(s);
}
/** 预算为最大实付；有限库存会产生未用预算，不自动增发结果份额。 */
export function dlpQuoteFormalBuyBudget(s: DlpState, side: Side, budget: number): DlpTradeQuote {
  if (!positive(budget)) throw new Error("AMOUNT");
  const i = sideIndex(side); let lo = 0, hi = s.inventory[i];
  if (!(hi > 0) || s.liquidityClosed) throw new Error("INVENTORY");
  const all = dlpQuoteFormalBuy(s, side, hi);
  if (all.gross <= budget) return { ...all, unused: budget - all.gross };
  for (let n = 0; n < 70; n++) {
    const mid = (lo + hi) / 2;
    if (dlpQuoteFormalBuy(s, side, mid).gross <= budget) lo = mid; else hi = mid;
  }
  if (!(lo > 0)) throw new Error("TINY");
  const q = dlpQuoteFormalBuy(s, side, lo); if (!(q.gross > 0)) throw new Error("TINY");
  return { ...q, unused: budget - q.gross };
}
export const dlpQuoteBudget = dlpQuoteFormalBuyBudget;
export function dlpFormalBuyBudget(state: DlpState, id: number, side: Side, budget: number): DlpState {
  requireFormal(state); if (budget > account(state, id).wallet) throw new Error("BALANCE");
  const q = dlpQuoteFormalBuyBudget(state, side, budget); return dlpFormalBuy(state, id, side, q.quantity);
}
export function dlpFormalSell(state: DlpState, id: number, side: Side, tokens: number): DlpState {
  requireFormal(state); const i = sideIndex(side), a = account(state, id);
  if (tokens > (i === 0 ? a.yes : a.no)) throw new Error("HOLDINGS");
  const q = dlpQuoteFormalSell(state, side, tokens), s = copy(state);
  const mergePairs = q.mergePairs ?? 0;
  s.inventory[i] += tokens; if (i === 0) s.accounts[id].yes -= tokens; else s.accounts[id].no -= tokens;
  s.inventory[0] -= mergePairs; s.inventory[1] -= mergePairs;
  s.collateral -= mergePairs; s.redeemedPairs += mergePairs;
  s.cash += mergePairs - q.gross; s.B+=q.B;s.lpFees += q.lpFee;s.lpFeesEarned+=q.lpFee;s.formalVolume+=q.gross; s.creatorFees += q.creatorFee; accrueCoreFee(s, q.coreFee);
  receive(s, id, q.net); record(s, "FORMAL_SELL", id, q.net, tokens, side); return result(s);
}
// 旧版本入口明确禁用，不能从LP权益转让绕回底层提款。
export function dlpQuoteExit(_s:DlpState,_lp:number):DlpExitQuote {throw new Error("LP_ASSETS_LOCKED");}
export function dlpExitLP(_s:DlpState,_id:number,_lp:number):DlpState {throw new Error("LP_ASSETS_LOCKED");}
export function dlpQuoteAddLP(_s:DlpState,_lp:number):DlpAddQuote {throw new Error("LP_ADDITION_DISABLED");}
export function dlpMaxAddLP(_s:DlpState,_id:number):number{return 0;}
export function dlpAddLP(_s:DlpState,_id:number,_lp:number):DlpState {throw new Error("LP_ADDITION_DISABLED");}
function transferRight(state:DlpState,from:number,to:number,amount:number,kind:"lp"|"z"):DlpState {
  const a=account(state,from);account(state,to);
  if(!positive(amount)||amount>a[kind]||from===to)throw new Error("HOLDINGS");
  if(kind==="lp"?!["FORMAL","WAIT_CORE","SETTLED"].includes(state.phase):state.phase==="CREATE")throw new Error("PHASE");
  const s=copy(state);s.accounts[from][kind]-=amount;s.accounts[to][kind]+=amount;
  record(s,kind==="lp"?"TRANSFER_LP":"TRANSFER_B",from,undefined,amount,String(to));return result(s);
}
export const dlpTransferLP=(s:DlpState,from:number,to:number,amount:number)=>transferRight(s,from,to,amount,"lp");
export const dlpTransferB=(s:DlpState,from:number,to:number,amount:number)=>transferRight(s,from,to,amount,"z");
/** 完整组合的抵押赎回：每对YES+NO所有结果都值1，不能从做市现金或B重复提款。 */
export function dlpRedeemPairs(state: DlpState, id: number, pairs: number): DlpState {
  if (state.phase !== "FORMAL" && state.phase !== "WAIT_CORE") throw new Error("PHASE");
  if (!positive(pairs)) throw new Error("AMOUNT");
  const a = account(state, id);
  if (pairs > Math.min(a.yes, a.no)) throw new Error("HOLDINGS");
  if (pairs > state.collateral) throw new Error("COLLATERAL");
  const s = copy(state);
  s.accounts[id].yes -= pairs; s.accounts[id].no -= pairs;
  s.collateral -= pairs; s.redeemedPairs += pairs;
  receive(s, id, pairs); record(s, "REDEEM_PAIRS", id, pairs, pairs); return result(s);
}
/** 回购可使用真实现金及池内完整组合释放的抵押，仍受持仓和对侧库存限制。 */
export function dlpMaxFormalSellTokens(s: DlpState, id: number, side: Side): number {
  const i = sideIndex(side), a = account(s, id);
  if (s.phase !== "FORMAL" || s.now >= s.TF || s.liquidityClosed) return 0;
  const capacity = Math.max(0, dlpCoordinates(s)[i] + Math.min(s.inventory[1-i], s.collateral));
  let lo = 0, hi = Math.min(i === 0 ? a.yes : a.no, capacity);
  if (!(hi > 0)) return 0;
  try { dlpQuoteFormalSell(s, side, hi); return hi; } catch { /* 真实现金可能小于完整回购所需。 */ }
  for (let n = 0; n < 64; n++) {
    const mid = (lo + hi) / 2;
    try { dlpQuoteFormalSell(s, side, mid); lo = mid; } catch { hi = mid; }
  }
  return lo;
}
export function dlpCoreStake(state: DlpState, id: number, side: Outcome, amount: number): DlpState {
  if (!["YES", "NO", "INVALID"].includes(side)) throw new Error("SIDE");
  if (state.core.openedAt === null || state.now >= state.TC || (state.phase !== "FORMAL" && state.phase !== "WAIT_CORE")) throw new Error("CORE_CLOSED");
  const a = account(state, id); if (a.coreSide && a.coreSide !== side) throw new Error("SIDE_LOCKED");
  const s = copy(state); pay(s, id, amount); s.accounts[id].coreSide = side; s.accounts[id].coreStake += amount;
  s.core.cash += amount;
  if (side === "YES") s.core.yes += amount; else if (side === "NO") s.core.no += amount; else s.core.invalid += amount;
  record(s, "CORE_STAKE", id, amount, undefined, side); return result(s);
}
function settle(s: DlpState) {
  const totalStake = s.core.yes + s.core.no + s.core.invalid;
  const outcome: Outcome = s.core.yes > totalStake / 2 ? "YES" : s.core.no > totalStake / 2 ? "NO" : "INVALID";
  s.result = outcome; s.core.result = outcome; s.phase = "SETTLED";
  const inventoryValue = outcomeValue(...s.inventory, outcome);
  s.collateral -= inventoryValue; s.outcomeBudget = s.collateral; s.collateral = 0;
  const nav = s.cash + s.lpFees + inventoryValue;
  s.cover = Math.min(s.B, Math.max(s.basis - nav, 0)); s.lpBudget = nav + s.cover; s.bBudget = s.B - s.cover;
  s.lpClaimSupply=s.lpSupply;s.bClaimSupply=sum(s.accounts.map(a=>a.z));
  s.lpBudgetInitial=s.lpBudget;s.bBudgetInitial=s.bBudget;
  s.payouts=[];
  const rewardIndex = outcome === "YES" ? 0 : outcome === "NO" ? 1 : 2;
  s.corePayouts = s.accounts.map(a => (outcome === "INVALID" ? a.coreStake
    : a.coreSide === outcome ? s.core.cash * a.coreStake / (outcome === "YES" ? s.core.yes : s.core.no) : 0) + a.coreRewards[rewardIndex]);
  s.coreBudget = sum(s.corePayouts); s.coreOfficialBudget = s.core.officialRewards[rewardIndex];
  s.core.fees = 0; s.core.cash = 0; s.cash = 0; s.lpFees = 0; s.B = 0; s.inventory = [0, 0];
  record(s, "SETTLE", undefined, s.cover, undefined, outcome);
}
function fail(s:DlpState){
  s.phase="FAILED";s.failedBudget=s.R;s.failedBudgetInitial=s.R;s.failedSupply=s.S;
  s.bBudget=s.B;s.bBudgetInitial=s.B;s.bClaimSupply=sum(s.accounts.map(a=>a.z));s.payouts=[];
  s.R=0;s.B=0;record(s,"FAIL");
}
/** 按当前token余额预览；结算分母/初始预算固定，转让和burn不改变每份兑付率。 */
export function dlpClaimPreview(s:DlpState,id:number):DlpPayout {
 const a=account(s,id);const settled=s.phase==="SETTLED",failedState=s.phase==="FAILED";
 const outcomes=settled?outcomeValue(a.yes,a.no,s.result!):0;
 const lp=settled&&s.lpClaimSupply>0?s.lpBudgetInitial*a.lp/s.lpClaimSupply:0;
 const B=(settled||failedState)&&s.bClaimSupply>0?s.bBudgetInitial*a.z/s.bClaimSupply:0;
 const failed=failedState&&s.failedSupply>0?s.failedBudgetInitial*a.g/s.failedSupply:0;
 return {outcomes,lp,B,failed,total:outcomes+lp+B+failed};
}
/** to是绝对模拟秒数；一次跨过多个时点也依正确顺序处理。 */
export function dlpAdvanceTime(state: DlpState, to: number): DlpState {
  if (!Number.isFinite(to) || to < state.now) throw new Error("TIME");
  if (state.phase === "CREATE") return state;
  const s = copy(state); s.now = to;
  if (s.phase === "GENESIS" && to >= s.TG) fail(s);
  if (s.phase === "FORMAL" && to >= s.TF) { s.phase = "WAIT_CORE"; record(s, "FORMAL_CLOSE"); }
  return result(s);
}
export function dlpFinalize(state: DlpState): DlpState {
  if ((state.phase !== "FORMAL" && state.phase !== "WAIT_CORE") || state.now < state.TC) throw new Error("CORE_PENDING");
  const s = copy(state); settle(s); return result(s);
}
export function dlpClaimLP(state:DlpState,id:number,amount:number):DlpState {
 const a=account(state,id);if(state.phase!=="SETTLED"||!positive(amount)||amount>a.lp||!positive(state.lpClaimSupply))throw new Error("CLAIM");
 const s=copy(state),money=s.lpBudgetInitial*amount/s.lpClaimSupply;
 s.accounts[id].lp-=amount;s.lpSupply-=amount;s.lpBudget-=money;
 receive(s,id,money);record(s,"BURN_LP",id,money,amount);return result(s);
}
export function dlpClaimB(state:DlpState,id:number,amount:number):DlpState {
 const a=account(state,id);if(!["SETTLED","FAILED"].includes(state.phase)||!positive(amount)||amount>a.z||!positive(state.bClaimSupply))throw new Error("CLAIM");
 const s=copy(state),money=s.bBudgetInitial*amount/s.bClaimSupply;
 s.accounts[id].z-=amount;s.bBudget-=money;
 receive(s,id,money);record(s,"BURN_B",id,money,amount);return result(s);
}
export function dlpClaim(state:DlpState,id:number):DlpState {
 const a=account(state,id);if(!["SETTLED","FAILED"].includes(state.phase)||!(a.lp+a.z+a.g+a.yes+a.no>0))throw new Error("CLAIM");
 let s=copy(state);const p=dlpClaimPreview(s,id);
 if(a.lp>0&&s.phase==="SETTLED")s=dlpClaimLP(s,id,a.lp);
 if(a.z>0)s=dlpClaimB(s,id,a.z);
 s.outcomeBudget-=p.outcomes;s.failedBudget-=p.failed;
 if(s.phase==="FAILED")s.S-=s.accounts[id].g;
 s.accounts[id].g=0;s.accounts[id].yes=0;s.accounts[id].no=0;s.accounts[id].claimed=true;
 receive(s,id,p.outcomes+p.failed);record(s,"CLAIM_MARKET",id,p.total);return result(s);
}
export function dlpClaimCore(state: DlpState, id: number): DlpState {
  const a = account(state, id); if (state.phase !== "SETTLED" || a.coreClaimed) throw new Error("CORE_CLAIM");
  const s = copy(state), payout = s.corePayouts[id]; s.accounts[id].coreClaimed = true; s.coreBudget -= payout;
  receive(s, id, payout); record(s, "CLAIM_CORE", id, payout); return result(s);
}
/** 演示把既有Core官方奖励接收人映射为协议账户；这不是Formal固定协议手续费。 */
export function dlpClaimCoreOfficial(state: DlpState, id: number): DlpState {
  if (state.phase !== "SETTLED" || id !== state.config.protocolAccount) throw new Error("FEE_OWNER");
  if (!positive(state.coreOfficialBudget)) throw new Error("NO_FEES");
  const s = copy(state), amount = s.coreOfficialBudget; s.coreOfficialBudget = 0;
  receive(s, id, amount); record(s, "CLAIM_CORE_OFFICIAL", id, amount); return result(s);
}
export function dlpClaimFees(state: DlpState, kind: "CREATOR" | "PROTOCOL", id: number): DlpState {
  if (kind !== "CREATOR" && kind !== "PROTOCOL") throw new Error("KIND");
  if (id !== (kind === "CREATOR" ? state.config.creatorAccount : state.config.protocolAccount)) throw new Error("FEE_OWNER");
  const s = copy(state), amount = kind === "CREATOR" ? s.creatorFees : s.protocolFees;
  if (!positive(amount)) throw new Error("NO_FEES");
  if (kind === "CREATOR") s.creatorFees = 0; else s.protocolFees = 0;
  receive(s, id, amount); record(s, "CLAIM_FEES", id, amount, undefined, kind); return result(s);
}
export function dlpMaxBuy(s: DlpState, id: number): number { return account(s, id).wallet; }
export function dlpHoldings(s: DlpState, id: number) { const a = account(s, id); return { g: a.g, lp: a.lp, z: a.z, yes: a.yes, no: a.no, wallet: a.wallet, core: a.coreStake }; }
export function dlpMaxFormalBuyTokens(s: DlpState, id: number, side: Side): number {
  const i = sideIndex(side), wallet = account(s, id).wallet; let lo = 0, hi = s.inventory[i];
  if (!hi || s.liquidityClosed) return 0;
  for (let n = 0; n < 70; n++) { const mid = (lo + hi) / 2; if (!mid) break;
    if (dlpQuoteFormalBuy(s, side, mid).gross <= wallet) lo = mid; else hi = mid; }
  return lo;
}
export function dlpAccounting(s: DlpState) {
  const wallets = sum(s.accounts.map(a => a.wallet));
  const reserves = s.R + s.B + s.collateral + s.cash + s.lpFees + s.creatorFees + s.protocolFees
    + s.core.cash + s.core.fees + s.coreOfficialBudget + s.lpBudget + s.bBudget + s.outcomeBudget + s.failedBudget + s.coreBudget;
  return { wallets, reserves, total: wallets + reserves, initialTotal: 30000, error: wallets + reserves - 30000 };
}
export function dlpAssertLedger(s: DlpState) {
  const a = dlpAccounting(s);
  const balances = [s.R, s.B, s.collateral, s.cash, s.lpFees, s.creatorFees, s.protocolFees, s.basis, s.b,
    s.lpSupply, s.redeemedPairs, ...s.inventory, s.core.cash, s.core.fees, s.coreOfficialBudget, s.lpBudget, s.bBudget, s.outcomeBudget, s.failedBudget, s.coreBudget,
    ...s.accounts.flatMap(x => [x.wallet, x.g, x.lp, x.z, x.yes, x.no, x.coreStake])];
  if (balances.some(x => !Number.isFinite(x) || x < -EPS) || Math.abs(a.error) > EPS) throw new Error("LEDGER");
  if (s.phase === "GENESIS" && (Math.abs(sum(s.accounts.map(x => x.g)) - s.S) > EPS || Math.abs(s.R - s.k * s.S * s.S) > EPS)) throw new Error("CURVE");
  if (s.phase === "FORMAL" || s.phase === "WAIT_CORE") {
    if (Math.abs(s.collateral + s.redeemedPairs - s.M0) > EPS) throw new Error("COLLATERAL_LEDGER");
    if (Math.abs(sum(s.accounts.map(x => x.lp)) - s.lpSupply) > EPS || s.inventory.some(x => x > s.basis + EPS)) throw new Error("LP_LEDGER");
    if (Math.abs(s.inventory[0] + sum(s.accounts.map(x => x.yes)) + s.redeemedPairs - s.M0) > EPS
      || Math.abs(s.inventory[1] + sum(s.accounts.map(x => x.no)) + s.redeemedPairs - s.M0) > EPS) throw new Error("OUTCOME_LEDGER");
  }
}
export function dlpScenario(kind: DlpScenario, config: DlpConfig = {}): DlpState {
  let s = dlpCreate(createDlpDemo(config));
  if (kind === "GENESIS") return s;
  if (kind === "FAILURE") { s = dlpBuy(s, 0, .05 * s.Q); s = dlpBuy(s, 1, .15 * s.Q); return dlpAdvanceTime(s, s.TG); }
  const fund = (total: number) => {
    let left = total;
    for (let id = 0; id < 3 && left > 1e-9; id++) { const paid = Math.min(left, s.accounts[id].wallet * .95); s = dlpBuy(s, id, paid); left -= paid; }
    if (left > 1e-7) throw new Error("SCENARIO_BUDGET");
  };
  if (kind === "BUY_GRADUATE") { fund(s.bTarget / .045 * (1 + 1e-12)); return s; }
  if (!["SELL_READY", "SELL_GRADUATE"].includes(kind)) throw new Error("SCENARIO");
  fund(8.5 * s.Q / .945);
  if (kind === "SELL_READY") return s;
  const gross = (s.bTarget - s.B) / .045 * (1 + 1e-12);
  const quantity = s.S - Math.sqrt((s.R - gross) / s.k);
  const holder = s.accounts.findIndex(a => a.g >= quantity); if (holder < 0) throw new Error("SCENARIO_HOLDINGS");
  s = dlpSell(s, holder, quantity);
  if (s.phase !== "FORMAL") throw new Error("SCENARIO_GRADUATION");
  return s;
}
