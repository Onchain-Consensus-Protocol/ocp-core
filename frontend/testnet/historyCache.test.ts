import {IDBFactory} from 'fake-indexeddb';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {loadHistoryCheckpoint,saveHistoryCheckpoint,historyCacheKey} from './historyCache';
import type {HistoryCheckpoint} from './priceHistory';
const factory='0x1111111111111111111111111111111111111111',market='0x2222222222222222222222222222222222222222';
const item=(block=20,hash='a'):HistoryCheckpoint=>({version:2,factory,market,createdAt:'10',k:'1',creation:{log:{} as never,timestamp:10},logs:[],latestBlock:block,latestHash:hash});
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()));afterEach(()=>vi.unstubAllGlobals());
describe('local IndexedDB history storage',()=>{
 it('rejects checkpoints from a previous schema',async()=>{await saveHistoryCheckpoint({...item(),version:1} as unknown as HistoryCheckpoint);expect(await loadHistoryCheckpoint(factory,market)).toBeNull();});
 it('persists across calls and isolates market/factory scope',async()=>{await saveHistoryCheckpoint(item());expect(await loadHistoryCheckpoint(factory,market)).toEqual(item());expect(await loadHistoryCheckpoint(market,factory)).toBeNull();expect(historyCacheKey(factory,market)).toContain('46630:2:');});
 it('prevents an older tab from replacing a newer scan',async()=>{await Promise.all([saveHistoryCheckpoint(item(30,'new')),saveHistoryCheckpoint(item(20,'old'))]);expect((await loadHistoryCheckpoint(factory,market))?.latestBlock).toBe(30);});
 it('replaces a reorg-invalid checkpoint only with its expected old hash',async()=>{await saveHistoryCheckpoint(item(30,'fork'));await saveHistoryCheckpoint(item(20,'canonical'),'fork');expect((await loadHistoryCheckpoint(factory,market))?.latestHash).toBe('canonical');});
 it('detects damaged payloads instead of displaying corrupt totals',async()=>{await saveHistoryCheckpoint(item());const db=await new Promise<IDBDatabase>((resolve)=>{const r=indexedDB.open('ocp-market-history-v2',1);r.onsuccess=()=>resolve(r.result);});await new Promise<void>(resolve=>{const tx=db.transaction('histories','readwrite');tx.objectStore('histories').put({payload:'{}',checksum:'broken'},historyCacheKey(factory,market));tx.oncomplete=()=>resolve();});db.close();expect(await loadHistoryCheckpoint(factory,market)).toBeNull();});
 it('continues without caching when browser storage is unavailable',async()=>{vi.stubGlobal('indexedDB',undefined);expect(await loadHistoryCheckpoint(factory,market)).toBeNull();await expect(saveHistoryCheckpoint(item())).resolves.toBeUndefined();});
 it('falls back when browser open never completes',async()=>{vi.useFakeTimers();try{vi.stubGlobal('indexedDB',{open:()=>({})});const pending=loadHistoryCheckpoint(factory,market);await vi.advanceTimersByTimeAsync(1600);expect(await pending).toBeNull();}finally{vi.useRealTimers();}});
});

it('bounds stalled checkpoint reads so live chart loading can continue',async()=>{
 vi.useFakeTimers();try{
  const abort=vi.fn(),close=vi.fn();vi.stubGlobal('indexedDB',{open:()=>{const request:any={};queueMicrotask(()=>{request.result={close,transaction:()=>({abort,objectStore:()=>({get:()=>({})})})};request.onsuccess();});return request;}});
  const read=loadHistoryCheckpoint(factory,market);await vi.advanceTimersByTimeAsync(1501);expect(await read).toBeNull();expect(abort).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 }finally{vi.useRealTimers();}
});
