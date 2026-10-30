import React from 'react';
import {AlertTriangle} from 'lucide-react';
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
  return <section role="region" aria-label={t('提前终止申请公告','Early resolution notice')} className="mb-5 rounded-2xl border-2 border-orange-500 bg-orange-500/10 p-4 sm:p-6 shadow-lg shadow-orange-500/10" data-testid="early-resolution-notice">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0"><div className="flex items-center gap-2 font-bold text-orange-500 text-lg"><AlertTriangle size={22} className="shrink-0"/>{t('有人申请提前终止市场','Early resolution requested')}</div>
        <p className="mt-2 text-xl font-bold">{t('申请结果','Requested result')}：<span className={request.requestedOutcome===1?'text-success':'text-danger'}>{request.requestedOutcome===1?'YES':'NO'}</span></p>
        <p className="mt-2 text-sm font-bold">{due?t('窗口已结束 · 等待玩家处理','Window ended · Awaiting player action'):t('申请窗口倒计时','Request window remaining')} {!due&&<span className="font-mono tabular-nums">{countdown}</span>}</p>
        <p className="mt-1 text-xs text-text-muted">{t('窗口结束','Window ends')}：{new Date(Number(request.processAfter)*1000).toLocaleString(zh?'zh-CN':'en-US')}</p>
      </div>
      {due&&<Button className="shrink-0 w-full sm:w-auto" disabled={busy} onClick={connected?onProcess:onConnect}>{busy?t('等待交易确认…','Awaiting confirmation…'):connected?t('处理提前终止申请','Process early resolution'):t('连接钱包并处理','Connect wallet to process')}</Button>}
    </div>
    <p className="mt-3 text-sm leading-relaxed">{due?t('Core 质押、解除质押及市场买卖已暂停。任何玩家均可处理：结果匹配则结算；不匹配则罚没保证金，尚未截止的操作恢复。处理者仅支付 gas，不需要保证金，也不能指定结果。','Core staking, unstaking and market trading are paused. Any player may process: a match settles; a mismatch forfeits the bond and reopens operations whose deadlines have not passed. The caller pays gas only and cannot choose the result.'):t('窗口期间，尚未截止的买卖、质押和解除质押仍可进行。窗口到期后暂停相关操作，等待任意玩家处理申请。','Until the window ends, trading, staking and unstaking remain available subject to their original deadlines. At the end they pause until any player processes the request.')}</p>
  </section>;
}
