import type {StockState, MarketSummary} from './chainClient';
const referenceStocks = ['TSLA', 'NVDA', 'AAPL', 'SPCX', 'GOOGL', 'ANT'];
const referenceSymbols: Record<string, string> = {ANT:'ANT', TSLA:'TSLA', NVDA:'NVDA', AAPL:'AAPL', SPCX:'SPACEX', GOOGL:'GOOGL', MSFT:'MSFT', AMZN:'AMZN', TSM:'TSM', META:'META'};
// Reference categories do not register assets or grant trading permissions on mainnet.
export function stockCategories(stocks: Pick<StockState, 'symbol'>[]): string[] {
  return [...new Set([...referenceStocks, ...stocks.map(stock => stock.symbol)])];
}
export function referenceSymbol(symbol: string): string | undefined {return referenceSymbols[symbol];}
export function filterStockMarkets<T extends Pick<MarketSummary, 'stock' | 'topic'>>(markets: T[], stocks: Pick<StockState, 'address' | 'symbol'>[], category: string, query: string): T[] {
  const symbols = new Map(stocks.map(stock => [stock.address.toLowerCase(), stock.symbol]));
  const search = query.trim().toLocaleLowerCase();
  return markets.filter(market => {
    const symbol = symbols.get(market.stock.toLowerCase()) ?? '';
    return (category === 'all' || symbol === category) && (!search || `${market.topic} ${symbol}`.toLocaleLowerCase().includes(search));
  });
}
