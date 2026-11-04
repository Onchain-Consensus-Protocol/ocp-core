import {getAddress} from 'ethers';
import type {HistoryCheckpoint} from './priceHistory';
const DB='ocp-market-history-v2',STORE='histories';
export const historyCacheKey=(f:string,m:string)=>`46630:2:${getAddress(f).toLowerCase()}:${getAddress(m).toLowerCase()}`;
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,'0')).join('');
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('Unavailable'));return;}
 let done=false;const timer=setTimeout(()=>{done=true;reject(Error('Cache timeout'));},1500);
 const fail=()=>{if(!done){done=true;clearTimeout(timer);reject(Error('Cache unavailable'));}};
 const r=indexedDB.open(DB,1);
 r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
 r.onsuccess=()=>{if(done){r.result.close();return;}done=true;clearTimeout(timer);resolve(r.result);};
 r.onerror=fail;r.onblocked=fail;
});}
export async function loadHistoryCheckpoint(f:string,m:string):Promise<HistoryCheckpoint|null>{
 let db:IDBDatabase|undefined;try{db=await open();const row=await new Promise<{payload:string;checksum:string}|undefined>((resolve,reject)=>{
  const tx=db!.transaction(STORE,'readonly');let value:{payload:string;checksum:string}|undefined;
  const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(Error('Cache read timeout'));},1500);
  const r=tx.objectStore(STORE).get(historyCacheKey(f,m));r.onsuccess=()=>{value=r.result;};
  tx.oncomplete=()=>{clearTimeout(timer);resolve(value);};tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(tx.error??Error('Cache read unavailable'));};
 });if(!row||await digest(row.payload)!==row.checksum)return null;const v=JSON.parse(row.payload) as HistoryCheckpoint;return v.version===2&&historyCacheKey(v.factory,v.market)===historyCacheKey(f,m)?v:null;}catch{return null;}finally{db?.close();}
}
/** 只用于历史展示。原子比较扫描截止块，防止旧标签页覆盖较新记录。存储故障不能阻断链上读取。 */
export async function saveHistoryCheckpoint(v:HistoryCheckpoint,invalidatedHash?:string){let db:IDBDatabase|undefined;try{const payload=JSON.stringify(v),checksum=await digest(payload);db=await open();await new Promise<void>((resolve,reject)=>{const tx=db!.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),key=historyCacheKey(v.factory,v.market),r=store.get(key);const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(Error('Cache write timeout'));},1500);r.onsuccess=()=>{if((r.result?.latestBlock??-1)>v.latestBlock&&r.result?.latestHash!==invalidatedHash)return;store.put({payload,checksum,latestBlock:v.latestBlock,latestHash:v.latestHash},key);};tx.oncomplete=()=>{clearTimeout(timer);resolve();};tx.onerror=tx.onabort=()=>{clearTimeout(timer);reject(tx.error);};});}catch{}finally{db?.close();}}
