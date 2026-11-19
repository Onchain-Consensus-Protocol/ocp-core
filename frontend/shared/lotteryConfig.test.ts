import { describe, expect, it } from "vitest";
import { resolveLotteryApiUrl } from "./lotteryConfig";

const market = "https://market.ocp-protocol.org";

describe("lottery Keeper API configuration", () => {
  it.each([
    ["/keeper", market, `${market}/keeper/snapshot?round=1795348800`],
    ["https://keeper.example/", market, "https://keeper.example/snapshot?round=1795348800"],
    ["http://localhost:4646", market, "http://localhost:4646/snapshot?round=1795348800"],
    ["http://[::1]:4646", market, "http://[::1]:4646/snapshot?round=1795348800"],
  ])("resolves %s", (base, origin, expected) => {
    expect(resolveLotteryApiUrl(base, "snapshot?round=1795348800", origin)).toBe(expected);
  });

  it.each(["http://keeper.example", "https://user:pass@keeper.example", "javascript:alert(1)",
    "https://keeper.example/?token=secret", "https://keeper.example/#fragment", "https://:"])(
    "rejects invalid or insecure endpoint %s", base => {
      expect(resolveLotteryApiUrl(base, "report", market)).toBeNull();
    },
  );
});
