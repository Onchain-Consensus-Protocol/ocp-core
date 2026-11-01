import {describe,it,expect} from 'vitest';
import {createPaperMarket,applyPaperAction,projectPaperMarket,quotePaperAction,advancePaperMarket,parseUSD} from './engine';
import {topicMarketAccounting} from '../../components/topicMarketDemoModel';
import type {PaperAction} from '../../shared/paperTypes';
const start=1_800_000_000_000,usd=parseUSD('100000');
function fixture(){let market=createPaperMarket('m','creator',{title:'Topic',yesRule:'Y',noRule:'N',invalidRule:'I',assetSymbol:'TSLA',coreHours:6},start);market=applyPaperAction(market,'lp',usd,{type:'GENESIS_BUY',budgetUSD:'10000'},start).market;return market;}
const act=(m:ReturnType<typeof fixture>,user:string,action:PaperAction,seconds=0)=>applyPaperAction(m,user,usd,action,start+seconds*1000);
const ledger=(m:ReturnType<typeof fixture>)=>expect(topicMarketAccounting(m.state).error).toBeCloseTo(0,7);
describe('paper Core exit and permissionless early settlement',()=>{
 it('requires nonzero principal and a reason but does not require proposer stake or current majority',()=>{
  let m=fixture();expect(()=>act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'r'})).toThrow('NO_PRINCIPAL');
  m=act(m,'staker',{type:'CORE_STAKE',side:'NO',budgetUSD:'100'}).market;
  expect(()=>act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:' '})).toThrow('MISSING_REASON');
  const q=quotePaperAction(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'Evidence'},start);
  expect(q.payUSD).toBe('500.000000');m=act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'Evidence'}).market;
  expect(m.state.early!.pending!.side).toBe('YES');expect(projectPaperMarket(m,'outsider',start).early!.bondUSD).toBe('500.000000');ledger(m);
 });
 it('freezes at the exact due time, requires a player process and refunds the successful fixed bond separately',()=>{
  let m=act(fixture(),'voter',{type:'CORE_STAKE',side:'YES',budgetUSD:'100'}).market;
  m=act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'Done'}).market;
  expect(()=>act(m,'executor',{type:'EARLY_PROCESS'},3599)).toThrow('EARLY_PENDING_WINDOW');
  for(const action of [{type:'CORE_STAKE',side:'NO',budgetUSD:'1'},{type:'CORE_EXIT'},{type:'FORMAL_BUY',side:'YES',budgetUSD:'1'}] as PaperAction[])
   expect(()=>act(m,'voter',action,3600)).toThrow('PROCESS_EARLY_REQUEST');
  const read=advancePaperMarket(m,start+22000*1000);expect(read.state.phase).not.toBe('SETTLED');
  m=act(m,'executor',{type:'EARLY_PROCESS'},22000).market;
  expect(m.state.result).toBe('YES');expect(m.state.early!.terminatedAt).toBe(3600);expect(m.state.TC).toBe(21600);
  expect(projectPaperMarket(m,'outsider',start+22000*1000).early!.bondRefundUSD).toBe('500.000000');
  const claim=act(m,'outsider',{type:'CLAIM_EARLY_BOND'},22000);expect(Number(claim.walletMicros-usd)/1e6).toBeCloseTo(500,5);
  expect(()=>act(claim.market,'outsider',{type:'CLAIM_EARLY_BOND'},22000)).toThrow('NO_BOND_REFUND');ledger(claim.market);
 });
 it('keeps Formal closed after a failed window crossing TF, while Core resumes',()=>{
  let m=act(fixture(),'voter',{type:'CORE_STAKE',side:'NO',budgetUSD:'100'}).market;
  m=act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'Dispute'},17000).market;
  expect(()=>act(m,'voter',{type:'CORE_EXIT'},20600)).toThrow('PROCESS_EARLY_REQUEST');
  m=act(m,'executor',{type:'EARLY_PROCESS'},20600).market;
  expect(m.state.phase).toBe('WAIT_CORE');expect(m.state.early!.failedBonds).toBe(2);
  expect(()=>act(m,'voter',{type:'FORMAL_BUY',side:'NO',budgetUSD:'1'},20601)).toThrow('FORMAL_CLOSED');
  m=act(m,'voter',{type:'CORE_STAKE',side:'NO',budgetUSD:'1'},20601).market;ledger(m);
 });
 it('resumes both pools after an early failure, and uses normal settlement for a late failed executor',()=>{
  let m=act(fixture(),'voter',{type:'CORE_STAKE',side:'NO',budgetUSD:'100'}).market;
  m=act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'r'}).market;
  m=act(m,'executor',{type:'EARLY_PROCESS'},3600).market;expect(m.state.phase).toBe('FORMAL');
  m=act(m,'trader',{type:'FORMAL_BUY',side:'YES',budgetUSD:'1'},3601).market;
  m=act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'again'},3602).market;
  m=act(m,'executor',{type:'EARLY_PROCESS'},22000).market;expect(m.state.result).toBe('NO');
  expect(m.state.early!.terminatedAt).toBeNull();expect(m.state.TC).toBe(21600);ledger(m);
 });
 it('rejects a window ending exactly at the original deadline',()=>{
  const m=act(fixture(),'voter',{type:'CORE_STAKE',side:'YES',budgetUSD:'100'}).market;
  expect(()=>act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'r'},18000)).toThrow('EARLY_WINDOW');
 });
 for(const outcome of ['YES','NO','INVALID'] as const)it(`forfeits old rewards on exit, permits a new side, and conserves ${outcome} settlement`,()=>{
  let m=act(fixture(),'exit',{type:'CORE_STAKE',side:'NO',budgetUSD:'100'}).market;
  m=act(m,'trader',{type:'FORMAL_BUY',side:'YES',budgetUSD:'100'}).market;
  const id=m.users.indexOf('exit'),old=m.state.accounts[id].coreRewards[1];expect(old).toBeGreaterThan(0);
  const exited=act(m,'exit',{type:'CORE_EXIT'});expect(Number(exited.walletMicros-usd)/1e6).toBeCloseTo(90,5);m=exited.market;
  expect(m.state.accounts[id].coreRewards).toEqual([0,0,0]);expect(m.state.early!.forfeited[1]).toBeCloseTo(old);
  m=act(m,'exit',{type:'CORE_STAKE',side:'YES',budgetUSD:'1'}).market;
  expect(m.state.accounts[id].coreRewards).toEqual([0,0,0]);
  m=act(m,'winner',{type:'CORE_STAKE',side:outcome,budgetUSD:'100'}).market;
  m=advancePaperMarket(m,start+21600*1000);expect(m.state.result).toBe(outcome);
  for(const user of m.users){const a=m.state.accounts[m.users.indexOf(user)];if(a.lp+a.yes+a.no>0)m=act(m,user,{type:'CLAIM_MARKET'},21600).market;if(a.coreStake>0)m=act(m,user,{type:'CLAIM_CORE'},21600).market;}
  ledger(m);expect(m.state.coreBudget).toBeCloseTo(0,7);
 });
 it('slashes a failed pending bond and routes all empty-pool penalties without locking funds',()=>{
  let m=act(fixture(),'voter',{type:'CORE_STAKE',side:'YES',budgetUSD:'100'}).market;
  m=act(m,'outsider',{type:'EARLY_PROPOSE',side:'YES',reason:'r'}).market;
  m=act(m,'voter',{type:'CORE_EXIT'},1).market;
  m=act(m,'executor',{type:'EARLY_PROCESS'},22000).market;
  expect(m.state.result).toBe('INVALID');expect(m.state.coreOfficialBudget).toBeCloseTo(510/250,7);expect(m.state.early!.pending).toBeNull();ledger(m);
 });
 it('normalizes published single-reserve documents without inventing past proposals or rewards',()=>{
  const m=fixture();delete m.state.early;
  const next=advancePaperMarket(m,start);expect(next.state.early).toMatchObject({bond:2,count:0,pending:null,penalty:0,failedBonds:0,forfeited:[0,0,0]});ledger(next);
 });
});
