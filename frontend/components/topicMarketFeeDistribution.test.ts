import {describe,it,expect} from "vitest";
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketSell,topicMarketQuoteBuy,topicMarketQuoteSell,
 topicMarketFormalBuyBudget,topicMarketFormalBuy,topicMarketFormalSell,topicMarketQuoteFormalBuyBudget,topicMarketQuoteFormalSell,
 topicMarketCoreStake,topicMarketAdvanceTime,topicMarketFinalize,topicMarketTransferB,topicMarketClaimB,topicMarketClaimLP,
 topicMarketClaim,topicMarketClaimCore,topicMarketClaimFees,topicMarketClaimCoreOfficial,topicMarketAccounting,topicMarketAssertLedger} from "./topicMarketDemoModel";
type State=ReturnType<typeof createTopicMarketDemo>;
const formal=()=>{let s=topicMarketCreate(createTopicMarketDemo());for(let id=0;id<3;id++)s=topicMarketBuy(s,id,9000);return s;};
const ledger=(s:State)=>{topicMarketAssertLedger(s);expect(topicMarketAccounting(s).total).toBeCloseTo(30000,7);expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);};
const finish=(s:State)=>topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));
const drain=(state:State)=>{let s=state;for(let id=0;id<3;id++){
 const a=s.accounts[id];if(a.lp>0||a.z>0||a.yes>0||a.no>0||a.g>0)s=topicMarketClaim(s,id);
 s=topicMarketClaimCore(s,id);ledger(s);
 }if(s.creatorFees>0)s=topicMarketClaimFees(s,"CREATOR",1);if(s.coreOfficialBudget>0)s=topicMarketClaimCoreOfficial(s,2);
 expect(s.protocolFees).toBe(0);expect(topicMarketAccounting(s).reserves).toBeCloseTo(0,7);ledger(s);return s;};

describe("TopicMarket v1.9 fee distribution and non-minting B capital income",()=>{
 it("assigns all one percent Genesis fees to creator on both directions",()=>{
  let s=topicMarketCreate(createTopicMarketDemo());const buy=topicMarketQuoteBuy(s,100);
  expect(buy.net).toBeCloseTo(94.5,8);expect(buy.B).toBeCloseTo(4.5,8);
  expect(buy.creatorFee).toBeCloseTo(1,8);expect(buy.protocolFee).toBe(0);
  s=topicMarketBuy(s,0,100);const sell=topicMarketQuoteSell(s,s.accounts[0].g),before=s;
  expect(sell.creatorFee).toBeCloseTo(sell.gross*.01,8);expect(sell.protocolFee).toBe(0);
  s=topicMarketSell(s,0,s.accounts[0].g);expect(before.R-s.R).toBeCloseTo(sell.gross,8);
  expect(s.creatorFees).toBeCloseTo(1+sell.gross*.01,8);expect(s.protocolFees).toBe(0);ledger(s);
 });
 it("splits Formal buy gross 100 as 98 trading, .5 LP, 1 Core and .5 B without minting z",()=>{
  let s=formal();const before=s,q=topicMarketQuoteFormalBuyBudget(s,"YES",100);
  expect(q.net).toBeCloseTo(98,8);expect(q.lpFee).toBeCloseTo(.5,8);expect(q.coreFee).toBeCloseTo(1,8);
  expect(q.B).toBeCloseTo(.5,8);expect(q.fees.B).toBeCloseTo(.5,8);expect(q.contribution).toBe(0);
  expect(q.creatorFee+q.protocolFee).toBe(0);expect(q.fees.creator+q.fees.protocol).toBe(0);
  s=topicMarketFormalBuyBudget(s,0,"YES",100);expect(s.cash-before.cash).toBeCloseTo(98,8);
  expect(s.lpFees-before.lpFees).toBeCloseTo(.5,8);expect(s.core.fees-before.core.fees).toBeCloseTo(1,8);
  expect(s.B-before.B).toBeCloseTo(.5,8);expect(s.accounts.map(a=>a.z)).toEqual(before.accounts.map(a=>a.z));
  expect(s.creatorFees).toBe(before.creatorFees);expect(s.protocolFees).toBe(0);ledger(s);
 });
 it("deducts full sell gross, pays 98 percent and partitions the remaining two percent exactly",()=>{
  let s=topicMarketFormalBuyBudget(formal(),0,"YES",100);const before=s,q=topicMarketQuoteFormalSell(s,"YES",s.accounts[0].yes/2);
  s=topicMarketFormalSell(s,0,"YES",q.quantity);
  expect(before.cash-s.cash).toBeCloseTo(q.gross,8);expect(s.accounts[0].wallet-before.accounts[0].wallet).toBeCloseTo(q.gross*.98,8);
  expect(s.lpFees-before.lpFees).toBeCloseTo(q.gross*.005,8);expect(s.core.fees-before.core.fees).toBeCloseTo(q.gross*.01,8);
  expect(s.B-before.B).toBeCloseTo(q.gross*.005,8);expect(q.net+q.lpFee+q.coreFee+q.B).toBeCloseTo(q.gross,8);
  expect(s.accounts.map(a=>a.z)).toEqual(before.accounts.map(a=>a.z));expect(s.creatorFees).toBe(before.creatorFees);ledger(s);
 });
 it("makes no-loss Formal B income a gain for the existing fixed B token supply",()=>{
  let s=formal();const initialB=s.B,Z=s.accounts.reduce((n,a)=>n+a.z,0),z=s.accounts[0].z;
  s=topicMarketFormalBuy(s,0,"YES",100);const sell=topicMarketQuoteFormalSell(s,"YES",100);
  s=topicMarketFormalSell(s,0,"YES",100);const allB=s.B;expect(allB).toBeGreaterThan(initialB);
  expect(sell.B).toBeCloseTo(sell.gross*.005,8);expect(s.accounts.reduce((n,a)=>n+a.z,0)).toBe(Z);
  s=finish(s);expect(s.cover).toBeCloseTo(0,8);expect(s.bBudgetInitial).toBeCloseTo(allB,8);
  expect(s.bClaimSupply).toBe(Z);const wallet=s.accounts[0].wallet;s=topicMarketClaimB(s,0,z);
  expect(s.accounts[0].wallet-wallet).toBeCloseTo(allB*z/Z,8);expect(s.accounts[0].wallet-wallet).toBeGreaterThan(z);ledger(s);
 });
 it("uses Formal B fee capital for losses before charging any residual loss to LP",()=>{
  let s=topicMarketBuy(topicMarketCreate(createTopicMarketDemo({Q:1,b:150})),0,30);const initialB=s.B;
  s=topicMarketFormalBuy(s,1,"YES",20);const allB=s.B;expect(allB).toBeGreaterThan(initialB);
  s=topicMarketCoreStake(s,2,"YES",1);const nav=s.cash+s.lpFees+s.inventory[0];expect(s.basis-nav).toBeGreaterThan(allB);
  s=finish(s);expect(s.cover).toBeCloseTo(allB,8);expect(s.bBudget).toBeCloseTo(0,8);expect(s.lpBudget).toBeCloseTo(nav+allB,8);
  expect(s.lpBudget).toBeLessThan(s.basis);drain(s);
 });
 it("transfers only fixed B rights after income and uses an unchanged denominator for partial burns",()=>{
  let s=formal();const supply=s.accounts.reduce((n,a)=>n+a.z,0);
  s=topicMarketFormalBuyBudget(s,0,"YES",100);s=topicMarketTransferB(s,0,1,100);s=finish(s);
  expect(s.bClaimSupply).toBe(supply);const budget=s.bBudgetInitial,own=s.accounts[1].z,wallet=s.accounts[1].wallet;
  s=topicMarketClaimB(s,1,own/3);s=topicMarketClaimB(s,1,own/3);s=topicMarketClaimB(s,1,s.accounts[1].z);
  expect(s.accounts[1].wallet-wallet).toBeCloseTo(budget*own/supply,8);expect(s.bClaimSupply).toBe(supply);drain(s);
 });
 for(const outcome of ["YES","NO","INVALID"] as const)it(`conserves all cash after v1.9 fees, partial burns and ${outcome} final claims`,()=>{
  let s=formal();const initialZ=s.accounts.map(a=>a.z);s=topicMarketFormalBuy(s,0,"YES",100);s=topicMarketFormalBuy(s,1,"NO",80);
  s=topicMarketFormalSell(s,0,"YES",30);expect(s.accounts.map(a=>a.z)).toEqual(initialZ);
  if(outcome!=="INVALID")s=topicMarketCoreStake(s,2,outcome,100);
  const B=s.B,V=outcome==="YES"?s.inventory[0]:outcome==="NO"?s.inventory[1]:(s.inventory[0]+s.inventory[1])/2;
  const cover=Math.min(B,Math.max(s.basis-s.cash-s.lpFees-V,0));s=finish(s);
  expect(s.cover).toBeCloseTo(cover,7);expect(s.bBudget+s.cover).toBeCloseTo(B,7);
  s=topicMarketClaimLP(s,0,s.accounts[0].lp/3);s=topicMarketClaimB(s,1,s.accounts[1].z/4);drain(s);
 });
});
