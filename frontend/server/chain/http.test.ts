import {describe,it,expect,vi} from 'vitest';
import {Interface} from 'ethers';
import {createChainHistoryHandler} from './http';
import type {HistoryStore,IndexedHistoryRow} from './types';
import factoryAbi from '../../testnet/abi/TopicMarketStockFactory.json';
const f='0x1111111111111111111111111111111111111111',m='0x2222222222222222222222222222222222222222',hash='0x'+'a'.repeat(64);
const i=new Interface(factoryAbi),event=i.encodeEventLog(i.getEvent('MarketCreated')!,[m,f,f,f,30,100,200,300,300,1]);
const cp:any={version:2,factory:f,market:m,createdAt:'30',k:'1',creation:{timestamp:30,log:{address:f,blockNumber:3,blockHash:hash,transactionHash:hash,transactionIndex:0,index:0,...event}},logs:[],latestBlock:4,latestHash:hash};
function row():IndexedHistoryRow{return {chainId:46630,factory:f,market:m,checkpoint:cp,origin:cp.creation,descriptor:null,targetBlock:4,throughTimestamp:40,updatedAt:100000,leaseUntil:null,lastError:null};}
async function request(value:IndexedHistoryRow|null,url='/?market='+m,method='GET',options:any={}){
 const headers:Record<string,string>={},res:any={setHeader:(k:string,v:string)=>{headers[k]=v;},end:(body:string)=>{res.body=JSON.parse(body);}},sync=vi.fn(async()=>{}),defer=vi.fn();
 const store={get:vi.fn(async()=>value)} as unknown as HistoryStore;
 await createChainHistoryHandler({factory:f,store,sync,defer,now:()=>100000,...options})({method,url} as any,res);
 await Promise.resolve();return {res,headers,sync,defer,store};
}
describe('public shared-history endpoint',()=>{
 it('serves a cached verified range without waiting for RPC or scheduling a fresh row',async()=>{const {res,sync,headers}=await request(row());expect(res.statusCode).toBe(200);expect(res.body.checkpoint.latestBlock).toBe(4);expect(sync).not.toHaveBeenCalled();expect(headers['Cache-Control']).toContain('s-maxage=3');});
 it('schedules bounded background work for an empty index and responds immediately',async()=>{const {res,defer}=await request(null);expect(res.statusCode).toBe(202);expect(res.body.syncing).toBe(true);expect(defer).toHaveBeenCalledOnce();});
 it('marks a checkpoint complete only through its scanned block, with remaining backfill explicit',async()=>{const r=row();r.targetBlock=100;const {res,defer}=await request(r);expect(res.body.checkpoint.latestBlock).toBe(4);expect(res.body.targetBlock).toBe(100);expect(res.body.syncing).toBe(true);expect(defer).toHaveBeenCalledOnce();});
 it.each(['/?market=bad','/?market='+m+'&rpc=https://evil.invalid','/?market='+m+'&chainId=1','/?market='+m+'&factory='+m,'/?market='+m+'&market='+m])('rejects user-selected upstream or scope %s',async url=>{const {res,store}=await request(null,url);expect(res.statusCode).toBe(400);expect(store.get).not.toHaveBeenCalled();});
 it('rejects writes',async()=>{const {res,store}=await request(null,'/?market='+m,'POST');expect(res.statusCode).toBe(405);expect(store.get).not.toHaveBeenCalled();});
 it('returns safe errors without exposing database credentials',async()=>{const {res}=await request(null,undefined,'GET',{store:{get:async()=>{throw Error('postgresql://private:password@database');}}});expect(res.statusCode).toBe(503);expect(JSON.stringify(res.body)).not.toContain('password');});
});
