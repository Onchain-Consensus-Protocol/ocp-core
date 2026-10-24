import {describe,it,expect} from 'vitest';
import {createDlpDemo,dlpCreate,dlpBuy,dlpAdvanceTime,dlpCoreStake,dlpFormalBuy,dlpFinalize} from './dlpDemoModel';
import {createStockDemo} from './stockDemoRouting';
describe('single final deadline',()=>{
 it('fixes Genesis at three hours and derives the remaining deadlines',()=>{
  const s=createDlpDemo();expect([s.TG,s.TF,s.TC,s.TT]).toEqual([10800,18000,21600,21600]);
  const custom=createStockDemo(250,2000,150,{TC:25200});expect([custom.TG,custom.TF,custom.TC,custom.TT]).toEqual([10800,21600,25200,25200]);
 });
 it('rejects invalid final deadlines and conflicting legacy overrides',()=>{
  for(const config of [{TC:14400},{TC:14399},{TF:14400,TC:21600},{TC:25200,TT:28800},{TC:30000,TT:25200},{TF:NaN},{TT:Infinity},{TC:21600.1}])expect(()=>createDlpDemo(config)).toThrow('CONFIG');
 });
 it('opens Core and Formal together on late graduation and settles at the shared final deadline',()=>{
  let s=dlpCreate(createDlpDemo());s=dlpAdvanceTime(s,s.TG-1);s=dlpBuy(s,0,10000);s=dlpBuy(s,1,10000);s=dlpBuy(s,2,7000);
  expect(s.phase).toBe('FORMAL');expect(s.core.openedAt).toBe(10799);expect([s.TF,s.TC,s.TT]).toEqual([18000,21600,21600]);
  s=dlpAdvanceTime(s,s.TF);expect(()=>dlpFormalBuy(s,0,'YES',1)).toThrow();s=dlpCoreStake(s,2,'YES',1);
  expect(()=>dlpFinalize(s)).toThrow('CORE_PENDING');s=dlpFinalize(dlpAdvanceTime(s,s.TC));expect(s.phase).toBe('SETTLED');expect(s.now).toBe(s.TT);
 });
 it('accepts a one-second positive Formal window and matching compatibility fields',()=>{const s=createDlpDemo({TC:14401,TF:10801,TT:14401});expect(s.TF-s.TG).toBe(1);expect(s.TC-s.TF).toBe(3600);});
 it('fails exactly at Genesis cutoff without opening Core',()=>{
  let s=dlpCreate(createDlpDemo());s=dlpAdvanceTime(s,s.TG);expect(s.phase).toBe('FAILED');expect(s.core.openedAt).toBeNull();
 });
});
