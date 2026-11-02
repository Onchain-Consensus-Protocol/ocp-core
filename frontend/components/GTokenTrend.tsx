import React from 'react';
import {genesisPrice} from './genesisDisplay';
/** Native-token prices only; never synthesize missing history. */
export function GTokenTrend({prices,unit,lang,error=false}:{prices?:number[];unit:string;lang:'zh'|'en';error?:boolean}){
 const t=(zh:string,en:string)=>lang==='zh'?zh:en;
 const values=prices?.filter(Number.isFinite);
 const last=values?.at(-1);
 const low=values?.length?Math.min(...values):0,high=values?.length?Math.max(...values):0;
 const line=values?.map((v,i)=>`${4+i/Math.max(1,values.length-1)*292},${high===low?29:52-(v-low)/(high-low)*46}`).join(' ');
 return <div className="space-y-2" data-testid="gtoken-card-trend"><div className="flex flex-wrap justify-between gap-2 text-xs"><span className="text-slate-500">{t('gToken 价格趋势','gToken price trend')}</span>{last!==undefined&&<strong className="font-mono">{genesisPrice(last)} {unit}{t('／枚','/token')}</strong>}</div>{values&&values.length>1?<svg viewBox="0 0 300 58" className="block w-full h-14" role="img" aria-label={t('gToken 历史价格走势','gToken historical prices')}><polyline points={line} fill="none" stroke="currentColor" className="text-orange-500" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>:<p className="text-xs text-slate-500">{values?t('暂无成交走势','No trade history yet'):error?t('价格走势暂不可用','Price history unavailable'):t('价格走势读取中…','Loading price history…')}</p>}</div>;
}
