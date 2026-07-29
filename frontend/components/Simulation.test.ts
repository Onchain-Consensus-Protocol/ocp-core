import { describe, expect, it } from "vitest";
import {
  buildQuote,
  deriveOutcome,
  lmsrYesPrice,
  marketRedemption,
} from "./Simulation";

describe("OCP × Market simulation model", () => {
  it("matches the Vault absolute-majority outcome rule", () => {
    expect(deriveOutcome({ YES: 51, NO: 30, INVALID: 19 })).toBe("YES");
    expect(deriveOutcome({ YES: 30, NO: 51, INVALID: 19 })).toBe("NO");
    expect(deriveOutcome({ YES: 40, NO: 35, INVALID: 25 })).toBe("INVALID");
  });

  it("starts LMSR at 50/50 and moves the purchased side upward", () => {
    expect(lmsrYesPrice(0, 0)).toBeCloseTo(0.5, 10);
    const quote = buildQuote(10, { YES: 0, NO: 0 }, "YES", "BUY");
    expect(quote).not.toBeNull();
    expect(quote!.nextPrice).toBeGreaterThan(0.5);
    expect(quote!.fee).toBeCloseTo(quote!.gross * 0.012, 10);
    expect(quote!.cashFlow).toBeCloseTo(quote!.gross + quote!.fee, 10);
  });

  it("rejects sells above total outstanding shares", () => {
    expect(buildQuote(11, { YES: 10, NO: 0 }, "YES", "SELL")).toBeNull();
  });

  it("uses the production INVALID redemption rule", () => {
    const shares = { YES: 30, NO: 10 };
    expect(marketRedemption("YES", shares)).toBe(30);
    expect(marketRedemption("NO", shares)).toBe(10);
    expect(marketRedemption("INVALID", shares)).toBe(20);
  });
});
