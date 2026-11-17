import { describe, expect, it } from "vitest";
import { advanceTime, assertLedger, claimPayout, cost, createMarket, genesisPotential, graduationStatus,
  newMarket, prices, publishResult, scenario, trade, type LifecycleMarket, type Pair } from "./marketLifecycleModel";
const roundTrip = (m: LifecycleMarket, pay = 100) => {
  const p = trade(m, 0, "YES", "BUY", pay); return trade(p.next, 0, "YES", "SELL", p.quantity);
};
function protectedAt(q: Pair, R: number, b: number) {
  const g = graduationStatus({ q, R, b }); expect(g.fundingReady && g.protectionReady).toBe(true);
  for (const x of [0, .0001, .1, .5, 1]) for (const y of [0, .0001, .1, .5, 1]) {
    const end: Pair = [q[0] * (1-x), q[1] * (1-y)];
    const gen = q.reduce((sum, v, i) => sum + genesisPotential(v,b) - genesisPotential(end[i],b),0);
    expect(cost(q,b)-cost(end,b)+1e-8).toBeGreaterThanOrEqual(gen);
  }
}
describe("Independent Genesis v2 lifecycle", () => {
  for (const side of ["YES", "NO"] as const) it(`${side} changes only its own buy and sell quotes`, () => {
    const m = scenario("GENESIS"), i = side === "YES" ? 0 : 1, initial = prices(m);
    const p = trade(m,0,side,"BUY",100), next = prices(p.next);
    expect(m.R).toBe(0); expect(p.quantity).toBeCloseTo(632.189053556,7);
    expect(next.ask[i]).toBeCloseTo(.6766666667,9);
    expect(next.ask[1-i]).toBe(initial.ask[1-i]); expect(next.bid[1-i]).toBe(initial.bid[1-i]);
    const sale = trade(p.next,0,side,"SELL",p.quantity);
    expect(sale.actual).toBeCloseTo(89.1,8); expect(sale.next.L).toBeCloseTo(9);
    expect(prices(sale.next).ask).toEqual(initial.ask); expect(prices(sale.next).bid).toEqual(initial.bid);
  });
  it("capital accumulation and time alone do not reprice", () => {
    let m = scenario("GENESIS"); const initial = prices(m);
    for(let i=0;i<10;i++) m=roundTrip(m).next;
    expect(m.L).toBeCloseTo(90); expect(prices(m)).toEqual(initial);
    expect(prices(advanceTime(m,30))).toEqual(initial);
  });
  it("funding alone cannot force a graduation that damages exits", () => {
    const m=scenario("BALANCED"), g=graduationStatus(m);
    expect(g.fundingReady).toBe(true); expect(g.protectionReady).toBe(false); expect(m.phase).toBe("GENESIS");
    expect(genesisPotential(m.q[0],m.b)).toBeGreaterThan(cost(m.q,m.b)-cost([0,m.q[1]],m.b));
  });
  it("turnover graduates mid-sale and prices the remainder under LMSR", () => {
    let m=scenario("GENESIS"); for(let i=0;i<11;i++){m=roundTrip(m).next;expect(m.phase).toBe("GENESIS");}
    const sale=roundTrip(m); expect(sale.next.phase).toBe("FORMAL"); expect(sale.actual).toBeGreaterThan(89.1);
    expect(sale.next.deadline).toBe(300); expect(sale.next.L).toBe(0); expect(sale.next.accounts[0].credit).toBeCloseTo(108);
    expect(sale.next.R).toBeCloseTo(150*Math.log(2),7);
    const e=sale.next.events.find(e=>e.kind==="GRADUATE")!; protectedAt(e.q!,e.principal!,m.b); assertLedger(sale.next);
  });
  it("retains excess capital when protection is the last gate and does not spend it in buy quotes", () => {
    let m=scenario("GENESIS"); for(let i=0;i<11;i++)m=roundTrip(m).next;
    m=roundTrip(m,9000).next; expect(m.phase).toBe("FORMAL"); expect(m.formalSurplus!).toBeGreaterThan(100);
    const e=m.events.find(e=>e.kind==="GRADUATE")!; protectedAt(e.q!,e.principal!,m.b);
    const next=trade(m,0,"NO","BUY",10).next;
    expect(cost(next.q,next.b)-cost(m.q,m.b)).toBeCloseTo(9.9,7);
    expect(next.formalSurplus).toBe(m.formalSurplus); assertLedger(next);
  });
  it("splitting buys and sells does not improve their result", () => {
    let a=scenario("GENESIS"),b=scenario("GENESIS"); a=trade(a,0,"YES","BUY",100).next;
    for(let i=0;i<10;i++)b=trade(b,0,"YES","BUY",10).next;
    expect(a.q[0]).toBeCloseTo(b.q[0],8);
    const all=trade(a,0,"YES","SELL",a.accounts[0].shares[0]);let cash=0;const qty=b.accounts[0].shares[0]/10;
    for(let i=0;i<10;i++){const p=trade(b,0,"YES","SELL",Math.min(qty,b.accounts[0].shares[0]));cash+=p.actual;b=p.next;}
    expect(cash).toBeCloseTo(all.actual,7);expect(b.L).toBeCloseTo(all.next.L,8);
  });
  it("checks independence and ledger on 1000 seeded orders", () => {
    let seed=5151;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
    for(let run=0;run<10;run++){let m=scenario("GENESIS");for(let j=0;j<100;j++){
      const owner=j%3,i=rand()<.5?0:1,side=i===0?"YES":"NO",held=m.accounts[owner].shares[i];
      const buy=held<1||rand()<.55,old=prices(m);
      const p=trade(m,owner,side,buy?"BUY":"SELL",buy?1+rand()*20:held*(.1+rand()*.8));assertLedger(p.next);
      if(p.graduated){const e=p.next.events.find(e=>e.kind==="GRADUATE")!;protectedAt(e.q!,e.principal!,m.b);break;}
      const next=prices(p.next);expect(next.ask[1-i]).toBe(old.ask[1-i]);expect(next.bid[1-i]).toBe(old.bid[1-i]);
      if(buy)expect(next.ask[i]).toBeGreaterThan(old.ask[i]);else expect(next.ask[i]).toBeLessThan(old.ask[i]);m=p.next;
    }}
  });
  it("both stages stop at the shared deadline", () => {
    const f=advanceTime(scenario("GENESIS"),300),m=advanceTime(scenario("FORMAL"),300);
    expect(f.phase).toBe("FAILED");expect(m.phase).toBe("WAIT_CORE");
    for(const n of [f,m])expect(()=>trade(n,0,"YES","BUY",2)).toThrow("CLOSED");
    expect(()=>publishResult(f,"YES")).toThrow();expect(()=>claimPayout(m,0)).toThrow();
  });
  it("failure option3 divides real T and returns L exactly once", () => {
    const live=scenario("FAILURE"),m=advanceTime(live,300),Q=live.q[0]+live.q[1];
    m.accounts.forEach((a,i)=>{expect(m.payouts![i].shares).toBeCloseTo(live.T*(a.shares[0]+a.shares[1])/Q,8);expect(m.payouts![i].capital).toBeCloseTo(a.credit,8);});
    let n=m;for(const i of [2,0,1])n=claimPayout(n,i);expect(n.R).toBeCloseTo(0,7);assertLedger(n);expect(()=>claimPayout(n,0)).toThrow("CLAIMED");
  });
  it("expiry with no shares returns only locked capital", () => {
    const m=advanceTime(roundTrip(scenario("GENESIS")).next,300);
    expect(m.payouts![0].shares).toBeCloseTo(0);expect(m.payouts![0].total).toBeCloseTo(9);
  });
  for(const result of ["YES","NO","INVALID"] as const)it(`settles ${result} with fixed funded claims independent of order`,()=>{
    const m=publishResult(advanceTime(scenario("FORMAL"),300),result);
    expect(m.now).toBeGreaterThan(m.deadline);expect(m.payouts!.reduce((n,p)=>n+p.total,0)).toBeCloseTo(m.R+m.fees.capital,6);
    expect(m.payouts!.reduce((n,p)=>n+p.shares,0)).toBeCloseTo(result==="YES"?m.q[0]:result==="NO"?m.q[1]:(m.q[0]+m.q[1])/2,7);
    let a=m,b=m;for(const i of [0,1,2])a=claimPayout(a,i);for(const i of [2,1,0])b=claimPayout(b,i);
    expect(a.accounts.map(x=>x.wallet)).toEqual(b.accounts.map(x=>x.wallet));expect(a.R).toBeCloseTo(0,6);assertLedger(a);expect(()=>publishResult(m,result)).toThrow();
  });
  it("Formal prices are linked and 99% of actual payment enters LMSR",()=>{
    const m=scenario("FORMAL"),old=prices(m),n=trade(m,0,"YES","BUY",100).next;
    expect(prices(n).ask[0]).toBeGreaterThan(old.ask[0]);expect(prices(n).ask[1]).toBeLessThan(old.ask[1]);
    expect(n.R-m.R).toBeCloseTo(99);expect(n.L).toBe(0);expect(n.fees.core-m.fees.core).toBeCloseTo(.7);expect(n.fees.capital-m.fees.capital).toBeCloseTo(.2);
  });
  it("invalid orders do not mutate the state",()=>{
    const m=createMarket(newMarket()),before=JSON.stringify(m);
    expect(()=>trade(m,0,"YES","BUY",NaN)).toThrow();expect(()=>trade(m,0,"YES","BUY",10001)).toThrow();expect(()=>trade(m,0,"YES","SELL",1)).toThrow();expect(JSON.stringify(m)).toBe(before);
  });
});
