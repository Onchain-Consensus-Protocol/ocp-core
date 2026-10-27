import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';
import {PaperStore,type PaperMutationContext,type PaperStoreUser} from './store';
import {createPaperMarket,projectPaperMarket,formatUSD} from './engine';
import {STOCK_DEMO_ASSETS} from '../../components/stockDemoRouting';

it('fails explicitly without DATABASE_URL and never uses a local fallback',()=>{
 vi.stubEnv('DATABASE_URL','');
 try{expect(()=>new PaperStore()).toThrow('DATABASE_URL_REQUIRED');}
 finally{vi.unstubAllEnvs();}
});

// Explicit opt-in only: never use DATABASE_URL or another application's production database for tests.
const connectionString=process.env.PAPER_TEST_DATABASE_URL;
describe.skipIf(!connectionString)('PaperStore real PostgreSQL transactions',()=>{
 const prefix=`paper-test-${randomUUID()}-`;
 let store:PaperStore;let inspect:Pool;
 const now=Date.now();
 const newUser=()=>store.ensureUser({subject:prefix+randomUUID(),email:'paper@example.test',name:'Paper Test'});
 const make=(user:PaperStoreUser)=>{
  const market=createPaperMarket(randomUUID(),user.id,{title:'Paper database test',yesRule:'Yes',noRule:'No',invalidRule:'Invalid',assetSymbol:STOCK_DEMO_ASSETS[0].symbol,coreHours:6},now);
  return {market,response:{market:projectPaperMarket(market,user.id,now),balanceUSD:formatUSD(user.balanceMicros)},walletMicros:user.balanceMicros};
 };
 const create=async(user:PaperStoreUser,requestId=randomUUID())=>store.mutate(user.id,requestId,requestId,null,({user})=>make(user));
 const debit=(amount:bigint)=>({user,market}:PaperMutationContext)=>{
  if(!market)throw new Error('missing market');
  if(user.balanceMicros<amount)throw new Error('INSUFFICIENT');
  market.revision++;
  return {market,walletMicros:user.balanceMicros-amount,response:{market:projectPaperMarket(market,user.id,now),balanceUSD:formatUSD(user.balanceMicros-amount)}};
 };
 beforeAll(async()=>{store=new PaperStore({connectionString});inspect=new Pool({connectionString});await store.ready();},30_000);
 afterAll(async()=>{
  if(inspect){
   const client=await inspect.connect();
   try{
    await client.query('BEGIN');
    const ids='SELECT id FROM ocp_paper_users WHERE subject LIKE $1';
    await client.query(`DELETE FROM ocp_paper_share_snapshots WHERE user_id IN (${ids})`,[prefix+'%']);
    await client.query(`DELETE FROM ocp_paper_journal WHERE user_id IN (${ids})`,[prefix+'%']);
    await client.query(`DELETE FROM ocp_paper_requests WHERE user_id IN (${ids})`,[prefix+'%']);
    await client.query(`DELETE FROM ocp_paper_markets WHERE creator_id IN (${ids})`,[prefix+'%']);
    await client.query(`DELETE FROM ocp_paper_grants WHERE user_id IN (${ids})`,[prefix+'%']);
    await client.query('DELETE FROM ocp_paper_users WHERE subject LIKE $1',[prefix+'%']);
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
   await inspect.end();
  }
  if(store)await store.close();
 },30_000);
 it('concurrent first logins grant exactly once and preserve subject identity',async()=>{
  const subject=prefix+randomUUID();
  const users=await Promise.all(Array.from({length:8},()=>store.ensureUser({subject,email:'old@example.test',name:'Test'})));
  expect(new Set(users.map(u=>u.id)).size).toBe(1);
  expect(users.every(u=>u.balanceMicros===100_000_000_000n)).toBe(true);
  const updated=await store.ensureUser({subject,email:'new@example.test',name:'Updated'});
  expect(updated.id).toBe(users[0].id);expect(updated.balanceMicros).toBe(100_000_000_000n);
  expect(updated.email).toBe('new@example.test');
  const count=await inspect.query('SELECT count(*)::int AS n FROM ocp_paper_grants WHERE user_id=$1',[updated.id]);expect(count.rows[0].n).toBe(1);
 });
 it('persists immutable snapshots with user-scoped idempotency without changing wallets',async()=>{
  const user=await newUser(),created=await create(user),requestId=randomUUID();
  const before=await inspect.query('SELECT balance_micros FROM ocp_paper_users WHERE id=$1',[user.id]);
  const [a,b]=await Promise.all([store.createShareSnapshot(user.id,created.market.id,'dark',requestId),store.createShareSnapshot(user.id,created.market.id,'dark',requestId)]);
  expect(a.id).toBe(b.id);expect(a.theme).toBe('dark');expect(await store.getShareSnapshot(a.id)).toEqual(a);
  expect(JSON.stringify(a)).not.toContain(user.email);expect(JSON.stringify(a)).not.toContain(user.id);
  await expect(store.createShareSnapshot(user.id,created.market.id,'light',requestId)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  const after=await inspect.query('SELECT balance_micros FROM ocp_paper_users WHERE id=$1',[user.id]);expect(after.rows).toEqual(before.rows);
 });
 it('same email on distinct authenticated subjects is not the same wallet',async()=>{
  const a=await newUser(),b=await newUser();expect(a.id).not.toBe(b.id);
 });
 it('replays the persisted response once and rejects mismatched idempotency payloads',async()=>{
  const user=await newUser();const market=await create(user);const id=randomUUID();let calls=0;
  const callback=(context:PaperMutationContext)=>{calls++;return debit(1_000_000n)(context);};
  const [first,second]=await Promise.all([store.mutate(user.id,id,'same',market.market.id,callback),store.mutate(user.id,id,'same',market.market.id,callback)]);
  expect(calls).toBe(1);expect(first.balanceUSD).toBe(second.balanceUSD);expect([first.replayed,second.replayed]).toContain(true);
  await expect(store.mutate(user.id,id,'different',market.market.id,callback)).rejects.toMatchObject({status:409});
  const audit=await inspect.query('SELECT count(*)::int AS n FROM ocp_paper_journal WHERE user_id=$1 AND request_id=$2',[user.id,id]);expect(audit.rows[0].n).toBe(1);
 });
 it('serializes global wallet debits across two different markets',async()=>{
  const user=await newUser();const a=await create(user),b=await create(user);
  const outcomes=await Promise.allSettled([store.mutate(user.id,randomUUID(),'a',a.market.id,debit(75_000_000_000n)),store.mutate(user.id,randomUUID(),'b',b.market.id,debit(75_000_000_000n))]);
  expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const balance=await inspect.query('SELECT balance_micros FROM ocp_paper_users WHERE id=$1',[user.id]);expect(BigInt(balance.rows[0].balance_micros)).toBe(25_000_000_000n);
 });
 it('serializes two users updating the same market without losing a revision',async()=>{
  const a=await newUser(),b=await newUser();const created=await create(a);
  await Promise.all([store.mutate(a.id,randomUUID(),'a',created.market.id,debit(1n)),store.mutate(b.id,randomUUID(),'b',created.market.id,debit(1n))]);
  const latest=await store.getMarket(created.market.id);expect(latest?.revision).toBe(2);
  expect((await store.listMarkets()).some(m=>m.id===created.market.id)).toBe(true);
 });
 it('rolls back market, wallet, request and journal on a late database failure',async()=>{
  const user=await newUser();const existing=await create(user);const id=randomUUID();
  // Force a duplicate market PK after callback. No request or audit row may survive.
  await expect(store.mutate(user.id,id,'collision',null,({user})=>{
   const update=make(user);update.market.id=existing.market.id;update.response.market.id=existing.market.id;
   update.walletMicros-=1n;update.response.balanceUSD=formatUSD(update.walletMicros);return update;
  })).rejects.toThrow();
  const wallet=await inspect.query('SELECT balance_micros FROM ocp_paper_users WHERE id=$1',[user.id]);expect(BigInt(wallet.rows[0].balance_micros)).toBe(user.balanceMicros);
  const requests=await inspect.query('SELECT count(*)::int AS n FROM ocp_paper_requests WHERE user_id=$1 AND request_id=$2',[user.id,id]);expect(requests.rows[0].n).toBe(0);
  const journal=await inspect.query('SELECT count(*)::int AS n FROM ocp_paper_journal WHERE user_id=$1 AND request_id=$2',[user.id,id]);expect(journal.rows[0].n).toBe(0);
 });
 it('requires an existing authenticated account and rolls back callbacks that fail',async()=>{
  let called=false;
  await expect(store.mutate(randomUUID(),randomUUID(),'hash',null,()=>{called=true;throw new Error('unreachable');})).rejects.toMatchObject({status:401});expect(called).toBe(false);
  const user=await newUser(),created=await create(user);const before=await store.getMarket(created.market.id);
  await expect(store.mutate(user.id,randomUUID(),'hash',created.market.id,({market})=>{market!.revision++;throw new Error('CALLBACK_FAILED');})).rejects.toThrow('CALLBACK_FAILED');
  expect((await store.getMarket(created.market.id))?.revision).toBe(before?.revision);
 });
 it('rejects stale revisions and reuse of a request ID on a different market',async()=>{
  const user=await newUser(),a=await create(user),b=await create(user);const id=randomUUID();
  await store.mutate(user.id,id,'same-hash',a.market.id,debit(1n));
  await expect(store.mutate(user.id,id,'same-hash',b.market.id,debit(1n))).rejects.toMatchObject({status:409});
  await expect(store.mutate(user.id,randomUUID(),'stale',a.market.id,({user,market})=>({market:market!,walletMicros:user.balanceMicros,response:{market:projectPaperMarket(market!,user.id,now),balanceUSD:formatUSD(user.balanceMicros)}}))).rejects.toMatchObject({status:409});
 });

});
