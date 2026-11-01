import {describe,it,expect} from 'vitest';
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketFormalBuy,topicMarketCoreStake,topicMarketAdvanceTime,topicMarketFinalize,topicMarketTransferLP,topicMarketClaimLP,topicMarketClaim,topicMarketClaimCore,topicMarketExitLP,topicMarketAddLP,topicMarketAccounting} from './topicMarketDemoModel';
const formal=()=>{let s=topicMarketCreate(createTopicMarketDemo({Q:6000}));for(let i=0;i<3;i++)s=topicMarketBuy(s,i,9000);return s;};
const finish=(s:ReturnType<typeof formal>)=>topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));
describe('transferable LP rights with locked underlying capital',()=>{
 it('transfers LP without changing pool assets, pricing depth or outcome holdings',()=>{
  const s=topicMarketFormalBuy(formal(),0,'YES',100),next=topicMarketTransferLP(s,0,1,10);
  for(const key of ['cash','collateral','basis','b','lpFees','lpSupply'] as const)expect(next[key]).toBe(s[key]);
  expect(next.inventory).toEqual(s.inventory);expect(next.accounts[0].yes).toBe(100);
  expect(next.accounts[1].lp-s.accounts[1].lp).toBe(10);expect(next.accounts[0].lp).toBe(s.accounts[0].lp-10);
 });
 it('allows transfer while waiting for Core without reopening trades',()=>{
  let s=formal();s=topicMarketAdvanceTime(s,s.TF);s=topicMarketTransferLP(s,0,1,1);
  expect(()=>topicMarketFormalBuy(s,0,'YES',1)).toThrow('FORMAL_CLOSED');
 });
 for(const amount of [0,-1,NaN,Infinity,1e9])it(`rejects invalid LP transfer ${amount} atomically`,()=>{
  const s=formal(),before=JSON.stringify(s);expect(()=>topicMarketTransferLP(s,0,1,amount)).toThrow();expect(JSON.stringify(s)).toBe(before);
 });
 it('rejects self transfer, missing recipient and pregraduation transfer',()=>{
  const s=formal();expect(()=>topicMarketTransferLP(s,0,0,1)).toThrow();expect(()=>topicMarketTransferLP(s,0,99,1)).toThrow();
  expect(()=>topicMarketTransferLP(topicMarketCreate(createTopicMarketDemo()),0,1,1)).toThrow();
 });
 it('disables capital withdrawal and additional LP',()=>{const s=formal();expect(()=>topicMarketExitLP(s,0,1)).toThrow('LP_ASSETS_LOCKED');expect(()=>topicMarketAddLP(s,0,1)).toThrow('LP_ADDITION_DISABLED');expect(()=>topicMarketClaimLP(s,0,1)).toThrow();});
 it('uses a fixed denominator for partial LP burns',()=>{
  let s=finish(formal());const budget=s.lpBudgetInitial,supply=s.lpClaimSupply,own=s.accounts[0].lp,before=s.accounts[0].wallet;
  s=topicMarketClaimLP(s,0,own/3);s=topicMarketClaimLP(s,0,s.accounts[0].lp);
  expect(s.accounts[0].wallet-before).toBeCloseTo(budget*own/supply,7);expect(s.lpClaimSupply).toBe(supply);expect(()=>topicMarketClaimLP(s,0,1)).toThrow();
 });
 it('transfers settled rights and allows a previous claimant to claim newly received LP',()=>{
  let s=finish(formal());s=topicMarketClaim(s,0);s=topicMarketTransferLP(s,1,0,1);const before=s.accounts[0].wallet;
  s=topicMarketClaim(s,0);expect(s.accounts[0].wallet-before).toBeCloseTo(s.lpBudgetInitial/s.lpClaimSupply,7);
 });
 for(const outcome of ['YES','NO','INVALID'] as const)it(`conserves assets through partial burns and ${outcome} settlement`,()=>{
  let s=topicMarketFormalBuy(formal(),1,'YES',80);s=topicMarketCoreStake(s,2,outcome,100);s=finish(s);
  s=topicMarketTransferLP(s,0,1,1);s=topicMarketClaimLP(s,1,1);
  for(const id of [2,0,1])s=topicMarketClaim(s,id);s=topicMarketClaimCore(s,2);
  expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);expect(topicMarketAccounting(s).reserves).toBeCloseTo(0,7);
 });
});
