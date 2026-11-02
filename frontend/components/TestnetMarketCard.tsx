import React from 'react';
import {MarketCard} from './MarketCard';
import {PaperMarketStatus} from './paper/PaperMarketStatus';
import type {MarketSummary} from '../testnet/chainClient';
import type {PaperMarket} from '../shared/paperTypes';
export function TestnetMarketCard({market:m,symbol,phaseLabel,lang,now,disabled,onClick}:{market:MarketSummary;symbol:string;phaseLabel:string;lang:'zh'|'en';now:number;disabled?:boolean;onClick:()=>void}){
 const t=(zh:string,en:string)=>lang==='zh'?zh:en;
 const phase=([ 'GENESIS','FORMAL','WAIT_CORE','SETTLED','FAILED'] as PaperMarket['phase'][])[m.phase??-1];
 const incomplete=!phase||(phase==='GENESIS'&&(m.R===undefined||m.rTarget===undefined))||(['FORMAL','WAIT_CORE'].includes(phase)&&m.priceYes===undefined);
 const status=incomplete?<p className="text-sm text-slate-500">{t('市场状态读取中…','Loading market status…')}</p>:<PaperMarketStatus lang={lang} market={{phase,result:m.outcome===1?'YES':m.outcome===2?'NO':m.outcome===3?'INVALID':null,R:String(m.R??0n),rTarget:String(m.rTarget??0n),yesPrice:Number(m.priceYes??0n)/1e18,noPrice:1-Number(m.priceYes??0n)/1e18,serverNow:now,early:m.earlyRequest?{requestId:Number(m.earlyRequest.requestId),requestedOutcome:m.earlyRequest.requestedOutcome===1?'YES':'NO',processAfter:Number(m.earlyRequest.processAfter)}:undefined}}/>;
 return <MarketCard symbol={symbol} phase={phaseLabel} title={m.topic} status={status} disabled={disabled} onClick={onClick} footer={<>{t('最终截止','Final deadline')} · {new Date(Number(m.coreCutoff)*1000).toLocaleString(lang==='zh'?'zh-CN':'en-US')}</>}/>;
}
