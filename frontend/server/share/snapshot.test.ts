import {describe,it,expect} from 'vitest';
import {createPaperMarket,applyPaperAction,parseUSD,advancePaperMarket} from '../paper/engine';
import {createShareSnapshot} from './snapshot';
import {topicMarketClaimPreview} from '../../components/topicMarketDemoModel';
const now=1_000_000,id='00000000-0000-4000-8000-000000000001';
const make=()=>createPaperMarket('m','alice',{title:'Test topic',yesRule:'Yes',noRule:'No',invalidRule:'Invalid',assetSymbol:'TSLA',coreHours:6},now);
const buy=(m:ReturnType<typeof make>,amount='100',user='alice',time=now)=>applyPaperAction(m,user,parseUSD('100000'),{type:'GENESIS_BUY',budgetUSD:amount},time).market;
describe('personal market snapshots',()=>{
 it('freezes server-owned values, theme and time without exposing account identities or mutating state',()=>{
  const m=buy(make()),before=JSON.stringify(m),snap=createShareSnapshot(m,'alice','dark',now,id);
  expect(JSON.stringify(m)).toBe(before);expect(snap.theme).toBe('dark');expect(snap.at).toBe(now/1000);expect(snap.pnl!.low).toBeLessThan(0);
  const encoded=JSON.stringify(snap);expect(encoded).not.toContain('alice');expect(encoded).not.toContain('wallet');expect(encoded).not.toContain('coreStake');
  buy(m,'500','bob');expect(JSON.stringify(snap)).toBe(encoded);
  expect(createShareSnapshot(m,'not-a-player','light',now,id).pnl).toBeNull();
 });
 it('does not fabricate infinite changes from a zero opening price or use truncated events for costs',()=>{
  const empty=createShareSnapshot(make(),'alice','light',now,id);expect(empty.prices[0].change).toBeNull();
  const m=buy(make());m.state.events=[];const snap=createShareSnapshot(m,'alice','light',now,id);
  expect(snap.pnl!.low).toBeCloseTo(-9.336,4);expect(snap.pnl!.note).toContain('B excluded');
  m.history=[{at:1000,genesisPriceUSD:0,yesPrice:null},{at:1001,genesisPriceUSD:Number(snap.prices[0].value.slice(1))/2,yesPrice:null}];
  expect(createShareSnapshot(m,'alice','light',now+1000,id).prices[0].change).toContain('+100.');
 });
 it('keeps final P&L constant before and after claims, without resetting last price after burns',()=>{
  let m=buy(make());m=advancePaperMarket(m,(m.createdAt+m.state.TG)*1000);
  const before=createShareSnapshot(m,'alice','light',(m.createdAt+m.state.TG)*1000,id);
  const paid=m.state.accounts[0].paid,claim=topicMarketClaimPreview(m.state,0).total;
  expect(before.pnl!.low).toBeCloseTo((claim-paid+m.state.creatorFees)*m.assetPriceUSD,6);
  const claimed=applyPaperAction(m,'alice',parseUSD('99900'),{type:'CLAIM_MARKET'},(m.createdAt+m.state.TG)*1000).market;
  const after=createShareSnapshot(claimed,'alice','light',(m.createdAt+m.state.TG)*1000,id);
  expect(after.pnl!.low).toBeCloseTo(before.pnl!.low,6);expect(after.prices).toEqual(before.prices);
 });
 it('shows scenario P&L and percentage-point changes without mixing Genesis history or settled fallback odds',()=>{
  const m=buy(make(),'30000'),t=m.createdAt;
  m.history=[{at:t,genesisPriceUSD:0,yesPrice:null},{at:t+1,genesisPriceUSD:1,yesPrice:.5},{at:t+2,genesisPriceUSD:1,yesPrice:.6}];
  // Use real current pool odds for an open market; freeze last retained .6 for settled.
  const open=createShareSnapshot(m,'alice','dark',now+2000,id);expect(open.pnl!.label).toContain('SETTLEMENT');expect(open.pnl!.high).toBeGreaterThanOrEqual(open.pnl!.low);
  const settled=advancePaperMarket(m,(m.createdAt+m.state.TC)*1000);
  settled.history.push({at:t+m.state.TC,genesisPriceUSD:0,yesPrice:.5});
  const snap=createShareSnapshot(settled,'alice','dark',(t+m.state.TC)*1000,id);
  expect(snap.prices[0].value).toBe('60.00%');expect(snap.prices[0].change).toBe('+10.00 pp');
 });
 it('keeps settled total P&L stable through LP/B, Core, and creator-fee claims',()=>{
  let trade=applyPaperAction(make(),'alice',parseUSD('100000'),{type:'GENESIS_BUY',budgetUSD:'30000'},now),m=trade.market,wallet=trade.walletMicros;
  trade=applyPaperAction(m,'alice',wallet,{type:'CORE_STAKE',side:'YES',budgetUSD:'100'},now+1000);m=trade.market;wallet=trade.walletMicros;
  m=applyPaperAction(m,'bob',parseUSD('100000'),{type:'CORE_STAKE',side:'NO',budgetUSD:'50'},now+1000).market;
  m=applyPaperAction(m,'bob',parseUSD('99950'),{type:'FORMAL_BUY',side:'YES',budgetUSD:'100'},now+2000).market;
  const end=(m.createdAt+m.state.TC)*1000;m=advancePaperMarket(m,end);
  const value=createShareSnapshot(m,'alice','dark',end,id).pnl!.low;
  for(const type of ['CLAIM_MARKET','CLAIM_CORE','CLAIM_CREATOR_FEES'] as const){
   trade=applyPaperAction(m,'alice',wallet,{type},end);m=trade.market;wallet=trade.walletMicros;
   expect(createShareSnapshot(m,'alice','dark',end,id).pnl!.low).toBeCloseTo(value,5);
  }
 });
});
