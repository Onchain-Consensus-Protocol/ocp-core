import {getAddress} from 'ethers';
import type {TimestampedMarketLog} from './priceHistory';
const DB='ocp-history-origins-v1',STORE='origins',TIMEOUT=1500;
export const originKey=(factory:string,market:string)=>`46630:1:${getAddress(factory).toLowerCase()}:${getAddress(market).toLowerCase()}`;
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 let done=false;const timer=setTimeout(fail,TIMEOUT);
 function fail(){if(!done){done=true;clearTimeout(timer);reject(Error('Origin cache unavailable'));}}
 try{if(typeof indexedDB==='undefined'){fail();return;}const r=indexedDB.open(DB,1);
 r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
 r.onsuccess=()=>{if(done){r.result.close();return;}done=true;clearTimeout(timer);resolve(r.result);};r.onerror=fail;r.onblocked=fail;
 }catch{fail();}
});}
function transact(db:IDBDatabase,key:string,value?:string):Promise<unknown>{return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,value===undefined?'readonly':'readwrite');let result:unknown,done=false;
 const timer=setTimeout(()=>{fail();try{tx.abort();}catch{}},TIMEOUT);
 function fail(){if(!done){done=true;clearTimeout(timer);reject(Error('Origin cache transaction unavailable'));}}
 try{const r=value===undefined?tx.objectStore(STORE).get(key):tx.objectStore(STORE).put(value,key);r.onsuccess=()=>{result=r.result;};r.onerror=fail;}catch{fail();}
 tx.onabort=fail;tx.onerror=fail;tx.oncomplete=()=>{if(!done){done=true;clearTimeout(timer);resolve(result);}};
});}
/** This is only a search hint, never a complete history or a displayable checkpoint.
 * The reader must fetch the canonical header AND indexed factory event before reuse. */
export async function loadHistoryOrigin(factory:string,market:string):Promise<TimestampedMarketLog|null>{
 let db:IDBDatabase|undefined;try{const key=originKey(factory,market);db=await open();const raw=await transact(db,key);
 if(typeof raw!=='string'||raw.length>16384)return null;const row=JSON.parse(raw);
 const v=row.creation;if(row.version!==1||row.key!==key||!v||!v.log||getAddress(v.log.address)!==getAddress(factory)||!Number.isSafeInteger(v.timestamp)||!Number.isSafeInteger(v.log.blockNumber)||v.log.blockNumber<1||!/^0x[0-9a-fA-F]{64}$/.test(v.log.blockHash))return null;
 return v;
 }catch{return null;}finally{db?.close();}
}
export async function saveHistoryOrigin(factory:string,market:string,creation:TimestampedMarketLog):Promise<void>{
 let db:IDBDatabase|undefined;try{const key=originKey(factory,market),raw=JSON.stringify({version:1,key,creation});if(raw.length>16384)return;db=await open();await transact(db,key,raw);}catch{/* A verified origin can be rediscovered if browser storage fails. */}finally{db?.close();}
}
