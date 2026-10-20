import { describe, expect, it } from "vitest";
import { createDlpDemo, dlpCreate, dlpBuy, dlpFormalBuy, dlpFormalSell, dlpRedeemPairs,
  dlpMaxFormalSellTokens, dlpCoordinates, dlpCoreStake, dlpAdvanceTime, dlpFinalize,
  dlpTransferLP, dlpTransferB, dlpClaimLP, dlpClaimB, dlpClaim, dlpClaimCore,
  dlpClaimFees, dlpClaimCoreOfficial, dlpAccounting, dlpAssertLedger } from "./dlpDemoModel";
type State=ReturnType<typeof createDlpDemo>;
const formal=()=>{let s=dlpCreate(createDlpDemo());for(let id=0;id<3;id++)s=dlpBuy(s,id,9000);return s;};
const bought=()=>dlpFormalBuy(dlpFormalBuy(formal(),0,"YES",100),0,"NO",80);
const ledger=(s:State)=>{dlpAssertLedger(s);expect(dlpAccounting(s).error).toBeCloseTo(0,7);};
const frozen=(s:State)=>({basis:s.basis,b:s.b,inventory:s.inventory,cash:s.cash,B:s.B,lpFees:s.lpFees,creatorFees:s.creatorFees,protocolFees:s.protocolFees,core:s.core,lp:s.accounts.map(a=>a.lp),z:s.accounts.map(a=>a.z)});
describe("DLP locked LP: directly purchased outcome pair redemption",()=>{
 it("redeems only real purchased YES+NO and leaves locked LP/B assets untouched",()=>{
  let s=bought();const before=s,other=frozen(s);s=dlpRedeemPairs(s,0,20);
  expect(s.accounts[0].yes).toBe(80);expect(s.accounts[0].no).toBe(60);
  expect(s.accounts[0].wallet-before.accounts[0].wallet).toBeCloseTo(20,8);
  expect(s.collateral).toBeCloseTo(before.collateral-20,8);expect(s.redeemedPairs).toBe(20);
  expect(frozen(s)).toEqual(other);ledger(s);
 });
 it("accepts partial then remaining-pair redemption without minting or double paying",()=>{
  let s=bought();s=dlpRedeemPairs(s,0,20);s=dlpRedeemPairs(s,0,60);
  expect(s.redeemedPairs).toBe(80);expect(s.accounts[0].yes).toBe(20);expect(s.accounts[0].no).toBe(0);
  expect(()=>dlpRedeemPairs(s,0,1)).toThrow();ledger(s);
 });
 it("sells residual real holdings after pair burn within coordinates and cash",()=>{
  let s=dlpRedeemPairs(bought(),0,20);
  for(const side of ["YES","NO"] as const){const i=side==="YES"?0:1;const n=dlpMaxFormalSellTokens(s,0,side);
   const held=i===0?s.accounts[0].yes:s.accounts[0].no;expect(n).toBeCloseTo(held,7);
   expect(n).toBeLessThanOrEqual(dlpCoordinates(s)[i]+1e-7);s=dlpFormalSell(s,0,side,n);ledger(s);}
  expect(s.accounts[0].yes+s.accounts[0].no).toBeCloseTo(0,7);
 });
 it("allows pair redemption during WAIT_CORE but not after final settlement",()=>{
  let s=dlpAdvanceTime(bought(),7200);s=dlpRedeemPairs(s,0,10);
  expect(()=>dlpFormalSell(s,0,"YES",1)).toThrow();s=dlpFinalize(dlpAdvanceTime(s,10800));
  expect(()=>dlpRedeemPairs(s,0,1)).toThrow();ledger(s);
 });
 it("rejects nonfinite, excessive and unowned pair amounts without mutating state",()=>{
  const s=bought(),before=JSON.stringify(s);
  for(const n of [0,-1,NaN,Infinity,81]){expect(()=>dlpRedeemPairs(s,0,n)).toThrow();expect(JSON.stringify(s)).toBe(before);}
  expect(()=>dlpRedeemPairs(s,1,1)).toThrow();ledger(s);
 });
 for(const outcome of ["YES","NO","INVALID"] as const)it(`preserves B cover and all final burn claims after pair redemption: ${outcome}`,()=>{
  let s=dlpRedeemPairs(bought(),0,20);s=dlpTransferLP(s,0,1,s.accounts[0].lp/3);s=dlpTransferB(s,1,2,s.accounts[1].z/4);
  if(outcome!=="INVALID")s=dlpCoreStake(s,2,outcome,100);
  const v=outcome==="YES"?s.inventory[0]:outcome==="NO"?s.inventory[1]:(s.inventory[0]+s.inventory[1])/2;
  const cover=Math.min(s.B,Math.max(s.basis-s.cash-s.lpFees-v,0));
  s=dlpFinalize(dlpAdvanceTime(s,s.TC));expect(s.cover).toBeCloseTo(cover,7);
  s=dlpClaimLP(s,1,s.accounts[1].lp/4);s=dlpClaimB(s,2,s.accounts[2].z/5);
  s=dlpTransferLP(s,2,0,s.accounts[2].lp/2);s=dlpTransferB(s,0,1,s.accounts[0].z/2);
  for(let id=0;id<3;id++){s=dlpClaim(s,id);s=dlpClaimCore(s,id);expect(()=>dlpClaim(s,id)).toThrow();ledger(s);}
  s=dlpClaimFees(s,"CREATOR",1);if(s.protocolFees>0)s=dlpClaimFees(s,"PROTOCOL",2);if(s.coreOfficialBudget>0)s=dlpClaimCoreOfficial(s,2);
  expect(dlpAccounting(s).wallets).toBeCloseTo(30000,7);expect(dlpAccounting(s).reserves).toBeCloseTo(0,7);ledger(s);
 });
});
