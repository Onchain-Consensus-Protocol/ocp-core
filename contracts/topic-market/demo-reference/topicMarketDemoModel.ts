/** Topic Market 浮点演示账本。无链上调用；不代表整数合约或生产定价证明。 */
export type Side = "YES" | "NO";
export type Outcome = Side | "INVALID";
export type TopicMarketPhase = "CREATE" | "GENESIS" | "FORMAL" | "WAIT_CORE" | "FAILED" | "SETTLED";
export type TopicMarketScenario = "GENESIS" | "BUY_GRADUATE" | "FAILURE";
export interface TopicMarketConfig {  depthPolicy?: "GRADUATION_CAPITAL"; Q?: number; k?: number; b?: number; TF?: number; TC?: number; TT?: number; creatorAccount?: number; protocolAccount?: number }
export interface EarlyRequest {id:number;proposer:number;side:Side;proposedAt:number;processAfter:number;reason:string;bond:number}
export interface EarlyState {bond:number;count:number;pending:EarlyRequest|null;penalty:number;failedBonds:number;forfeited:[number,number,number];terminatedAt:number|null}
export interface TopicMarketAccount { bondRefund?:number;
  name: string; wallet: number; g: number; lp: number; yes: number; no: number;
  coreSide: Outcome | null; coreStake: number; coreRewards: [number, number, number]; claimed: boolean; coreClaimed: boolean; paid: number; received: number;
}
export interface TopicMarketPayout { outcomes: number; lp: number; failed: number; total: number }
export interface TopicMarketEvent { id: number; at: number; kind: string; actor?: number; amount?: number; quantity?: number; detail?: string; wallet?: string; transactionHash?: string; source?: "MARKET" | "CORE"; timestamp?: number; side?: string }
export interface TopicMarketLiquidityReference { lpSupply:number; basis:number; b:number; cash:number; lpFees:number; inventory:[number,number] }
export interface TopicMarketAddQuote { lp:number; money:number; cash:number; lpFee:number; yes:number; no:number; basis:number; b:number; restart:boolean }
export interface TopicMarketState { early?:EarlyState;
   initialCapital?:number; phase: TopicMarketPhase; now: number; TG: number; TF: number; TC: number; TT: number; Q: number; k: number;
  rTarget: number; R: number; S: number; M0: number; redeemedPairs: number;
  collateral: number; cash: number; lpFees: number; lpFeesEarned:number; formalVolume:number; creatorFees: number; protocolFees: number;
  basis: number; b: number; lpSupply: number; inventory: [number, number]; liquidityClosed: boolean; restartLiquidity:TopicMarketLiquidityReference|null;
  accounts: TopicMarketAccount[]; core: { openedAt: number | null; yes: number; no: number; invalid: number; cash: number; fees: number; feeTotal: number; officialRewards: [number, number, number]; result: Outcome | null };
  result: Outcome | null; lpBudget: number; outcomeBudget: number;
  lpClaimSupply:number;  lpBudgetInitial:number;  failedSupply:number; failedBudgetInitial:number;
  failedBudget: number; coreBudget: number; coreOfficialBudget: number; payouts: TopicMarketPayout[] | null; corePayouts: number[];
  events: TopicMarketEvent[]; config: { creatorAccount: number; protocolAccount: number; depthPolicy?: "GRADUATION_CAPITAL" };
}
export interface TopicMarketTradeQuote {
  quantity: number; gross: number; net: number; R: number; lpFee: number;
  creatorFee: number; protocolFee: number; coreFee: number; wouldGraduate: boolean; average: number; mergePairs?: number;
  actual: number; fees: { creator: number; lp: number; protocol: number; core: number }; unused?: number;
}
export interface TopicMarketExitQuote { money: number; cash: number; lpFee: number; yes: number; no: number; fraction: number }
const EPS = 1e-7;
const positive = (x: number) => Number.isFinite(x) && x > 0;
const sideIndex = (s: Side): 0 | 1 => { if (s !== "YES" && s !== "NO") throw new Error("SIDE"); return s === "YES" ? 0 : 1; };
const outcomeValue = (y: number, n: number, r: Outcome) => r === "YES" ? y : r === "NO" ? n : (y + n) / 2;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
function copy(s: TopicMarketState): TopicMarketState {
  return { ...s, early:s.early?{...s.early,pending:s.early.pending?{...s.early.pending}:null,forfeited:[...s.early.forfeited]}:undefined, inventory: [...s.inventory], accounts: s.accounts.map(a => ({ ...a, coreRewards: [...a.coreRewards] })),
    restartLiquidity:s.restartLiquidity?{...s.restartLiquidity,inventory:[...s.restartLiquidity.inventory]}:null,
    core: { ...s.core, officialRewards: [...s.core.officialRewards] }, events: [...s.events], config: { ...s.config },
    payouts: s.payouts?.map(p => ({ ...p })) ?? null, corePayouts: [...s.corePayouts] };
}
function account(s: TopicMarketState, id: number): TopicMarketAccount {
  if (!Number.isInteger(id) || !s.accounts[id]) throw new Error("ACCOUNT"); return s.accounts[id];
}
function record(s: TopicMarketState, kind: string, actor?: number, amount?: number, quantity?: number, detail?: string) {
  s.events.push({source:kind.startsWith('CORE_')||kind.startsWith('EARLY_')||kind.startsWith('CLAIM_CORE')||kind==='CLAIM_EARLY_BOND'?'CORE':'MARKET', id: (s.events.at(-1)?.id ?? 0) + 1, at: s.now, kind, actor, amount, quantity, detail });
  if (s.events.length > 200) s.events.splice(0, s.events.length - 200);
}
function result(s: TopicMarketState): TopicMarketState { topicMarketAssertLedger(s); return s; }
function requireGen(s: TopicMarketState) { if (s.phase !== "GENESIS" || s.now >= s.TG) throw new Error("GENESIS_CLOSED"); }
export function topicMarketEarlyDue(s:TopicMarketState){return !!s.early?.pending && s.now>=s.early.pending.processAfter;}
function requireCoreOpen(s:TopicMarketState){if(!["FORMAL","WAIT_CORE"].includes(s.phase)||s.now>=s.TC||s.core.openedAt===null)throw new Error("CORE_CLOSED");if(topicMarketEarlyDue(s))throw new Error("PROCESS_EARLY_REQUEST");}
function requireFormal(s: TopicMarketState) {
  if(topicMarketEarlyDue(s))throw new Error("PROCESS_EARLY_REQUEST");
  if (s.phase !== "FORMAL" || s.now >= s.TF || s.liquidityClosed) throw new Error("FORMAL_CLOSED");
}
function pay(s: TopicMarketState, id: number, amount: number) {
  const a = account(s, id); if (!positive(amount) || amount > a.wallet) throw new Error("BALANCE");
  a.wallet -= amount; a.paid += amount;
}
function receive(s: TopicMarketState, id: number, amount: number) {
  const a = account(s, id); a.wallet += amount; a.received += amount;
}
function accrueGenesis(s: TopicMarketState, id: number, gross: number) {
  s.creatorFees += .007 * gross; s.protocolFees += .003 * gross;
}
/** 沿用OCPCore：三套条件奖励只在终局择一兑现；手续费不加入质押本金或多数分母。 */
function accrueCoreFee(s: TopicMarketState, amount: number) {
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
function graduate(s: TopicMarketState, id: number, kind: string) {
  // 不用epsilon补足门槛，也不截断本笔订单。
  if (!(s.R >= s.rTarget)) return;
  // 多人模拟按毕业时真实入池资本确定曲线深度；不创造资金、不增加结果份额。
  s.b=s.R;
  s.phase = "FORMAL"; s.M0 = s.R; s.collateral = 0; s.cash=s.R; s.basis = s.R; s.R = 0;
  s.inventory = [0, 0]; s.lpSupply = s.S;
  s.accounts.forEach(a => { a.lp = a.g; a.g = 0; });
  s.core.openedAt = s.now;
  record(s, "GRADUATE", id, s.M0, s.lpSupply, kind);
}

export function createTopicMarketDemo(config: TopicMarketConfig = {}): TopicMarketState {
  const Q = config.Q ?? 2000, k = config.k ?? 1, b = config.b ?? 150, TC = config.TC ?? 21600, TF = TC - 3600, TG = TF - 3600, TT = TC;
  if (![Q, k, b].every(positive) || ![TF, TC, TT].every(Number.isSafeInteger) || TC <= 14400 || !(TG < TF) || (config.TF !== undefined && config.TF !== TF) || (config.TT !== undefined && config.TT !== TT)) throw new Error("CONFIG");
  // -1表示演示账户以外的独立费用收款桶；不向账户1/2/3赋予收款角色。
  const creatorAccount = config.creatorAccount ?? 1, protocolAccount = config.protocolAccount ?? 2;
  if (![creatorAccount, protocolAccount].every(x => Number.isInteger(x) && x >= -1 && x < 3)) throw new Error("ACCOUNT");
  return { early:{bond:500,count:0,pending:null,penalty:0,failedBonds:0,forfeited:[0,0,0],terminatedAt:null},phase: "CREATE", now: 0, TG, TF, TC, TT, Q, k,
    rTarget: 4.2 * Q, R: 0, S: 0, M0: 0, redeemedPairs: 0, collateral: 0,
    cash: 0, lpFees: 0, lpFeesEarned:0,formalVolume:0, creatorFees: 0, protocolFees: 0, basis: 0, b, lpSupply: 0,
    inventory: [0, 0], liquidityClosed: false, restartLiquidity:null,
    accounts: ["You", "Trader A", "Trader B"].map(name => ({ name, wallet: 10000, g: 0, lp: 0,
      yes: 0, no: 0, coreSide: null, coreStake: 0, coreRewards: [0, 0, 0], claimed: false, coreClaimed: false, paid: 0, received: 0 })),
    core: { openedAt: null, yes: 0, no: 0, invalid: 0, cash: 0, fees: 0, feeTotal: 0, officialRewards: [0, 0, 0], result: null }, result: null,
    lpBudget: 0, outcomeBudget: 0, lpClaimSupply:0,lpBudgetInitial:0,failedSupply:0,failedBudgetInitial:0,
    failedBudget: 0, coreBudget: 0, coreOfficialBudget: 0,
    payouts: null, corePayouts: [], events: [], config: { creatorAccount, protocolAccount, ...(config.depthPolicy?{depthPolicy:config.depthPolicy}:{}) } };
}
export function topicMarketCreate(state: TopicMarketState): TopicMarketState {
  if (state.phase !== "CREATE") throw new Error("PHASE");
  const s = copy(state); s.phase = "GENESIS"; record(s, "CREATE"); return result(s);
}
export function topicMarketCost(y: number, n: number, b: number): number {
  if (![y, n].every(x => Number.isFinite(x) && x >= -EPS) || !positive(b)) throw new Error("NUMERIC");
  return Math.max(y, n) + b * Math.log1p(Math.exp(-Math.abs(y - n) / b));
}
export function topicMarketCoordinates(s: TopicMarketState): [number, number] { return [sum(s.accounts.map(a=>a.yes)),sum(s.accounts.map(a=>a.no))]; }
export function topicMarketPrices(s: TopicMarketState) {
  const genesis = 2 * s.k * s.S;
  if (!s.lpSupply || s.liquidityClosed || s.phase==="SETTLED" || s.phase==="FAILED") return { genesis, probability: null as [number, number] | null };
  const [y, n] = topicMarketCoordinates(s), d = (y - n) / s.b;
  const p = d >= 0 ? 1 / (1 + Math.exp(-d)) : Math.exp(d) / (1 + Math.exp(d));
  return { genesis, probability: [p, 1 - p] as [number, number] };
}
export function topicMarketQuoteBuy(s: TopicMarketState, paid: number): TopicMarketTradeQuote {
  if (!positive(paid)) throw new Error("AMOUNT");
  const rate=.99;
  const quantity = Math.sqrt((s.R + rate * paid) / s.k) - s.S;
  return { quantity, gross: paid, net: rate * paid, R: rate * paid, lpFee: 0,
    creatorFee: .007 * paid, protocolFee: .003 * paid, coreFee: 0,
    wouldGraduate: s.R + rate * paid >= s.rTarget,
    average: paid / quantity, actual: paid,
    fees: { creator: .007 * paid, lp: 0, protocol: .003 * paid, core: 0 } };
}
export function topicMarketQuoteSell(s: TopicMarketState, tokens: number): TopicMarketTradeQuote {
  if (!positive(tokens) || tokens > s.S) throw new Error("HOLDINGS");
  const rate=.99;
  const gross = tokens === s.S ? s.R : s.k * tokens * (2 * s.S - tokens);
  return { quantity: tokens, gross, net: rate * gross, R: -gross, lpFee: 0,
    creatorFee: .007 * gross, protocolFee: .003 * gross, coreFee: 0,
    wouldGraduate: s.R - gross >= s.rTarget,
    average: rate * gross / tokens, actual: rate * gross,
    fees: { creator: .007 * gross, lp: 0, protocol: .003 * gross, core: 0 } };
}
export function topicMarketBuy(state: TopicMarketState, id: number, paid: number): TopicMarketState {
  requireGen(state); const q = topicMarketQuoteBuy(state, paid), s = copy(state); pay(s, id, paid);
  s.R += q.R; s.S += q.quantity; s.accounts[id].g += q.quantity; accrueGenesis(s, id, paid);
  record(s, "GENESIS_BUY", id, paid, q.quantity); graduate(s, id, "BUY"); return result(s);
}
export function topicMarketSell(state: TopicMarketState, id: number, tokens: number): TopicMarketState {
  requireGen(state); if (tokens > account(state, id).g) throw new Error("HOLDINGS");
  const q = topicMarketQuoteSell(state, tokens), s = copy(state);
  s.R -= q.gross; s.S -= tokens; s.accounts[id].g -= tokens; accrueGenesis(s, id, q.gross); receive(s, id, q.net);
  record(s, "GENESIS_SELL", id, q.net, tokens); graduate(s, id, "SELL"); return result(s);
}
/** Stable single-side cost delta; avoids subtracting two large, nearly equal costs. */
function curveDelta(q:[number,number],i:0|1,tokens:number,b:number){
 const d=(q[i]-q[1-i])/b,end=d+tokens/b;
 return d>=0?tokens+b*(Math.log1p(Math.exp(-end))-Math.log1p(Math.exp(-d)))
   :b*((end>=0?end+Math.log1p(Math.exp(-end)):Math.log1p(Math.exp(end)))-Math.log1p(Math.exp(d)));
}
export const MAX_TOPIC_OUTCOME_SUPPLY=Number((1n<<192n)-1n)/1e18;
export function topicMarketQuoteFormalBuy(s: TopicMarketState, side: Side, tokens: number): TopicMarketTradeQuote {
  const i = sideIndex(side); if (!positive(tokens) || !positive(s.b)) throw new Error("AMOUNT");
  const q = topicMarketCoordinates(s), end: [number, number] = [...q]; if(tokens>MAX_TOPIC_OUTCOME_SUPPLY-q[i])throw new Error("SUPPLY_LIMIT");end[i] += tokens;
  const net = Math.max(0,curveDelta(q,i,tokens,s.b));
  if(!(net>0))throw new Error("TINY");
  const gross = net / .98;
  return { quantity: tokens, gross, net, R: 0, lpFee: .01 * gross,
    creatorFee: 0, protocolFee: .003 * gross, coreFee: .007 * gross, wouldGraduate: false, average: gross / tokens,
    actual: gross, fees: { creator: 0, lp: .01 * gross, protocol: .003 * gross, core: .007 * gross } };
}
export function topicMarketQuoteFormalSell(s: TopicMarketState, side: Side, tokens: number): TopicMarketTradeQuote {
  const i = sideIndex(side), q = topicMarketCoordinates(s);
  if (!positive(tokens) || !positive(s.b) || s.liquidityClosed) throw new Error("CAPACITY");
  if(tokens>q[i])throw new Error("HOLDINGS");
  const end:[number,number]=[...q];end[i]-=tokens;
  const gross=Math.max(0,curveDelta(end,i,tokens,s.b));
  if(!(gross>0))throw new Error("TINY");
  if(gross>s.cash+EPS)throw new Error("CASH");
  return { quantity: tokens, gross, net: .98 * gross, mergePairs:0, R: 0, lpFee: .01 * gross,
    creatorFee: 0, protocolFee: .003 * gross, coreFee: .007 * gross, wouldGraduate: false, average: .98 * gross / tokens,
    actual: .98 * gross, fees: { creator: 0, lp: .01 * gross, protocol: .003 * gross, core: .007 * gross } };
}
export function topicMarketFormalBuy(state: TopicMarketState, id: number, side: Side, tokens: number): TopicMarketState {
  requireFormal(state); const q = topicMarketQuoteFormalBuy(state, side, tokens), s = copy(state), i = sideIndex(side);
  pay(s, id, q.gross); s.cash += q.net; s.lpFees += q.lpFee;s.lpFeesEarned+=q.lpFee;s.formalVolume+=q.gross; s.creatorFees += q.creatorFee; s.protocolFees += q.protocolFee; accrueCoreFee(s, q.coreFee);
  if (i === 0) s.accounts[id].yes += tokens; else s.accounts[id].no += tokens;
  record(s, "FORMAL_BUY", id, q.gross, tokens, side); return result(s);
}
/** 按真实LMSR曲线反求预算份额；仅受技术供应上限限制，不受毕业资本数量限制。 */
export function topicMarketQuoteFormalBuyBudget(s: TopicMarketState, side: Side, budget: number): TopicMarketTradeQuote {
  if (!positive(budget)) throw new Error("AMOUNT");
  const i=sideIndex(side),coordinates=topicMarketCoordinates(s);let lo=0,hi=Math.min(MAX_TOPIC_OUTCOME_SUPPLY-coordinates[i],.98*budget+Math.max(0,coordinates[1-i]-coordinates[i])+s.b*Math.LN2+1);
  if(!(hi>0)||s.liquidityClosed)throw new Error("SUPPLY_LIMIT");
  const all=topicMarketQuoteFormalBuy(s,side,hi);
  if(all.gross<=budget)return {...all,unused:budget-all.gross};
  for (let n = 0; n < 70; n++) {
    const mid = (lo + hi) / 2;
    try{if(topicMarketQuoteFormalBuy(s,side,mid).gross<=budget)lo=mid;else hi=mid;}catch(error){if(error instanceof Error&&error.message==="TINY")lo=mid;else throw error;}
  }
  if (!(lo > 0)) throw new Error("TINY");
  const q = topicMarketQuoteFormalBuy(s, side, lo); if (!(q.gross > 0)) throw new Error("TINY");
  return { ...q, unused: budget - q.gross };
}
export const topicMarketQuoteBudget = topicMarketQuoteFormalBuyBudget;
export function topicMarketFormalBuyBudget(state: TopicMarketState, id: number, side: Side, budget: number): TopicMarketState {
  requireFormal(state); if (budget > account(state, id).wallet) throw new Error("BALANCE");
  const q = topicMarketQuoteFormalBuyBudget(state, side, budget); return topicMarketFormalBuy(state, id, side, q.quantity);
}
export function topicMarketFormalSell(state: TopicMarketState, id: number, side: Side, tokens: number): TopicMarketState {
  requireFormal(state); const i = sideIndex(side), a = account(state, id);
  if (tokens > (i === 0 ? a.yes : a.no)) throw new Error("HOLDINGS");
  const q = topicMarketQuoteFormalSell(state, side, tokens), s = copy(state);
  if (i === 0) s.accounts[id].yes -= tokens; else s.accounts[id].no -= tokens;
  s.cash -= q.gross; s.lpFees += q.lpFee;s.lpFeesEarned+=q.lpFee;s.formalVolume+=q.gross; s.creatorFees += q.creatorFee; s.protocolFees += q.protocolFee; accrueCoreFee(s, q.coreFee);
  receive(s, id, q.net); record(s, "FORMAL_SELL", id, q.net, tokens, side); return result(s);
}
// 旧版本入口明确禁用，不能从LP权益转让绕回底层提款。
export function topicMarketQuoteExit(_s:TopicMarketState,_lp:number):TopicMarketExitQuote {throw new Error("LP_ASSETS_LOCKED");}
export function topicMarketExitLP(_s:TopicMarketState,_id:number,_lp:number):TopicMarketState {throw new Error("LP_ASSETS_LOCKED");}
export function topicMarketQuoteAddLP(_s:TopicMarketState,_lp:number):TopicMarketAddQuote {throw new Error("LP_ADDITION_DISABLED");}
export function topicMarketMaxAddLP(_s:TopicMarketState,_id:number):number{return 0;}
export function topicMarketAddLP(_s:TopicMarketState,_id:number,_lp:number):TopicMarketState {throw new Error("LP_ADDITION_DISABLED");}
export function topicMarketTransferLP(state:TopicMarketState,from:number,to:number,amount:number):TopicMarketState {
  const a=account(state,from);account(state,to);
  if(!positive(amount)||amount>a.lp||from===to)throw new Error("HOLDINGS");
  if(!["FORMAL","WAIT_CORE","SETTLED"].includes(state.phase))throw new Error("PHASE");
  const s=copy(state);s.accounts[from].lp-=amount;s.accounts[to].lp+=amount;
  record(s,"TRANSFER_LP",from,undefined,amount,String(to));return result(s);
}

/** 完整组合的抵押赎回：每对YES+NO所有结果都值1，不能从做市现金重复提款。 */
export function topicMarketRedeemPairs(state: TopicMarketState, id: number, pairs: number): TopicMarketState {
  if(topicMarketEarlyDue(state))throw new Error("PROCESS_EARLY_REQUEST");
  if (state.phase !== "FORMAL" && state.phase !== "WAIT_CORE") throw new Error("PHASE");
  if (!positive(pairs)) throw new Error("AMOUNT");
  const a = account(state, id);
  if (pairs > Math.min(a.yes, a.no)) throw new Error("HOLDINGS");
  if (pairs > state.cash) throw new Error("CASH");
  const s = copy(state);
  s.accounts[id].yes -= pairs; s.accounts[id].no -= pairs;
  s.cash -= pairs; s.redeemedPairs += pairs;
  receive(s, id, pairs); record(s, "REDEEM_PAIRS", id, pairs, pairs); return result(s);
}
/** 回购可使用真实现金及池内完整组合释放的抵押，仍受持仓和对侧库存限制。 */
export function topicMarketMaxFormalSellTokens(s: TopicMarketState, id: number, side: Side): number {
  const i = sideIndex(side), a = account(s, id);
  if (s.phase !== "FORMAL" || s.now >= s.TF || s.liquidityClosed) return 0;
  let lo=0,hi=i===0?a.yes:a.no;
  if (!(hi > 0)) return 0;
  try { topicMarketQuoteFormalSell(s, side, hi); return hi; } catch { /* 真实现金可能小于完整回购所需。 */ }
  for (let n = 0; n < 64; n++) {
    const mid = (lo + hi) / 2;
    try { topicMarketQuoteFormalSell(s, side, mid); lo = mid; } catch { hi = mid; }
  }
  return lo;
}
export function topicMarketCoreStake(state: TopicMarketState, id: number, side: Outcome, amount: number): TopicMarketState {
  if (!["YES", "NO", "INVALID"].includes(side)) throw new Error("SIDE");
  requireCoreOpen(state);
  const a = account(state, id); if (a.coreSide && a.coreSide !== side) throw new Error("SIDE_LOCKED");
  const s = copy(state); pay(s, id, amount); s.accounts[id].coreSide = side; s.accounts[id].coreStake += amount;
  s.core.cash += amount;
  if (side === "YES") s.core.yes += amount; else if (side === "NO") s.core.no += amount; else s.core.invalid += amount;
  record(s, "CORE_STAKE", id, amount, undefined, side); return result(s);
}
export function topicMarketCoreExit(state:TopicMarketState,id:number):TopicMarketState {
 requireCoreOpen(state);const a=account(state,id);if(!(a.coreStake>0)||!a.coreSide)throw new Error("NO_STAKE");
 const s=copy(state),user=s.accounts[id],principal=user.coreStake;
 const penalty=Math.min(principal,Math.ceil(principal*1e18/10)/1e18),refund=principal-penalty;
 const e=s.early!;e.penalty+=penalty;
 for(let i=0;i<3;i++){e.forfeited[i]+=user.coreRewards[i];user.coreRewards[i]=0;}
 if(user.coreSide==='YES')s.core.yes-=principal;else if(user.coreSide==='NO')s.core.no-=principal;else s.core.invalid-=principal;
 s.core.cash-=principal;user.coreStake=0;user.coreSide=null;user.coreClaimed=false;
 receive(s,id,refund);record(s,'CORE_EXIT',id,refund,principal);return result(s);
}
export function topicMarketProposeEarly(state:TopicMarketState,id:number,side:Side,reason:string):TopicMarketState {
 requireCoreOpen(state);if(side!=='YES'&&side!=='NO')throw new Error('EARLY_OUTCOME');
 if(!reason.trim())throw new Error('MISSING_REASON');if(state.early?.pending)throw new Error('EARLY_PENDING');
 if(!(state.core.cash>0))throw new Error('NO_PRINCIPAL');if(state.now+3600>=state.TC)throw new Error('EARLY_WINDOW');
 const s=copy(state),e=s.early!;pay(s,id,e.bond);
 e.pending={id:++e.count,proposer:id,side,proposedAt:s.now,processAfter:s.now+3600,reason:reason.trim(),bond:e.bond};
 record(s,'EARLY_PROPOSE',id,e.bond,undefined,side);return result(s);
}
export function topicMarketProcessEarly(state:TopicMarketState):TopicMarketState {
 if(!['FORMAL','WAIT_CORE'].includes(state.phase))throw new Error('CORE_CLOSED');
 const request=state.early?.pending;if(!request)throw new Error('NO_EARLY_REQUEST');if(state.now<request.processAfter)throw new Error('EARLY_PENDING_WINDOW');
 const s=copy(state),e=s.early!;e.pending=null;
 const total=s.core.yes+s.core.no+s.core.invalid,actual=s.core.yes>total/2?'YES':s.core.no>total/2?'NO':'INVALID';
 if(actual===request.side){s.accounts[request.proposer].bondRefund=(s.accounts[request.proposer].bondRefund??0)+request.bond;e.terminatedAt=request.processAfter;settle(s);}
 else {e.failedBonds+=request.bond;if(s.now>=s.TC)settle(s);}
 record(s,'EARLY_PROCESS',undefined,request.bond,undefined,actual);return result(s);
}
export function topicMarketClaimEarlyBond(state:TopicMarketState,id:number):TopicMarketState {
 const amount=account(state,id).bondRefund??0;if(!(amount>0))throw new Error('NO_BOND_REFUND');
 const s=copy(state);s.accounts[id].bondRefund=0;receive(s,id,amount);record(s,'CLAIM_EARLY_BOND',id,amount);return result(s);
}
function distributeOfficialFees(s:TopicMarketState){
 if(s.config.protocolAccount<0)return;
 // 本地模拟账户直接收款；共享模拟的外部收款人由服务端管理，保留其可领取账。
 if(s.accounts[s.config.creatorAccount]&&s.creatorFees>0){const n=s.creatorFees;s.creatorFees=0;receive(s,s.config.creatorAccount,n);record(s,'CLAIM_FEES',s.config.creatorAccount,n,undefined,'CREATOR');}
 if(s.accounts[s.config.protocolAccount]){const n=s.protocolFees+s.coreOfficialBudget;s.protocolFees=0;s.coreOfficialBudget=0;if(n>0){receive(s,s.config.protocolAccount,n);record(s,'CLAIM_FEES',s.config.protocolAccount,n,undefined,'PROTOCOL');}}
}
function settle(s: TopicMarketState) {
  const totalStake = s.core.yes + s.core.no + s.core.invalid;
  const outcome: Outcome = s.core.yes > totalStake / 2 ? "YES" : s.core.no > totalStake / 2 ? "NO" : "INVALID";
  s.result = outcome; s.core.result = outcome; s.phase = "SETTLED";
  const liability=outcomeValue(...topicMarketCoordinates(s),outcome);
  s.outcomeBudget=liability;s.collateral=0;
  const nav=s.cash+s.lpFees-liability;
  if(nav < -EPS)throw new Error("SETTLEMENT_INSOLVENT");
  s.lpBudget=Math.max(0,nav);
  s.lpClaimSupply=s.lpSupply;
  s.lpBudgetInitial=s.lpBudget;
  s.payouts=[];
  const rewardIndex = outcome === "YES" ? 0 : outcome === "NO" ? 1 : 2;
  const penalty=(s.early?.penalty??0)+(s.early?.failedBonds??0),forfeited=s.early?.forfeited[rewardIndex]??0;
  const eligible=outcome==='YES'?s.core.yes:outcome==='NO'?s.core.no:s.core.yes+s.core.no;
  s.corePayouts = s.accounts.map(a => {
    const principal=outcome==='INVALID'?(totalStake>0?(s.core.cash+penalty)*a.coreStake/totalStake:0)
      :a.coreSide===outcome?(s.core.cash+penalty)*a.coreStake/eligible:0;
    const feeEligible=outcome==='INVALID'?(a.coreSide==='YES'||a.coreSide==='NO'):a.coreSide===outcome;
    return principal+a.coreRewards[rewardIndex]+(feeEligible&&eligible>0?forfeited*a.coreStake/eligible:0);
  });
  s.coreBudget=sum(s.corePayouts);s.coreOfficialBudget=s.core.officialRewards[rewardIndex]+(eligible===0?forfeited:0)+(totalStake===0?penalty:0);
  if(s.early){s.early.penalty=0;s.early.failedBonds=0;s.early.forfeited=[0,0,0];}
  s.core.fees = 0; s.core.cash = 0; s.cash = 0; s.lpFees = 0; s.inventory = [0, 0];
  record(s, "SETTLE", undefined, undefined, undefined, outcome);
  distributeOfficialFees(s);
}
function fail(s:TopicMarketState){
  s.phase="FAILED";s.failedBudget=s.R;s.failedBudgetInitial=s.R;s.failedSupply=s.S;
  s.payouts=[];
  s.R=0;record(s,"FAIL");distributeOfficialFees(s);
}
/** 按当前token余额预览；结算分母/初始预算固定，转让和burn不改变每份兑付率。 */
export function topicMarketClaimPreview(s:TopicMarketState,id:number):TopicMarketPayout {
 const a=account(s,id);const settled=s.phase==="SETTLED",failedState=s.phase==="FAILED";
 const outcomes=settled?outcomeValue(a.yes,a.no,s.result!):0;
 const lp=settled&&s.lpClaimSupply>0?s.lpBudgetInitial*a.lp/s.lpClaimSupply:0;
 const failed=failedState&&s.failedSupply>0?s.failedBudgetInitial*a.g/s.failedSupply:0;
 return {outcomes,lp,failed,total:outcomes+lp+failed};
}
/** to是绝对模拟秒数；一次跨过多个时点也依正确顺序处理。 */
export function topicMarketAdvanceTime(state: TopicMarketState, to: number): TopicMarketState {
  if (!Number.isFinite(to) || to < state.now) throw new Error("TIME");
  if (state.phase === "CREATE") return state;
  const s = copy(state); s.now = to;
  if (s.phase === "GENESIS" && to >= s.TG) fail(s);
  if (s.phase === "FORMAL" && to >= s.TF) { s.phase = "WAIT_CORE"; record(s, "FORMAL_CLOSE"); }
  return result(s);
}
export function topicMarketFinalize(state: TopicMarketState): TopicMarketState {
  if ((state.phase !== "FORMAL" && state.phase !== "WAIT_CORE") || state.now < state.TC) throw new Error("CORE_PENDING");
  if(state.early?.pending)return topicMarketProcessEarly(state);
  const s = copy(state); settle(s); return result(s);
}
export function topicMarketClaimLP(state:TopicMarketState,id:number,amount:number):TopicMarketState {
 const a=account(state,id);if(state.phase!=="SETTLED"||!positive(amount)||amount>a.lp||!positive(state.lpClaimSupply))throw new Error("CLAIM");
 const s=copy(state),money=s.lpBudgetInitial*amount/s.lpClaimSupply;
 s.accounts[id].lp-=amount;s.lpSupply-=amount;s.lpBudget-=money;
 receive(s,id,money);record(s,"BURN_LP",id,money,amount);return result(s);
}
export function topicMarketClaim(state:TopicMarketState,id:number):TopicMarketState {
 const a=account(state,id);if(!["SETTLED","FAILED"].includes(state.phase)||!(a.lp+a.g+a.yes+a.no>0))throw new Error("CLAIM");
 let s=copy(state);const p=topicMarketClaimPreview(s,id);
 if(a.lp>0&&s.phase==="SETTLED")s=topicMarketClaimLP(s,id,a.lp);
 s.outcomeBudget-=p.outcomes;s.failedBudget-=p.failed;
 if(s.phase==="FAILED")s.S-=s.accounts[id].g;
 s.accounts[id].g=0;s.accounts[id].yes=0;s.accounts[id].no=0;s.accounts[id].claimed=true;
 receive(s,id,p.outcomes+p.failed);record(s,"CLAIM_MARKET",id,p.total);return result(s);
}
export function topicMarketClaimCore(state: TopicMarketState, id: number): TopicMarketState {
  const a = account(state, id); if (state.phase !== "SETTLED" || a.coreClaimed) throw new Error("CORE_CLAIM");
  const s = copy(state), payout = s.corePayouts[id]; s.accounts[id].coreClaimed = true; s.coreBudget -= payout;
  receive(s, id, payout); record(s, "CLAIM_CORE", id, payout); return result(s);
}
/** 演示把既有Core官方奖励接收人映射为协议账户；这不是Formal固定协议手续费。 */
export function topicMarketClaimCoreOfficial(state: TopicMarketState, id: number): TopicMarketState {
  if (state.phase !== "SETTLED" || id !== state.config.protocolAccount) throw new Error("FEE_OWNER");
  if (!positive(state.coreOfficialBudget)) throw new Error("NO_FEES");
  const s = copy(state), amount = s.coreOfficialBudget; s.coreOfficialBudget = 0;
  receive(s, id, amount); record(s, "CLAIM_CORE_OFFICIAL", id, amount); return result(s);
}
export function topicMarketClaimFees(state: TopicMarketState, kind: "CREATOR" | "PROTOCOL", id: number): TopicMarketState {
  if (kind !== "CREATOR" && kind !== "PROTOCOL") throw new Error("KIND");
  if (id !== (kind === "CREATOR" ? state.config.creatorAccount : state.config.protocolAccount)) throw new Error("FEE_OWNER");
  const s = copy(state), amount = kind === "CREATOR" ? s.creatorFees : s.protocolFees;
  if (!positive(amount)) throw new Error("NO_FEES");
  if (kind === "CREATOR") s.creatorFees = 0; else s.protocolFees = 0;
  receive(s, id, amount); record(s, "CLAIM_FEES", id, amount, undefined, kind); return result(s);
}
export function topicMarketMaxBuy(s: TopicMarketState, id: number): number { return account(s, id).wallet; }
export function topicMarketHoldings(s: TopicMarketState, id: number) { const a = account(s, id); return { g: a.g, lp: a.lp, yes: a.yes, no: a.no, wallet: a.wallet, core: a.coreStake }; }
export function topicMarketMaxFormalBuyTokens(s: TopicMarketState, id: number, side: Side): number {
  if(s.liquidityClosed)return 0;
  const wallet=account(s,id).wallet;
  return wallet>0?topicMarketQuoteFormalBuyBudget(s,side,wallet).quantity:0;
}
export function topicMarketAccounting(s: TopicMarketState) {
  const wallets = sum(s.accounts.map(a => a.wallet));
  const earlyFunds=(s.early?.pending?.bond??0)+(s.early?.penalty??0)+(s.early?.failedBonds??0)+sum(s.accounts.map(a=>a.bondRefund??0));
  const reserves = earlyFunds+s.R + s.collateral + s.cash + s.lpFees + s.creatorFees + s.protocolFees
    + s.core.cash + s.core.fees + s.coreOfficialBudget + s.lpBudget + s.outcomeBudget + s.failedBudget + s.coreBudget;
  return { wallets, reserves, total: wallets + reserves, initialTotal: s.initialCapital ?? 30000, error: wallets + reserves - (s.initialCapital ?? 30000) };
}
export function topicMarketAssertLedger(s: TopicMarketState) {
  const a = topicMarketAccounting(s);
  const balances = [s.R, s.collateral, s.cash, s.lpFees, s.creatorFees, s.protocolFees, s.basis, s.b,
    s.lpSupply, s.redeemedPairs, ...s.inventory, s.core.cash, s.core.fees, s.coreOfficialBudget, s.lpBudget, s.outcomeBudget, s.failedBudget, s.coreBudget,
    ...s.accounts.flatMap(x => [x.wallet, x.g, x.lp, x.yes, x.no, x.coreStake])];
  if (balances.some(x => !Number.isFinite(x) || x < -EPS) || Math.abs(a.error) > EPS) throw new Error("LEDGER");
  if (s.phase === "GENESIS" && (Math.abs(sum(s.accounts.map(x => x.g)) - s.S) > EPS || Math.abs(s.R - s.k * s.S * s.S) > EPS)) throw new Error("CURVE");
  if (s.phase === "FORMAL" || s.phase === "WAIT_CORE") {
    if (Math.abs(sum(s.accounts.map(x => x.lp)) - s.lpSupply) > EPS) throw new Error("LP_LEDGER");
    const q=topicMarketCoordinates(s);
    if(s.inventory[0]!==0||s.inventory[1]!==0||s.collateral!==0)throw new Error("OUTCOME_LEDGER");
    if(s.cash+EPS<Math.max(...q))throw new Error("SOLVENCY");
    const expected=s.M0+topicMarketCost(...q,s.b)-s.b*Math.LN2;
    if(Math.abs(s.cash-expected)>EPS)throw new Error("LMSR_LEDGER");
  }
}
export function topicMarketScenario(kind: TopicMarketScenario, config: TopicMarketConfig = {}): TopicMarketState {
  let s = topicMarketCreate(createTopicMarketDemo(config));
  if (kind === "GENESIS") return s;
  if (kind === "FAILURE") { s = topicMarketBuy(s, 0, .05 * s.Q); s = topicMarketBuy(s, 1, .15 * s.Q); return topicMarketAdvanceTime(s, s.TG); }
  const fund = (total: number) => {
    let left = total;
    for (let id = 0; id < 3 && left > 1e-9; id++) { const paid = Math.min(left, s.accounts[id].wallet * .95); s = topicMarketBuy(s, id, paid); left -= paid; }
    if (left > 1e-7) throw new Error("SCENARIO_BUDGET");
  };
  if (kind !== "BUY_GRADUATE") throw new Error("SCENARIO");
  fund(s.rTarget / .99 * (1 + 1e-12)); return s;
}
