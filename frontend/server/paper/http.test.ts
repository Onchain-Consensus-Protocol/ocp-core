import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {describe,it,expect,vi} from 'vitest';
import {createPaperHandler,type PaperHandlerDependencies} from './http';
import {createPaperMarket,projectPaperMarket} from './engine';
import {PaperStoreError,type PaperMutationContext,type PaperMutationUpdate} from './store';
import {STOCK_DEMO_ASSETS} from '../../components/stockDemoRouting';
import {createShareSnapshot} from '../share/snapshot';

const origin='https://market.example.test';
const env={CLERK_SECRET_KEY:'secret-never-return',DATABASE_URL:'postgres://hidden-password',PAPER_ALLOWED_ORIGINS:origin,NODE_ENV:'production'};
const user={id:'internal-user',name:'Player',email:'google@example.test',balanceMicros:100_000_000_000n};
const identity=()=>({id:'clerk-subject',firstName:'Player',primaryEmailAddressId:'email-1',externalAccounts:[{provider:'oauth_google',emailAddress:user.email,verification:{status:'verified'}}],emailAddresses:[{id:'email-1',emailAddress:user.email,verification:{status:'verified'}}]});
const createBody={requestId:'request_1234567890',title:'Test',yesRule:'Yes',noRule:'No',invalidRule:'Invalid',assetSymbol:STOCK_DEMO_ASSETS[0].symbol,coreHours:6};
function setup(overrides:PaperHandlerDependencies={}){
 const nowMs=1_000_000;
 const market=createPaperMarket('market-1',user.id,createBody,nowMs);
 const store={ensureUser:vi.fn(async()=>({...user})),listMarkets:vi.fn(async()=>[market]),getMarket:vi.fn(async()=>market),mutate:vi.fn(async(_u:string,_r:string,_h:string,_m:string|null,callback:(context:PaperMutationContext)=>unknown)=>{
  const result=await callback({user:{...user},market:_m?structuredClone(market):null}) as PaperMutationUpdate;return result.response;
 })};
 const verifySession=vi.fn(async()=>({sub:'clerk-subject',azp:origin}));
 const getIdentity=vi.fn(async()=>identity());
 const handler=createPaperHandler({env,getStore:()=>store,verifySession,getIdentity,now:()=>nowMs,...overrides});
 return {handler,store,verifySession,getIdentity,market,nowMs};
}
async function request(handler:ReturnType<typeof createPaperHandler>,op:string,options:{method?:string;payload?:unknown;raw?:string;headers?:Record<string,string|undefined>}={}){
 const method=options.method??(['session','market','markets'].includes(op)?'GET':'POST');
 const raw=options.raw??(options.payload===undefined?'':JSON.stringify(options.payload));
 const headers:Record<string,string>={origin,authorization:'Bearer good-token','content-type':'application/json'};
 for(const [key,value]of Object.entries(options.headers??{})){if(value===undefined)delete headers[key];else headers[key]=value;}
 const req=Object.assign(Readable.from(raw?[Buffer.from(raw)]:[]),{method,url:`/api/paper?op=${op}&id=market-1`,headers}) as IncomingMessage;
 let encoded='';const sentHeaders:Record<string,unknown>={};
 const res={statusCode:200,setHeader:(key:string,value:unknown)=>{sentHeaders[key]=value;},end:(value:string)=>{encoded=value;}} as unknown as ServerResponse;
 await handler(req,res);return {status:res.statusCode,body:JSON.parse(encoded),headers:sentHeaders};
}

describe('paper HTTP security boundary',()=>{
 it('creates only authenticated, server-calculated personal snapshots and rejects forged fields',async()=>{
  const s=setup(),snapshot=createShareSnapshot(s.market,user.id,'dark',s.nowMs,'00000000-0000-4000-8000-000000000001');
  const save=vi.fn(async()=>snapshot);
  const configured=setup({getStore:()=>({...s.store,createShareSnapshot:save})});
  const payload={marketId:s.market.id,theme:'dark',requestId:'share_request_000001'};
  const good=await request(configured.handler,'share',{payload});
  expect(good.status).toBe(200);expect(save).toHaveBeenCalledWith(user.id,s.market.id,'dark',payload.requestId,expect.any(Function));expect(good.body.url).toContain('?snapshot=');expect(good.headers['Cache-Control']).toBe('no-store');
  save.mockClear();
  for(const extra of [{pnl:999999},{userId:'victim'},{theme:'url(https://evil.test)'}])expect((await request(configured.handler,'share',{payload:{...payload,...extra}})).status).toBe(400);
  expect((await request(configured.handler,'share',{payload,headers:{authorization:undefined}})).status).toBe(401);
  expect(save).not.toHaveBeenCalled();
 });
 it('executes a quoted buy with zero receive floor, then sells and updates holdings/balance',async()=>{
  const nowMs=1_000_000;let stored=createPaperMarket('market-1',user.id,createBody,nowMs),wallet=user.balanceMicros;
  const store={ensureUser:async()=>({...user,balanceMicros:wallet}),listMarkets:async()=>[stored],getMarket:async()=>stored,
   mutate:async(_u:string,_r:string,_h:string,_m:string|null,callback:(context:PaperMutationContext)=>PaperMutationUpdate)=>{const next=await callback({user:{...user,balanceMicros:wallet},market:structuredClone(stored)});stored=next.market;wallet=next.walletMicros;return next.response;}};
  const handler=createPaperHandler({env,getStore:()=>store,verifySession:async()=>({sub:'clerk-subject',azp:origin}),getIdentity:async()=>identity(),now:()=>nowMs});
  const buyAction={type:'GENESIS_BUY',budgetUSD:'100'};
  const q=await request(handler,'quote',{payload:{marketId:stored.id,action:buyAction}});expect(q.status).toBe(200);
  const buy=await request(handler,'trade',{payload:{marketId:stored.id,requestId:'buy_request_000001',expectedRevision:q.body.revision,action:buyAction,maxPayUSD:'101',minReceiveUSD:'0.000000'}});
  expect(buy.status).toBe(200);expect(Number(buy.body.market.position.gToken)).toBeGreaterThan(0);expect(Number(buy.body.balanceUSD)).toBeCloseTo(99900,5);
  const sellAction={type:'GENESIS_SELL',quantity:(Number(buy.body.market.position.gToken)/2).toFixed(6)};
  const sq=await request(handler,'quote',{payload:{marketId:stored.id,action:sellAction}});expect(sq.status).toBe(200);
  const sell=await request(handler,'trade',{payload:{marketId:stored.id,requestId:'sell_request_00001',expectedRevision:sq.body.revision,action:sellAction,maxPayUSD:'0.000000',minReceiveUSD:(Number(sq.body.receiveUSD)*.99).toFixed(6)}});
  expect(sell.status).toBe(200);expect(Number(sell.body.balanceUSD)).toBeGreaterThan(Number(buy.body.balanceUSD));expect(Number(sell.body.market.position.gToken)).toBeLessThan(Number(buy.body.market.position.gToken));
  const strict=await request(handler,'trade',{payload:{marketId:stored.id,requestId:'bad_request_000001',expectedRevision:stored.revision,action:buyAction,maxPayUSD:'1',minReceiveUSD:'0'}});expect(strict.status).toBe(409);expect(strict.body.error).toBe('SLIPPAGE');
 });
 it('requires server-verified primary email before granting',async()=>{
  const s=setup();const response=await request(s.handler,'session');
  expect(response.status).toBe(200);expect(response.body.user.id).toBe(user.id);
  expect(s.store.ensureUser).toHaveBeenCalledWith({subject:'clerk-subject',email:user.email,name:'Player'});
  expect(s.verifySession).toHaveBeenCalledWith('good-token',env.CLERK_SECRET_KEY,[origin]);
  expect(response.headers['Cache-Control']).toBe('no-store');
 });
 it('accepts verified email without Google and rejects unverified or non-primary email',async()=>{
  const changed=identity();changed.externalAccounts=[];
  const s=setup({getIdentity:async()=>changed});expect((await request(s.handler,'session')).status).toBe(200);
  for(const mode of ['unverified','missing','nonprimary']){
   const invalid=identity();invalid.externalAccounts=[];
   if(mode==='unverified')invalid.emailAddresses[0].verification.status='unverified';
   if(mode==='missing')invalid.emailAddresses=[];
   if(mode==='nonprimary')invalid.primaryEmailAddressId='other';
   const denied=setup({getIdentity:async()=>invalid});expect((await request(denied.handler,'session')).status).toBe(403);expect(denied.store.ensureUser).not.toHaveBeenCalled();
  }
 });
 it('rejects legacy deadline overrides and derives cutoffs from Core only',async()=>{
  for(const patch of [{formalHours:5},{formalHours:null},{topicHours:6},{coreHours:4}]){
   const s=setup();expect((await request(s.handler,'create',{payload:{...createBody,...patch}})).status).toBe(400);expect(s.store.mutate).not.toHaveBeenCalled();
  }
 });
 it('accepts an absolute cutoff and keeps it fixed while waiting for the wallet lock',async()=>{
  let clock=1_000_000;const s=setup({now:()=>clock});const {coreHours,...fields}=createBody;const deadline=Math.floor(clock/1000)+21600;
  s.store.mutate.mockImplementation(async(_u,_r,_h,_m,callback)=>{clock+=3600000;const result=await callback({user,market:null}) as PaperMutationUpdate;return result.response;});
  const r=await request(s.handler,'create',{payload:{...fields,coreDeadline:deadline}});expect(r.status).toBe(200);expect(r.body.market.coreDeadline).toBe(deadline);expect(r.body.market.genesisDeadline).toBe(deadline-7200);expect(r.body.market.formalDeadline).toBe(deadline-3600);
 });
 it('rejects an absolute cutoff that becomes only four hours away inside the lock',async()=>{
  let clock=1_000_000;const s=setup({now:()=>clock});const {coreHours,...fields}=createBody;const deadline=Math.floor(clock/1000)+21600;
  s.store.mutate.mockImplementation(async(_u,_r,_h,_m,callback)=>{clock+=7200000;const result=await callback({user,market:null}) as PaperMutationUpdate;return result.response;});
  const r=await request(s.handler,'create',{payload:{...fields,coreDeadline:deadline}});expect(r.status).toBe(400);expect(r.body.error).toBe('TIME');
 });
 it('rejects conflicting, missing or malformed calendar deadlines before mutation',async()=>{
  const {coreHours,...fields}=createBody;
  for(const payload of [fields,{...createBody,coreDeadline:30000},...['bad',null,30000.5,1800000000000,253402300800].map(coreDeadline=>({...fields,coreDeadline}))]){const s=setup();expect((await request(s.handler,'create',{payload})).status).toBe(400);expect(s.store.mutate).not.toHaveBeenCalled();}
 });
 it('replays the same successful absolute deadline after it is past without re-executing creation',async()=>{
  let clock=1_000_000;const s=setup({now:()=>clock});const {coreHours,...fields}=createBody;const payload={...fields,coreDeadline:Math.floor(clock/1000)+21600};let saved:unknown;let savedHash='';let calls=0;
  s.store.mutate.mockImplementation(async(_u,_r,hash,_m,callback)=>{if(saved){if(hash!==savedHash)throw new PaperStoreError('IDEMPOTENCY_CONFLICT',409);return saved as never;}calls++;savedHash=hash;const next=await callback({user,market:null}) as PaperMutationUpdate;saved=next.response;return next.response;});
  const first=await request(s.handler,'create',{payload});expect(first.status).toBe(200);clock+=86400000;const replay=await request(s.handler,'create',{payload});expect(replay.status).toBe(200);expect(replay.body.market.id).toBe(first.body.market.id);expect(calls).toBe(1);expect((await request(s.handler,'create',{payload:{...payload,coreDeadline:payload.coreDeadline+3600}})).status).toBe(409);
 });
 it('rejects failed verification, missing or foreign authorized party, and identity mismatch',async()=>{
  const bad:PaperHandlerDependencies[]=[
   {verifySession:async()=>{throw new Error('secret token details');}},
   {verifySession:async()=>({sub:'clerk-subject'})},
   {verifySession:async()=>({sub:'clerk-subject',azp:'https://evil.test'})},
   {getIdentity:async()=>({...identity(),id:'someone-else'})},
  ];
  for(const overrides of bad){const s=setup(overrides);const response=await request(s.handler,'session');expect(response.status).toBe(401);expect(response.body.error).toBe('AUTH_REQUIRED');expect(s.store.ensureUser).not.toHaveBeenCalled();}
 });
 it('rejects foreign origins and missing POST Origin before provider or database access',async()=>{
  for(const value of ['https://evil.test',undefined]){
   const s=setup();const response=await request(s.handler,'create',{payload:createBody,headers:{origin:value}});
   expect(response.status).toBe(403);expect(s.verifySession).not.toHaveBeenCalled();expect(s.store.mutate).not.toHaveBeenCalled();
  }
 });
 it('does not treat a forged body account as authentication',async()=>{
  const s=setup();const denied=await request(s.handler,'create',{payload:{...createBody,userId:user.id},headers:{authorization:undefined}});
  expect(denied.status).toBe(401);expect(s.store.mutate).not.toHaveBeenCalled();
  const allowed=await request(s.handler,'create',{payload:{...createBody,userId:'victim'}});
  expect(allowed.status).toBe(400);expect(s.store.mutate).not.toHaveBeenCalled();
 });
 it('fails closed when production origin configuration is absent',async()=>{
  const s=setup({env:{...env,PAPER_ALLOWED_ORIGINS:''}});const response=await request(s.handler,'session');
  expect(response.status).toBe(503);expect(response.body).toEqual({error:'SERVICE_UNAVAILABLE'});
 });
 it('allows a configuration status response but no unconfigured writes',async()=>{
  const s=setup({env:{}});const session=await request(s.handler,'session',{headers:{authorization:undefined}});expect(session.body.configured).toBe(false);
  expect((await request(s.handler,'create',{payload:createBody,headers:{authorization:undefined}})).status).toBe(503);
 });
 it('enforces operation methods, JSON object content and body limits',async()=>{
  const s=setup();
  expect((await request(s.handler,'create',{method:'GET'})).status).toBe(405);
  expect((await request(s.handler,'unknown')).status).toBe(404);
  expect((await request(s.handler,'create',{payload:createBody,headers:{'content-type':'text/plain'}})).status).toBe(415);
  expect((await request(s.handler,'create',{raw:'[1,2]'})).status).toBe(400);
  expect((await request(s.handler,'create',{raw:'null'})).status).toBe(400);
  expect((await request(s.handler,'create',{raw:'{invalid'})).status).toBe(400);
  expect((await request(s.handler,'create',{raw:'x'.repeat(16001)})).status).toBe(413);
  expect((await request(s.handler,'create',{payload:createBody,headers:{'content-length':'16001'}})).status).toBe(413);
  expect(s.store.mutate).not.toHaveBeenCalled();
 });
 it('validates request ID, action amounts, side and revision before mutation',async()=>{
  const s=setup();
  expect((await request(s.handler,'create',{payload:{...createBody,requestId:'tiny'}})).status).toBe(400);
  const trade={marketId:'market-1',requestId:createBody.requestId,expectedRevision:0,action:{type:'FORMAL_BUY',side:'INVALID',budgetUSD:'10'}};
  expect((await request(s.handler,'trade',{payload:trade})).status).toBe(400);
  expect((await request(s.handler,'trade',{payload:{...trade,action:{type:'GENESIS_BUY',budgetUSD:10}}})).status).toBe(400);
  expect((await request(s.handler,'trade',{payload:{...trade,action:{type:'GENESIS_BUY',budgetUSD:'10'},expectedRevision:1.1}})).status).toBe(409);
  expect(s.store.mutate).not.toHaveBeenCalled();
 });
 it('samples real server time inside the wallet/market lock callback',async()=>{
  let clock=1_000_000;const s=setup({now:()=>clock});
  s.store.mutate.mockImplementation(async(_u,_r,_h,_m,callback)=>{
   clock=s.nowMs+s.market.state.TG*1000;
   return (await callback({user,market:structuredClone(s.market)})) as never;
  });
  const response=await request(s.handler,'trade',{payload:{marketId:'market-1',requestId:createBody.requestId,expectedRevision:0,action:{type:'GENESIS_BUY',budgetUSD:'10'}}});
  expect(response.status).toBe(409);expect(response.body.error).toBe('STALE_QUOTE');
 });
 it('checks limits against actual wallet changes inside the transaction',async()=>{
  const s=setup();const response=await request(s.handler,'trade',{payload:{marketId:'market-1',requestId:createBody.requestId,expectedRevision:0,action:{type:'GENESIS_BUY',budgetUSD:'10'},maxPayUSD:'0'}});
  expect(response.status).toBe(409);expect(response.body.error).toBe('SLIPPAGE');
 });
 it('canonicalizes request object order while preserving actual endpoint identity',async()=>{
  const s=setup();await request(s.handler,'create',{payload:createBody});
  const reversed=Object.fromEntries(Object.entries(createBody).reverse());await request(s.handler,'create',{payload:reversed});
  expect(s.store.mutate.mock.calls[0][2]).toBe(s.store.mutate.mock.calls[1][2]);
 });
 it('returns generic 503 for unexpected database or provider errors without leaking secrets',async()=>{
  const s=setup();s.store.listMarkets.mockRejectedValue(Object.assign(new Error('password=top-secret host=private-db'),{status:400,code:'08006'}));
  const response=await request(s.handler,'markets');expect(response.status).toBe(503);expect(response.body).toEqual({error:'SERVICE_UNAVAILABLE'});
  const p=setup({getIdentity:async()=>{throw new Error('clerk_secret=private');}});
  expect((await request(p.handler,'session')).body).toEqual({error:'SERVICE_UNAVAILABLE'});
 });
 it('serves public markets with PostgreSQL configured before Clerk is provisioned',async()=>{
  const s=setup({env:{DATABASE_URL:env.DATABASE_URL,NODE_ENV:'production'}});
  expect((await request(s.handler,'markets',{headers:{authorization:undefined}})).status).toBe(200);
  expect((await request(s.handler,'session',{headers:{authorization:undefined}})).body.configured).toBe(false);
  expect((await request(s.handler,'markets')).status).toBe(401);
  expect((await request(s.handler,'create',{payload:createBody,headers:{authorization:undefined}})).status).toBe(503);
  expect(s.verifySession).not.toHaveBeenCalled();
 });
 it('caches only verified identities for 60 seconds while verifying every token',async()=>{
  let clock=1_000_000;const s=setup({now:()=>clock});
  await request(s.handler,'session');await request(s.handler,'session');
  expect(s.getIdentity).toHaveBeenCalledTimes(1);expect(s.verifySession).toHaveBeenCalledTimes(2);
  clock+=60_000;await request(s.handler,'session');expect(s.getIdentity).toHaveBeenCalledTimes(2);
 });

});
