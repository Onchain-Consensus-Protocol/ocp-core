import { describe, expect, it } from "vitest";
import { createDlpDemo, dlpCreate, dlpBuy, dlpFormalBuy, dlpFormalSell, dlpQuoteFormalSell,
  dlpRedeemPairs, dlpMaxFormalSellTokens, dlpCoordinates, dlpPrices, dlpAccounting,
  dlpAssertLedger, dlpAdvanceTime, dlpTransferLP, dlpTransferB } from "./dlpDemoModel";
const formal=()=>{let s=dlpCreate(createDlpDemo());for(let id=0;id<3;id++)s=dlpBuy(s,id,9000);return s;};
const bought=()=>dlpFormalBuy(dlpFormalBuy(formal(),0,"YES",100),0,"NO",80);
describe("DLP locked LP: single-side sales sourced only from real outcome purchases",()=>{
 for(const side of ["YES","NO"] as const)it(`sells purchased ${side} without relying on LP withdrawals or a collateral merge`,()=>{
  let s=bought();const i=side==="YES"?0:1,before=s,n=side==="YES"?100:80;
  const q=dlpQuoteFormalSell(s,side,n);expect(q.mergePairs).toBe(0);expect(q.gross).toBeLessThanOrEqual(s.cash+1e-7);
  expect(dlpMaxFormalSellTokens(s,0,side)).toBeCloseTo(n,7);expect(n).toBeLessThanOrEqual(dlpCoordinates(s)[i]+1e-7);
  s=dlpFormalSell(s,0,side,n);expect(s.accounts[0].wallet-before.accounts[0].wallet).toBeCloseTo(q.net,8);
  expect(s.collateral).toBe(before.collateral);expect(s.redeemedPairs).toBe(0);
  expect(dlpPrices(s).probability![i]).toBeLessThan(dlpPrices(before).probability![i]);dlpAssertLedger(s);
 });
 it("cannot obtain sellable outcome tokens by transferring LP or B",()=>{
  let s=formal();s=dlpTransferLP(s,0,1,s.accounts[0].lp);s=dlpTransferB(s,0,1,s.accounts[0].z);
  expect(s.accounts[1].yes+s.accounts[1].no).toBe(0);expect(dlpMaxFormalSellTokens(s,1,"YES")).toBe(0);
  expect(()=>dlpFormalSell(s,1,"YES",1)).toThrow();dlpAssertLedger(s);
 });
 it("keeps every residual holding within existing q after direct pair redemption",()=>{
  let s=dlpRedeemPairs(bought(),0,25);const coordinates=dlpCoordinates(s);
  expect(s.accounts[0].yes).toBeLessThanOrEqual(coordinates[0]);expect(s.accounts[0].no).toBeLessThanOrEqual(coordinates[1]);
  for(const side of ["YES","NO"] as const){const n=dlpMaxFormalSellTokens(s,0,side);const quote=dlpQuoteFormalSell(s,side,n);
   expect(quote.mergePairs).toBe(0);expect(quote.gross).toBeLessThanOrEqual(s.cash+1e-7);s=dlpFormalSell(s,0,side,n);dlpAssertLedger(s);}
  expect(dlpAccounting(s).error).toBeCloseTo(0,7);
 });
 it("charges real friction on repeated purchase-sale cycles with no cash profit",()=>{
  let s=formal();const before=s.accounts[0].wallet,collateral=s.collateral;
  for(let n=0;n<5;n++){s=dlpFormalBuy(s,0,"YES",40);s=dlpFormalSell(s,0,"YES",40);dlpAssertLedger(s);}
  expect(s.accounts[0].wallet).toBeLessThan(before);expect(s.accounts[0].yes).toBeCloseTo(0,8);
  expect(s.collateral).toBe(collateral);expect(s.redeemedPairs).toBe(0);expect(s.cash).toBeCloseTo(0,7);expect(dlpAccounting(s).error).toBeCloseTo(0,7);
 });
 it("rejects overselling and stops sells at Formal cutoff while Core remains open",()=>{
  let s=bought();const before=JSON.stringify(s);expect(()=>dlpFormalSell(s,0,"YES",101)).toThrow();expect(JSON.stringify(s)).toBe(before);
  s=dlpAdvanceTime(s,s.TF);expect(s.phase).toBe("WAIT_CORE");expect(dlpMaxFormalSellTokens(s,0,"YES")).toBe(0);
  expect(()=>dlpFormalSell(s,0,"YES",1)).toThrow();dlpAssertLedger(s);
 });
});
