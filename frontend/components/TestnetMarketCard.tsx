import React,{useEffect,useState} from 'react';
import {GTokenTrend} from './GTokenTrend';
import type {ChainPriceHistory} from '../testnet/priceHistory';
import {MarketCard} from './MarketCard';
import {PaperMarketStatus} from './paper/PaperMarketStatus';
import type {MarketSummary} from '../testnet/chainClient';
import type {PaperMarket} from '../shared/paperTypes';
export function TestnetMarketCard({market:m,symbol,phaseLabel,lang,now,disabled,onClick,readHistory,readCachedHistory}:{market:MarketSummary;symbol:string;phaseLabel:string;lang:'zh'|'en';now:number;disabled?:boolean;onClick:()=>void;readHistory?:(address:string)=>Promise<ChainPriceHistory>;readCachedHistory?:(address:string)=>Promise<ChainPriceHistory|null|undefined>}){
 const [trend,setTrend]=useState<{address:string;prices:number[]}|null>(null);
 const [trendError,setTrendError]=useState(false);
 useEffect(()=>{
  if(![0,4].includes(m.phase??-1)||!readHistory)return;
  let cancelled=false;setTrendError(false);
  const apply=(history:ChainPriceHistory|null|undefined)=>{if(history&&!cancelled)setTrend({address:m.address,prices:history.genesis.map(p=>Number(p.price)/1e18)});};
  void (async()=>{try{apply(await readCachedHistory?.(m.address));}catch{/* Live read remains available. */}if(cancelled)return;try{apply(await readHistory(m.address));}catch{if(!cancelled)setTrendError(true);}})();
  return()=>{cancelled=true;};
 },[m.address,m.phase,m.R,readHistory,readCachedHistory]);
 const t=(zh:string,en:string)=>lang==='zh'?zh:en;
 const phase=([ 'GENESIS','FORMAL','WAIT_CORE','SETTLED','FAILED'] as PaperMarket['phase'][])[m.phase??-1];
 const incomplete=!phase||(phase==='GENESIS'&&(m.R===undefined||m.rTarget===undefined))||(['FORMAL','WAIT_CORE'].includes(phase)&&m.priceYes===undefined);
 const status=incomplete?<p className="text-sm text-slate-500">{t('市场状态读取中…','Loading market status…')}</p>:<PaperMarketStatus lang={lang} market={{phase,result:m.outcome===1?'YES':m.outcome===2?'NO':m.outcome===3?'INVALID':null,R:String(m.R??0n),rTarget:String(m.rTarget??0n),yesPrice:Number(m.priceYes??0n)/1e18,noPrice:1-Number(m.priceYes??0n)/1e18,serverNow:now,early:m.earlyRequest?{requestId:Number(m.earlyRequest.requestId),requestedOutcome:m.earlyRequest.requestedOutcome===1?'YES':'NO',processAfter:Number(m.earlyRequest.processAfter)}:undefined}}/>;
 return <MarketCard symbol={symbol} phase={phaseLabel} title={m.topic} status={status} trend={[0,4].includes(m.phase??-1)?<GTokenTrend prices={trend?.address===m.address?trend.prices:undefined} unit={symbol} lang={lang} error={trendError}/>:undefined} disabled={disabled} onClick={onClick} footer={<>{t('最终截止','Final deadline')} · {new Date(Number(m.coreCutoff)*1000).toLocaleString(lang==='zh'?'zh-CN':'en-US')}</>}/>;
}
