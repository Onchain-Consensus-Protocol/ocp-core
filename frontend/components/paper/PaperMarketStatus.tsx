import React,{useEffect,useState} from 'react';
import type {PaperMarket} from '../../shared/paperTypes';
type Props={market:Pick<PaperMarket,'phase'|'result'|'R'|'rTarget'|'yesPrice'|'noPrice'>&Partial<Pick<PaperMarket,'serverNow'>>&{early?:Pick<NonNullable<PaperMarket['early']>,'requestId'|'requestedOutcome'|'processAfter'>};lang:'zh'|'en'};
const percent=(value:number)=>value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function PaperMarketStatus({market:m,lang}:Props){
 const [now,setNow]=useState(m.serverNow??0);
 useEffect(()=>{const base=m.serverNow??0;setNow(base);if(!m.early?.requestId)return;const start=Date.now(),timer=setInterval(()=>setNow(base+(Date.now()-start)/1000),1000);return()=>clearInterval(timer);},[m.serverNow,m.early?.requestId]);
 const t=(zh:string,en:string)=>lang==='zh'?zh:en;
 if(m.phase==='SETTLED')return <p className="text-sm font-bold">{t('最终结果','Final result')}: <span className={m.result==='YES'?'text-green-700':m.result==='NO'?'text-red-700':'text-amber-700'}>{m.result??'—'}</span></p>;
 if(m.phase==='FAILED')return <p className="text-sm text-slate-500">{t('未毕业 · 进入清算，正式市场未开启','Not graduated · Claim refunds; market never opened')}</p>;
 if(m.phase==='GENESIS')return <p className="text-sm">R {percent(Number(m.R)/Number(m.rTarget)*100)}%</p>;
 const seconds=Math.max(0,Math.ceil((m.early?.processAfter??0)-now));
 return <div className="space-y-2"><p className="text-sm"><span className="text-green-700">YES {percent(m.yesPrice*100)}%</span> · <span className="text-red-700">NO {percent(m.noPrice*100)}%</span></p>{m.early&&m.early.requestId>0&&<p className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-xs text-orange-800" data-testid="paper-card-early">{t('提前结算','Early settlement')} · {m.early.requestedOutcome} · {seconds===0?t('待处理','Action needed'):`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}</p>}</div>;
}
