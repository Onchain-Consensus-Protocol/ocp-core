import { describe, expect, it } from "vitest";
import {
  createDlpDemo, dlpCreate, dlpBuy, dlpFormalBuy, dlpCoreStake,
  dlpAdvanceTime, dlpFinalize, dlpTransferLP, dlpTransferB,
  dlpClaimLP, dlpClaimB, dlpClaim, dlpClaimCore, dlpClaimCoreOfficial,
  dlpClaimFees, dlpExitLP, dlpAddLP, dlpAccounting, dlpAssertLedger,
} from "./dlpDemoModel";

type State = ReturnType<typeof createDlpDemo>;
const active = () => dlpCreate(createDlpDemo());
const formal = () => {
  let s = active();
  for (let id = 0; id < 3; id++) s = dlpBuy(s, id, 9000);
  return s;
};
const terminal = (s: State, outcome: "YES" | "NO" | "INVALID" = "INVALID") => {
  if (outcome !== "INVALID") s = dlpCoreStake(s, 1, outcome, 100);
  return dlpFinalize(dlpAdvanceTime(s, s.TC));
};
const ledger = (s: State) => {
  dlpAssertLedger(s);
  expect(dlpAccounting(s).total).toBeCloseTo(30000, 7);
  expect(dlpAccounting(s).error).toBeCloseTo(0, 7);
  expect(s.lpSupply).toBeCloseTo(s.accounts.reduce((sum, a) => sum + a.lp, 0), 7);
};
const underlying = (s: State) => ({
  phase: s.phase, R: s.R, B: s.B, S: s.S, M0: s.M0, collateral: s.collateral,
  cash: s.cash, basis: s.basis, b: s.b, inventory: s.inventory,
  lpSupply: s.lpSupply, lpFees: s.lpFees, creatorFees: s.creatorFees,
  protocolFees: s.protocolFees, core: s.core, cover: s.cover,
  lpBudget: s.lpBudget, bBudget: s.bBudget, outcomeBudget: s.outcomeBudget,
  failedBudget: s.failedBudget, coreBudget: s.coreBudget,
  wallets: s.accounts.map(a => a.wallet), g: s.accounts.map(a => a.g),
  outcomes: s.accounts.map(a => [a.yes, a.no]),
});
const rejectsUnchanged = (s: State, action: () => unknown) => {
  const before = JSON.stringify(s);
  expect(action).toThrow();
  expect(JSON.stringify(s)).toBe(before);
  ledger(s);
};
const drain = (state: State) => {
  let s = state;
  for (let id = 0; id < 3; id++) {
    const a = s.accounts[id];
    if (a.lp > 0 || a.z > 0 || a.yes > 0 || a.no > 0 || a.g > 0) s = dlpClaim(s, id);
    if (s.phase === "SETTLED") s = dlpClaimCore(s, id);
    ledger(s);
  }
  if (s.creatorFees > 0) s = dlpClaimFees(s, "CREATOR", 1);
  if (s.protocolFees > 0) s = dlpClaimFees(s, "PROTOCOL", 2);
  if (s.coreOfficialBudget > 0) s = dlpClaimCoreOfficial(s, 2);
  ledger(s);
  expect(dlpAccounting(s).reserves).toBeCloseTo(0, 7);
  expect(dlpAccounting(s).wallets).toBeCloseTo(30000, 7);
  return s;
};

describe("DLP locked LP and independent transferable B burn rights", () => {
  it("moves LP rights while keeping every underlying asset and B ownership unchanged", () => {
    let s = dlpFormalBuy(formal(), 2, "YES", 80);
    const before = underlying(s), lp0 = s.accounts[0].lp, lp1 = s.accounts[1].lp;
    const z = s.accounts.map(a => a.z), amount = lp0 / 3;
    s = dlpTransferLP(s, 0, 1, amount);
    expect(s.accounts[0].lp).toBeCloseTo(lp0 - amount, 8);
    expect(s.accounts[1].lp).toBeCloseTo(lp1 + amount, 8);
    expect(s.accounts.map(a => a.z)).toEqual(z);
    expect(underlying(s)).toEqual(before);
    ledger(s);
  });

  it("moves B independently during Genesis and assigns future contributions to the new payer", () => {
    let s = dlpBuy(active(), 0, 100);
    const before = underlying(s), amount = s.accounts[0].z;
    s = dlpTransferB(s, 0, 1, amount);
    expect(s.accounts[0].z).toBe(0);
    expect(s.accounts[1].z).toBeCloseTo(4.5, 8);
    expect(underlying(s)).toEqual(before);
    s = dlpBuy(s, 0, 20);
    expect(s.accounts[0].z).toBeCloseTo(.9, 8);
    expect(s.accounts[1].z).toBeCloseTo(4.5, 8);
    ledger(s);
  });

  it("allows LP and B transfers while waiting for Core without reopening trading", () => {
    let s = formal();s = dlpAdvanceTime(s, s.TF);
    expect(s.phase).toBe("WAIT_CORE");
    const before = underlying(s);
    s = dlpTransferLP(s, 0, 1, s.accounts[0].lp / 2);
    s = dlpTransferB(s, 1, 2, s.accounts[1].z / 2);
    expect(underlying(s)).toEqual(before);
    ledger(s);
  });

  it("atomically rejects invalid quantities, overdraws and invalid recipient accounts", () => {
    const s = formal();
    for (const amount of [0, -1, NaN, Infinity, -Infinity]) {
      rejectsUnchanged(s, () => dlpTransferLP(s, 0, 1, amount));
      rejectsUnchanged(s, () => dlpTransferB(s, 0, 1, amount));
    }
    rejectsUnchanged(s, () => dlpTransferLP(s, 0, 1, s.accounts[0].lp + 1));
    rejectsUnchanged(s, () => dlpTransferB(s, 0, 1, s.accounts[0].z + 1));
    rejectsUnchanged(s, () => dlpTransferLP(s, 0, 99, 1));
    rejectsUnchanged(s, () => dlpTransferB(s, 0, -1, 1));
  });

  it("rejects LP transfer before graduation and B transfer before creation", () => {
    const genesis = dlpBuy(active(), 0, 100);
    rejectsUnchanged(genesis, () => dlpTransferLP(genesis, 0, 1, 1));
    rejectsUnchanged(createDlpDemo(), () => dlpTransferB(createDlpDemo(), 0, 1, 1));
  });

  it("locks LP underlying assets and disables additional LP in every former exit phase", () => {
    const f = formal();
    for (const s of [f, dlpAdvanceTime(f, f.TF), terminal(f)]) {
      const before = JSON.stringify(s);
      expect(() => dlpExitLP(s, 0, 1)).toThrow("LP_ASSETS_LOCKED");
      expect(() => dlpAddLP(s, 0, 1)).toThrow("LP_ADDITION_DISABLED");
      expect(JSON.stringify(s)).toBe(before);
      ledger(s);
    }
  });

  it("allows only terminal LP/B burns and rejects repeated or excessive burns", () => {
    const f = formal();
    rejectsUnchanged(f, () => dlpClaimLP(f, 0, 1));
    rejectsUnchanged(f, () => dlpClaimB(f, 0, 1));
    let s = terminal(f);
    for (const amount of [0, -1, NaN, Infinity]) {
      rejectsUnchanged(s, () => dlpClaimLP(s, 0, amount));
      rejectsUnchanged(s, () => dlpClaimB(s, 0, amount));
    }
    rejectsUnchanged(s, () => dlpClaimLP(s, 0, s.accounts[0].lp + 1));
    rejectsUnchanged(s, () => dlpClaimB(s, 0, s.accounts[0].z + 1));
    s = dlpClaimLP(s, 0, s.accounts[0].lp);
    s = dlpClaimB(s, 0, s.accounts[0].z);
    rejectsUnchanged(s, () => dlpClaimLP(s, 0, 1));
    rejectsUnchanged(s, () => dlpClaimB(s, 0, 1));
  });

  it("uses the original LP budget and denominator for partial burns", () => {
    let s = terminal(dlpFormalBuy(formal(), 2, "YES", 100), "YES");
    const budget = s.lpBudget, supply = s.lpClaimSupply, own = s.accounts[0].lp, wallet = s.accounts[0].wallet;
    s = dlpClaimLP(s, 0, own / 4);
    expect(s.accounts[0].wallet - wallet).toBeCloseTo(budget * own / supply / 4, 8);
    s = dlpClaimLP(s, 0, own / 4);
    s = dlpClaimLP(s, 0, s.accounts[0].lp);
    expect(s.accounts[0].wallet - wallet).toBeCloseTo(budget * own / supply, 8);
    expect(s.lpClaimSupply).toBe(supply);
    expect(s.accounts[0].lp).toBeCloseTo(0, 8);
    ledger(s);
  });

  it("uses the original B budget and denominator for partial burns", () => {
    let s = terminal(dlpFormalBuy(formal(), 2, "YES", 100), "YES");
    const budget = s.bBudget, supply = s.bClaimSupply, own = s.accounts[0].z, wallet = s.accounts[0].wallet;
    s = dlpClaimB(s, 0, own / 3);
    s = dlpClaimB(s, 0, own / 3);
    s = dlpClaimB(s, 0, s.accounts[0].z);
    expect(s.accounts[0].wallet - wallet).toBeCloseTo(budget * own / supply, 8);
    expect(s.bClaimSupply).toBe(supply);
    expect(s.accounts[0].z).toBeCloseTo(0, 8);
    ledger(s);
  });

  it("pays the same token entitlement independently of the LP/B claimant order", () => {
    const original = terminal(dlpFormalBuy(formal(), 2, "YES", 100), "NO");
    const run = (order: number[]) => {
      let s = original;
      for (const id of order) { s = dlpClaimLP(s, id, s.accounts[id].lp); s = dlpClaimB(s, id, s.accounts[id].z); ledger(s); }
      return s;
    };
    const first = run([0, 1, 2]), second = run([2, 0, 1]);
    first.accounts.forEach((a, i) => expect(a.wallet).toBeCloseTo(second.accounts[i].wallet, 8));
    expect(first.lpBudget).toBeCloseTo(0, 7);
    expect(first.bBudget).toBeCloseTo(0, 7);
  });

  it("transfers settled rights to the current holder and removes the former holder's claim", () => {
    let s = terminal(formal());
    const lp = s.accounts[0].lp, z = s.accounts[0].z;
    const expected = s.lpBudget * lp / s.lpClaimSupply + s.bBudget * z / s.bClaimSupply;
    s = dlpTransferLP(s, 0, 1, lp);
    s = dlpTransferB(s, 0, 1, z);
    rejectsUnchanged(s, () => dlpClaim(s, 0));
    rejectsUnchanged(s, () => dlpClaimLP(s, 0, lp));
    rejectsUnchanged(s, () => dlpClaimB(s, 0, z));
    const wallet = s.accounts[1].wallet;
    s = dlpClaimLP(s, 1, lp);
    s = dlpClaimB(s, 1, z);
    expect(s.accounts[1].wallet - wallet).toBeCloseTo(expected, 7);
    ledger(s);
  });

  it("lets an address claim again after receiving new LP/B tokens", () => {
    let s = terminal(formal());
    s = dlpClaim(s, 0);
    rejectsUnchanged(s, () => dlpClaim(s, 0));
    const lp = s.accounts[1].lp / 2, z = s.accounts[1].z / 2;
    const expected = s.lpBudget * lp / s.accounts.reduce((sum, a) => sum + a.lp, 0)
      + s.bBudget * z / s.accounts.reduce((sum, a) => sum + a.z, 0);
    s = dlpTransferLP(s, 1, 0, lp);
    s = dlpTransferB(s, 1, 0, z);
    const wallet = s.accounts[0].wallet;
    s = dlpClaim(s, 0);
    expect(s.accounts[0].wallet - wallet).toBeCloseTo(expected, 7);
    expect(s.accounts[0].lp).toBe(0);
    expect(s.accounts[0].z).toBe(0);
    ledger(s);
  });

  it("allows failed-market B transfer without transferring the Genesis R refund", () => {
    let s = dlpBuy(active(), 0, 100);
    s = dlpBuy(s, 1, 200);
    s = dlpAdvanceTime(s, s.TG);
    const z = s.accounts[0].z, g = s.accounts[0].g, R = s.failedBudget;
    s = dlpTransferB(s, 0, 2, z);
    expect(s.accounts[0].g).toBe(g);
    const wallet0 = s.accounts[0].wallet;
    s = dlpClaim(s, 0);
    expect(s.accounts[0].wallet - wallet0).toBeCloseTo(R * g / (g + s.accounts[1].g), 8);
    const wallet2 = s.accounts[2].wallet;
    s = dlpClaimB(s, 2, z);
    expect(s.accounts[2].wallet - wallet2).toBeCloseTo(4.5, 8);
    rejectsUnchanged(s, () => dlpTransferLP(s, 1, 2, 1));
    drain(s);
  });

  it("allows zero-value B rights to be transferred and burned after B covers all capital", () => {
    let s = dlpBuy(dlpCreate(createDlpDemo({ Q: 1, b: 150 })), 0, 30);
    s = dlpFormalBuy(s, 1, "YES", 20);
    s = dlpCoreStake(s, 2, "YES", 1);
    s = dlpFinalize(dlpAdvanceTime(s, s.TC));
    expect(s.bBudget).toBeCloseTo(0, 8);
    const z = s.accounts[0].z;
    s = dlpTransferB(s, 0, 1, z);
    const wallet = s.accounts[1].wallet;
    s = dlpClaimB(s, 1, z / 2);
    s = dlpClaimB(s, 1, s.accounts[1].z);
    expect(s.accounts[1].wallet).toBe(wallet);
    expect(s.accounts[1].z).toBe(0);
    ledger(s);
    drain(s);
  });

  for (const outcome of ["YES", "NO", "INVALID"] as const) {
    it(`fully conserves all wallets and custody after transfer/partial burn/wrapper claims: ${outcome}`, () => {
      let s = dlpFormalBuy(formal(), 2, "YES", 100);
      s = dlpTransferLP(s, 0, 1, s.accounts[0].lp / 3);
      s = dlpTransferB(s, 1, 2, s.accounts[1].z / 4);
      s = terminal(s, outcome);
      s = dlpClaimLP(s, 1, s.accounts[1].lp / 4);
      s = dlpClaimB(s, 2, s.accounts[2].z / 5);
      s = dlpTransferLP(s, 2, 0, s.accounts[2].lp / 2);
      s = dlpTransferB(s, 0, 1, s.accounts[0].z / 2);
      ledger(s);
      drain(s);
    });
  }
});
