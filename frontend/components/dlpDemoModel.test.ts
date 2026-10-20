import { describe, expect, it } from "vitest";
import {
  createDlpDemo, dlpCreate, dlpBuy, dlpSell, dlpFormalBuy, dlpFormalSell,
  dlpExitLP, dlpCoreStake, dlpAdvanceTime, dlpClaim, dlpClaimCore,
  dlpClaimCoreOfficial, dlpClaimFees, dlpAccounting, dlpAssertLedger, dlpFinalize, dlpPrices,
  dlpFormalBuyBudget, dlpQuoteFormalBuyBudget, dlpTransferLP, dlpTransferB,
} from "./dlpDemoModel";

type State = ReturnType<typeof createDlpDemo>;
const ledger = (s: State) => {
  dlpAssertLedger(s);
  expect(dlpAccounting(s).error).toBeCloseTo(0, 7);
  expect(dlpAccounting(s).total).toBeCloseTo(30000, 7);
};
const active = () => dlpCreate(createDlpDemo());
const graduated = () => {
  let s = active();
  for (let i = 0; i < 3; i++) { s = dlpBuy(s, i, 9000); ledger(s); }
  return s;
};
const rejectsUnchanged = (s: State, action: () => unknown) => {
  const before = JSON.stringify(s);
  expect(action).toThrow();
  expect(JSON.stringify(s)).toBe(before);
  ledger(s);
};

describe("DLP homepage: independent full lifecycle and settlement", () => {
  it("starts without hidden Core stakes, virtual reserves or external capital", () => {
    const s = createDlpDemo();
    ledger(s);
    expect(dlpAccounting(s).wallets).toBe(30000);
    expect(dlpAccounting(s).reserves).toBe(0);
  });

  it("funds both directions of Genesis from the same wallets", () => {
    let s = dlpBuy(active(), 0, 100);
    ledger(s);
    s = dlpSell(s, 0, s.accounts[0].g);
    expect(s.accounts[0].wallet).toBeCloseTo(9989.3025, 7);
    expect(s.accounts[0].g).toBeCloseTo(0, 7);
    expect(s.accounts[0].z).toBeCloseTo(8.7525, 7);
    ledger(s);
  });

  it("reaches seller-triggered graduation through legal, funded holdings", () => {
    let s = dlpBuy(active(), 0, 9000);
    s = dlpBuy(s, 1, 8990);
    expect(s.phase).toBe("GENESIS");
    // R=17000.55, B=809.55. A small epsilon avoids binary float threshold ambiguity.
    const gross = (1200 - 809.55) / .045 + 1e-6;
    const supply = s.accounts.reduce((sum, a) => sum + a.g, 0);
    const sold = supply - Math.sqrt(supply * supply - gross);
    s = dlpSell(s, 0, sold);
    expect(s.phase).toBe("FORMAL");
    ledger(s);
    rejectsUnchanged(s, () => dlpBuy(s, 0, 1));
  });

  it("rejects nonfinite amounts, overdrafts and short-selling atomically", () => {
    const s = active();
    for (const amount of [NaN, Infinity, -Infinity, -1, 0, 10001]) {
      rejectsUnchanged(s, () => dlpBuy(s, 0, amount));
    }
    rejectsUnchanged(s, () => dlpSell(s, 0, 1));
    rejectsUnchanged(s, () => dlpCoreStake(s, 0, "YES", 1));
  });

  it("rejects nonfinite Formal, LP, Core and time inputs without mutation", () => {
    const s = dlpFormalBuy(graduated(), 0, "YES", 10);
    for (const amount of [NaN, Infinity, -Infinity, -1, 0]) {
      rejectsUnchanged(s, () => dlpFormalBuy(s, 0, "YES", amount));
      rejectsUnchanged(s, () => dlpFormalSell(s, 0, "YES", amount));
      rejectsUnchanged(s, () => dlpExitLP(s, 0, amount));
      rejectsUnchanged(s, () => dlpCoreStake(s, 0, "YES", amount));
    }
    for (const time of [NaN, Infinity, -Infinity, -1]) {
      rejectsUnchanged(s, () => dlpAdvanceTime(s, time));
    }
  });

  it("spends only the actual filled Formal budget and never mints beyond inventory", () => {
    let s = dlpBuy(dlpCreate(createDlpDemo({ Q: 1 })), 0, 30);
    const beforeWallet = s.accounts[1].wallet;
    const inventory = s.inventory[0];
    const quote = dlpQuoteFormalBuyBudget(s, "YES", 100);
    expect(quote.unused).toBeGreaterThan(0);
    expect(quote.quantity).toBe(inventory);
    s = dlpFormalBuyBudget(s, 1, "YES", 100);
    expect(beforeWallet - s.accounts[1].wallet).toBeCloseTo(quote.actual, 8);
    expect(s.accounts[1].yes).toBe(inventory);
    expect(s.inventory[0]).toBe(0);
    rejectsUnchanged(s, () => dlpFormalBuyBudget(s, 1, "YES", 1));
    ledger(s);
  });

  it("fails at the Genesis cutoff and independently pays R/S and B/z once", () => {
    let s = dlpBuy(active(), 0, 100);
    s = dlpSell(s, 0, s.accounts[0].g);
    s = dlpBuy(s, 1, 10);
    s = dlpAdvanceTime(s, 3600);
    expect(s.phase).toBe("FAILED");
    rejectsUnchanged(s, () => dlpBuy(s, 0, 1));
    s = dlpClaim(s, 0);
    expect(s.accounts[0].wallet).toBeCloseTo(9998.055, 7);
    s = dlpClaim(s, 1);
    expect(s.accounts[1].wallet).toBeCloseTo(9999.9, 7);
    rejectsUnchanged(s, () => dlpClaim(s, 0));
    rejectsUnchanged(s, () => dlpClaimCore(s, 0));
    ledger(s);
  });

  for (const result of ["YES", "NO", "INVALID"] as const) {
    it(`pays ${result} outcome, LP and B once without double-counting collateral`, () => {
      let s = graduated();
      s = dlpFormalBuy(s, 0, "YES", 100);
      s = dlpFormalBuy(s, 1, "NO", 70);
      if (result !== "INVALID") s = dlpCoreStake(s, 2, result, 200);
      ledger(s);
      rejectsUnchanged(s, () => dlpClaim(s, 0));
      rejectsUnchanged(s, () => dlpClaimCore(s, 2));
      s = dlpAdvanceTime(s, 7200);
      rejectsUnchanged(s, () => dlpFormalBuy(s, 0, "YES", 1));
      rejectsUnchanged(s, () => dlpFormalSell(s, 0, "YES", 1));
      rejectsUnchanged(s, () => dlpClaimCore(s, 2));
      s = dlpAdvanceTime(s, 10800);
      rejectsUnchanged(s, () => dlpCoreStake(s, 2, "YES", 1));
      s = dlpFinalize(s);
      expect(s.phase).toBe("SETTLED");
      expect(s.result).toBe(result);
      rejectsUnchanged(s, () => dlpFinalize(s));
      for (const id of [2, 0, 1]) {
        s = dlpClaim(s, id); ledger(s);
        rejectsUnchanged(s, () => dlpClaim(s, id));
      }
      if (result !== "INVALID") {
        s = dlpClaimCore(s, 2);
        rejectsUnchanged(s, () => dlpClaimCore(s, 2));
      }
      s = dlpClaimFees(s, "CREATOR", 1);
      if (s.protocolFees > 0) s = dlpClaimFees(s, "PROTOCOL", 2);
      if (s.coreOfficialBudget > 0) s = dlpClaimCoreOfficial(s, 2);
      ledger(s);
      expect(dlpAccounting(s).reserves).toBeCloseTo(0, 7);
    });
  }

  it("locks all LP assets while transferred LP and Core rights remain independent", () => {
    let s = graduated();
    s = dlpCoreStake(s, 0, "YES", 100);
    s = dlpCoreStake(s, 1, "NO", 50);
    const collateral = s.collateral;
    for (const id of [0, 1, 2]) rejectsUnchanged(s, () => dlpExitLP(s, id, s.accounts[id].lp));
    s = dlpTransferLP(s, 0, 1, s.accounts[0].lp);
    expect(s.collateral).toBe(collateral);
    s = dlpFinalize(dlpAdvanceTime(s, 10800));
    for (const id of [0, 1, 2]) { s = dlpClaim(s, id); ledger(s); }
    const wallet = s.accounts[0].wallet;
    s = dlpClaimCore(s, 0);
    expect(s.accounts[0].wallet - wallet).toBeCloseTo(150, 7);
    s = dlpClaimCore(s, 1);
    ledger(s);
  });

  it("preserves prices and pool assets during LP transfer without attaching B", () => {
    let s = dlpFormalBuy(graduated(), 0, "YES", 100);
    const before = s;
    const p = dlpPrices(s).probability![0];
    s = dlpTransferLP(s, 1, 2, s.accounts[1].lp / 2);
    expect(s.collateral).toBe(before.collateral);
    expect(s.M0).toBe(before.M0);
    expect(s.cash).toBe(before.cash);
    expect(s.lpFees).toBe(before.lpFees);
    expect(s.inventory).toEqual(before.inventory);
    expect(s.b).toBe(before.b);
    expect(s.accounts.map(a => a.z)).toEqual(before.accounts.map(a => a.z));
    expect(dlpPrices(s).probability![0]).toBeCloseTo(p, 9);
    ledger(s);
  });

  it("includes retained LP fees in terminal net loss after independent B transfer", () => {
    let s = dlpFormalBuy(graduated(), 0, "YES", 100);
    s = dlpTransferB(s, 1, 2, s.accounts[1].z / 2);
    s = dlpCoreStake(s, 2, "YES", 1);
    const B = s.B;
    const expectedLoss = Math.max(s.basis - s.cash - s.lpFees - s.inventory[0], 0);
    const withoutFees = Math.max(s.basis - s.cash - s.inventory[0], 0);
    expect(expectedLoss).toBeGreaterThan(0);
    expect(withoutFees - expectedLoss).toBeCloseTo(s.lpFees, 7);
    s = dlpFinalize(dlpAdvanceTime(s, 10800));
    expect(s.cover).toBeCloseTo(Math.min(B, expectedLoss), 7);
    expect(s.bBudget + s.cover).toBeCloseTo(B, 7);
    expect(s.inventory).toEqual([0, 0]);
    expect(s.collateral).toBe(0);
    ledger(s);
  });

  it("bounds an underfunded high-depth research scenario by actual B and leaves residual loss to LP", () => {
    // Explicit research configuration; default Q=2000,b=150 cannot exhaust B.
    let s = dlpBuy(dlpCreate(createDlpDemo({ Q: 1, b: 150 })), 0, 30);
    s = dlpFormalBuy(s, 1, "YES", 20);
    s = dlpCoreStake(s, 2, "YES", 1);
    const originalB = s.B;
    const nav = s.cash + s.lpFees + s.inventory[0];
    expect(s.basis - nav).toBeGreaterThan(originalB);
    s = dlpFinalize(dlpAdvanceTime(s, 10800));
    expect(s.cover).toBeCloseTo(originalB, 9);
    expect(s.bBudget).toBeCloseTo(0, 9);
    expect(s.lpBudget).toBeLessThan(s.basis);
    expect(s.outcomeBudget).toBeCloseTo(20, 9);
    for (const id of [0, 1]) { s = dlpClaim(s, id); ledger(s); }
    rejectsUnchanged(s, () => dlpClaim(s, 2));
  });

  it("does not cap B loss coverage by either LP or B token transfer fractions", () => {
    let s = dlpBuy(dlpCreate(createDlpDemo({ Q: 1, b: 150 })), 0, 30);
    s = dlpFormalBuy(s, 1, "YES", 20);
    s = dlpTransferLP(s, 0, 2, s.accounts[0].lp * .9);
    s = dlpTransferB(s, 0, 1, s.accounts[0].z * .9);
    s = dlpCoreStake(s, 2, "YES", 1);
    const B = s.B, loss = Math.max(s.basis - s.cash - s.lpFees - s.inventory[0], 0);
    s = dlpFinalize(dlpAdvanceTime(s, 10800));
    expect(s.cover).toBeCloseTo(Math.min(B, loss), 8);
    expect(s.bBudget).toBeCloseTo(B - Math.min(B, loss), 8);
    ledger(s);
  });

  it("charges real round-trip fees without creating additional outcome collateral", () => {
    let s = graduated();
    const M = s.M0;
    s = dlpFormalBuy(s, 0, "YES", 100);
    s = dlpFormalSell(s, 0, "YES", 100);
    expect(s.cash).toBeCloseTo(0, 8);
    expect(s.lpFees).toBeGreaterThan(0);
    expect(s.accounts[0].yes).toBeCloseTo(0, 8);
    expect(s.inventory[0]).toBeCloseTo(M, 8);
    expect(s.collateral).toBe(M);
    rejectsUnchanged(s, () => dlpClaimFees(s, "CREATOR", 0));
    s = dlpClaimFees(s, "CREATOR", 1);
    rejectsUnchanged(s, () => dlpClaimFees(s, "CREATOR", 1));
    s = dlpFinalize(dlpAdvanceTime(s, 10800));
    expect(s.cover).toBeCloseTo(0, 8);
    expect(s.lpBudget).toBeGreaterThan(M);
    ledger(s);
  });

  it("includes INVALID stakes in the absolute-majority denominator", () => {
    let s = graduated();
    s = dlpCoreStake(s, 0, "YES", 40);
    s = dlpCoreStake(s, 1, "NO", 35);
    s = dlpCoreStake(s, 2, "INVALID", 25);
    s = dlpFinalize(dlpAdvanceTime(s, 10800));
    expect(s.result).toBe("INVALID");
    expect(s.corePayouts).toEqual([40, 35, 25]);
    for (const id of [0, 1, 2]) { s = dlpClaimCore(s, id); ledger(s); }
  });

  it("pays INVALID losing stake to an absolute-majority winner", () => {
    let s = graduated();
    s = dlpCoreStake(s, 0, "YES", 60);
    s = dlpCoreStake(s, 1, "NO", 15);
    s = dlpCoreStake(s, 2, "INVALID", 25);
    s = dlpFinalize(dlpAdvanceTime(s, 10800));
    expect(s.result).toBe("YES");
    expect(s.corePayouts).toEqual([100, 0, 0]);
    for (const id of [0, 1, 2]) { s = dlpClaimCore(s, id); ledger(s); }
  });

  it("allocates the whole Core pool pro rata among multiple winning stakers", () => {
    let s = graduated();
    s = dlpCoreStake(s, 0, "NO", 200);
    s = dlpCoreStake(s, 1, "NO", 100);
    s = dlpCoreStake(s, 2, "YES", 100);
    s = dlpFinalize(dlpAdvanceTime(s, 10800));
    expect(s.result).toBe("NO");
    expect(s.corePayouts[0]).toBeCloseTo(400 * 2 / 3, 8);
    expect(s.corePayouts[1]).toBeCloseTo(400 / 3, 8);
    expect(s.corePayouts[2]).toBe(0);
    ledger(s);
  });

  it("keeps Core and trading deadlines distinct and refunds tied Core stakes", () => {
    let s = graduated();
    s = dlpAdvanceTime(s, 3600);
    expect(s.phase).toBe("FORMAL");
    rejectsUnchanged(s, () => dlpBuy(s, 0, 1));
    s = dlpFormalBuy(s, 0, "YES", 1);
    s = dlpAdvanceTime(s, 7200);
    expect(s.phase).toBe("WAIT_CORE");
    s = dlpCoreStake(s, 0, "YES", 100);
    s = dlpCoreStake(s, 1, "NO", 100);
    rejectsUnchanged(s, () => dlpCoreStake(s, 0, "NO", 1));
    rejectsUnchanged(s, () => dlpFinalize(s));
    s = dlpAdvanceTime(s, 10799);
    rejectsUnchanged(s, () => dlpFinalize(s));
    s = dlpAdvanceTime(s, 10800);
    rejectsUnchanged(s, () => dlpCoreStake(s, 2, "YES", 1));
    s = dlpFinalize(s);
    expect(s.result).toBe("INVALID");
    for (const id of [0, 1]) {
      const wallet = s.accounts[id].wallet;
      s = dlpClaimCore(s, id);
      expect(s.accounts[id].wallet - wallet).toBeCloseTo(100, 8);
    }
    ledger(s);
  });
});
