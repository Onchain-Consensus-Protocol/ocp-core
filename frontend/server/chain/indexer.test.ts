import {describe,it,expect,vi} from 'vitest';
import {Interface,ZeroAddress,type Provider,type Log} from 'ethers';
import factoryAbi from '../../testnet/abi/TopicMarketStockFactory.json';
import marketAbi from '../../testnet/abi/TopicMarket.json';
import {CURRENT_TESTNET_FACTORY,CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK} from '../../shared/testnetDeployment.js';
import {syncIndexedMarket} from './indexer.js';
import type {HistoryStore,HistoryKey,HistoryPatch,IndexedHistoryRow} from './types.js';
const factory='0x0000000000000000000000000000000000001234',market='0x0000000000000000000000000000000000005678';
const key:HistoryKey={chainId:46630,factory,market};
const fi=new Interface(factoryAbi),mi=new Interface(marketAbi);
const hash=(n:number,revision=0)=>'0x'+BigInt(n+revision*1000000).toString(16).padStart(64,'0');
class MemoryStore implements HistoryStore {
 rows=new Map<string,IndexedHistoryRow>();tokens=new Map<string,string>();sequence=0;denyGlobal=false;loseCheckpoint=false;
 claims:Array<{key:HistoryKey;cooldown:number;lease:number}>=[];releases:Array<{key:HistoryKey;token:string;cooldown:number;error?:string}>=[];
 async get(k:HistoryKey){return this.rows.get(k.market)??null;}
 async claim(k:HistoryKey,cooldown=0,lease=0){this.claims.push({key:k,cooldown,lease});if(this.tokens.has(k.market)||(k.market===ZeroAddress&&this.denyGlobal))return null;
  const token=String(++this.sequence),row=this.rows.get(k.market)??{...k,checkpoint:null,origin:null,descriptor:null,targetBlock:null,throughTimestamp:null,updatedAt:0,leaseUntil:null,lastError:null};this.rows.set(k.market,row);this.tokens.set(k.market,token);return {token,row:{...row}};}
 async save(k:HistoryKey,token:string,patch:HistoryPatch){if(this.tokens.get(k.market)!==token)return false;if(patch.checkpoint&&this.loseCheckpoint){this.tokens.set(k.market,'successor');return false;}Object.assign(this.rows.get(k.market)!,patch);return true;}
 async release(k:HistoryKey,token:string,_cooldown=0,error?:string){this.releases.push({key:k,token,cooldown:_cooldown,error});if(this.tokens.get(k.market)===token){this.tokens.delete(k.market);this.rows.get(k.market)!.lastError=error??null;}}
}
function fixture(options:{factory?:string;creation?:number;head?:number;rangeLimit?:number;badOriginHash?:boolean;wrongIndexedMarket?:boolean;prunedState?:'phase'|'S'|'failedSupply';stateErrorCode?:string}={}){
 const factory=options.factory??'0x0000000000000000000000000000000000001234',creation=options.creation??10,createdAt=1000+creation,coreCutoff=createdAt+9000;
 const store=new MemoryStore();let revision=0,registered=true,wrongChain=false,badSupply=false,headerFailure=false,failed=false,head=options.head??100;
 const ranges:Array<{address:string;from:number;to:number}>=[];
 const header=(n:number)=>({number:n,timestamp:1000+n,hash:hash(n,n>=15?revision:0)});
 const log=(address:string,blockNumber:number,data:{topics:string[];data:string},index=0)=>({address,blockNumber,blockHash:header(blockNumber).hash,transactionHash:hash(blockNumber+100),transactionIndex:0,index,removed:false,...data}) as unknown as Log;
 const origin=()=>{const value=log(factory,creation,fi.encodeEventLog(fi.getEvent('MarketCreated')!,[options.wrongIndexedMarket?'0x0000000000000000000000000000000000009999':market,market,market,market,createdAt,coreCutoff-7200,coreCutoff-3600,coreCutoff,coreCutoff,0]));return options.badOriginHash?{...value,blockHash:hash(creation,99)} as unknown as Log:value;};
 const trade=()=>log(market,creation+1,mi.encodeEventLog(mi.getEvent('GenesisTrade')!,[market,true,100,100]));
 const provider={getNetwork:vi.fn(async()=>({chainId:wrongChain?1n:46630n})),getBlock:vi.fn(async(n:number|'latest')=>{if(headerFailure&&n===19)throw Error('temporary RPC outage');return header(n==='latest'?head:n);}),
  getLogs:vi.fn(async(f:{address:string;fromBlock:number;toBlock:number})=>{ranges.push({address:f.address,from:Number(f.fromBlock),to:Number(f.toBlock)});if(options.rangeLimit&&Number(f.toBlock)-Number(f.fromBlock)+1>options.rangeLimit)throw Error('block range too large');return (f.address===factory?[origin()]:[trade()]).filter(l=>l.blockNumber>=Number(f.fromBlock)&&l.blockNumber<=Number(f.toBlock));}),
  call:vi.fn(async(tx:{data:string;blockTag?:number})=>{
   const iface=tx.data.slice(0,10)===fi.getFunction('isMarket')!.selector||tx.data.slice(0,10)===fi.getFunction('marketRecord')!.selector||tx.data.slice(0,10)===fi.getFunction('marketCollateral')!.selector?fi:mi;
   const fragment=iface.getFunction(tx.data.slice(0,10))!;
   if(fragment.name===options.prunedState)throw Object.assign(Error('historical state unavailable'),{code:options.stateErrorCode??'CALL_EXCEPTION'});
   const values:Record<string,unknown[]>={isMarket:[registered],marketRecord:[[market,market,market,createdAt,coreCutoff-3600,coreCutoff,coreCutoff,0,'topic','yes','no','invalid']],marketCollateral:[market],k:[1000000000000n],phase:[failed?4:0],S:[badSupply?101:100],failedSupply:[100]};
   return iface.encodeFunctionResult(fragment,values[fragment.name]);
  })} as unknown as Provider;
 return {store,provider,ranges,run:(maxBlocks:number|undefined=10)=>syncIndexedMarket({provider,factory,market,store,maxBlocks}),fork:()=>revision++,unregister:()=>registered=false,wrongChain:()=>wrongChain=true,badSupply:()=>badSupply=true,setHead:(n:number)=>head=n,failHeader:()=>headerFailure=true,failedPhase:()=>failed=true};
}
describe('shared history indexer',()=>{
 it('gates RPC behind the global lease and factory registration',async()=>{
  const f=fixture();f.store.denyGlobal=true;expect((await f.run()).status).toBe('busy');expect(f.provider.getNetwork).not.toHaveBeenCalled();
  f.store.denyGlobal=false;f.unregister();expect((await f.run()).status).toBe('not-market');expect(f.provider.getLogs).not.toHaveBeenCalled();expect(f.store.claims.filter(x=>x.key.market===market)).toHaveLength(0);
  expect(f.store.releases.at(-1)?.key.market).toBe(ZeroAddress);expect(f.store.releases.at(-1)?.cooldown).toBe(1000);
 });
 it('rejects wrong chain before contract reads',async()=>{const f=fixture();f.wrongChain();expect((await f.run()).status).toBe('failed');expect(f.provider.call).not.toHaveBeenCalled();expect(f.store.releases.at(-1)?.error).toBe('WRONG_CHAIN');});
 it('saves origin, bounds scans, and keeps real target separate from scanned completeness',async()=>{
  const f=fixture(),result=await f.run();expect(result.status).toBe('updated');expect(result.row?.checkpoint?.latestBlock).toBe(19);expect(result.row?.targetBlock).toBe(100);expect(result.row?.throughTimestamp).toBe(1019);
  expect(f.ranges.filter(r=>r.address===market)).toEqual([{address:market,from:10,to:19}]);expect(result.row?.origin?.log.blockNumber).toBe(10);
  expect(f.store.claims.map(c=>[c.key.market,c.cooldown,c.lease])).toEqual([[ZeroAddress,0,45000],[market,15000,45000]]);
  const calls=(f.provider.call as ReturnType<typeof vi.fn>).mock.calls.map(c=>c[0]);expect(calls.filter(c=>[mi.getFunction('phase')!.selector,mi.getFunction('S')!.selector].includes(c.data.slice(0,10))).every(c=>c.blockTag===19)).toBe(true);
 });
 it('continues only after a verified checkpoint and is idempotent at the chain head',async()=>{
  const f=fixture();await f.run();f.ranges.length=0;expect((await f.run()).row?.checkpoint?.latestBlock).toBe(29);expect(f.ranges.filter(r=>r.address===market)).toEqual([{address:market,from:20,to:29}]);
  f.setHead(29);f.ranges.length=0;const before=(await f.store.get(key))!.checkpoint;const result=await f.run();expect(result.status).toBe('updated');expect(result.row?.checkpoint?.logs).toEqual(before?.logs);expect(f.ranges.filter(r=>r.address===market)).toHaveLength(0);
 });
 it('resets a reorged checkpoint before choosing the bounded rescan end',async()=>{
  const f=fixture();await f.run();f.fork();f.ranges.length=0;const result=await f.run();expect(result.status).toBe('updated');expect(result.row?.checkpoint?.latestBlock).toBe(19);expect(result.row?.checkpoint?.latestHash).toBe(hash(19,1));expect(f.ranges.filter(r=>r.address===market)).toEqual([{address:market,from:10,to:19}]);
 });
 it('never saves a failed replay/supply snapshot but retains verified origin for retry',async()=>{
  const f=fixture();f.badSupply();const result=await f.run();expect(result.status).toBe('failed');expect(result.row?.checkpoint).toBeNull();expect(result.row?.origin?.log.blockNumber).toBe(10);expect(f.store.releases.find(x=>x.key.market===market)?.error).toBe('SUPPLY_MISMATCH');expect(f.store.tokens.size).toBe(0);
 });
 it('retains a valid checkpoint when canonical-header RPC fails transiently',async()=>{
  const f=fixture();await f.run();const before=(await f.store.get(key))!.checkpoint;f.failHeader();expect((await f.run()).status).toBe('failed');expect((await f.store.get(key))!.checkpoint).toBe(before);expect(f.store.tokens.size).toBe(0);
 });
 it('compares FAILED history against failedSupply, not the decreasing live S',async()=>{
  const f=fixture();f.failedPhase();f.badSupply();expect((await f.run()).status).toBe('updated');
 });
 it('does not retain a reorged checkpoint when the new supply snapshot fails',async()=>{
  const f=fixture();await f.run();f.fork();f.badSupply();const result=await f.run();expect(result.status).toBe('failed');expect(result.row?.checkpoint).toBeNull();expect(result.row?.throughTimestamp).toBeNull();expect(result.row?.origin?.log.blockNumber).toBe(10);
 });
 it('uses token CAS and cannot release a successor lease',async()=>{
  const f=fixture();f.store.loseCheckpoint=true;expect((await f.run()).status).toBe('failed');expect((await f.store.get(key))?.checkpoint).toBeNull();expect(f.store.tokens.get(market)).toBe('successor');expect(f.store.tokens.has(ZeroAddress)).toBe(false);expect(f.store.releases.find(x=>x.key.market===market)?.error).toBe('LEASE_LOST');
 });
 it('checks the budget before further RPC and releases leases',async()=>{
  const f=fixture();let t=0;const result=await syncIndexedMarket({provider:f.provider,factory,market,store:f.store,budgetMs:1,now:()=>t++});expect(result.status).toBe('failed');expect(f.provider.getNetwork).not.toHaveBeenCalled();expect(f.store.tokens.size).toBe(0);
 });
 it('uses the known production deployment bound with an indexed origin query and no timestamp search',async()=>{
  const creation=CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+100,head=CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+2_200_000;
  const f=fixture({factory:CURRENT_TESTNET_FACTORY,creation,head});
  const result=await syncIndexedMarket({provider:f.provider,factory:CURRENT_TESTNET_FACTORY,market,store:f.store});
  expect(result.status).toBe('updated');expect(result.row?.origin?.log.blockNumber).toBe(creation);
  expect(result.row?.checkpoint?.latestBlock).toBe(creation+249999);expect(result.row?.targetBlock).toBe(head);expect(result.row?.throughTimestamp).toBe(1000+creation+249999);
  const filters=(f.provider.getLogs as ReturnType<typeof vi.fn>).mock.calls.map(c=>c[0]);
  expect(filters[0]).toMatchObject({address:CURRENT_TESTNET_FACTORY,fromBlock:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK,toBlock:head,topics:[fi.getEvent('MarketCreated')!.topicHash,'0x'+market.slice(2).padStart(64,'0')]});
  const blocks=(f.provider.getBlock as ReturnType<typeof vi.fn>).mock.calls.map(c=>c[0]);expect(blocks).not.toContain(1);expect(blocks.filter(n=>typeof n==='number').every(n=>n>=CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK)).toBe(true);
  const scans=f.ranges.filter(r=>r.address===market).sort((a,b)=>a.from-b.from);expect(scans).toHaveLength(5);
  expect(scans[0].from).toBe(creation);expect(scans.at(-1)?.to).toBe(creation+249999);expect(scans.every(r=>r.to-r.from+1===50000)).toBe(true);
  for(let i=1;i<scans.length;i++)expect(scans[i].from).toBe(scans[i-1].to+1);
 });
 it('keeps the production origin shortcut behind factory registration',async()=>{
  const f=fixture({factory:CURRENT_TESTNET_FACTORY,creation:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+100,head:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+1000});f.unregister();
  expect((await f.run()).status).toBe('not-market');expect(f.provider.getLogs).not.toHaveBeenCalled();expect(f.provider.getBlock).not.toHaveBeenCalled();
  expect(f.store.claims.filter(c=>c.key.market===market)).toHaveLength(0);
 });
 it('rejects a production indexed origin whose canonical header hash disagrees',async()=>{
  const f=fixture({factory:CURRENT_TESTNET_FACTORY,creation:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+100,head:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+1000,badOriginHash:true});
  const result=await f.run();expect(result.status).toBe('failed');expect(result.row?.checkpoint).toBeNull();expect(result.row?.origin).toBeNull();expect(f.ranges.filter(r=>r.address===market)).toHaveLength(0);
  expect(f.store.releases.find(r=>r.key.market===market)?.error).toBe('ORIGIN_REORG');
 });
 it('validates the indexed event market instead of trusting a production RPC response',async()=>{
  const f=fixture({factory:CURRENT_TESTNET_FACTORY,creation:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+100,head:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+1000,wrongIndexedMarket:true});
  const result=await f.run();expect(result.status).toBe('failed');expect(result.row?.checkpoint).toBeNull();expect(f.ranges.filter(r=>r.address===market)).toHaveLength(0);
  expect(f.store.releases.find(r=>r.key.market===market)?.error).toBe('ORIGIN_NOT_UNIQUE');
 });
 it('falls back to bounded production factory subscans when the broad indexed query is rejected',async()=>{
  const creation=CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+100,head=CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+120000;
  const f=fixture({factory:CURRENT_TESTNET_FACTORY,creation,head,rangeLimit:50000});const result=await f.run();expect(result.status).toBe('updated');
  const factoryRanges=f.ranges.filter(r=>r.address===CURRENT_TESTNET_FACTORY);expect(factoryRanges[0]).toEqual({address:CURRENT_TESTNET_FACTORY,from:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK,to:head});
  expect(factoryRanges.slice(1).every(r=>r.to-r.from+1<=50000)).toBe(true);
  expect(factoryRanges.slice(1,4).map(r=>[r.from,r.to])).toEqual([[CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK,CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+49999],[CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+50000,CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+99999],[CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK+100000,head]]);
  expect((f.provider.getBlock as ReturnType<typeof vi.fn>).mock.calls.map(c=>c[0])).not.toContain(1);
 });

 it('accepts canonical partial event prefixes when historical state is pruned and preserves the explicit farther target',async()=>{
  for(const prunedState of ['phase','S','failedSupply'] as const){
   const f=fixture({prunedState});if(prunedState==='failedSupply')f.failedPhase();
   const result=await f.run();expect(result.status).toBe('updated');
   expect(result.row?.checkpoint?.latestBlock).toBe(19);expect(result.row?.checkpoint?.latestHash).toBe(hash(19));
   expect(result.row?.throughTimestamp).toBe(1019);expect(result.row?.targetBlock).toBe(100);
   // A complete canonical log prefix is not a historical-state proof or tip-complete result.
   expect(result.row!.targetBlock!).toBeGreaterThan(result.row!.checkpoint!.latestBlock);
   expect(f.store.releases.find(r=>r.key.market===market)?.error).toBeUndefined();
  }
 });
 it('rejects pruned-state calls at the scanned tip rather than publishing an unverified complete result',async()=>{
  for(const prunedState of ['phase','S','failedSupply'] as const){
   const f=fixture({prunedState,head:19});if(prunedState==='failedSupply')f.failedPhase();
   const result=await f.run();expect(result.status).toBe('failed');expect(result.row?.checkpoint).toBeNull();
   expect(result.row?.throughTimestamp).toBeNull();expect(result.row?.targetBlock).toBeNull();expect(result.row?.origin?.log.blockNumber).toBe(10);
   expect(f.store.tokens.size).toBe(0);
  }
 });
 it('does not treat unrelated historical-state RPC failures as pruning exceptions',async()=>{
  const f=fixture({prunedState:'phase',stateErrorCode:'NETWORK_ERROR'});const result=await f.run();
  expect(result.status).toBe('failed');expect(result.row?.checkpoint).toBeNull();expect(result.row?.throughTimestamp).toBeNull();
 });
 it('rejects an observed supply mismatch both during partial backfill and at the tip',async()=>{
  for(const head of [100,19]){
   const f=fixture({head});f.badSupply();const result=await f.run();expect(result.status).toBe('failed');expect(result.row?.checkpoint).toBeNull();
   expect(f.store.releases.find(r=>r.key.market===market)?.error).toBe('SUPPLY_MISMATCH');
  }
 });

});
