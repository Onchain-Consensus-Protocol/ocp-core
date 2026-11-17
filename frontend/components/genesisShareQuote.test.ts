import { describe, expect, it } from "vitest";
import type { Contract } from "ethers";
import { budgetForGenesisShares, readGenesisCapitalBps, type GenesisBuyState } from "./genesisShareQuote";

const initial: GenesisBuyState = {virtualQuote: 9_000_000n, reserve: 0n, tokenReserve: 900_000_000n, cumulative: 0n, locked: 0n, gap: 42_000_000n};
const received = (s: GenesisBuyState, budget: bigint) => {
  const retained = budget * 9900n / 10000n;
  const r = retained > s.gap ? s.gap : retained;
  const curve = r - ((s.cumulative + r) * (s.capitalBps ?? 900n) / 9900n - s.locked);
  return s.tokenReserve * curve / (s.virtualQuote + s.reserve + curve);
};
describe("Genesis share input", () => {
  it("finds the minimum payable budget despite fee and share rounding", () => {
    for (const shares of [1n, 10n, 1_000_000n, 10_000_000n, 100_000_000n]) {
      const {budget} = budgetForGenesisShares(initial, shares);
      expect(received(initial, budget)).toBeGreaterThanOrEqual(shares);
      expect(received(initial, budget - 1n)).toBeLessThan(shares);
    }
  });
  it("reports the graduation limit instead of silently buying fewer shares", () => {
    const near = {...initial, reserve: 30_000_000n, tokenReserve: 208_000_000n, cumulative: 45_000_000n, locked: 45_000_000n * 900n / 9900n, gap: 459_000n};
    const {maximum, budget} = budgetForGenesisShares(near, 10_000_000n);
    expect(budget).toBe(0n);
    expect(maximum).toBeLessThan(10_000_000n);
    const last = budgetForGenesisShares(near, maximum);
    expect(received(near, last.budget)).toBeGreaterThanOrEqual(maximum);
    expect(received(near, last.budget - 1n)).toBeLessThan(maximum);
  });
  it("rejects zero quantity and closed fundraising", () => {
    expect(() => budgetForGenesisShares(initial, 0n)).toThrow();
    expect(() => budgetForGenesisShares({...initial, gap: 0n}, 1n)).toThrow();
  });
  it("preserves legacy 15% quotes while new markets use 9%", () => {
    const legacy = {...initial, capitalBps: 1500n};
    const shares = 100_000_000n;
    const oldQuote = budgetForGenesisShares(legacy, shares);
    const newQuote = budgetForGenesisShares(initial, shares);
    expect(oldQuote.budget).toBeGreaterThan(newQuote.budget);
    expect(received(legacy, oldQuote.budget)).toBeGreaterThanOrEqual(shares);
    expect(received(legacy, oldQuote.budget - 1n)).toBeLessThan(shares);
  });
  it("reads published ratios and falls back only for legacy empty calls", async () => {
    const contract = (read?: () => Promise<bigint>) => ({buyCapitalBps: read}) as unknown as Contract;
    await expect(readGenesisCapitalBps(contract(async () => 900n))).resolves.toBe(900n);
    await expect(readGenesisCapitalBps(contract())).resolves.toBe(1500n);
    const missing = Object.assign(new Error("missing selector"), {code: "CALL_EXCEPTION", data: "0x"});
    await expect(readGenesisCapitalBps(contract(async () => { throw missing; }))).resolves.toBe(1500n);
    const network = Object.assign(new Error("offline"), {code: "NETWORK_ERROR"});
    await expect(readGenesisCapitalBps(contract(async () => { throw network; }))).rejects.toBe(network);
    const reverted = Object.assign(new Error("contract reverted"), {code: "CALL_EXCEPTION", data: "0x12345678"});
    await expect(readGenesisCapitalBps(contract(async () => { throw reverted; }))).rejects.toBe(reverted);
  });
});
