import {describe, it, expect} from 'vitest';
import {stockCategories, referenceSymbol, filterStockMarkets} from './marketDirectory';
describe('testnet stock directory', () => {
  it('retains reference categories without inventing registered markets', () => {
    expect(stockCategories([])).toEqual(['TSLA','NVDA','AAPL','SPCX','GOOGL']);
    expect(filterStockMarkets([], [], 'TSLA', '')).toEqual([]);
    expect(referenceSymbol('SPCX')).toBe('SPACEX');
    expect(referenceSymbol('UNKNOWN')).toBeUndefined();
  });
  it('filters real markets by registered collateral and topic without mixing reference assets', () => {
    const stocks=[{address:'0xAbC',symbol:'TSLA'},{address:'0xDEF',symbol:'AMZN'}];
    const markets=[{stock:'0xabc',topic:'Tesla launch'},{stock:'0xdef',topic:'Earnings'},{stock:'0x999',topic:'Unregistered'}];
    expect(stockCategories(stocks)).toContain('AMZN');
    expect(filterStockMarkets(markets,stocks,'TSLA','')).toEqual([markets[0]]);
    expect(filterStockMarkets(markets,stocks,'NVDA','')).toEqual([]);
    expect(filterStockMarkets(markets,stocks,'all','amzn')).toEqual([markets[1]]);
    expect(filterStockMarkets(markets,stocks,'all','  LAUNCH ')).toEqual([markets[0]]);
  });
});
