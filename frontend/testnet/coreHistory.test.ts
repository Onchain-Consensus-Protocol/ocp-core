import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {Interface,type Log,type Provider} from 'ethers';
import coreAbi from './abi/OCPCore.json';
import factoryAbi from './abi/TopicMarketStockFactory.json';
import {readCoreHistory,replayCoreHistory} from './coreHistory';
import type {HistoryCheckpoint} from './priceHistory';
import {historyCacheKey} from './coreHistoryCache';
const factory='0x1111111111111111111111111111111111111111',market='0x2222222222222222222222222222222222222222',core='0x3333333333333333333333333333333333333333',user='0x4444444444444444444444444444444444444444';
const iface=new Interface(coreAbi),fi=new Interface(factoryAbi);
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
function event(name:string,args:unknown[],block=4,index=0):Log{return {address:core,blockNumber:block,blockHash:hash(block),transactionHash:hash(1000+block),transactionIndex:0,index,removed:false,...iface.encodeEventLog(iface.getEvent(name)!,args)} as unknown as Log;}
const stamped=(log:Log)=>({log,timestamp:log.blockNumber*10});
function origin():HistoryCheckpoint{return {version:1,factory,market,createdAt:'30',k:'1',creation:{timestamp:30,log:{address:factory,blockNumber:3,blockHash:hash(3),transactionHash:hash(1003),transactionIndex:0,index:0,removed:false,...fi.encodeEventLog(fi.getEvent('MarketCreated')!,[market,user,user,user,30n,100n,200n,300n,300n,1n])} as unknown as Log},logs:[],latestBlock:6,latestHash:hash(6)};}
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()));afterEach(()=>vi.unstubAllGlobals());
function provider(logs:Log[]){let head=6,reorg=false;const ranges:number[][]=[];const p={getNetwork:async()=>({chainId:46630n}),getBlock:async(n:number|string)=>{const number=n==='latest'?head:Number(n);return {number,timestamp:number*10,hash:hash(number+(reorg&&number===6?100:0))};},getLogs:async({address,fromBlock,toBlock}:{address:string;fromBlock:number;toBlock:number})=>{expect(address).toBe(core);ranges.push([fromBlock,toBlock]);return logs.filter(l=>l.blockNumber>=fromBlock&&l.blockNumber<=toBlock);}} as unknown as Provider;return {p,ranges,advance:()=>{head=8;},reorg:()=>{reorg=true;}};}
describe('independent Core history',()=>{
 it('decodes actual Core actors, sides, refund and gross withdrawal with genuine hashes',()=>{
  const logs=[event('Staked',[user,1,100n,100n],4),event('StakeExited',[user,1,100n,90n,10n],5),event('Withdrawn',[user,30n,7n],6)];
  const rows=replayCoreHistory(logs.map(stamped),core);
  expect(rows.map(e=>e.kind)).toEqual(['CORE_STAKE','CORE_EXIT','CLAIM_CORE']);expect(rows.map(e=>e.amount)).toEqual([100n,90n,37n]);expect(rows[0].actor).toBe(user);expect(rows[0].transactionHash).toBe(hash(1004));expect(rows[1].at).toBe(50);
 });
 it('does not double count fee event emitted by the same withdrawal, retains standalone fees',()=>{
  const rows=replayCoreHistory([event('MarketFeesClaimed',[user,7n],6,0),event('Withdrawn',[user,30n,7n],6,1),event('MarketFeesClaimed',[user,2n],5)].map(stamped),core);
  expect(rows.map(e=>e.amount)).toEqual([2n,37n]);
 });
 it('retains independent fee claims in the same multicall transaction as withdrawal',()=>{
  const rows=replayCoreHistory([event('MarketFeesClaimed',[user,7n],6,0),event('MarketFeesClaimed',[user,0n],6,1),event('Withdrawn',[user,30n,0n],6,2)].map(stamped),core);
  expect(rows.map(e=>e.amount)).toEqual([7n,30n]);
 });
 it('deduplicates exact logs, omits removed logs, and rejects wrong contract logs',()=>{
  const log=event('Staked',[user,0,1n,1n]);expect(replayCoreHistory([stamped(log),stamped(log),stamped({...log,removed:true,index:3} as Log)],core)).toHaveLength(1);
  expect(()=>replayCoreHistory([stamped({...log,address:market} as Log)],core)).toThrow('address mismatch');
 });
 it('scans the entire creation range once, persists and reads only new blocks thereafter',async()=>{
  const mock=provider([event('Staked',[user,0,10n,10n])]);const first=await readCoreHistory(mock.p,core,origin());expect(first.events).toHaveLength(1);expect(mock.ranges).toEqual([[3,6]]);
  mock.advance();const second=await readCoreHistory(mock.p,core,origin());expect(second.events).toHaveLength(1);expect(mock.ranges).toEqual([[3,6],[7,8]]);
 });
 it('rebuilds from creation when the cached anchor reorganizes',async()=>{
  const mock=provider([]);await readCoreHistory(mock.p,core,origin());mock.reorg();mock.advance();await readCoreHistory(mock.p,core,origin());expect(mock.ranges).toEqual([[3,6],[3,8]]);
 });
 it('continues with complete chain reads when IndexedDB is unavailable',async()=>{
  vi.stubGlobal('indexedDB',undefined);const mock=provider([]);await readCoreHistory(mock.p,core,origin());await readCoreHistory(mock.p,core,origin());expect(mock.ranges).toEqual([[3,6],[3,6]]);
 });
 it('rejects a log whose block hash disagrees with its real header',async()=>{
  const mock=provider([{...event('Staked',[user,0,10n,10n]),blockHash:hash(999)} as Log]);await expect(readCoreHistory(mock.p,core,origin())).rejects.toThrow('reorganized');
 });
 it('rejects other chains and invalid factory origin evidence',async()=>{
  const mock=provider([]);vi.spyOn(mock.p,'getNetwork').mockResolvedValue({chainId:1n} as never);await expect(readCoreHistory(mock.p,core,origin())).rejects.toThrow('Wrong history chain');
  const o=origin();o.market=core;await expect(readCoreHistory(provider([]).p,core,o)).rejects.toThrow();
 });
 it('cache identity includes chain, factory, market and Core, separated from Market history',()=>{
  const key=historyCacheKey(factory,market,core);expect(key).toContain('46630:core:1:');expect(key).not.toBe(historyCacheKey(factory,market,user));expect(key).not.toBe(historyCacheKey(factory,user,core));expect(key).not.toBe(historyCacheKey(user,market,core));
 });
});
