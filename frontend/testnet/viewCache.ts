import type {DirectoryState,MarketState} from './chainClient';

const DB='ocp-view-snapshots-v1',STORE='snapshots';
const TTL=24*60*60*1000,MAX_BYTES=1024*1024,TIMEOUT=1500;
type Snapshot=DirectoryState|MarketState;
const address=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v);
const scope=(v:string)=>{if(!address(v))throw Error('Invalid cache scope');return v.toLowerCase();};
export const viewCacheKey=(factory:string,account?:string,market?:string)=>`46630:1:${scope(factory)}:${account?scope(account):'public'}:${market?scope(market):'directory'}`;
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const big=(v:unknown)=>typeof v==='bigint'&&v>=0n;
const bigFields=(v:Record<string,unknown>,fields:string[])=>fields.every(k=>big(v[k]));
function summary(v:unknown):boolean{
 return record(v)&&['address','stock','creator','adapter','vault'].every(k=>address(v[k]))&&
  ['topic','yesRule','noRule','invalidRule'].every(k=>typeof v[k]==='string')&&
  bigFields(v,['createdAt','genesisCutoff','formalCutoff','coreCutoff','snapshot']);
}
function valid(v:unknown,factory:string,market?:string):v is Snapshot{
 if(!record(v))return false;
 if(!market)return address(v.factory)&&v.factory.toLowerCase()===scope(factory)&&address(v.owner)&&
  Number.isSafeInteger(v.blockNumber)&&Number(v.blockNumber)>=0&&big(v.timestamp)&&
  Array.isArray(v.stocks)&&v.stocks.every(s=>record(s)&&address(s.address)&&typeof s.symbol==='string'&&Number.isInteger(s.decimals)&&Number(s.decimals)>=0&&Number(s.decimals)<=18&&typeof s.enabled==='boolean'&&address(s.oracle)&&address(s.router)&&big(s.k))&&
  Array.isArray(v.markets)&&v.markets.every(summary);
 return summary(v)&&typeof v.address==='string'&&v.address.toLowerCase()===scope(market)&&
  Number.isInteger(v.phase)&&Number(v.phase)>=0&&Number(v.phase)<=4&&
  Number.isInteger(v.outcome)&&Number(v.outcome)>=0&&Number(v.outcome)<=3&&
  bigFields(v,['R','S','rTarget','k','cash','lpFees','lpBudgetRemaining','totalStakeYes','totalStakeNo','totalStakeInvalid'])&&
  ['vaultResolved','vaultSettlementReady'].every(k=>typeof v[k]==='boolean')&&Number.isInteger(v.vaultOutcome)&&Number(v.vaultOutcome)>=0&&Number(v.vaultOutcome)<=3&&
  (v.position===undefined||(record(v.position)&&bigFields(v.position,['balance','genesisShares','yes','no','lp','coreYes','coreNo','coreInvalid','marketAllowance','vaultAllowance','routerAllowance'])));
}
const stringify=(v:unknown)=>JSON.stringify(v,(_key,value)=>typeof value==='bigint'?{$bigint:value.toString()}:value);
const parse=(s:string):unknown=>JSON.parse(s,(_key,value)=>{
 if(record(value)&&Object.hasOwn(value,'$bigint')){
  if(Object.keys(value).length!==1||typeof value.$bigint!=='string'||!/^(-?)(0|[1-9][0-9]*)$/.test(value.$bigint))throw Error('Invalid bigint');
  return BigInt(value.$bigint);
 }
 return value;
});
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 let finished=false;
 const timer=setTimeout(()=>fail(),TIMEOUT);
 function fail(){if(!finished){finished=true;clearTimeout(timer);reject(Error('Cache unavailable'));}}
 try{
  if(typeof indexedDB==='undefined'){fail();return;}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onsuccess=()=>{if(finished){request.result.close();return;}finished=true;clearTimeout(timer);resolve(request.result);};
  request.onerror=fail;request.onblocked=fail;
 }catch{fail();}
});}
function transaction(db:IDBDatabase,key:string,payload?:string):Promise<unknown>{return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,payload===undefined?'readonly':'readwrite');
 let result:unknown,finished=false;
 const timer=setTimeout(()=>{fail();try{tx.abort();}catch{/* already closed */}},TIMEOUT);
 function fail(){if(!finished){finished=true;clearTimeout(timer);reject(Error('Cache transaction unavailable'));}}
 tx.onerror=fail;tx.onabort=fail;
 tx.oncomplete=()=>{if(!finished){finished=true;clearTimeout(timer);resolve(result);}};
 try{const store=tx.objectStore(STORE);const request=payload===undefined?store.get(key):store.put(payload,key);request.onsuccess=()=>{result=request.result;};request.onerror=fail;}catch{fail();}
});}
/** Display-only cache. Callers must obtain fresh chain reads for all transaction decisions. */
export async function loadViewSnapshot(factory:string,account?:string,market?:string):Promise<Snapshot|null>{
 let db:IDBDatabase|undefined;
 try{
  const key=viewCacheKey(factory,account,market);db=await open();const raw=await transaction(db,key);
  if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>MAX_BYTES)return null;
  const row=parse(raw),now=Date.now();
  if(!record(row)||row.version!==1||row.chainId!==46630||row.key!==key||row.factory!==scope(factory)||!Number.isSafeInteger(row.savedAt)||Number(row.savedAt)>now||now-Number(row.savedAt)>TTL)return null;
  return valid(row.value,factory,market)?row.value:null;
 }catch{return null;}finally{db?.close();}
}
/** Save only successful live reads; persistence failures never manufacture a snapshot. */
export async function saveViewSnapshot(factory:string,value:Snapshot,account?:string,market?:string):Promise<void>{
 let db:IDBDatabase|undefined;
 try{
  const key=viewCacheKey(factory,account,market);if(!valid(value,factory,market))return;
  const payload=stringify({version:1,chainId:46630,key,factory:scope(factory),savedAt:Date.now(),value});
  if(new TextEncoder().encode(payload).byteLength>MAX_BYTES)return;
  db=await open();await transaction(db,key,payload);
 }catch{/* Cache is optional; never replace a failed read with invented values. */}finally{db?.close();}
}
