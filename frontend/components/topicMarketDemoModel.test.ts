import { describe, expect, it } from "vitest";
import {
  createTopicMarketDemo, topicMarketCreate, topicMarketBuy, topicMarketSell, topicMarketFormalBuy, topicMarketFormalSell,
  topicMarketExitLP, topicMarketCoreStake, topicMarketAdvanceTime, topicMarketClaim, topicMarketClaimCore,
  topicMarketClaimCoreOfficial, topicMarketClaimFees, topicMarketAccounting, topicMarketAssertLedger, topicMarketFinalize, topicMarketPrices,
  topicMarketFormalBuyBudget, topicMarketQuoteFormalBuyBudget, topicMarketTransferLP,
} from "./topicMarketDemoModel";

type State = ReturnType<typeof createTopicMarketDemo>;
const ledger = (s: State) => {
  topicMarketAssertLedger(s);
  expect(topicMarketAccounting(s).error).toBeCloseTo(0, 7);
  expect(topicMarketAccounting(s).total).toBeCloseTo(30000, 7);
};
const active = () => topicMarketCreate(createTopicMarketDemo({Q:6000}));
const graduated = () => {
  let s = active();
  for (let i = 0; i < 3; i++) { s = topicMarketBuy(s, i, 9000); ledger(s); }
  return s;
};
const rejectsUnchanged = (s: State, action: () => unknown) => {
  const before = JSON.stringify(s);
  expect(action).toThrow();
  expect(JSON.stringify(s)).toBe(before);
  ledger(s);
};

describe("TopicMarket: independent full lifecycle and settlement", () => {
  it("starts without hidden Core stakes, virtual reserves or external capital", () => {
    const s = createTopicMarketDemo();
    ledger(s);
    expect(topicMarketAccounting(s).wallets).toBe(30000);
    expect(topicMarketAccounting(s).reserves).toBe(0);
  });

  it("funds both directions of Genesis from the same wallets", () => {
    let s = topicMarketBuy(active(), 0, 100);
    ledger(s);
    s = topicMarketSell(s, 0, s.accounts[0].g);
    expect(s.accounts[0].wallet).toBeCloseTo(9998.01, 7);
    expect(s.accounts[0].g).toBeCloseTo(0, 7);
    ledger(s);
  });

  it("graduates exactly when the reserve target is reached",()=>{let s=topicMarketBuy(active(),0,9000);s=topicMarketBuy(s,1,9000);expect(s.phase).toBe('GENESIS');s=topicMarketBuy(s,2,9000);expect(s.phase).toBe('FORMAL');expect(s.b).toBe(s.M0);ledger(s);});

  it("rejects nonfinite amounts, overdrafts and short-selling atomically", () => {
    const s = active();
    for (const amount of [NaN, Infinity, -Infinity, -1, 0, 10001]) {
      rejectsUnchanged(s, () => topicMarketBuy(s, 0, amount));
    }
    rejectsUnchanged(s, () => topicMarketSell(s, 0, 1));
    rejectsUnchanged(s, () => topicMarketCoreStake(s, 0, "YES", 1));
  });

  it("rejects nonfinite Formal, LP, Core and time inputs without mutation", () => {
    const s = topicMarketFormalBuy(graduated(), 0, "YES", 10);
    for (const amount of [NaN, Infinity, -Infinity, -1, 0]) {
      rejectsUnchanged(s, () => topicMarketFormalBuy(s, 0, "YES", amount));
      rejectsUnchanged(s, () => topicMarketFormalSell(s, 0, "YES", amount));
      rejectsUnchanged(s, () => topicMarketExitLP(s, 0, amount));
      rejectsUnchanged(s, () => topicMarketCoreStake(s, 0, "YES", amount));
    }
    for (const time of [NaN, Infinity, -Infinity, -1]) {
      rejectsUnchanged(s, () => topicMarketAdvanceTime(s, time));
    }
  });

  it("spends only the actual filled Formal budget and never mints beyond inventory", () => {
    let s = topicMarketBuy(topicMarketCreate(createTopicMarketDemo({  Q: 1 })), 0, 30);
    const beforeWallet = s.accounts[1].wallet;
    const inventory = s.inventory[0];
    const quote = topicMarketQuoteFormalBuyBudget(s, "YES", 100);
    expect(quote.unused).toBeGreaterThan(0);
    expect(quote.quantity).toBe(inventory);
    s = topicMarketFormalBuyBudget(s, 1, "YES", 100);
    expect(beforeWallet - s.accounts[1].wallet).toBeCloseTo(quote.actual, 8);
    expect(s.accounts[1].yes).toBe(inventory);
    expect(s.inventory[0]).toBe(0);
    rejectsUnchanged(s, () => topicMarketFormalBuyBudget(s, 1, "YES", 1));
    ledger(s);
  });

  it("refunds remaining reserve once after Genesis failure",()=>{let s=topicMarketBuy(active(),0,100);s=topicMarketSell(s,0,s.accounts[0].g/2);const remaining=s.R;s=topicMarketAdvanceTime(s,s.TG);const before=s.accounts[0].wallet;s=topicMarketClaim(s,0);expect(s.accounts[0].wallet-before).toBeCloseTo(remaining,7);rejectsUnchanged(s,()=>topicMarketClaim(s,0));ledger(s);});

  for (const result of ["YES", "NO", "INVALID"] as const) {
    it(`pays ${result} outcome, LP once without double-counting collateral`, () => {
      let s = graduated();
      s = topicMarketFormalBuy(s, 0, "YES", 100);
      s = topicMarketFormalBuy(s, 1, "NO", 70);
      if (result !== "INVALID") s = topicMarketCoreStake(s, 2, result, 200);
      ledger(s);
      rejectsUnchanged(s, () => topicMarketClaim(s, 0));
      rejectsUnchanged(s, () => topicMarketClaimCore(s, 2));
      s = topicMarketAdvanceTime(s, s.TF);
      rejectsUnchanged(s, () => topicMarketFormalBuy(s, 0, "YES", 1));
      rejectsUnchanged(s, () => topicMarketFormalSell(s, 0, "YES", 1));
      rejectsUnchanged(s, () => topicMarketClaimCore(s, 2));
      s = topicMarketAdvanceTime(s, s.TC);
      rejectsUnchanged(s, () => topicMarketCoreStake(s, 2, "YES", 1));
      s = topicMarketFinalize(s);
      expect(s.phase).toBe("SETTLED");
      expect(s.result).toBe(result);
      rejectsUnchanged(s, () => topicMarketFinalize(s));
      for (const id of [2, 0, 1]) {
        s = topicMarketClaim(s, id); ledger(s);
        rejectsUnchanged(s, () => topicMarketClaim(s, id));
      }
      if (result !== "INVALID") {
        s = topicMarketClaimCore(s, 2);
        rejectsUnchanged(s, () => topicMarketClaimCore(s, 2));
      }
      if(s.creatorFees>0)s = topicMarketClaimFees(s, "CREATOR", 1);
      if (s.protocolFees > 0) s = topicMarketClaimFees(s, "PROTOCOL", 2);
      if (s.coreOfficialBudget > 0) s = topicMarketClaimCoreOfficial(s, 2);
      ledger(s);
      expect(topicMarketAccounting(s).reserves).toBeCloseTo(0, 7);
    });
  }

  it("locks all LP assets while transferred LP and Core rights remain independent", () => {
    let s = graduated();
    s = topicMarketCoreStake(s, 0, "YES", 100);
    s = topicMarketCoreStake(s, 1, "NO", 50);
    const collateral = s.collateral;
    for (const id of [0, 1, 2]) rejectsUnchanged(s, () => topicMarketExitLP(s, id, s.accounts[id].lp));
    s = topicMarketTransferLP(s, 0, 1, s.accounts[0].lp);
    expect(s.collateral).toBe(collateral);
    s = topicMarketFinalize(topicMarketAdvanceTime(s, s.TC));
    for (const id of [0, 1, 2]) { if(s.accounts[id].lp+s.accounts[id].yes+s.accounts[id].no>0)s = topicMarketClaim(s, id); ledger(s); }
    const wallet = s.accounts[0].wallet;
    s = topicMarketClaimCore(s, 0);
    expect(s.accounts[0].wallet - wallet).toBeCloseTo(150, 7);
    s = topicMarketClaimCore(s, 1);
    ledger(s);
  });

  it("preserves prices and pool assets during LP transfer without changing pricing", () => {
    let s = topicMarketFormalBuy(graduated(), 0, "YES", 100);
    const before = s;
    const p = topicMarketPrices(s).probability![0];
    s = topicMarketTransferLP(s, 1, 2, s.accounts[1].lp / 2);
    expect(s.collateral).toBe(before.collateral);
    expect(s.M0).toBe(before.M0);
    expect(s.cash).toBe(before.cash);
    expect(s.lpFees).toBe(before.lpFees);
    expect(s.inventory).toEqual(before.inventory);
    expect(s.b).toBe(before.b);
    expect(topicMarketPrices(s).probability![0]).toBeCloseTo(p, 9);
    ledger(s);
  });

  it("includes retained LP fees in the terminal LP budget",()=>{let s=topicMarketFormalBuy(graduated(),0,'YES',100);s=topicMarketCoreStake(s,2,'YES',1);const nav=s.cash+s.lpFees+s.inventory[0];s=topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));expect(s.lpBudget).toBeCloseTo(nav,7);ledger(s);});

  it("fixes depth to actual graduation reserve rather than an oversized research input",()=>{const s=topicMarketBuy(topicMarketCreate(createTopicMarketDemo({Q:1,b:150})),0,30);expect(s.b).toBeCloseTo(29.7);expect(s.b).toBe(s.M0);ledger(s);});

  it("makes terminal LP value independent of LP transfer fractions",()=>{let s=topicMarketFormalBuy(graduated(),0,'YES',100);s=topicMarketTransferLP(s,0,2,s.accounts[0].lp*.9);const nav=s.cash+s.lpFees+s.inventory[0];s=topicMarketCoreStake(s,2,'YES',1);s=topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));expect(s.lpBudget).toBeCloseTo(nav,7);ledger(s);});

  it("charges real round-trip fees without creating additional outcome collateral", () => {
    let s = graduated();
    const M = s.M0;
    s = topicMarketFormalBuy(s, 0, "YES", 100);
    s = topicMarketFormalSell(s, 0, "YES", 100);
    expect(s.cash).toBeCloseTo(0, 8);
    expect(s.lpFees).toBeGreaterThan(0);
    expect(s.accounts[0].yes).toBeCloseTo(0, 8);
    expect(s.inventory[0]).toBeCloseTo(M, 8);
    expect(s.collateral).toBe(M);
    rejectsUnchanged(s, () => topicMarketClaimFees(s, "CREATOR", 0));
    if(s.creatorFees>0)s = topicMarketClaimFees(s, "CREATOR", 1);
    rejectsUnchanged(s, () => topicMarketClaimFees(s, "CREATOR", 1));
    s = topicMarketFinalize(topicMarketAdvanceTime(s, s.TC));
    expect(s.lpBudget).toBeGreaterThan(M);
    ledger(s);
  });

  it("includes INVALID stakes in the absolute-majority denominator", () => {
    let s = graduated();
    s = topicMarketCoreStake(s, 0, "YES", 40);
    s = topicMarketCoreStake(s, 1, "NO", 35);
    s = topicMarketCoreStake(s, 2, "INVALID", 25);
    s = topicMarketFinalize(topicMarketAdvanceTime(s, s.TC));
    expect(s.result).toBe("INVALID");
    expect(s.corePayouts).toEqual([40, 35, 25]);
    for (const id of [0, 1, 2]) { s = topicMarketClaimCore(s, id); ledger(s); }
  });

  it("pays INVALID losing stake to an absolute-majority winner", () => {
    let s = graduated();
    s = topicMarketCoreStake(s, 0, "YES", 60);
    s = topicMarketCoreStake(s, 1, "NO", 15);
    s = topicMarketCoreStake(s, 2, "INVALID", 25);
    s = topicMarketFinalize(topicMarketAdvanceTime(s, s.TC));
    expect(s.result).toBe("YES");
    expect(s.corePayouts).toEqual([100, 0, 0]);
    for (const id of [0, 1, 2]) { s = topicMarketClaimCore(s, id); ledger(s); }
  });

  it("allocates the whole Core pool pro rata among multiple winning stakers", () => {
    let s = graduated();
    s = topicMarketCoreStake(s, 0, "NO", 200);
    s = topicMarketCoreStake(s, 1, "NO", 100);
    s = topicMarketCoreStake(s, 2, "YES", 100);
    s = topicMarketFinalize(topicMarketAdvanceTime(s, s.TC));
    expect(s.result).toBe("NO");
    expect(s.corePayouts[0]).toBeCloseTo(400 * 2 / 3, 8);
    expect(s.corePayouts[1]).toBeCloseTo(400 / 3, 8);
    expect(s.corePayouts[2]).toBe(0);
    ledger(s);
  });

  it("keeps Core and trading deadlines distinct and refunds tied Core stakes", () => {
    let s = graduated();
    s = topicMarketAdvanceTime(s, s.TG);
    expect(s.phase).toBe("FORMAL");
    rejectsUnchanged(s, () => topicMarketBuy(s, 0, 1));
    s = topicMarketFormalBuy(s, 0, "YES", 1);
    s = topicMarketAdvanceTime(s, s.TF);
    expect(s.phase).toBe("WAIT_CORE");
    s = topicMarketCoreStake(s, 0, "YES", 100);
    s = topicMarketCoreStake(s, 1, "NO", 100);
    rejectsUnchanged(s, () => topicMarketCoreStake(s, 0, "NO", 1));
    rejectsUnchanged(s, () => topicMarketFinalize(s));
    s = topicMarketAdvanceTime(s, s.TC-1);
    rejectsUnchanged(s, () => topicMarketFinalize(s));
    s = topicMarketAdvanceTime(s, s.TC);
    rejectsUnchanged(s, () => topicMarketCoreStake(s, 2, "YES", 1));
    s = topicMarketFinalize(s);
    expect(s.result).toBe("INVALID");
    for (const id of [0, 1]) {
      const wallet = s.accounts[id].wallet;
      s = topicMarketClaimCore(s, id);
      expect(s.accounts[id].wallet - wallet).toBeCloseTo(100, 8);
    }
    ledger(s);
  });
});
