import React from 'react';
import {Button} from './Button';
export function MarketSettlementNotice({failed,lang,connected,busy,onConnect,onProcess}:{failed:boolean;lang:'zh'|'en';connected:boolean;busy:boolean;onConnect:()=>void;onProcess:()=>void}){
 const t=(zh:string,en:string)=>lang==='zh'?zh:en;
 return <div role="status" data-testid="market-settlement-notice" className="max-w-6xl mx-auto mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-400/30 border-l-2 border-l-orange-400 bg-orange-400/5 px-4 py-3">
  <div className="text-xs"><strong className="text-accent">{failed?t('毕业失败 · 待清算','Funding failed · Settlement needed'):t('结果待结算','Final settlement needed')}</strong><span className="ml-3 text-text-muted">{failed?t('执行后开放退款。任何人均可处理。','Processing enables refunds. Anyone may process.'):t('一次交易完成结算及自动费用发放。任何人均可处理。','Settle and distribute fees in one transaction. Anyone may process.')}</span></div>
  <Button size="sm" disabled={busy} onClick={connected?onProcess:onConnect}>{!connected?t('连接钱包','Connect wallet'):failed?t('执行未毕业清算','Settle failed Genesis'):t('执行最终结算','Finalize settlement')}</Button>
 </div>;
}
