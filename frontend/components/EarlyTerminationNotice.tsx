import React from 'react';
import {Clock3} from 'lucide-react';
import {Button} from './Button';
import type {CoreLifecycle} from '../testnet/chainClient';
import type {Language} from '../types';

type Request = Pick<CoreLifecycle,'requestId'|'requestedOutcome'|'processAfter'>;
export function EarlyTerminationNotice({request,now,lang,connected,busy,onConnect,onProcess}: {
  request:Request;now:number;lang:Language;connected:boolean;busy:boolean;onConnect:()=>void;onProcess:()=>void;
}) {
  if(request.requestId===0n)return null;
  const zh=lang==='zh',t=(cn:string,en:string)=>zh?cn:en;
  const seconds=Math.max(0,Number(request.processAfter)-now),due=seconds===0;
  const countdown=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':');
  return <section role="region" aria-label={t('提前终止申请公告','Early resolution notice')} className="mb-4 rounded-xl border border-border border-l-2 border-l-orange-400 bg-orange-400/[0.03] px-4 py-2.5" data-testid="early-resolution-notice">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <div className="flex items-center gap-2"><Clock3 size={14} className="text-orange-400 shrink-0"/><span className="font-semibold">{t('提前终止申请','Early resolution')}</span><span aria-label={t('申请结果','Requested result')} className={'rounded px-1.5 py-0.5 font-mono font-bold '+(request.requestedOutcome===1?'bg-success/10 text-success':'bg-danger/10 text-danger')}>{request.requestedOutcome===1?'YES':'NO'}</span></div>
      <span className="text-text-muted">{due?t('窗口结束 · 待处理','Window ended · Action needed'):<>{t('剩余','Remaining')} <span className="font-mono tabular-nums text-text">{countdown}</span></>}</span>
      <div className="ml-auto flex items-center gap-3">
        {due&&<Button size="sm" variant="outline" className="shrink-0" aria-label={t('处理提前终止申请','Process early resolution')} disabled={busy} onClick={connected?onProcess:onConnect}>{busy?t('确认中…','Confirming…'):connected?t('处理申请','Process'):t('连接钱包并处理','Connect to process')}</Button>}
        <details className="relative"><summary className="cursor-pointer text-text-muted hover:text-text list-none">{t('规则','Details')}</summary><div className="absolute right-0 top-full mt-3 z-30 w-64 max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-white p-4 shadow-xl text-xs leading-relaxed"><p className="text-text-muted mb-2">{t('窗口结束','Window ends')}：{new Date(Number(request.processAfter)*1000).toLocaleString(zh?'zh-CN':'en-US')}</p><p>{due?t('Core 质押、解除质押及市场买卖已暂停。任何玩家均可处理：结果匹配则结算；不匹配则罚没保证金，尚未截止的操作恢复。处理者仅支付 gas，不需要保证金，也不能指定结果。','Core staking, unstaking and market trading are paused. Any player may process: a match settles; a mismatch forfeits the bond and reopens operations whose deadlines have not passed. The caller pays gas only and cannot choose the result.'):t('窗口期间，尚未截止的买卖、质押和解除质押仍可进行。窗口到期后暂停相关操作，等待任意玩家处理申请。','Until the window ends, trading, staking and unstaking remain available subject to their original deadlines. At the end they pause until any player processes the request.')}</p></div></details>
      </div>
    </div>
  </section>;
}
