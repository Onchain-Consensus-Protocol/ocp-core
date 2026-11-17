import {describe,it,expect} from 'vitest';
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketSell,topicMarketQuoteSell,topicMarketQuoteFormalBuy,topicMarketFormalBuy,topicMarketCoreStake,topicMarketAdvanceTime,topicMarketFinalize,topicMarketClaim,topicMarketClaimCore,topicMarketAccounting} from './topicMarketDemoModel';

describe('single R pool',()=>{
 it('charges 1% Genesis fee, never mints B and refunds only remaining R on failure',()=>{
  let s=topicMarketBuy(topicMarketCreate(createTopicMarketDemo()),0,100);
  expect(s.R).toBe(99);
  expect(s.rTarget).toBe(8400);
  const q=topicMarketQuoteSell(s,s.S/2);expect(q.net).toBeCloseTo(q.gross*.99);
  s=topicMarketSell(s,0,s.S/2);const reserve=s.R;
  s=topicMarketAdvanceTime(s,s.TG);const before=s.accounts[0].wallet;s=topicMarketClaim(s,0);
  expect(s.accounts[0].wallet-before).toBeCloseTo(reserve);expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);
 });
 for(const outcome of ['YES','NO','INVALID'] as const)it(`keeps fixed graduation depth and conserves cash after ${outcome}`,()=>{
  let s=topicMarketBuy(topicMarketCreate(createTopicMarketDemo()),0,9000);
  expect(s.phase).toBe('FORMAL');expect(s.b).toBe(8910);expect(s.M0).toBe(8910);
  const lp=s.lpSupply,b=s.b,q=topicMarketQuoteFormalBuy(s,'YES',100);
  expect(q.lpFee).toBeCloseTo(q.gross*.01);expect(q.coreFee).toBeCloseTo(q.gross*.007);
  s=topicMarketFormalBuy(s,1,'YES',100);s=topicMarketFormalBuy(s,2,'NO',80);
  expect(s.b).toBe(b);expect(s.lpSupply).toBe(lp);
  s=topicMarketCoreStake(s,2,outcome,100);s=topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));
  expect(s.result).toBe(outcome);
  for(const id of [2,0,1])s=topicMarketClaim(s,id);
  s=topicMarketClaimCore(s,2);
  expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);expect(topicMarketAccounting(s).reserves).toBeCloseTo(0,7);
 });
});
