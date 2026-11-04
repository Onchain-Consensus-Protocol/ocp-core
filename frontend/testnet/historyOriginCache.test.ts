import {IDBFactory} from 'fake-indexeddb';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {loadHistoryOrigin,saveHistoryOrigin} from './historyOriginCache';
import type {TimestampedMarketLog} from './priceHistory';
const f='0x1111111111111111111111111111111111111111',m='0x2222222222222222222222222222222222222222';
const origin={timestamp:30,log:{address:f,blockNumber:3,blockHash:'0x'+'a'.repeat(64),topics:[],data:'0x'}} as unknown as TimestampedMarketLog;
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()));afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('creation origin hints are separate from complete history',()=>{
 it('retains a search hint across reads and isolates factory/market',async()=>{await saveHistoryOrigin(f,m,origin);expect(await loadHistoryOrigin(f,m)).toEqual(origin);expect(await loadHistoryOrigin(m,f)).toBeNull();});
 it('rejects a hint whose factory identity differs from its scope',async()=>{await saveHistoryOrigin(f,m,{...origin,log:{...origin.log,address:m} as typeof origin.log});expect(await loadHistoryOrigin(f,m)).toBeNull();});
 it('continues when persistence is unavailable',async()=>{vi.stubGlobal('indexedDB',undefined);await saveHistoryOrigin(f,m,origin);expect(await loadHistoryOrigin(f,m)).toBeNull();});
 it('bounds a stalled transaction instead of holding up history',async()=>{vi.useFakeTimers();const abort=vi.fn(),close=vi.fn();vi.stubGlobal('indexedDB',{open:()=>{const r:any={};queueMicrotask(()=>{r.result={close,transaction:()=>({abort,objectStore:()=>({get:()=>({})})})};r.onsuccess();});return r;}});const read=loadHistoryOrigin(f,m);await vi.advanceTimersByTimeAsync(1501);expect(await read).toBeNull();expect(abort).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();});
});
