import {describe,it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
import {ChainHistoryStore} from './store';
const key={chainId:46630,factory:'0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',market:'0x0000000000000000000000000000000000000000'},token='12345678-1234-1234-1234-123456789abc';
const row=()=>({chain_id:'46630',factory:key.factory.toLowerCase(),market:key.market,checkpoint:null,origin:null,descriptor:null,target_block:'88',through_timestamp:'123',updated_at:new Date(1000),lease_until:new Date(5000),last_error:null});
function fixture(){
 const client={query:vi.fn(async(_sql:string)=>({rows:[],rowCount:0})),release:vi.fn()};
 const pool={connect:vi.fn(async()=>client),query:vi.fn(async(_sql:string,_args?:unknown[])=>({rows:[] as Record<string,unknown>[],rowCount:0})),end:vi.fn(async()=>{}),on:vi.fn()};
 return {store:new ChainHistoryStore({pool:pool as unknown as Pool}),pool,client};
}
describe('shared chain history Postgres store',()=>{
 it('creates only its additive table under a transaction lock, once',async()=>{
  const {store,pool,client}=fixture();await Promise.all([store.get(key),store.get(key)]);expect(pool.connect).toHaveBeenCalledOnce();
  const sql=client.query.mock.calls.map(c=>c[0]);expect(sql[0]).toBe('BEGIN');expect(sql[1]).toContain('pg_advisory_xact_lock');expect(sql[2]).toContain('CREATE TABLE IF NOT EXISTS ocp_chain_history_v1');expect(sql[2]).toContain('PRIMARY KEY(chain_id,factory,market)');expect(sql[2]).not.toContain('ocp_paper');expect(sql[3]).toBe('COMMIT');expect(client.release).toHaveBeenCalledOnce();await store.close();expect(pool.end).toHaveBeenCalledOnce();
 });
 it('rolls back and retries initialization on failure',async()=>{
  const {store,client}=fixture();client.query.mockRejectedValueOnce(Error('failed'));await expect(store.get(key)).rejects.toThrow('failed');expect(client.query).toHaveBeenCalledWith('ROLLBACK');await expect(store.get(key)).resolves.toBeNull();expect(client.release).toHaveBeenCalledTimes(2);
 });
 it('normalizes scope and decodes null fields, numbers, timestamps',async()=>{
  const {store,pool}=fixture();pool.query.mockResolvedValueOnce({rows:[row()],rowCount:1});expect(await store.get(key)).toEqual({...key,factory:key.factory.toLowerCase(),checkpoint:null,origin:null,descriptor:null,targetBlock:88,throughTimestamp:123,updatedAt:1000,leaseUntil:5000,lastError:null});expect(pool.query.mock.calls[0][1]).toEqual([46630,key.factory.toLowerCase(),key.market]);expect(pool.query.mock.calls[0][0]).toMatch(/^SELECT/);
 });
 it('claims atomically with DB-time lease/cooldown checks, allowing cooldown zero',async()=>{
  const {store,pool}=fixture();pool.query.mockResolvedValueOnce({rows:[row()],rowCount:1});expect((await store.claim(key,0,45000))?.token).toMatch(/^[0-9a-f-]{36}$/);const [sql,args]=pool.query.mock.calls[0];expect(sql).toContain('ON CONFLICT');expect(sql).toContain('h.lease_until<=clock_timestamp()');expect(sql).toContain('h.next_sync<=clock_timestamp()');expect(args?.slice(4)).toEqual([45000,0]);expect(await store.claim(key)).toBeNull();
 });
 it('uses unexpired token CAS; undefined preserves fields, null clears',async()=>{
  const {store,pool}=fixture();pool.query.mockResolvedValueOnce({rows:[{chain_id:'46630'}],rowCount:1});expect(await store.save(key,token,{checkpoint:undefined,origin:null,targetBlock:99})).toBe(true);
  const [sql,args]=pool.query.mock.calls[0];expect(sql).toContain('origin=$5::jsonb');expect(sql).toContain('target_block=$6');expect(sql).not.toContain('checkpoint=');expect(sql).toContain('lease_token=$4 AND lease_until>clock_timestamp()');expect(args?.slice(3)).toEqual([token,null,99]);expect(await store.save(key,token,{targetBlock:100})).toBe(false);
 });
 it('serializes descriptor JSON with exact string quantities',async()=>{
  const {store,pool}=fixture(),descriptor={createdAt:'100',k:'1000000000000',stock:key.factory,genesisCutoff:'200',formalCutoff:'300'};await store.save(key,token,{descriptor});expect(pool.query.mock.calls[0][1]?.[4]).toBe(JSON.stringify(descriptor));
 });
 it('releases by token and sanitizes error codes instead of persisting secrets',async()=>{
  const {store,pool}=fixture();await store.release(key,token,0,'RPC_TIMEOUT');const [sql,args]=pool.query.mock.calls[0];expect(sql).toContain('lease_token=$4');expect(sql).toContain('lease_token=NULL,lease_until=NULL');expect(args?.slice(3)).toEqual([token,0,'RPC_TIMEOUT']);await store.release(key,token,15000,'https://user:secret@example.test');expect(pool.query.mock.calls[1][1]?.[5]).toBe('SYNC_FAILED');await store.release(key,token);expect(pool.query.mock.calls[2][1]?.[5]).toBeNull();
 });
 it('rejects invalid keys/durations and does not send bad tokens to SQL',async()=>{
  const {store,pool}=fixture();await expect(store.get({...key,chainId:1.5})).rejects.toThrow('INVALID_HISTORY_KEY');await expect(store.get({...key,factory:'bad'})).rejects.toThrow();await expect(store.claim(key,-1)).rejects.toThrow();await expect(store.claim(key,0,0)).rejects.toThrow();expect(await store.save(key,'bad',{})).toBe(false);await store.release(key,'bad');expect(pool.query).not.toHaveBeenCalled();
 });
 it('rejects unsafe database integers rather than silently rounding block heights',async()=>{
  const {store,pool}=fixture();pool.query.mockResolvedValueOnce({rows:[{...row(),target_block:'9007199254740993'}],rowCount:1});await expect(store.get(key)).rejects.toThrow('INVALID_HISTORY_ROW');
 });
});
