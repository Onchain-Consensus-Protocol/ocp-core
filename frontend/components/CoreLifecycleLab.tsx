import React,{useState} from 'react';
import {Button} from './Button';
import {SimulationCoreActions,SimulationEarlyNotice,buildLocalCoreLifecycle} from './SimulationCoreActions';
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketCoreStake,topicMarketAdvanceTime,type TopicMarketState} from './topicMarketDemoModel';
import type {Language} from '../types';
export function createCoreLifecycleLab(){
 let s=topicMarketBuy(topicMarketCreate(createTopicMarketDemo({Q:1,k:1,TC:21600})),0,10);
 s=topicMarketCoreStake(s,0,'YES',100);s=topicMarketCoreStake(s,1,'NO',60);return topicMarketCoreStake(s,2,'INVALID',20);
}
/** Local-only rules experiment, driven by the same model as the simulation and paper server. */
export function CoreLifecycleLab({lang}:{lang:Language}){
 const [state,setState]=useState(createCoreLifecycleLab),[actor,setActor]=useState(0),[error,setError]=useState('');
 const t=(cn:string,en:string)=>lang==='zh'?cn:en;
 const run=(fn:(s:TopicMarketState)=>TopicMarketState)=>{try{setState(fn(state));setError('');}catch(e){setError(t('当前操作不可执行：','Action unavailable: ')+(e instanceof Error?e.message:String(e)));}};
 const lifecycle=buildLocalCoreLifecycle(state,actor,run),total=state.core.yes+state.core.no+state.core.invalid;
 return <div className="mt-6 rounded-2xl border border-border bg-white p-5 space-y-4" data-testid="core-lifecycle-lab">
  <h3 className="text-lg font-bold">{t('退出与提前结算实验','Exit and early settlement lab')}</h3><p className="text-xs leading-6 text-text-muted">{t('独立本地实验，以虚拟USD作抵押单位，保证金500。只有此实验允许推进时间；多人市场按服务器真实时间运行。先选择玩家，可尝试退出、换边重进、申请非领先方向，以及等待确认期后由其他玩家处理。','Independent local experiment with virtual USD collateral and a 500-unit bond. Only this lab allows time advancement; multiplayer markets follow real server time. Select a player to try exit, re-entry, a non-leading proposal and processing by another player after the window.')}</p>
  <div className="flex flex-wrap items-center gap-3 text-xs"><label>{t('操作玩家','Acting player')} <select aria-label={t('实验玩家','Lab player')} className="border border-border rounded p-2" value={actor} onChange={e=>setActor(Number(e.target.value))}>{[0,1,2].map(id=><option key={id} value={id}>{t('玩家','Player')} {id+1}</option>)}</select></label><span>{t('余额','Balance')} {state.accounts[actor].wallet.toFixed(2)} USD</span><span>YES {state.core.yes.toFixed(2)} / NO {state.core.no.toFixed(2)} / INVALID {state.core.invalid.toFixed(2)}</span><span>{t('结果','Result')}: {state.result??(total>0?(state.core.yes>total/2?'YES':state.core.no>total/2?'NO':'INVALID'):'—')}</span></div>
  <SimulationEarlyNotice lifecycle={lifecycle} now={state.now} lang={lang} busy={false} connected onConnect={()=>{}}/>
  <div className="flex flex-wrap gap-2">{(['YES','NO','INVALID'] as const).map(side=><Button key={side} size="sm" variant="outline" disabled={state.phase==='SETTLED'||lifecycle.paused} onClick={()=>run(s=>topicMarketCoreStake(s,actor,side,25))}>{t('质押','Stake')} 25 {side}</Button>)}<Button size="sm" variant="outline" onClick={()=>run(s=>topicMarketAdvanceTime(s,Math.min(s.TC,s.now+3600)))}>{t('推进1小时（仅本实验）','Advance 1 hour (lab only)')}</Button><Button size="sm" variant="outline" onClick={()=>{setState(createCoreLifecycleLab());setError('');}}>{t('重置实验','Reset lab')}</Button></div>
  <SimulationCoreActions lifecycle={lifecycle} lang={lang} symbol="USD" busy={false} connected available={state.accounts[actor].wallet} onConnect={()=>{}}/>
  {error&&<p role="status" className="text-xs text-danger">{error}</p>}
 </div>;
}
