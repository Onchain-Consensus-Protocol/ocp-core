import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {attachDatabasePool} from '@vercel/functions';
import type {HistoryKey,HistoryPatch,HistoryStore,IndexedHistoryRow} from './types.js';
const TABLE='ocp_chain_history_v1';
const schema=`CREATE TABLE IF NOT EXISTS ${TABLE} (
 chain_id BIGINT NOT NULL, factory TEXT NOT NULL, market TEXT NOT NULL,
 checkpoint JSONB, origin JSONB, descriptor JSONB,
 target_block BIGINT, through_timestamp BIGINT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 lease_token UUID, lease_until TIMESTAMPTZ,
 next_sync TIMESTAMPTZ NOT NULL DEFAULT 'epoch', last_error TEXT,
 PRIMARY KEY(chain_id,factory,market)
)`;
function scope(key:HistoryKey):[number,string,string]{
 if(!Number.isSafeInteger(key.chainId)||key.chainId<=0||!/^0x[0-9a-fA-F]{40}$/.test(key.factory)||!/^0x[0-9a-fA-F]{40}$/.test(key.market))throw Error('INVALID_HISTORY_KEY');
 return [key.chainId,key.factory.toLowerCase(),key.market.toLowerCase()];
}
const duration=(v:number)=>{if(!Number.isSafeInteger(v)||v<0||v>86_400_000)throw Error('INVALID_HISTORY_DURATION');return v;};
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function number(v:unknown):number{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('INVALID_HISTORY_ROW');return n;}
function timestamp(v:unknown):number{const n=v instanceof Date?v.getTime():new Date(String(v)).getTime();if(!Number.isSafeInteger(n))throw Error('INVALID_HISTORY_ROW');return n;}
function decode(r:Record<string,unknown>):IndexedHistoryRow{
 const [chainId,factory,market]=scope({chainId:number(r.chain_id),factory:String(r.factory),market:String(r.market)});
 return {chainId,factory,market,checkpoint:(r.checkpoint??null) as IndexedHistoryRow['checkpoint'],origin:(r.origin??null) as IndexedHistoryRow['origin'],descriptor:(r.descriptor??null) as IndexedHistoryRow['descriptor'],targetBlock:r.target_block==null?null:number(r.target_block),throughTimestamp:r.through_timestamp==null?null:number(r.through_timestamp),updatedAt:timestamp(r.updated_at),leaseUntil:r.lease_until==null?null:timestamp(r.lease_until),lastError:r.last_error==null?null:String(r.last_error)};
}
/** Additive display-history index only; never touches paper balances or transaction state. */
export class ChainHistoryStore implements HistoryStore{
 private readonly pool:Pool;
 private initialization?:Promise<void>;
 constructor(options:{connectionString?:string;pool?:Pool}={}){
  if(options.pool)this.pool=options.pool;
  else{
   const connectionString=options.connectionString??process.env.DATABASE_URL;
   if(!connectionString?.trim())throw Error('DATABASE_URL_REQUIRED');
   this.pool=new Pool({connectionString,max:3,connectionTimeoutMillis:5000,statement_timeout:5000});
   attachDatabasePool(this.pool);
  }
  this.pool.on('error',()=>{});
 }
 async ready():Promise<void>{
  if(!this.initialization)this.initialization=this.initialize().catch(error=>{this.initialization=undefined;throw error;});
  return this.initialization;
 }
 private async initialize():Promise<void>{
  const client=await this.pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(716012344)');await client.query(schema);await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 async close():Promise<void>{await this.pool.end();}
 async get(key:HistoryKey):Promise<IndexedHistoryRow|null>{
  const args=scope(key);await this.ready();
  const {rows}=await this.pool.query(`SELECT * FROM ${TABLE} WHERE chain_id=$1 AND factory=$2 AND market=$3`,args);
  return rows[0]?decode(rows[0]):null;
 }
 async claim(key:HistoryKey,cooldownMs=15000,leaseMs=45000):Promise<{token:string;row:IndexedHistoryRow}|null>{
  const args=scope(key),cooldown=duration(cooldownMs),lease=duration(leaseMs);if(lease===0)throw Error('INVALID_HISTORY_DURATION');
  await this.ready();const token=randomUUID();
  const {rows}=await this.pool.query(`INSERT INTO ${TABLE} AS h (chain_id,factory,market,lease_token,lease_until,next_sync)
   VALUES($1,$2,$3,$4,clock_timestamp()+$5*interval '1 millisecond',clock_timestamp()+$6*interval '1 millisecond')
   ON CONFLICT(chain_id,factory,market) DO UPDATE SET lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until,next_sync=EXCLUDED.next_sync
   WHERE (h.lease_until IS NULL OR h.lease_until<=clock_timestamp()) AND h.next_sync<=clock_timestamp()
   RETURNING *`,[...args,token,lease,cooldown]);
  return rows[0]?{token,row:decode(rows[0])}:null;
 }
 async save(key:HistoryKey,token:string,patch:HistoryPatch):Promise<boolean>{
  const args:unknown[]=scope(key);if(!uuid(token))return false;args.push(token);
  const fields={checkpoint:'checkpoint',origin:'origin',descriptor:'descriptor',targetBlock:'target_block',throughTimestamp:'through_timestamp'} as const;
  const updates:string[]=[];
  for(const k of Object.keys(fields) as (keyof typeof fields)[]){
   const value=patch[k];if(value===undefined)continue;
   const json=k==='checkpoint'||k==='origin'||k==='descriptor';
   if(!json&&value!==null)number(value);
   args.push(json&&value!==null?JSON.stringify(value):value);
   updates.push(`${fields[k]}=$${args.length}${json?'::jsonb':''}`);
  }
  updates.push('updated_at=clock_timestamp()');await this.ready();
  const result=await this.pool.query(`UPDATE ${TABLE} SET ${updates.join(',')} WHERE chain_id=$1 AND factory=$2 AND market=$3 AND lease_token=$4 AND lease_until>clock_timestamp() RETURNING chain_id`,args);
  return (result.rowCount??0)>0;
 }
 async release(key:HistoryKey,token:string,cooldownMs=15000,errorCode?:string):Promise<void>{
  const args=scope(key),cooldown=duration(cooldownMs);if(!uuid(token))return;
  const code=errorCode===undefined?null:/^[A-Z][A-Z0-9_]{0,63}$/.test(errorCode)?errorCode:'SYNC_FAILED';
  await this.ready();
  await this.pool.query(`UPDATE ${TABLE} SET lease_token=NULL,lease_until=NULL,next_sync=clock_timestamp()+$5*interval '1 millisecond',last_error=$6 WHERE chain_id=$1 AND factory=$2 AND market=$3 AND lease_token=$4`,[...args,token,cooldown,code]);
 }
}
