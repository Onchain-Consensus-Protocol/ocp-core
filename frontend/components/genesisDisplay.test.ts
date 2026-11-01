import { describe, it, expect } from "vitest";
import { genesisTokens, genesisShares, genesisPrice, GENESIS_TOKEN_UNIT } from "./genesisDisplay";
import { createTopicMarketDemo, topicMarketCreate, topicMarketBuy, topicMarketQuoteSell } from "./topicMarketDemoModel";
describe("Genesis token denomination", () => {
  it("quotes the same real cash after converting displayed sell quantities", () => {
    const s = topicMarketBuy(topicMarketCreate(createTopicMarketDemo()), 0, 100);
    expect(GENESIS_TOKEN_UNIT).toBe(1);expect(genesisTokens(s.S)).toBe(s.S);
    const shares = s.accounts[0].g / 4;
    const before = topicMarketQuoteSell(s, shares);
    const after = topicMarketQuoteSell(s, genesisShares(genesisTokens(shares)));
    expect(after.net).toBeCloseTo(before.net, 10);
    expect(genesisPrice(2 * s.k * s.S)).toBe("19.8997487421");
    expect(genesisTokens(s.S) * (2 * s.k * s.S / GENESIS_TOKEN_UNIT)).toBeCloseTo(s.S * 2 * s.k * s.S, 8);
  });
});

it('matches raw 18-decimal contract quantities at kWad=1e12 without a display multiplier',async()=>{
  const {createStockDemo}=await import('./stockDemoRouting');
  const W=10n**18n,kWad=10n**12n,reserve=99n*W/100n;
  const sqrt=(n:bigint)=>{let x=n,y=(x+1n)/2n;while(y<x){x=y;y=(x+n/x)/2n;}return x;};
  const expected=sqrt(reserve*W*W/kWad);
  for(const stockPrice of [100,150,200,250]){
    const s=topicMarketBuy(topicMarketCreate(createStockDemo(stockPrice)),0,1);
    expect(s.k).toBe(1e-6);expect(s.Q).toBe(2000/stockPrice);
    expect(genesisTokens(s.S)).toBeCloseTo(Number(expected)/1e18,10);
    expect(genesisShares(1)).toBe(1);
    expect(Number(genesisPrice(2*s.k*s.S))).toBeCloseTo(Number(2n*kWad*expected/W)/1e18,9);
  }
});
