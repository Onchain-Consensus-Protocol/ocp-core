import { describe, it, expect } from "vitest";
import { genesisTokens, genesisShares, genesisPrice, GENESIS_TOKEN_UNIT } from "./genesisDisplay";
import { createDlpDemo, dlpCreate, dlpBuy, dlpQuoteSell } from "./dlpDemoModel";
describe("Genesis token denomination", () => {
  it("quotes the same real cash after converting displayed sell quantities", () => {
    const s = dlpBuy(dlpCreate(createDlpDemo()), 0, 100);
    const shares = s.accounts[0].g / 4;
    const before = dlpQuoteSell(s, shares);
    const after = dlpQuoteSell(s, genesisShares(genesisTokens(shares)));
    expect(after.net).toBeCloseTo(before.net, 10);
    expect(genesisPrice(2 * s.k * s.S)).toBe("0.0000019442");
    expect(genesisTokens(s.S) * (2 * s.k * s.S / GENESIS_TOKEN_UNIT)).toBeCloseTo(s.S * 2 * s.k * s.S, 8);
  });
});
