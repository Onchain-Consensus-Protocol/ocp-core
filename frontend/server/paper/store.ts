import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool, type PoolClient} from 'pg';
import type {StoredPaperMarket, PaperMutationResult} from '../../shared/paperTypes.js';

export interface PaperStoreUser {id:string;name:string;email:string;balanceMicros:bigint}
export interface PaperAuthenticatedUser {subject:string;email:string;name:string}
export interface PaperMutationContext {user:PaperStoreUser;market:StoredPaperMarket|null}
export interface PaperMutationUpdate {market:StoredPaperMarket;response:PaperMutationResult;walletMicros:bigint}
export class PaperStoreError extends Error {
 constructor(message:string,public readonly status:number){super(message);this.name='PaperStoreError';}
}
const INITIAL_GRANT=100_000_000_000n;
const MAX_WALLET=9_223_372_036_854_775_807n;
const fromRow=(row:Record<string,unknown>):PaperStoreUser=>({id:String(row.id),name:String(row.name),email:String(row.email),balanceMicros:BigInt(String(row.balance_micros))});
const text=(value:unknown,max:number)=>typeof value==='string'&&value.length>0&&value.length<=max;
function wallet(value:bigint){if(typeof value!=='bigint'||value<0n||value>MAX_WALLET)throw new PaperStoreError('BALANCE_RANGE',400);}

/** PostgreSQL is authoritative. No local, JSON, or in-memory fallback is permitted. */
export class PaperStore {
 private readonly pool:Pool;
 private initialization:Promise<void>|undefined;
 constructor(options:{connectionString?:string}={}){
  const connectionString=options.connectionString??process.env.DATABASE_URL;
  if(!connectionString?.trim())throw new PaperStoreError('DATABASE_URL_REQUIRED',503);
  this.pool=new Pool({connectionString,max:5,connectionTimeoutMillis:10_000,idleTimeoutMillis:30_000});
  // Idle connection failures must not terminate the server process; active queries still reject.
  this.pool.on('error',()=>{});
 }
 async ready():Promise<void>{
  if(!this.initialization)this.initialization=this.initialize().catch(error=>{this.initialization=undefined;throw error;});
  return this.initialization;
 }
 private async initialize():Promise<void>{
  const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  const client=await this.pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(716012343)');await client.query(schema);await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 async close():Promise<void>{await this.pool.end();}
 private async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{
  await this.ready();const client=await this.pool.connect();
  try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 /** auth must already have been verified by the authentication provider on the server. */
 async ensureUser(auth:PaperAuthenticatedUser):Promise<PaperStoreUser>{
  if(!text(auth.subject,2048)||!text(auth.email,320)||!text(auth.name,320))throw new PaperStoreError('AUTH_IDENTITY',400);
  return this.transaction(async client=>{
   const {rows}=await client.query('INSERT INTO ocp_paper_users(id,subject,email,name) VALUES($1,$2,$3,$4) ON CONFLICT(subject) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name RETURNING *',[randomUUID(),auth.subject,auth.email,auth.name]);
   // The upsert locks this user until commit, also serializing concurrent first logins.
   const user=fromRow(rows[0]);
   const grant=await client.query("INSERT INTO ocp_paper_grants(user_id,grant_type,amount_micros) VALUES($1,'INITIAL_USD',$2) ON CONFLICT DO NOTHING RETURNING user_id",[user.id,INITIAL_GRANT.toString()]);
   if(grant.rowCount){
    const before=user.balanceMicros;user.balanceMicros+=INITIAL_GRANT;wallet(user.balanceMicros);
    await client.query('UPDATE ocp_paper_users SET balance_micros=$2 WHERE id=$1',[user.id,user.balanceMicros.toString()]);
    await client.query("INSERT INTO ocp_paper_journal(id,user_id,kind,delta_micros,balance_before_micros,balance_after_micros) VALUES($1,$2,'INITIAL_GRANT',$3,$4,$5)",[randomUUID(),user.id,INITIAL_GRANT.toString(),before.toString(),user.balanceMicros.toString()]);
   }
   return user;
  });
 }
 async listMarkets():Promise<StoredPaperMarket[]>{
  await this.ready();const result=await this.pool.query('SELECT document FROM ocp_paper_markets ORDER BY created_at DESC,id LIMIT 100');return result.rows.map(row=>row.document as StoredPaperMarket);
 }
 async getMarket(id:string):Promise<StoredPaperMarket|null>{
  if(!text(id,200))throw new PaperStoreError('MARKET_ID',400);
  await this.ready();const result=await this.pool.query('SELECT document FROM ocp_paper_markets WHERE id=$1',[id]);return result.rows[0]?.document??null;
 }
 async mutate(userId:string,requestId:string,payloadHash:string,marketId:string|null,
  callback:(context:PaperMutationContext)=>PaperMutationUpdate|Promise<PaperMutationUpdate>):Promise<PaperMutationResult>{
  if(!text(userId,200)||!text(requestId,200)||!text(payloadHash,256)||(marketId!==null&&!text(marketId,200)))throw new PaperStoreError('MUTATION_ID',400);
  return this.transaction(async client=>{
   // Always lock wallet first, market second. All orders for one wallet serialize across markets.
   const users=await client.query('SELECT * FROM ocp_paper_users WHERE id=$1 FOR UPDATE',[userId]);
   if(!users.rows[0])throw new PaperStoreError('AUTH_REQUIRED',401);
   const previous=await client.query('SELECT payload_hash,market_id,response FROM ocp_paper_requests WHERE user_id=$1 AND request_id=$2',[userId,requestId]);
   if(previous.rows[0]){
    if(previous.rows[0].payload_hash!==payloadHash||(marketId!==null&&previous.rows[0].market_id!==marketId))throw new PaperStoreError('IDEMPOTENCY_CONFLICT',409);
    return {...previous.rows[0].response,replayed:true} as PaperMutationResult;
   }
   const user=fromRow(users.rows[0]);let market:StoredPaperMarket|null=null;
   if(marketId!==null){
    const selected=await client.query('SELECT document FROM ocp_paper_markets WHERE id=$1 FOR UPDATE',[marketId]);
    if(!selected.rows[0])throw new PaperStoreError('MARKET_NOT_FOUND',404);
    market=selected.rows[0].document as StoredPaperMarket;
   }
   const before=user.balanceMicros;
   const original=market?{id:market.id,creatorId:market.creatorId,createdAt:market.createdAt,revision:market.revision}:null;
   const update=await callback({user,market});wallet(update.walletMicros);
   const next=update.market;
   if(!next||!text(next.id,200)||!Number.isSafeInteger(next.revision)||next.revision<0||update.response?.market?.id!==next.id)throw new PaperStoreError('MARKET_UPDATE',400);
   if(original&&(next.id!==original.id||next.creatorId!==original.creatorId||next.createdAt!==original.createdAt||next.revision<=original.revision))throw new PaperStoreError('MARKET_UPDATE',409);
   if(!original&&next.creatorId!==userId)throw new PaperStoreError('MARKET_OWNER',403);
   const formatted=`${update.walletMicros/1_000_000n}.${(update.walletMicros%1_000_000n).toString().padStart(6,'0')}`;
   if(update.response.balanceUSD!==formatted)throw new PaperStoreError('RESPONSE_BALANCE',400);
   if(original)await client.query('UPDATE ocp_paper_markets SET document=$2::jsonb,revision=$3,updated_at=now() WHERE id=$1',[next.id,JSON.stringify(next),next.revision]);
   else await client.query('INSERT INTO ocp_paper_markets(id,creator_id,revision,document) VALUES($1,$2,$3,$4::jsonb)',[next.id,userId,next.revision,JSON.stringify(next)]);
   await client.query('UPDATE ocp_paper_users SET balance_micros=$2 WHERE id=$1',[userId,update.walletMicros.toString()]);
   await client.query('INSERT INTO ocp_paper_requests(user_id,request_id,payload_hash,market_id,response) VALUES($1,$2,$3,$4,$5::jsonb)',[userId,requestId,payloadHash,next.id,JSON.stringify(update.response)]);
   await client.query("INSERT INTO ocp_paper_journal(id,user_id,request_id,market_id,kind,delta_micros,balance_before_micros,balance_after_micros) VALUES($1,$2,$3,$4,'MUTATION',$5,$6,$7)",[randomUUID(),userId,requestId,next.id,(update.walletMicros-before).toString(),before.toString(),update.walletMicros.toString()]);
   return update.response;
  });
 }
}
