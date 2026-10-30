import { describe, expect, it } from "vitest";
import {
  createTopicMarketDemo, topicMarketCreate, topicMarketBuy, topicMarketFormalBuyBudget, topicMarketFormalSell,
  topicMarketQuoteFormalBuyBudget, topicMarketQuoteFormalSell, topicMarketCoreStake,
  topicMarketAdvanceTime, topicMarketFinalize, topicMarketClaim, topicMarketClaimCore, topicMarketClaimCoreOfficial,
  topicMarketClaimFees, topicMarketAccounting, topicMarketAssertLedger,
} from "./topicMarketDemoModel";

type State = ReturnType<typeof createTopicMarketDemo>;
const ledger = (s: State) => {
  topicMarketAssertLedger(s);
  expect(topicMarketAccounting(s).error).toBeCloseTo(0, 7);
  expect(topicMarketAccounting(s).total).toBeCloseTo(30000, 7);
};
const formal = () => {
  let s = topicMarketCreate(createTopicMarketDemo());
  for (let id = 0; id < 3; id++) s = topicMarketBuy(s, id, 9000);
  expect(s.phase).toBe("FORMAL");
  return s;
};
const finalize = (s: State) => topicMarketFinalize(topicMarketAdvanceTime(s, s.TC));
const trade = (s: State, budget = 100) => topicMarketFormalBuyBudget(s, 2, "YES", budget);

describe("TopicMarket Formal Core fee: historical conditional reward escrow", () => {
  it("preserves Genesis creator/project fees and routes Formal fees to LP/Core/B", () => {
    let s = formal();
    const before = s;
    expect(before.protocolFees).toBeCloseTo(81,8);
    expect(before.creatorFees).toBeCloseTo(189, 8);
    const q = topicMarketQuoteFormalBuyBudget(s, "YES", 100);
    expect(q.coreFee).toBeCloseTo(.7, 8);
    expect(q.fees.core).toBeCloseTo(.7, 8);
    expect(q.protocolFee).toBeCloseTo(q.gross*.003,8);
    expect(q.fees.protocol).toBeCloseTo(q.gross*.003,8);
    s = trade(s);
    expect(s.cash - before.cash).toBeCloseTo(98, 8);
    expect(s.lpFees - before.lpFees).toBeCloseTo(.5, 8);
    expect(s.creatorFees).toBe(before.creatorFees);
    expect(q.B).toBeCloseTo(.5, 8);
    expect(q.fees.B).toBeCloseTo(.5, 8);
    expect(q.contribution).toBe(0);
    expect(s.protocolFees).toBeCloseTo(before.protocolFees+q.protocolFee,8);
    expect(s.core.fees).toBeCloseTo(.7, 8);
    expect(s.core.feeTotal).toBeCloseTo(.7, 8);
    expect(s.core.cash).toBe(0);
    expect(s.core.yes + s.core.no + s.core.invalid).toBe(0);
    expect(s.B - before.B).toBeCloseTo(.5, 8);
    expect(s.accounts.map(a => a.z)).toEqual(before.accounts.map(a => a.z));
    expect(s.collateral).toBe(before.collateral);
    ledger(s);
  });

  it("routes 0.7 percent of sell gross to Core without treating it as principal", () => {
    let s = trade(formal());
    const before = s, tokens = s.accounts[2].yes / 2;
    const q = topicMarketQuoteFormalSell(s, "YES", tokens);
    expect(q.coreFee).toBeCloseTo(q.gross * .007, 8);
    expect(q.protocolFee).toBeCloseTo(q.gross*.003,8);
    s = topicMarketFormalSell(s, 2, "YES", tokens);
    expect(before.cash - s.cash).toBeCloseTo(q.gross, 8);
    expect(s.accounts[2].wallet - before.accounts[2].wallet).toBeCloseTo(q.gross * .98, 8);
    expect(s.core.fees - before.core.fees).toBeCloseTo(q.coreFee, 8);
    expect(s.protocolFees).toBeCloseTo(before.protocolFees+q.protocolFee,8);
    expect(s.core.cash).toBe(0);
    ledger(s);
  });

  it("does not let a later YES staker earn fees accrued before joining", () => {
    let s = trade(formal()); // No eligible stakers: this fee cannot be claimed later.
    s = topicMarketCoreStake(s, 0, "YES", 100);
    s = trade(s);
    expect(s.accounts[0].coreRewards[0]).toBeCloseTo(.7, 8);
    expect(s.core.officialRewards[0]).toBeCloseTo(.7, 8);
    s = finalize(s);
    expect(s.result).toBe("YES");
    expect(s.corePayouts[0]).toBeCloseTo(100.7, 8);
    expect(s.coreOfficialBudget).toBeCloseTo(0, 8);
    expect(s.coreBudget).toBeCloseTo(100.7, 8);
    ledger(s);
  });

  it("snapshots each fee using stake at that transaction rather than final stake", () => {
    let s = topicMarketCoreStake(formal(), 0, "YES", 100);
    s = trade(s);
    s = topicMarketCoreStake(s, 1, "YES", 100);
    s = trade(s);
    expect(s.accounts[0].coreRewards[0]).toBeCloseTo(1.05, 8);
    expect(s.accounts[1].coreRewards[0]).toBeCloseTo(.35, 8);
    s = finalize(s);
    expect(s.corePayouts[0]).toBeCloseTo(101.05, 8);
    expect(s.corePayouts[1]).toBeCloseTo(100.35, 8);
    expect(s.coreOfficialBudget).toBeCloseTo(0, 8);
    ledger(s);
  });

  for (const winner of ["YES", "NO"] as const) {
    it(`selects only the ${winner} conditional fee branch at settlement`, () => {
      let s = topicMarketCoreStake(formal(), 0, "YES", winner === "YES" ? 60 : 15);
      s = topicMarketCoreStake(s, 1, "NO", winner === "NO" ? 60 : 15);
      s = topicMarketCoreStake(s, 2, "INVALID", 25);
      s = topicMarketFormalBuyBudget(s, 0, "YES", 100);
      expect(s.accounts[0].coreRewards[0]).toBeCloseTo(.7, 8);
      expect(s.accounts[1].coreRewards[1]).toBeCloseTo(.7, 8);
      s = finalize(s);
      expect(s.result).toBe(winner);
      const id = winner === "YES" ? 0 : 1;
      expect(s.corePayouts[id]).toBeCloseTo(100.7, 8);
      expect(s.corePayouts.filter((_, i) => i !== id)).toEqual([0, 0]);
      expect(s.coreBudget).toBeCloseTo(100.7, 8); // Not 103: branches are mutually exclusive.
      ledger(s);
    });
  }

  it("refunds all INVALID principal but rewards only historical YES/NO stakes", () => {
    let s = topicMarketCoreStake(formal(), 0, "YES", 100);
    s = topicMarketCoreStake(s, 1, "NO", 100);
    s = topicMarketCoreStake(s, 2, "INVALID", 100);
    s = trade(s);
    expect(s.accounts[0].coreRewards[2]).toBeCloseTo(.35, 8);
    expect(s.accounts[1].coreRewards[2]).toBeCloseTo(.35, 8);
    expect(s.accounts[2].coreRewards[2]).toBe(0);
    s = finalize(s);
    expect(s.result).toBe("INVALID");
    expect(s.corePayouts[0]).toBeCloseTo(100.35, 8);
    expect(s.corePayouts[1]).toBeCloseTo(100.35, 8);
    expect(s.corePayouts[2]).toBeCloseTo(100, 8);
    expect(s.coreBudget).toBeCloseTo(300.7, 8);
    ledger(s);
  });

  it("keeps fee-only Core solvent when nobody ever stakes", () => {
    let s = finalize(trade(formal()));
    expect(s.result).toBe("INVALID");
    expect(s.corePayouts).toEqual([0, 0, 0]);
    expect(s.coreBudget).toBe(0);
    expect(s.coreOfficialBudget).toBeCloseTo(0, 8);
    expect(s.core.fees).toBe(0);
    expect(s.core.feeTotal).toBeCloseTo(.7, 8);
    for (let id = 0; id < 3; id++) { s = topicMarketClaimCore(s, id); ledger(s); }
    const wallet = s.accounts[2].wallet;
    if(s.coreOfficialBudget>0)s = topicMarketClaimCoreOfficial(s, 2);
    expect(s.accounts[2].wallet - wallet).toBeCloseTo(0, 8);
    expect(s.coreOfficialBudget).toBeCloseTo(0, 8);
    ledger(s);
  });

  it("does not reward INVALID-only stake with fees allocated to no eligible side", () => {
    let s = topicMarketCoreStake(formal(), 0, "INVALID", 100);
    s = trade(s);
    s = finalize(s);
    expect(s.result).toBe("INVALID");
    expect(s.corePayouts).toEqual([100, 0, 0]);
    expect(s.coreOfficialBudget).toBeCloseTo(0, 8);
    ledger(s);
  });

  it("blocks early claims, wrong official recipients and duplicate withdrawals", () => {
    let s = trade(formal());
    expect(() => topicMarketClaimCoreOfficial(s, 2)).toThrow();
    s = topicMarketCoreStake(s, 0, "YES", 100);
    s = trade(s);
    s = finalize(s);
    const frozen = JSON.stringify(s);
    expect(() => topicMarketClaimCoreOfficial(s, 0)).toThrow();
    expect(JSON.stringify(s)).toBe(frozen);
    if(s.coreOfficialBudget>0)s = topicMarketClaimCoreOfficial(s, 2);
    expect(() => topicMarketClaimCoreOfficial(s, 2)).toThrow();
    s = topicMarketClaimCore(s, 0);
    expect(() => topicMarketClaimCore(s, 0)).toThrow();
    ledger(s);
  });

  it("conserves all 30000 USDC after market, Core, Genesis and official claims", () => {
    let s = trade(formal());
    s = topicMarketCoreStake(s, 0, "YES", 100);
    s = trade(s);
    s = finalize(s);
    for (let id = 0; id < 3; id++) {
      s = topicMarketClaim(s, id);
      s = topicMarketClaimCore(s, id);
      ledger(s);
    }
    if(s.creatorFees>0)s = topicMarketClaimFees(s, "CREATOR", 1);
    if (s.protocolFees > 0) s = topicMarketClaimFees(s, "PROTOCOL", 2);
    if(s.coreOfficialBudget>0)s = topicMarketClaimCoreOfficial(s, 2);
    ledger(s);
    expect(topicMarketAccounting(s).reserves).toBeCloseTo(0, 7);
    expect(topicMarketAccounting(s).wallets).toBeCloseTo(30000, 7);
  });
});
