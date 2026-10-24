import { describe, expect, it } from "vitest";
import { createTopicMarketDemo, topicMarketCreate, topicMarketBuy, topicMarketFormalBuy, topicMarketFormalSell, topicMarketQuoteFormalSell,
  topicMarketRedeemPairs, topicMarketMaxFormalSellTokens, topicMarketCoordinates, topicMarketPrices, topicMarketAccounting,
  topicMarketAssertLedger, topicMarketAdvanceTime, topicMarketTransferLP, topicMarketTransferB } from "./topicMarketDemoModel";
const formal=()=>{let s=topicMarketCreate(createTopicMarketDemo());for(let id=0;id<3;id++)s=topicMarketBuy(s,id,9000);return s;};
const bought=()=>topicMarketFormalBuy(topicMarketFormalBuy(formal(),0,"YES",100),0,"NO",80);
describe("TopicMarket locked LP: single-side sales sourced only from real outcome purchases",()=>{
 for(const side of ["YES","NO"] as const)it(`sells purchased ${side} without relying on LP withdrawals or a collateral merge`,()=>{
  let s=bought();const i=side==="YES"?0:1,before=s,n=side==="YES"?100:80;
  const q=topicMarketQuoteFormalSell(s,side,n);expect(q.mergePairs).toBe(0);expect(q.gross).toBeLessThanOrEqual(s.cash+1e-7);
  expect(topicMarketMaxFormalSellTokens(s,0,side)).toBeCloseTo(n,7);expect(n).toBeLessThanOrEqual(topicMarketCoordinates(s)[i]+1e-7);
  s=topicMarketFormalSell(s,0,side,n);expect(s.accounts[0].wallet-before.accounts[0].wallet).toBeCloseTo(q.net,8);
  expect(s.collateral).toBe(before.collateral);expect(s.redeemedPairs).toBe(0);
  expect(topicMarketPrices(s).probability![i]).toBeLessThan(topicMarketPrices(before).probability![i]);topicMarketAssertLedger(s);
 });
 it("cannot obtain sellable outcome tokens by transferring LP or B",()=>{
  let s=formal();s=topicMarketTransferLP(s,0,1,s.accounts[0].lp);s=topicMarketTransferB(s,0,1,s.accounts[0].z);
  expect(s.accounts[1].yes+s.accounts[1].no).toBe(0);expect(topicMarketMaxFormalSellTokens(s,1,"YES")).toBe(0);
  expect(()=>topicMarketFormalSell(s,1,"YES",1)).toThrow();topicMarketAssertLedger(s);
 });
 it("keeps every residual holding within existing q after direct pair redemption",()=>{
  let s=topicMarketRedeemPairs(bought(),0,25);const coordinates=topicMarketCoordinates(s);
  expect(s.accounts[0].yes).toBeLessThanOrEqual(coordinates[0]);expect(s.accounts[0].no).toBeLessThanOrEqual(coordinates[1]);
  for(const side of ["YES","NO"] as const){const n=topicMarketMaxFormalSellTokens(s,0,side);const quote=topicMarketQuoteFormalSell(s,side,n);
   expect(quote.mergePairs).toBe(0);expect(quote.gross).toBeLessThanOrEqual(s.cash+1e-7);s=topicMarketFormalSell(s,0,side,n);topicMarketAssertLedger(s);}
  expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);
 });
 it("charges real friction on repeated purchase-sale cycles with no cash profit",()=>{
  let s=formal();const before=s.accounts[0].wallet,collateral=s.collateral;
  for(let n=0;n<5;n++){s=topicMarketFormalBuy(s,0,"YES",40);s=topicMarketFormalSell(s,0,"YES",40);topicMarketAssertLedger(s);}
  expect(s.accounts[0].wallet).toBeLessThan(before);expect(s.accounts[0].yes).toBeCloseTo(0,8);
  expect(s.collateral).toBe(collateral);expect(s.redeemedPairs).toBe(0);expect(s.cash).toBeCloseTo(0,7);expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);
 });
 it("rejects overselling and stops sells at Formal cutoff while Core remains open",()=>{
  let s=bought();const before=JSON.stringify(s);expect(()=>topicMarketFormalSell(s,0,"YES",101)).toThrow();expect(JSON.stringify(s)).toBe(before);
  s=topicMarketAdvanceTime(s,s.TF);expect(s.phase).toBe("WAIT_CORE");expect(topicMarketMaxFormalSellTokens(s,0,"YES")).toBe(0);
  expect(()=>topicMarketFormalSell(s,0,"YES",1)).toThrow();topicMarketAssertLedger(s);
 });
});
