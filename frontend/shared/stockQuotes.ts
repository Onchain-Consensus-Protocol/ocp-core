// Canonical Robinhood Chain assets, checked against api.robinhood.com/rhj/assets.
// Reference display only: never feed these quotes into simulation balances or settlement.
export const STOCK_QUOTE_TOKENS:Record<string,string>={
 TSLA:'0x322f0929c4625ed5bad873c95208d54e1c003b2d',
 NVDA:'0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec',
 AAPL:'0xaf3d76f1834a1d425780943c99ea8a608f8a93f9',
 GOOGL:'0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3',
 SPACEX:'0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea',
};
const USDG='0x5fc5360d0400a0fd4f2af552add042d716f1d168';
export interface StockQuote {pair:string;symbol:string;quoteSymbol:string;price:number;change24h:number|null;liquidity:number;volume24h:number|null;url:string}
const numeric=(v:unknown)=>typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number(v):NaN;
export function selectStockQuote(data:unknown,symbol:string,previousPair?:string):StockQuote|null {
 const token=STOCK_QUOTE_TOKENS[symbol];if(!token||!Array.isArray(data))return null;
 const candidates=data.filter(p=>p&&p.chainId==='robinhood'&&p.dexId==='uniswap'&&Array.isArray(p.labels)&&p.labels.includes('v3')&&
  typeof p.baseToken?.address==='string'&&p.baseToken.address.toLowerCase()===token&&typeof p.pairAddress==='string'&&/^0x[0-9a-f]{40}$/i.test(p.pairAddress)&&
  Number.isFinite(numeric(p.priceUsd))&&numeric(p.priceUsd)>0&&Number.isFinite(numeric(p.liquidity?.usd))&&numeric(p.liquidity.usd)>=10000);
 candidates.sort((a,b)=>Number(String(b.quoteToken?.address).toLowerCase()===USDG)-Number(String(a.quoteToken?.address).toLowerCase()===USDG)||numeric(b.liquidity.usd)-numeric(a.liquidity.usd));
 const p=candidates.find(p=>p.pairAddress.toLowerCase()===previousPair?.toLowerCase())??candidates[0];if(!p)return null;
 const pair=p.pairAddress.toLowerCase(),change=numeric(p.priceChange?.h24),volume=numeric(p.volume?.h24);
 return {pair,symbol:symbol==='SPACEX'?'SPCX':symbol,quoteSymbol:typeof p.quoteToken?.symbol==='string'?p.quoteToken.symbol:'',price:numeric(p.priceUsd),change24h:Number.isFinite(change)?change:null,liquidity:numeric(p.liquidity.usd),volume24h:Number.isFinite(volume)&&volume>=0?volume:null,url:`https://dexscreener.com/robinhood/${pair}`};
}
export function stockChartUrl(quote:StockQuote,dark:boolean){
 const theme=dark?'dark':'light';
 return `${quote.url}?${new URLSearchParams({embed:'1',loadChartSettings:'0',trades:'0',info:'0',chartLeftToolbar:'0',theme,chartTheme:theme,chartStyle:'2',interval:'60',chartType:'price'})}`;
}
