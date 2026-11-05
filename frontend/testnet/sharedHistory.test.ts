import {describe,it,expect,vi} from 'vitest';
import {Interface} from 'ethers';
import {readSharedHistory} from './sharedHistory';
import factoryAbi from './abi/TopicMarketStockFactory.json';
const f='0x1111111111111111111111111111111111111111',m='0x2222222222222222222222222222222222222222',hash='0x'+'a'.repeat(64),i=new Interface(factoryAbi);
const event=i.encodeEventLog(i.getEvent('MarketCreated')!,[m,f,f,f,30,100,200,300,300,1]);
const cp:any={version:2,factory:f,market:m,createdAt:'30',k:'1',creation:{timestamp:30,log:{address:f,blockNumber:3,blockHash:hash,transactionHash:hash,transactionIndex:0,index:0,...event}},logs:[],latestBlock:4,latestHash:hash};
const body=()=>({version:1,chainId:46630,factory:f,market:m,checkpoint:cp,targetBlock:4,throughTimestamp:40,syncing:false,updatedAt:1000});
const response=(status:number,value:unknown)=>({status,json:async()=>value}) as Response;
describe('shared chart history client',()=>{
 it('replays a scoped checkpoint and preserves the real timestamp and syncing status',async()=>{const fetcher=vi.fn(async()=>response(200,{...body(),targetBlock:100,syncing:true}));const r=await readSharedHistory(f,m,{fetcher});expect(r?.genesis[0].at).toBe(30);expect(r?.latestBlock).toBe(4);expect(r?.cacheStatus).toBe('shared');expect(r?.serverSyncing).toBe(true);expect(fetcher.mock.calls).toHaveLength(1);});
 it.each([{...body(),chainId:1},{...body(),market:f},{...body(),targetBlock:2},{...body(),throughTimestamp:20},{...body(),checkpoint:{...cp,version:1}}])('rejects corrupt or foreign history',async value=>{expect(await readSharedHistory(f,m,{fetcher:async()=>response(200,value)})).toBeNull();});
 it('allows direct-chain fallback when no backend route exists',async()=>{expect(await readSharedHistory(f,m,{fetcher:async()=>response(404,{})})).toBeNull();});
 it('polls a warming index rather than returning invented empty history',async()=>{const fetcher=vi.fn().mockResolvedValueOnce(response(202,{...body(),checkpoint:null})).mockResolvedValueOnce(response(200,body()));const r=await readSharedHistory(f,m,{fetcher,pollMs:1});expect(r?.genesis).toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(2);});
 it('respects consumer cancellation',async()=>{const controller=new AbortController();controller.abort();await expect(readSharedHistory(f,m,{signal:controller.signal,fetcher:vi.fn()})).rejects.toMatchObject({name:'AbortError'});});
});
