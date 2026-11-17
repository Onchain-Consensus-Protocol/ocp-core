import {describe,it,expect} from 'vitest';
import type {ChainActivity,ChainPriceHistory} from './priceHistory';
import {buildFormalPriceHistory} from './formalPriceHistory';
const WAD=10n**18n;
const e=(kind:string,extra:Partial<ChainActivity>={}):ChainActivity=>({id:'event',kind,at:100,blockNumber:1,blockHash:'0x1',transactionHash:'0x2',logIndex:0,...extra});
const history=(...events:ChainActivity[]):ChainPriceHistory=>({events,genesis:[],creationBlock:1,latestBlock:100,complete:true,formalVolume:0n});
const graduate=e('GRADUATE',{amount:WAD});
const trade=(kind:string,isYes:boolean,quantity=WAD,logIndex=1)=>e(kind,{isYes,quantity,logIndex});
describe('formal price history approximate continuous LMSR replay',()=>{
 it('starts at real graduation and returns complementary prices',()=>{
  const p=buildFormalPriceHistory(history(e('GENESIS_BUY'),graduate,trade('FORMAL_BUY',true)),18);
  expect(p[0]).toEqual({at:100,yes:.5,no:.5});expect(p[1].yes).toBeCloseTo(1/(1+Math.exp(-1)),14);
  for(const point of p)expect(point.yes+point.no).toBe(1);
 });
 it('selling reverses a buy and opposite buys cancel the difference',()=>{
  const p=buildFormalPriceHistory(history(graduate,trade('FORMAL_BUY',true),trade('FORMAL_SELL',true,WAD,2),trade('FORMAL_BUY',false,WAD,3),trade('FORMAL_BUY',true,WAD,4)),18);
  expect(p[2].yes).toBe(.5);expect(p[3].yes).toBeLessThan(.5);expect(p[4].yes).toBe(.5);
 });
 it('scales six-decimal collateral to the same WAD depth as eighteen decimals',()=>{
  expect(buildFormalPriceHistory(history(e('GRADUATE',{amount:1_000_000n}),trade('FORMAL_BUY',true)),6)).toEqual(buildFormalPriceHistory(history(graduate,trade('FORMAL_BUY',true)),18));
 });
 it('sorts by block and log index while retaining same-time points',()=>{
  const p=buildFormalPriceHistory(history(trade('FORMAL_BUY',false,WAD,2),trade('FORMAL_BUY',true,WAD,1),graduate),18);
  expect(p).toHaveLength(3);expect(p.map(v=>v.at)).toEqual([100,100,100]);expect(p[1].yes).toBeGreaterThan(.5);expect(p[2].yes).toBe(.5);
  const later=trade('FORMAL_BUY',true,WAD,0);later.blockNumber=2;
  expect(buildFormalPriceHistory(history(later,graduate),18)[1].yes).toBeGreaterThan(.5);
 });
 it('paired redemption leaves price unchanged; claims do not generate prices',()=>{
  const p=buildFormalPriceHistory(history(graduate,trade('FORMAL_BUY',true,2n*WAD),trade('FORMAL_BUY',false,WAD,2),e('REDEEM_PAIRS',{quantity:WAD,logIndex:3}),e('CLAIM',{logIndex:4})),18);
  expect(p).toHaveLength(4);expect(p[3]).toEqual(p[2]);
 });
 it('matches positive and negative 60-depth saturation',()=>{
  for(const isYes of [true,false]){
   const p=buildFormalPriceHistory(history(graduate,trade('FORMAL_BUY',isYes,60n*WAD)),18);
   expect(p[1].yes).toBe(isYes?1:0);expect(p[1].no).toBe(isYes?0:1);
  }
 });
 it('handles enormous quantities without exponential overflow',()=>{
  expect(buildFormalPriceHistory(history(graduate,trade('FORMAL_BUY',false,2n**192n-1n)),18)[1].yes).toBe(0);
 });
 it('does not invent an origin for Genesis, missing graduation or invalid depth',()=>{
  expect(buildFormalPriceHistory(history(e('GENESIS_BUY')),18)).toEqual([]);
  expect(buildFormalPriceHistory(history(trade('FORMAL_BUY',true)),18)).toEqual([]);
  for(const amount of [undefined,0n,-1n])expect(buildFormalPriceHistory(history(e('GRADUATE',{amount}),trade('FORMAL_BUY',true)),18)).toEqual([]);
 });
 it('rejects invalid units and incomplete trade fields',()=>{
  for(const decimals of [-1,19,1.5])expect(buildFormalPriceHistory(history(graduate),decimals)).toEqual([]);
  expect(buildFormalPriceHistory(history(graduate,e('FORMAL_BUY',{quantity:WAD,logIndex:1})),18)).toEqual([]);
 });
});
