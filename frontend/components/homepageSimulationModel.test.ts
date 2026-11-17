import { describe, expect, it } from "vitest";
import { assertHomepage, corePayout, homepageAdvance, homepageClaimCore, homepageClaimMarket,
  homepageCreate, homepageFinalize, homepageInitial, homepageStake, homepageTrade } from "./homepageSimulationModel";

describe("original homepage full lifecycle", () => {
  it("funds original Core seed stakes from the same demo wallets", () => {
    const s = homepageInitial(); assertHomepage(s);
    expect(s.market.externalCash).toBe(70);
    expect(s.market.R).toBe(0);
    expect(s.market.accounts[1].wallet).toBe(9960);
    expect(s.market.accounts[2].wallet).toBe(9970);
  });
  it("locks Core stake side and shares one wallet with Genesis trades", () => {
    let s = homepageCreate(homepageInitial());
    s = homepageStake(s, 0, "NO", 100);
    expect(() => homepageStake(s, 0, "YES", 1)).toThrow("SIDE_LOCKED");
    s = homepageTrade(s, 0, "YES", "BUY", 100).homepage;
    expect(s.market.accounts[0].wallet).toBe(9800);
    expect(s.market.R).toBeCloseTo(99);
    expect(s.market.externalCash).toBe(170);
    assertHomepage(s);
  });
  it("stops staking and trading at the same deadline and independently refunds failure", () => {
    let s = homepageInitial("FAILURE");
    s = homepageStake(s, 0, "YES", 10);
    s = homepageAdvance(s, 300);
    expect(s.market.phase).toBe("FAILED");
    expect(() => homepageStake(s, 0, "YES", 1)).toThrow("CLOSED");
    expect(() => homepageTrade(s, 0, "YES", "BUY", 1)).toThrow("CLOSED");
    s = homepageClaimMarket(s, 0);
    expect(s.result).toBeNull();
    expect(() => homepageClaimCore(s, 0)).toThrow("PHASE");
    s = homepageFinalize(s);
    s = homepageClaimCore(s, 0);
    expect(() => homepageClaimMarket(s, 0)).toThrow("CLAIMED");
    expect(() => homepageClaimCore(s, 0)).toThrow("CLAIMED");
    assertHomepage(s);
  });
  for (const side of ["YES", "NO", "INVALID"] as const) {
    it(`settles formal market and Core from one result (${side}) in either claim order`, () => {
      let s = homepageInitial("FORMAL");
      s = homepageStake(s, 0, side, side === "INVALID" ? 100 : 200);
      s = homepageTrade(s, 0, "YES", "BUY", 10).homepage;
      s = homepageAdvance(s, 300);
      expect(s.market.phase).toBe("WAIT_CORE");
      expect(s.result).toBeNull();
      s = homepageFinalize(s);
      expect(s.result).toBe(side);
      expect(s.market.result).toBe(side);
      expect(s.market.now).toBeGreaterThan(s.market.deadline);
      expect(() => homepageFinalize(s)).toThrow("PHASE");
      for (const i of [2, 0, 1]) {
        s = i === 0 ? homepageClaimCore(homepageClaimMarket(s, i), i) : homepageClaimMarket(homepageClaimCore(s, i), i);
        assertHomepage(s);
      }
      expect(s.market.R).toBeCloseTo(0, 7);
      expect(s.market.externalCash).toBeCloseTo(0, 7);
      expect(s.market.fees.capital).toBeCloseTo(0, 7);
    });
  }
  it("indexes Core fees only to capital present at the trade", () => {
    let s = homepageInitial("FORMAL");
    expect(s.core[0].fees.YES).toBe(0);
    s = homepageStake(s, 0, "YES", 100);
    const before = s.core[0].fees.YES;
    s = homepageTrade(s, 0, "NO", "BUY", 100).homepage;
    expect(s.core[0].fees.YES - before).toBeCloseTo(.7 * 100 / 140);
    expect(s.core[0].fees.INVALID).toBeCloseTo(.7 * 100 / 170);
    s = homepageFinalize(homepageAdvance(s, 300));
    const payout = corePayout(s, 0);
    expect(payout.principal).toBeCloseTo(170 * 100 / 140);
    assertHomepage(s);
  });
});
