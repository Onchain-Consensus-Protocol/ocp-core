import React from 'react';
import type {PaperMarket} from '../../shared/paperTypes';
type Props={market:Pick<PaperMarket,'phase'|'result'|'R'|'B'|'rTarget'|'bTarget'|'yesPrice'|'noPrice'>;lang:'zh'|'en'};
const percent=(value:number)=>value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function PaperMarketStatus({market:m,lang}:Props){
 const t=(zh:string,en:string)=>lang==='zh'?zh:en;
 if(m.phase==='SETTLED')return <p className="text-sm font-bold">{t('最终结果','Final result')}: <span className={m.result==='YES'?'text-green-700':m.result==='NO'?'text-red-700':'text-amber-700'}>{m.result??'—'}</span></p>;
 if(m.phase==='FAILED')return <p className="text-sm text-slate-500">{t('未毕业 · 进入清算，正式市场未开启','Not graduated · Claim refunds; market never opened')}</p>;
 if(m.phase==='GENESIS')return <p className="text-sm">R {percent(Number(m.R)/Number(m.rTarget)*100)}% · B {percent(Number(m.B)/Number(m.bTarget)*100)}%</p>;
 return <p className="text-sm"><span className="text-green-700">YES {percent(m.yesPrice*100)}%</span> · <span className="text-red-700">NO {percent(m.noPrice*100)}%</span></p>;
}
