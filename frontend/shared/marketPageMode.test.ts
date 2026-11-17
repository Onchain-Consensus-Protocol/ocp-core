import {describe, it, expect} from 'vitest';
import {isMainnetMarketPage,marketViewHref} from './marketPageMode';
describe('separate simulation and mainnet entries', () => {
  it('keeps the normal market and existing bookmarks in simulation mode', () => {
    for (const path of ['/', '/explore.html']) {
      expect(isMainnetMarketPage(path, '?lang=zh')).toBe(false);
      expect(isMainnetMarketPage(path, '?market=existing&stock=TSLA')).toBe(false);
    }
  });
  it('enables onchain actions only for an explicit mainnet entry', () => {
    expect(isMainnetMarketPage('/market.html', '?lang=zh')).toBe(true);expect(isMainnetMarketPage('/degen.html', '?lang=zh')).toBe(true);
    expect(isMainnetMarketPage('/', '?mode=testnet')).toBe(false);
    expect(isMainnetMarketPage('/', '?mode=simulation')).toBe(false);
  });
});

it('preserves market selection when switching between independent views',()=>{expect(marketViewHref(true,'?market=0xabc&stock=TSLA&lang=en','zh')).toBe('/degen.html?market=0xabc&stock=TSLA&lang=zh');expect(marketViewHref(false,'?market=0xabc','en')).toBe('/market.html?market=0xabc&lang=en&view=full');});
