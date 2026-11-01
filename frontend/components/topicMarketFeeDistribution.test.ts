import {describe,it,expect} from 'vitest';
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketQuoteSell,topicMarketQuoteFormalBuyBudget,topicMarketFormalBuyBudget,topicMarketQuoteFormalSell,topicMarketFormalSell,topicMarketCoreStake,topicMarketAdvanceTime,topicMarketFinalize,topicMarketClaim,topicMarketClaimCore,topicMarketAccounting} from './topicMarketDemoModel';
const formal=()=>{let s=topicMarketCreate(createTopicMarketDemo({Q:6000}));for(let i=0;i<3;i++)s=topicMarketBuy(s,i,9000);return s;};
describe('single reserve fee allocation',()=>{
 it('charges Genesis creator .7%, protocol .3% and reserves 99%',()=>{
  const s=topicMarketBuy(topicMarketCreate(createTopicMarketDemo()),0,100);expect(s.R).toBe(99);expect(s.creatorFees).toBeCloseTo(.7);expect(s.protocolFees).toBeCloseTo(.3);
  const q=topicMarketQuoteSell(s,s.S);expect(q.net).toBeCloseTo(98.01);expect(q.net+q.creatorFee+q.protocolFee).toBeCloseTo(q.gross);
 });
 it('allocates Formal gross 100 as 98 trading, 1 LP, .7 Core, .3 protocol',()=>{
  const s=formal(),q=topicMarketQuoteFormalBuyBudget(s,'YES',100),next=topicMarketFormalBuyBudget(s,2,'YES',100);
  expect(q.net).toBeCloseTo(98);expect(q.lpFee).toBeCloseTo(1);expect(q.coreFee).toBeCloseTo(.7);expect(q.protocolFee).toBeCloseTo(.3);
  expect(next.lpSupply).toBe(s.lpSupply);expect(next.b).toBe(s.b);expect(next.lpFees-s.lpFees).toBeCloseTo(1);
 });
 it('deducts full sell gross while paying the exact 98% net',()=>{
  const s=topicMarketFormalBuyBudget(formal(),2,'YES',100),q=topicMarketQuoteFormalSell(s,'YES',s.accounts[2].yes),next=topicMarketFormalSell(s,2,'YES',s.accounts[2].yes);
  expect(next.accounts[2].wallet-s.accounts[2].wallet).toBeCloseTo(q.gross*.98,7);
  expect(q.net+q.lpFee+q.coreFee+q.protocolFee).toBeCloseTo(q.gross,7);
 });
 for(const outcome of ['YES','NO','INVALID'] as const)it(`allocates all receipts once for ${outcome}`,()=>{
  let s=topicMarketFormalBuyBudget(formal(),0,'YES',100);s=topicMarketCoreStake(s,2,outcome,100);
  const creator=s.accounts[1].wallet,fee=s.creatorFees;s=topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));
  expect(s.accounts[1].wallet-creator).toBeCloseTo(fee,7);expect(s.creatorFees+s.protocolFees+s.coreOfficialBudget).toBe(0);
  for(let i=0;i<3;i++)s=topicMarketClaim(s,i);s=topicMarketClaimCore(s,2);
  expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);expect(topicMarketAccounting(s).reserves).toBeCloseTo(0,7);
 });
});
