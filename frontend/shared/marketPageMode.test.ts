import {describe, it, expect} from 'vitest';
import {isMainnetMarketPage,marketViewHref} from './marketPageMode';
describe('separate simulation and mainnet entries', () => {
  it('uses the mainnet market on the market domain root', () => {
    expect(isMainnetMarketPage('/', 'market.ocp-protocol.org')).toBe(true);
    expect(isMainnetMarketPage('/', 'ocp-protocol.org')).toBe(false);
  });

  it('keeps explicit simulation and mainnet pages separate', () => {
    const hostname = 'market.ocp-protocol.org';
    expect(isMainnetMarketPage('/explore.html', hostname)).toBe(false);
    expect(isMainnetMarketPage('/market.html', hostname)).toBe(true);
    expect(isMainnetMarketPage('/degen.html', hostname)).toBe(true);
    expect(isMainnetMarketPage('/testnet.html', hostname)).toBe(false);
  });
});

it('preserves market selection when switching between independent views',()=>{expect(marketViewHref(true,'?market=0xabc&stock=TSLA&lang=en','zh')).toBe('/degen.html?market=0xabc&stock=TSLA&lang=zh');expect(marketViewHref(false,'?market=0xabc','en')).toBe('/market.html?market=0xabc&lang=en&view=full');});
