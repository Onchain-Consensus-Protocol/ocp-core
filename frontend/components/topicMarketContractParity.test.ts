import {describe,it,expect} from 'vitest';
import snapshots from './fixtures/topicMarketLockedEvmParity.json';
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketFormalBuy,topicMarketFormalSell,topicMarketTransferLP,topicMarketTransferB,topicMarketClaimLP,topicMarketClaimB,topicMarketCoreStake,topicMarketAdvanceTime,topicMarketFinalize,topicMarketClaim,topicMarketClaimCore,topicMarketClaimFees,topicMarketClaimCoreOfficial,topicMarketPrices,topicMarketAccounting,type TopicMarketState} from './topicMarketDemoModel';
const errors = { money: 0, token: 0, probability: 0 };
function compare(s: TopicMarketState, expected: any) {
  const fields: Record<string, number> = { collateral6: s.collateral+s.outcomeBudget, cash6:s.cash,
    inventoryYWad:s.inventory[0], inventoryNWad:s.inventory[1], basisWad:s.basis, bWad:s.b,
    liquiditySupplyWad:s.lpSupply, lpFees6:s.lpFees, B6:s.B,
    coreFeesSent6:s.core.feeTotal, coreFeesEscrow6:s.core.feeTotal };
  const check = (actual:number, raw:string, unit:"money"|"token"|"probability", field:string) => {
    const value=Number(raw)/(unit==="money"?1e6:1e18), error=Math.abs(actual-value);
    errors[unit]=Math.max(errors[unit],error);
    // 单笔保留5micro界；终局账户合并多次burn和交易舍入，累计界8micro。
    // 该序列实际最大约6.58micro，不将浮点结果冒充整数完全相等。
    expect(error,`${expected.step}.${field}: ${actual} vs ${value}`).toBeLessThanOrEqual(unit==="probability"?1e-12:unit==="money"?(expected.step==="all_claimed"&&field.includes("wallet6")?8e-6:5e-6):1e-6);
  };
  for(const [key,value] of Object.entries(fields)) check(value,expected[key],key.endsWith("6")?"money":"token",key);
  check(s.redeemedPairs,String(BigInt(expected.merged6)+BigInt(expected.redeemed6)),"money","allBurnedPairs");
  if(expected.priceYesWad) check(topicMarketPrices(s).probability![0],expected.priceYesWad,"probability","priceYes");
  for(const a of expected.accounts) {
    const user=s.accounts[a.account];
    for(const [key,value] of Object.entries({wallet6:user.wallet,lpWad:user.lp,yesWad:user.yes,noWad:user.no,zWad:user.z}))
      check(value,a[key],key.endsWith("6")?"money":"token",`account${a.account}.${key}`);
  }
  expect(Math.abs(topicMarketAccounting(s).error)).toBeLessThan(1e-7);
}

it('matches real ERC20 LP/B transfers, partial burns, post-settlement transfer and final claims at 10 EVM checkpoints',()=>{
 let s=topicMarketCreate(createTopicMarketDemo());for(let id=0;id<3;id++)s=topicMarketBuy(s,id,9000);
 const rows=snapshots.tests.testDemoParityLockedTokensBurn;let i=0;const snap=()=>compare(s,rows[i++]);
 snap();s=topicMarketFormalBuy(s,2,'YES',80);snap();s=topicMarketTransferLP(s,0,1,10);snap();s=topicMarketTransferB(s,0,2,100);snap();
 s=topicMarketFormalSell(s,2,'YES',30);snap();s=topicMarketCoreStake(s,1,'YES',100);s=topicMarketFinalize(topicMarketAdvanceTime(s,s.TC));snap();
 s=topicMarketClaimLP(s,1,1);snap();s=topicMarketClaimB(s,2,50);snap();s=topicMarketTransferLP(s,1,2,2);snap();
 for(let id=0;id<3;id++)s=topicMarketClaim(s,id);s=topicMarketClaimCore(s,1);s=topicMarketClaimFees(s,'CREATOR',1);if(s.protocolFees>0)s=topicMarketClaimFees(s,'PROTOCOL',2);
 if(s.coreOfficialBudget>0)s=topicMarketClaimCoreOfficial(s,2);snap();expect(i).toBe(10);
});
