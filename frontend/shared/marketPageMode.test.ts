import {describe, it, expect} from 'vitest';
import {isTestnetMarketPage,marketViewHref} from './marketPageMode';
describe('separate simulation and testnet entries', () => {
  it('keeps the normal market and existing bookmarks in simulation mode', () => {
    for (const path of ['/', '/explore.html']) {
      expect(isTestnetMarketPage(path, '?lang=zh')).toBe(false);
      expect(isTestnetMarketPage(path, '?market=existing&stock=TSLA')).toBe(false);
    }
  });
  it('enables onchain actions only for an explicit testnet entry', () => {
    expect(isTestnetMarketPage('/testnet.html', '?lang=zh')).toBe(true);expect(isTestnetMarketPage('/degen.html', '?lang=zh')).toBe(true);
    expect(isTestnetMarketPage('/', '?mode=testnet')).toBe(true);
    expect(isTestnetMarketPage('/', '?mode=simulation')).toBe(false);
  });
});

it('preserves market selection when switching between independent views',()=>{expect(marketViewHref(true,'?market=0xabc&stock=TSLA&lang=en','zh')).toBe('/degen.html?market=0xabc&stock=TSLA&lang=zh');expect(marketViewHref(false,'?market=0xabc','en')).toBe('/testnet.html?market=0xabc&lang=en');});
