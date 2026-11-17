import {IDBFactory} from 'fake-indexeddb';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {DirectoryState,MarketState} from './chainClient';
import {viewCacheKey,loadViewSnapshot,saveViewSnapshot} from './viewCache';
const f='0x1111111111111111111111111111111111111111',m='0x2222222222222222222222222222222222222222',a='0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const directory=():DirectoryState=>({factory:f,owner:a,stocks:[],markets:[],blockNumber:7,timestamp:99n});
const market=():MarketState=>({address:m,stock:f,creator:a,adapter:f,vault:f,topic:'Test',yesRule:'Y',noRule:'N',invalidRule:'I',createdAt:1n,genesisCutoff:2n,formalCutoff:3n,coreCutoff:4n,snapshot:400n,phase:1,outcome:0,R:123456789012345678901234567890n,S:2n,rTarget:3n,k:4n,cash:5n,lpFees:6n,lpBudgetRemaining:0n,vaultResolved:false,vaultOutcome:0,vaultSettlementReady:false,totalStakeYes:7n,totalStakeNo:8n,totalStakeInvalid:9n});
async function raw(change:(value:string|undefined)=>string|undefined,key=viewCacheKey(f)){
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('ocp-view-snapshots-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite'),s=tx.objectStore('snapshots'),r=s.get(key);r.onsuccess=()=>{const value=change(r.result);if(value!==undefined)s.put(value,key);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
}
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()));afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('display-only chain view snapshots',()=>{
 it('scopes schema/network/factory/account/market and normalizes address case',()=>{
  expect(viewCacheKey(f)).toBe(`46630:1:${f}:public:directory`);
  expect(viewCacheKey(f,a.toUpperCase().replace('0X','0x'),m)).toBe(viewCacheKey(f,a,m));
  expect(viewCacheKey(f,a,m)).not.toBe(viewCacheKey(f,undefined,m));expect(viewCacheKey(f,a,m)).not.toBe(viewCacheKey(m,a,f));
 });
 it('roundtrips directory and exact large bigint market fields, without cross-account leakage',async()=>{
  await saveViewSnapshot(f,directory());expect(await loadViewSnapshot(f)).toEqual(directory());
  await saveViewSnapshot(f,market(),a,m);expect(await loadViewSnapshot(f,a,m)).toEqual(market());
  expect(await loadViewSnapshot(f,undefined,m)).toBeNull();expect(await loadViewSnapshot(m,a,m)).toBeNull();
 });
 it('rejects wrong factory, wrong market, missing stake fields, and invalid phases',async()=>{
  await saveViewSnapshot(f,{...directory(),factory:m});expect(await loadViewSnapshot(f)).toBeNull();
  await saveViewSnapshot(f,{...market(),address:f},a,m);expect(await loadViewSnapshot(f,a,m)).toBeNull();
  for(const mutation of [{phase:5},{totalStakeYes:'7'},{totalStakeInvalid:undefined}]){
   await saveViewSnapshot(f,{...market(),...mutation} as MarketState,a,m);expect(await loadViewSnapshot(f,a,m)).toBeNull();
  }
 });
 it('rejects corrupted JSON, malformed bigint tags and mismatched envelopes',async()=>{
  for(const corrupt of [()=>'{broken',()=>JSON.stringify({version:1}), (s:string|undefined)=>s!.replace('"$bigint":"99"','"$bigint":"NaN"'),(s:string|undefined)=>s!.replace('"factory":"'+f+'"','"factory":"'+m+'"')]){
   await saveViewSnapshot(f,directory());await raw(corrupt);expect(await loadViewSnapshot(f)).toBeNull();
  }
 });
 it('expires persistent rows after 24 hours and rejects future timestamps',async()=>{
  const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now);
  try{await saveViewSnapshot(f,directory());vi.mocked(Date.now).mockReturnValue(now+24*3600*1000);expect(await loadViewSnapshot(f)).toEqual(directory());vi.mocked(Date.now).mockReturnValue(now+24*3600*1000+1);expect(await loadViewSnapshot(f)).toBeNull();vi.mocked(Date.now).mockReturnValue(now-1);expect(await loadViewSnapshot(f)).toBeNull();}finally{vi.mocked(Date.now).mockRestore();}
 });
 it('rejects payloads above 1MB both at save and load',async()=>{
  await saveViewSnapshot(f,{...market(),topic:'x'.repeat(1024*1024)},a,m);expect(await loadViewSnapshot(f,a,m)).toBeNull();
  await saveViewSnapshot(f,directory());await raw(()=> 'x'.repeat(1024*1024+1));expect(await loadViewSnapshot(f)).toBeNull();
 });
 it('returns null and resolves writes when storage is absent or throws',async()=>{
  for(const idb of [undefined,{open:()=>{throw Error('denied');}}]){vi.stubGlobal('indexedDB',idb);expect(await loadViewSnapshot(f)).toBeNull();await expect(saveViewSnapshot(f,directory())).resolves.toBeUndefined();}
 });
 it('bounds stalled opens',async()=>{
  vi.useFakeTimers();vi.stubGlobal('indexedDB',{open:()=>({})});const pending=loadViewSnapshot(f);await vi.advanceTimersByTimeAsync(1501);expect(await pending).toBeNull();
 });
 it('bounds stalled transactions and aborts them',async()=>{
  vi.useFakeTimers();const abort=vi.fn(),close=vi.fn();
  vi.stubGlobal('indexedDB',{open:()=>{const request:any={};queueMicrotask(()=>{request.result={close,transaction:()=>({abort,objectStore:()=>({get:()=>({})})})};request.onsuccess();});return request;}});
  const pending=loadViewSnapshot(f);await vi.advanceTimersByTimeAsync(1501);expect(await pending).toBeNull();expect(abort).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 });
});
