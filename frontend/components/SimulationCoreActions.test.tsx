import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {SimulationCoreActions,SimulationEarlyNotice,buildLocalCoreLifecycle} from './SimulationCoreActions';
import {CoreLifecycleLab,createCoreLifecycleLab} from './CoreLifecycleLab';
import {topicMarketAdvanceTime} from './topicMarketDemoModel';
describe('simulation Core lifecycle controls',()=>{
 it('renders independent collapsed exit and proposal controls in both languages',()=>{
  const s=createCoreLifecycleLab(),l=buildLocalCoreLifecycle(s,0,()=>{});
  for(const lang of ['zh','en'] as const){const html=renderToStaticMarkup(<SimulationCoreActions lifecycle={l} lang={lang} symbol="USD" busy={false} connected available={10000} onConnect={()=>{}}/>);expect(html).toContain('simulation-core-exit');expect(html).toContain('simulation-early-request');expect(html).toContain('500');expect(html).not.toContain(' open=""');expect(html).toContain(lang==='zh'?'不能指定结果':'cannot choose the result');}
 });
 it('wires real exit, non-leading proposal, permissionless process and separate refund actions',()=>{
  let s=createCoreLifecycleLab();const run=(fn:(v:typeof s)=>typeof s)=>{s=fn(s);};
  const proposal=buildLocalCoreLifecycle(s,2,run);expect(proposal.canPropose).toBe(true);proposal.propose('NO','Non-leading side remains allowed');expect(s.early?.pending?.side).toBe('NO');
  const before=s.accounts[0].wallet;buildLocalCoreLifecycle(s,0,run).exit();expect(s.accounts[0].wallet-before).toBeCloseTo(90);expect(s.accounts[0].coreStake).toBe(0);
  s=topicMarketAdvanceTime(s,3600);const due=buildLocalCoreLifecycle(s,0,run);expect(due.paused).toBe(true);expect(due.canExit).toBe(false);expect(due.canProcess).toBe(true);due.process();expect(s.result).toBe('NO');expect(s.accounts[2].bondRefund).toBe(500);
  const wallet=s.accounts[2].wallet;buildLocalCoreLifecycle(s,2,run).claimBond();expect(s.accounts[2].wallet-wallet).toBeCloseTo(500);expect(s.accounts[2].bondRefund).toBe(0);
 });
 it('shows pending side/countdown and only offers processing when the window ends',()=>{
  let s=createCoreLifecycleLab();const run=(fn:(v:typeof s)=>typeof s)=>{s=fn(s);};buildLocalCoreLifecycle(s,1,run).propose('YES','test');
  const html=renderToStaticMarkup(<SimulationEarlyNotice lifecycle={buildLocalCoreLifecycle(s,0,run)} now={0} lang="en" busy={false} connected onConnect={()=>{}}/>);expect(html).toContain('YES');expect(html).toContain('01:00:00');expect(html).not.toContain('Check settlement');
  s=topicMarketAdvanceTime(s,3600);const due=renderToStaticMarkup(<SimulationEarlyNotice lifecycle={buildLocalCoreLifecycle(s,0,run)} now={s.now} lang="en" busy={false} connected onConnect={()=>{}}/>);expect(due).toContain('Check settlement');expect(due).toContain('Any player may process');
 });
 it('offers a genuine model-backed local lab without pretending the shared market can fast-forward',()=>{const html=renderToStaticMarkup(<CoreLifecycleLab lang="zh"/>);expect(html).toContain('仅本实验');expect(html).toContain('按服务器真实时间');expect(html).toContain('simulation-core-actions');});
});
