import React from 'react';
import type {TopicMarketEvent} from './topicMarketDemoModel';
import type {Language} from '../types';
import {config} from '../config';
const coreKinds=new Set(['CORE_STAKE','CORE_EXIT','CLAIM_CORE','CLAIM_FEES','CLAIM_CORE_OFFICIAL']);
export const recordsForTab=(events:TopicMarketEvent[],core:boolean)=>events.filter(e=>e.source?e.source===(core?'CORE':'MARKET'):coreKinds.has(e.kind)===core);
const short=(value:string)=>`${value.slice(0,8)}…${value.slice(-6)}`;
export function ActivityRecords({events,core,lang,symbol,names,onchain}:{events:TopicMarketEvent[];core:boolean;lang:Language;symbol:string;names:string[];onchain:boolean}){
  const t=(cn:string,en:string)=>lang==='zh'?cn:en;
  const labels:Record<string,string>={GENESIS_BUY:t('买入 gToken','Buy gToken'),GENESIS_SELL:t('卖出 gToken','Sell gToken'),FORMAL_BUY:t('买入份额','Buy shares'),FORMAL_SELL:t('卖出份额','Sell shares'),CORE_STAKE:t('质押','Stake'),CORE_EXIT:t('解除质押退款','Unstake refund'),CLAIM_CORE:t('领取 Core 结算款','Core withdrawal'),CLAIM_FEES:t('领取 Core 手续费','Core fee claim'),CLAIM:t('领取市场结算款','Market claim'),CLAIM_MARKET:t('领取市场结算款','Market claim'),MATERIALIZE_LP:t('领取 LP 代币','Receive LP tokens'),REDEEM_PAIRS:t('成对兑换','Pair redemption'),GRADUATE:t('毕业','Graduated'),FINALIZED:t('最终结算','Finalized'),CLOSED:t('阶段截止','Stage closed')};
  const rows=recordsForTab(events,core).slice().reverse();
  return <details><summary className="cursor-pointer">{core?t('质押记录','Stake history'):t('交易记录','Market activity')}</summary><div className="mt-3 max-h-64 overflow-auto text-[11px] space-y-3">
    {rows.length===0&&<p className="text-text-muted">{t('暂无记录','No records')}</p>}
    {rows.map(e=><div key={`${e.source??'demo'}:${e.id}`} className="border-b border-border pb-2 space-y-1">
      <div>{e.timestamp!==undefined?new Date(e.timestamp*1000).toLocaleString():`${Math.floor(e.at)}s`} · {labels[e.kind]??e.kind} {e.side} {e.amount!==undefined?`${e.amount.toLocaleString('en-US',{maximumFractionDigits:8})} ${symbol}`:''}</div>
      {onchain?<><div>{t('钱包','Wallet')}: {e.wallet?<a className="text-accent underline font-mono" title={e.wallet} href={`${config.explorer}/address/${e.wallet}`} target="_blank" rel="noreferrer">{short(e.wallet)}</a>:'—'}</div><div>{t('交易哈希','Transaction hash')}: {e.transactionHash?<a className="text-accent underline font-mono" title={e.transactionHash} href={`${config.explorer}/tx/${e.transactionHash}`} target="_blank" rel="noreferrer">{short(e.transactionHash)}</a>:'—'}</div></>:e.actor!==undefined?<div>{names[e.actor]}</div>:null}
    </div>)}
  </div></details>;
}
