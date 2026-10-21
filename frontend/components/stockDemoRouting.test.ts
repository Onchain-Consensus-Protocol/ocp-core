import {describe,it,expect} from 'vitest';
import {STOCK_DEMO_ASSETS,createStockDemo,routeStockDemo} from './stockDemoRouting';
import {dlpCreate,dlpBuy,dlpSell,dlpAdvanceTime,dlpClaim,dlpAccounting,dlpCoreStake,dlpFormalBuy,dlpFormalSell,dlpFinalize,dlpClaimCore} from './dlpDemoModel';
describe('stock collateral demo routes',()=>{
 for(const asset of STOCK_DEMO_ASSETS)it(asset.symbol+' preserves units and roundtrip / failed claim',()=>{
  let s=dlpCreate(createStockDemo(asset.price)),u=[5000,5000,5000];
  const total=()=>dlpAccounting(s).total*asset.price+u.reduce((a,b)=>a+b,0);
  expect(total()).toBeCloseTo(30000);
  const apply=(fn:Parameters<typeof routeStockDemo>[5])=>{const r=routeStockDemo(s,u,0,asset.price,true,fn);s=r.state;u=r.stable;expect(total()).toBeCloseTo(30000,5)};
  apply(v=>dlpBuy(v,0,1000/asset.price));expect(u[0]).toBeCloseTo(4000);expect(s.accounts[0].wallet).toBeCloseTo(5000/asset.price);expect(s.R).toBeCloseTo(945/asset.price);
  apply(v=>dlpSell(v,0,v.accounts[0].g/2));
  const old=JSON.stringify({s,u});expect(()=>routeStockDemo(s,u,0,asset.price,true,v=>dlpBuy(v,0,100000/asset.price))).toThrow();expect(JSON.stringify({s,u})).toBe(old);
  apply(v=>dlpAdvanceTime(v,3600));apply(v=>dlpClaim(v,0));expect(s.accounts[0].g+s.accounts[0].z).toBe(0);expect(()=>routeStockDemo(s,u,0,asset.price,true,v=>dlpClaim(v,0))).toThrow();
 });
 it('graduates and routes formal/Core settlement to the original account',()=>{
 const price=250;let s=dlpCreate(createStockDemo(price)),u=[5000,5000,5000];
 for(let id=0;id<3;id++){
  let r=routeStockDemo(s,u,id,price,false,v=>dlpBuy(v,id,5000/price));s=r.state;u=r.stable;
  r=routeStockDemo(s,u,id,price,true,v=>dlpBuy(v,id,4500/price));s=r.state;u=r.stable;
 }
 expect(s.phase).toBe('FORMAL');
 const apply=(fn:Parameters<typeof routeStockDemo>[5])=>{const r=routeStockDemo(s,u,0,price,true,fn);s=r.state;u=r.stable};
 apply(v=>dlpCoreStake(v,0,'YES',1/price));expect(s.accounts[0].coreStake).toBeCloseTo(1/price);
 apply(v=>dlpFormalBuy(v,0,'YES',.1));apply(v=>dlpFormalSell(v,0,'YES',.1));apply(v=>dlpAdvanceTime(v,10800));apply(dlpFinalize);apply(v=>dlpClaim(v,0));apply(v=>dlpClaimCore(v,0));
 expect(s.accounts[0].lp+s.accounts[0].z).toBe(0);expect(dlpAccounting(s).total*price+u.reduce((a,b)=>a+b,0)).toBeCloseTo(30000,5);
 });
 it('rejects invalid prices without mutating inputs',()=>{expect(()=>createStockDemo(0)).toThrow();expect(()=>createStockDemo(Infinity)).toThrow()});
});
