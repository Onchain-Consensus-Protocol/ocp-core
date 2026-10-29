import {describe, it, expect} from 'vitest';
import {isTestnetMarketPage} from './marketPageMode';
describe('separate simulation and testnet entries', () => {
  it('keeps the normal market and existing bookmarks in simulation mode', () => {
    for (const path of ['/', '/explore.html']) {
      expect(isTestnetMarketPage(path, '?lang=zh')).toBe(false);
      expect(isTestnetMarketPage(path, '?market=existing&stock=TSLA')).toBe(false);
    }
  });
  it('enables onchain actions only for an explicit testnet entry', () => {
    expect(isTestnetMarketPage('/testnet.html', '?lang=zh')).toBe(true);
    expect(isTestnetMarketPage('/', '?mode=testnet')).toBe(true);
    expect(isTestnetMarketPage('/', '?mode=simulation')).toBe(false);
  });
});
