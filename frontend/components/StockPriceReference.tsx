import React,{useEffect,useRef,useState} from 'react';
import {ExternalLink,ChevronDown} from 'lucide-react';
import {STOCK_QUOTE_TOKENS,selectStockQuote,stockChartUrl,type StockQuote} from '../shared/stockQuotes';

export function StockPriceReference({symbol,lang,compact=false}:{symbol:string;lang:'zh'|'en';compact?:boolean}){
 const zh=lang==='zh',t=(a:string,b:string)=>zh?a:b;
 const [quote,setQuote]=useState<StockQuote|null>(null),[fetchedAt,setFetchedAt]=useState(0),[failed,setFailed]=useState(false),[open,setOpen]=useState(false),[dark,setDark]=useState(()=>document.documentElement.dataset.ocpTheme==='dark'||document.documentElement.dataset.theme==='dark'||document.documentElement.classList.contains('dark'));
 const pair=useRef<string|undefined>(undefined);
 useEffect(()=>{
  const theme=()=>setDark(document.documentElement.dataset.ocpTheme==='dark'||document.documentElement.dataset.theme==='dark'||document.documentElement.classList.contains('dark'));
  const observer=new MutationObserver(theme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','data-ocp-theme']});return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  setQuote(null);setFailed(false);setFetchedAt(0);pair.current=undefined;
  const token=STOCK_QUOTE_TOKENS[symbol];if(!token){setFailed(true);return;}
  let stopped=false,busy=false;const controller=new AbortController();
  const load=async()=>{if(busy)return;busy=true;const timeout=new AbortController();const timer=window.setTimeout(()=>timeout.abort(),12000);const abort=()=>timeout.abort();controller.signal.addEventListener('abort',abort,{once:true});
   try{const response=await fetch(`https://api.dexscreener.com/token-pairs/v1/robinhood/${token}`,{signal:timeout.signal,credentials:'omit'});if(!response.ok)throw new Error('QUOTE_UNAVAILABLE');const next=selectStockQuote(await response.json(),symbol,pair.current);if(!next)throw new Error('NO_RELIABLE_POOL');if(!stopped){pair.current=next.pair;setQuote(next);setFetchedAt(Date.now());setFailed(false);}}
   catch{if(!stopped)setFailed(true);}finally{window.clearTimeout(timer);controller.signal.removeEventListener('abort',abort);busy=false;}
  };
  void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},30000);
  return()=>{stopped=true;controller.abort();window.clearInterval(timer);};
 },[symbol]);
 const money=(v:number)=>v.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
 if(compact)return <span className="mt-1 flex justify-between gap-x-2 text-[11px] leading-4 font-normal tabular-nums whitespace-nowrap"><span className="text-text">{quote?money(quote.price):failed?t('暂无行情','Unavailable'):'…'}</span>{quote?.change24h!==null&&quote&&<span className={quote.change24h>=0?'text-green-600':'text-red-600'}>{quote.change24h>=0?'+':''}{quote.change24h.toFixed(2)}% <span className="text-[10px]">24h</span></span>}{failed&&quote&&<span className="text-amber-600 text-[10px]">{t('更新失败','Update failed')}</span>}</span>;
 if(!open)return <section className="rounded-xl border border-border bg-white px-4 py-3 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1" aria-label={t('股票代币参考行情','Stock-token reference price')}><strong className="text-sm text-text">{quote?.symbol??symbol}</strong><span className="text-sm text-text tabular-nums">{quote?money(quote.price):failed?t('暂无行情','Unavailable'):'…'}</span>{quote&&quote.change24h!==null&&<span className={'text-xs '+(quote.change24h>=0?'text-green-600':'text-red-600')}>{quote.change24h>=0?'+':''}{quote.change24h.toFixed(2)}% 24h</span>}<span className="text-[10px] text-text-muted">{t('参考行情 · DEX Screener','Reference · DEX Screener')}</span><button type="button" className="ml-auto text-xs text-accent inline-flex items-center gap-1" onClick={()=>setOpen(true)} aria-expanded={false}>{t('查看走势','View chart')}<ChevronDown size={14}/></button></section>;
 return <section className="rounded-xl border border-border bg-white overflow-hidden mb-6" aria-label={t('股票代币参考行情','Stock-token reference price')}>
  <div className="p-4 sm:p-5">
   <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-text">{quote?.symbol??(symbol==='SPACEX'?'SPCX':symbol)} <span className="font-normal text-text-muted">{t('股票代币行情','stock-token price')}</span></h3><p className="text-[10px] text-text-muted mt-1">Robinhood Chain · {t('参考行情，不参与模拟定价或结算','Reference only; does not affect simulation prices or settlement')}</p></div><button type="button" className="p-1 text-text-muted" onClick={()=>setOpen(v=>!v)} aria-label={t(open?'收起走势图':'展开走势图',open?'Collapse chart':'Expand chart')} aria-expanded={open}><ChevronDown size={18} className={open?'':'rotate-180'}/></button></div>
   {quote?<><div className="flex flex-wrap items-baseline gap-3 mt-3"><strong className="text-2xl text-text tabular-nums">{money(quote.price)}</strong>{quote.change24h!==null&&<span className={'text-sm '+(quote.change24h>=0?'text-green-600':'text-red-600')}>{quote.change24h>=0?'+':''}{quote.change24h.toFixed(2)}% <span className="text-[10px]">24h</span></span>}</div><div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted mt-2"><span>Uniswap V3 · {quote.symbol}/{quote.quoteSymbol}</span><span>{t('流动性','Liquidity')} {money(quote.liquidity)}</span>{quote.volume24h!==null&&<span>24h {t('成交额','volume')} {money(quote.volume24h)}</span>}</div></>:<p role="status" className="text-xs text-text-muted mt-4">{failed?t('参考行情暂不可用，请稍后重试。','Reference price unavailable. Retrying shortly.'):t('正在加载链上股票代币行情…','Loading onchain stock-token prices…')}</p>}
   {failed&&quote&&<p role="status" className="text-xs text-amber-600 mt-2">{t('刷新失败，显示上次获取的数据。','Refresh failed; showing the last retrieved data.')}</p>}
  </div>
  {open&&quote&&<><iframe key={`${symbol}-${quote.pair}-${dark}`} title={`${quote.symbol} ${t('参考价格走势图','reference price chart')}`} src={stockChartUrl(quote,dark)} className="w-full h-[320px] sm:h-[380px] border-0" loading="lazy" referrerPolicy="no-referrer"/><p className="px-4 sm:px-5 pb-3 text-[10px] text-text-muted">{t('历史走势图由 DEX Screener 加载；若无法显示，可点击下方查看原始行情。','Historical chart loads from DEX Screener. If unavailable, open the source below.')}</p></>}
  {quote&&<div className="px-4 sm:px-5 py-3 border-t border-border flex flex-wrap justify-between gap-2 text-[10px] text-text-muted"><span>{t('来源：DEX Screener · 获取于','Source: DEX Screener · Retrieved')} {new Date(fetchedAt).toLocaleTimeString(zh?'zh-CN':'en-US',{hour12:false})}</span><a href={quote.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">{t('查看原始行情','View source')}<ExternalLink size={11}/></a></div>}
 </section>;
}
