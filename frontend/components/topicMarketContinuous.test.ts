import {describe,it,expect} from 'vitest';
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketFormalBuy,topicMarketFormalSell,topicMarketRedeemPairs,topicMarketCoordinates,topicMarketPrices,topicMarketCost,topicMarketQuoteFormalBuyBudget,topicMarketCoreStake,topicMarketAdvanceTime,topicMarketFinalize,topicMarketClaim,topicMarketClaimCore,topicMarketAccounting,topicMarketAssertLedger} from './topicMarketDemoModel';
const active=()=>topicMarketBuy(topicMarketCreate(createTopicMarketDemo({Q:1})),0,30);
const check=(s:ReturnType<typeof active>)=>{topicMarketAssertLedger(s);expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);if(s.phase==='FORMAL')expect(s.cash+1e-7).toBeGreaterThanOrEqual(Math.max(...topicMarketCoordinates(s)));};
describe('continuous fixed-depth LMSR',()=>{
 it('mints beyond graduation capital with no LP mint, pre-split collateral or inventory',()=>{
  let s=active();const lp=s.lpSupply,b=s.b,initial=s.M0;
  expect(s.cash).toBe(initial);expect(s.collateral).toBe(0);expect(s.inventory).toEqual([0,0]);
  const q=topicMarketQuoteFormalBuyBudget(s,'YES',1000);expect(q.quantity).toBeGreaterThan(10*initial);expect(q.gross).toBeCloseTo(1000,7);
  s=topicMarketFormalBuy(s,1,'YES',q.quantity);expect(s.accounts[1].yes).toBe(q.quantity);expect(s.lpSupply).toBe(lp);expect(s.b).toBe(b);check(s);
 });
 for(const outcome of ['YES','NO','INVALID'] as const)it(`conserves cash with multi-account opposite trades, existing pair burns and ${outcome} claims`,()=>{
  let s=active();const lp=s.lpSupply,b=s.b;
  for(const [actor,side,quantity] of [[1,'YES',200],[1,'NO',180],[2,'YES',160],[2,'NO',140]] as const){s=topicMarketFormalBuy(s,actor,side,quantity);check(s);}
  const price=topicMarketPrices(s).probability![0],cash=s.cash,cost=topicMarketCost(...topicMarketCoordinates(s),b),fees=s.lpFees;
  s=topicMarketRedeemPairs(s,1,80);s=topicMarketRedeemPairs(s,2,60);check(s);
  expect(s.cash).toBeCloseTo(cash-140,7);expect(cost-topicMarketCost(...topicMarketCoordinates(s),b)).toBeCloseTo(140,7);
  expect(topicMarketPrices(s).probability![0]).toBeCloseTo(price,12);expect(s.lpFees).toBe(fees);expect(s.b).toBe(b);expect(s.lpSupply).toBe(lp);
  s=topicMarketFormalSell(s,1,'YES',100);s=topicMarketFormalSell(s,2,'NO',80);check(s);
  expect(topicMarketCoordinates(s)).toEqual([120,100]);
  const debt=outcome==='YES'?120:outcome==='NO'?100:110,nav=s.cash+s.lpFees-debt;
  s=topicMarketCoreStake(s,0,outcome,100);s=topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));
  expect(s.outcomeBudget).toBeCloseTo(debt,7);expect(s.lpBudget).toBeCloseTo(nav,7);
  for(const actor of [2,0,1])s=topicMarketClaim(s,actor);s=topicMarketClaimCore(s,0);check(s);
  expect(topicMarketAccounting(s).reserves).toBeCloseTo(0,7);
 });
});
