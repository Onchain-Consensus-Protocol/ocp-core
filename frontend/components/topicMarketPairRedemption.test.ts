import { describe, expect, it } from "vitest";
import { createTopicMarketDemo, topicMarketCreate, topicMarketBuy, topicMarketFormalBuy, topicMarketFormalSell, topicMarketRedeemPairs,
  topicMarketMaxFormalSellTokens, topicMarketCoordinates, topicMarketCoreStake, topicMarketAdvanceTime, topicMarketFinalize,
  topicMarketTransferLP,  topicMarketClaimLP,  topicMarketClaim, topicMarketClaimCore,
  topicMarketClaimFees, topicMarketClaimCoreOfficial, topicMarketAccounting, topicMarketAssertLedger } from "./topicMarketDemoModel";
type State=ReturnType<typeof createTopicMarketDemo>;
const formal=()=>{let s=topicMarketCreate(createTopicMarketDemo({Q:6000}));for(let id=0;id<3;id++)s=topicMarketBuy(s,id,9000);return s;};
const bought=()=>topicMarketFormalBuy(topicMarketFormalBuy(formal(),0,"YES",100),0,"NO",80);
const frozen=(s:State)=>({lpFees:s.lpFees,lpSupply:s.lpSupply,inventory:s.inventory,b:s.b});
const ledger=(s:State)=>{topicMarketAssertLedger(s);expect(topicMarketAccounting(s).error).toBeCloseTo(0,7);};
describe("TopicMarket locked LP: directly purchased outcome pair redemption",()=>{
 it("redeems only real purchased YES+NO and leaves locked LP assets untouched",()=>{
  let s=bought();const before=s,other=frozen(s);s=topicMarketRedeemPairs(s,0,20);
  expect(s.accounts[0].yes).toBe(80);expect(s.accounts[0].no).toBe(60);
  expect(s.accounts[0].wallet-before.accounts[0].wallet).toBeCloseTo(20,8);
  expect(s.cash).toBeCloseTo(before.cash-20,8);expect(s.redeemedPairs).toBe(20);
  expect(frozen(s)).toEqual(other);ledger(s);
 });
 it("accepts partial then remaining-pair redemption without minting or double paying",()=>{
  let s=bought();s=topicMarketRedeemPairs(s,0,20);s=topicMarketRedeemPairs(s,0,60);
  expect(s.redeemedPairs).toBe(80);expect(s.accounts[0].yes).toBe(20);expect(s.accounts[0].no).toBe(0);
  expect(()=>topicMarketRedeemPairs(s,0,1)).toThrow();ledger(s);
 });
 it("sells residual real holdings after pair burn within coordinates and cash",()=>{
  let s=topicMarketRedeemPairs(bought(),0,20);
  for(const side of ["YES","NO"] as const){const i=side==="YES"?0:1;const n=topicMarketMaxFormalSellTokens(s,0,side);
   const held=i===0?s.accounts[0].yes:s.accounts[0].no;expect(n).toBeCloseTo(held,7);
   expect(n).toBeLessThanOrEqual(topicMarketCoordinates(s)[i]+1e-7);s=topicMarketFormalSell(s,0,side,n);ledger(s);}
  expect(s.accounts[0].yes+s.accounts[0].no).toBeCloseTo(0,7);
 });
 it("allows pair redemption during WAIT_CORE but not after final settlement",()=>{
  let s=bought();s=topicMarketAdvanceTime(s,s.TF);s=topicMarketRedeemPairs(s,0,10);
  expect(()=>topicMarketFormalSell(s,0,"YES",1)).toThrow();s=topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));
  expect(()=>topicMarketRedeemPairs(s,0,1)).toThrow();ledger(s);
 });
 it("rejects nonfinite, excessive and unowned pair amounts without mutating state",()=>{
  const s=bought(),before=JSON.stringify(s);
  for(const n of [0,-1,NaN,Infinity,81]){expect(()=>topicMarketRedeemPairs(s,0,n)).toThrow();expect(JSON.stringify(s)).toBe(before);}
  expect(()=>topicMarketRedeemPairs(s,1,1)).toThrow();ledger(s);
 });
 for(const outcome of ["YES","NO","INVALID"] as const)it(`preserves all final burn claims after pair redemption: ${outcome}`,()=>{
  let s=topicMarketRedeemPairs(bought(),0,20);
  if(outcome!=="INVALID")s=topicMarketCoreStake(s,2,outcome,100);
  const v=outcome==="YES"?s.inventory[0]:outcome==="NO"?s.inventory[1]:(s.inventory[0]+s.inventory[1])/2;
  s=topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));
  for(let id=0;id<3;id++){s=topicMarketClaim(s,id);s=topicMarketClaimCore(s,id);expect(()=>topicMarketClaim(s,id)).toThrow();ledger(s);}
  if(s.creatorFees>0)s=topicMarketClaimFees(s,"CREATOR",1);if(s.protocolFees>0)s=topicMarketClaimFees(s,"PROTOCOL",2);if(s.coreOfficialBudget>0)s=topicMarketClaimCoreOfficial(s,2);
  expect(topicMarketAccounting(s).wallets).toBeCloseTo(30000,7);expect(topicMarketAccounting(s).reserves).toBeCloseTo(0,7);ledger(s);
 });
});
