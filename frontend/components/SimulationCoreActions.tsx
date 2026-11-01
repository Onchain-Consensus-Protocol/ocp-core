import React,{useState} from 'react';
import {Button} from './Button';
import type {Language} from '../types';
import {topicMarketCoreExit,topicMarketProposeEarly,topicMarketProcessEarly,topicMarketClaimEarlyBond,type Side,type TopicMarketState} from './topicMarketDemoModel';
export interface SimulationCoreLifecycle {
 bond:number;bondRefund:number;exitRefund:number;exitPenalty:number;
 request?:{id:number;side:Side;processAfter:number;reason:string;proposerLabel?:string};
 canExit:boolean;canPropose:boolean;canProcess:boolean;paused:boolean;
 exit:()=>void;propose:(side:Side,reason:string)=>void;process:()=>void;claimBond:()=>void;
}
export function buildLocalCoreLifecycle(s:TopicMarketState,id:number,run:(fn:(value:TopicMarketState)=>TopicMarketState)=>unknown):SimulationCoreLifecycle {
 const a=s.accounts[id],request=s.early?.pending,terminal=s.phase==='SETTLED'||s.phase==='FAILED';
 const paused=!!request&&s.now>=request.processAfter,open=s.core.openedAt!==null&&s.now<s.TC&&!terminal&&!paused;
 const penalty=Math.min(a.coreStake,Math.ceil(a.coreStake*1e18/10)/1e18);
 return {bond:s.early?.bond??500,bondRefund:a.bondRefund??0,exitRefund:a.coreStake-penalty,exitPenalty:penalty,
  request:request?{id:request.id,side:request.side,processAfter:request.processAfter,reason:request.reason,proposerLabel:`Player ${request.proposer+1}`}:undefined,
  canExit:open&&a.coreStake>0,canPropose:open&&!request&&s.core.yes+s.core.no+s.core.invalid>0&&s.now+3600<s.TC,
  canProcess:!!request&&s.now>=request.processAfter&&!terminal,paused,
  exit:()=>run(v=>topicMarketCoreExit(v,id)),propose:(side,reason)=>run(v=>topicMarketProposeEarly(v,id,side,reason)),process:()=>run(topicMarketProcessEarly),claimBond:()=>run(v=>topicMarketClaimEarlyBond(v,id))};
}
const format=(value:number)=>value.toLocaleString('en-US',{maximumFractionDigits:8});
export function SimulationEarlyNotice({lifecycle:l,now,lang,busy,connected,onConnect}:{lifecycle:SimulationCoreLifecycle;now:number;lang:Language;busy:boolean;connected:boolean;onConnect:()=>void}){
 if(!l.request)return null;
 const t=(cn:string,en:string)=>lang==='zh'?cn:en;
 const seconds=Math.max(0,Math.ceil(l.request.processAfter-now));
 const countdown=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
 return <section aria-label={t('提前结算申请公告','Early settlement notice')} className="max-w-6xl mx-auto mb-4 rounded-xl border border-border border-l-2 border-l-orange-400 bg-orange-400/[0.03] px-4 py-2.5" data-testid="simulation-early-notice">
  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs"><strong>{t('提前结算申请','Early settlement request')}</strong><span className={'rounded px-2 py-0.5 font-bold '+(l.request.side==='YES'?'bg-success/10 text-success':'bg-danger/10 text-danger')}>{t('方向：','Side: ')}{l.request.side}</span><span>{seconds>0?<>{t('确认期剩余','Confirmation ends in')} <span className="font-mono tabular-nums">{countdown}</span></>:t('确认期结束 · 等待玩家处理','Confirmation ended · Any player may process')}</span>
   {seconds===0&&<Button size="sm" variant="outline" className="ml-auto" disabled={busy||connected&&!l.canProcess} onClick={connected?l.process:onConnect}>{connected?t('执行结算检查','Check settlement'):t('登录后处理','Sign in to process')}</Button>}
   <details className="ml-auto"><summary className="cursor-pointer text-text-muted">{t('规则','Details')}</summary><p className="mt-2 max-w-xl leading-6">{seconds>0?t('确认期内，未到原截止时间的买卖、质押和解除质押仍可进行。到期后暂停这些操作，由任意玩家处理；处理者不需要再次交保证金。','During the window, trading, staking and unstaking remain available before their original deadlines. They pause when the window ends until any player processes the request, without posting another bond.'):t('处理时按确认期结束时已冻结的 Core 本金判断；匹配申请方向则结算并退还保证金，不匹配（含 INVALID）则罚没保证金。仅恢复原截止时间尚未到的操作。','Processing checks Core principal frozen at the end of the window. A match settles and makes the bond refundable; a mismatch, including INVALID, forfeits the bond. Only operations before their original deadlines resume.')}</p></details>
  </div>
  <div className="mt-2 text-xs space-y-1"><p>{t('发起玩家：','Proposer: ')}{l.request.proposerLabel??'—'}</p><p className="whitespace-pre-wrap break-words">{t('理由：','Reason: ')}{l.request.reason}</p></div>
 </section>;
}
export function SimulationCoreActions({lifecycle:l,lang,symbol,busy,connected,available,onConnect}:{lifecycle:SimulationCoreLifecycle;lang:Language;symbol:string;busy:boolean;connected:boolean;available:number;onConnect:()=>void}){
 const [side,setSide]=useState<Side>('YES'),[reason,setReason]=useState('');
 const t=(cn:string,en:string)=>lang==='zh'?cn:en;
 const row=(label:string,value:number)=><div className="flex justify-between gap-3"><span>{label}</span><strong className="text-right tabular-nums">{format(value)} {symbol}</strong></div>;
 return <div className="space-y-3 text-xs" data-testid="simulation-core-actions">
  <details className="rounded-xl border border-border p-4" data-testid="simulation-core-exit"><summary className="cursor-pointer font-bold">{t('解除质押','Unstake')}</summary><div className="space-y-3 mt-3">
   {row(t('退回本金','Principal refunded'),l.exitRefund)}{row(t('罚没本金','Penalty'),l.exitPenalty)}
   <p>{t('仅支持全仓退出：退还90%，罚没10%（原始单位向上取整），放弃全部历史条件手续费奖励。罚没资金不参与投票；重新质押可选新方向，但不会恢复已放弃的奖励。','Full exit only: refund 90%, forfeit 10% rounded up in native units, and abandon all historical conditional fee rewards. Penalties carry no votes. Re-entry may select a new side without restoring abandoned rewards.')}</p>
   {!l.canExit&&<p className="text-text-muted">{l.paused?t('确认期已到期，请先处理提前结算申请。','The confirmation window ended. Process the request first.'):t('当前没有可退出本金，或 Core 尚未开启／已截止。','There is no stake to exit, or Core has not opened or has closed.')}</p>}
   <Button variant="outline" disabled={busy||connected&&!l.canExit} onClick={connected?l.exit:onConnect}>{connected?t('确认解除全部质押','Confirm full unstake'):t('登录后操作','Sign in to continue')}</Button>
  </div></details>
  <details className="rounded-xl border border-border p-4" data-testid="simulation-early-request"><summary className="cursor-pointer font-bold">{t('提前结算申请','Early settlement request')}</summary><div className="space-y-3 mt-3">
   <p className="font-semibold">{t('保证金：500 虚拟USD等值','Bond: 500 virtual USD equivalent')}</p>{row(t('固定抵押代币金额','Fixed collateral amount'),l.bond)}
   <p>{t('任何玩家均可申请 YES 或 NO，不要求当前领先。确认期1小时且结束时间必须严格早于原 Core 截止；有本金时才可申请，一次仅一份，不可撤回。','Any player may propose YES or NO, including a non-leading side. The one-hour window must end strictly before the original Core cutoff. Principal must exist; only one request may be pending and it cannot be withdrawn.')}</p>
   {l.request?<p>{t('已有申请，等待确认期结束后处理。','A request is pending. Process it when its window ends.')}</p>:<><label className="block">{t('申请结果','Requested outcome')}<select className="block border border-border rounded p-2 w-full mt-1 bg-white" value={side} onChange={e=>setSide(e.target.value as Side)} disabled={busy}><option value="YES">YES</option><option value="NO">NO</option></select></label><label className="block">{t('申请原因','Reason')}<input className="block border border-border rounded p-2 w-full mt-1 bg-white" value={reason} maxLength={512} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
   {!l.canPropose&&<p className="text-text-muted">{t('Core须有活跃本金、尚未截止，并保留完整1小时确认期。','Core must have active principal and more than one hour before its original cutoff.')}</p>}
   {available<l.bond&&connected&&<p className="text-text-muted">{t('可用余额不足以支付保证金。','Insufficient available balance for the bond.')}</p>}
   <Button variant="outline" disabled={busy||connected&&(!l.canPropose||!reason.trim()||available<l.bond)} onClick={()=>connected?l.propose(side,reason.trim()):onConnect()}>{connected?t('提交提前结算申请','Submit early settlement request'):t('登录后申请','Sign in to propose')}</Button></>}
   <p className="text-text-muted">{t('股票数量按创建时500U等值固定；成功退还相同数量股票，失败加入股票赔付资金。USDG实际兑换金额随报价变化，模拟使用固定汇率。处理者不能指定结果，也无需 Keeper。','The stock quantity is fixed at creation using 500 USD. Success refunds the same stock quantity; failure funds stock payouts. USDG values follow swap quotes; simulations use fixed rates. The processing player cannot choose the result. No Keeper is required.')}</p>
   {l.bondRefund>0&&<><div>{row(t('可退保证金','Refundable bond'),l.bondRefund)}</div><Button disabled={busy||!connected} onClick={l.claimBond}>{t('领取退还保证金','Claim bond refund')}</Button></>}
  </div></details>
 </div>;
}
