import {describe,it,expect} from 'vitest';
import {STOCK_QUOTE_TOKENS,selectStockQuote,stockChartUrl} from './stockQuotes';
const valid={chainId:'robinhood',dexId:'uniswap',labels:['v3'],baseToken:{address:STOCK_QUOTE_TOKENS.TSLA},quoteToken:{address:'0x5fc5360d0400a0fd4f2af552add042d716f1d168',symbol:'USDG'},pairAddress:'0x1111111111111111111111111111111111111111',priceUsd:'300',liquidity:{usd:500000},priceChange:{h24:2},volume:{h24:100000}};
describe('reference stock quote boundaries',()=>{
 it('rejects same-symbol impostors, other chains, non-v3 pools, invalid prices and thin pools',()=>{
  for(const changed of [{baseToken:{address:'0x2222222222222222222222222222222222222222',symbol:'TSLA'}},{chainId:'ethereum'},{labels:['v4']},{priceUsd:'NaN'},{priceUsd:'0'},{liquidity:{usd:9999}},{baseToken:{address:12}},{pairAddress:'https://evil.example'}])expect(selectStockQuote([{...valid,...changed}],'TSLA')).toBeNull();
  expect(selectStockQuote({},'TSLA')).toBeNull();expect(selectStockQuote([valid],'UNKNOWN')).toBeNull();
 });
 it('keeps the selected valid pool stable, and builds only the provider URL in price mode',()=>{
  const other={...valid,pairAddress:'0x2222222222222222222222222222222222222222',liquidity:{usd:900000},url:'https://evil.example'};
  const q=selectStockQuote([other,valid],'TSLA',valid.pairAddress)!;
  expect(q.pair).toBe(valid.pairAddress);expect(q.url).toBe('https://dexscreener.com/robinhood/'+valid.pairAddress);
  expect(stockChartUrl(q,false)).toContain('chartType=price');expect(stockChartUrl(q,false)).toContain('loadChartSettings=0');
 });
});
