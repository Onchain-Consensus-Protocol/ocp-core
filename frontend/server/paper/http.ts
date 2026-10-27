import {validDeadlineTimestamp} from '../../shared/deadlineDate.js';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {createClerkClient,verifyToken} from '@clerk/backend';
import {PaperStore,PaperStoreError} from './store.js';
import {createPaperMarket,applyPaperAction,quotePaperAction,projectPaperMarket,advancePaperMarket,parseUSD,formatUSD} from './engine.js';
import type {PaperAction,PaperCreateInput,PaperMutationResult} from '../../shared/paperTypes.js';
import {marketSnapshotUrl} from '../../shared/marketShare.js';

class HttpError extends Error {constructor(message:string,readonly status:number){super(message);}}
const failure=(code:string,status:number)=>new HttpError(code,status);
type StoreAPI=Pick<PaperStore,'ensureUser'|'listMarkets'|'getMarket'|'mutate'>&Partial<Pick<PaperStore,'createShareSnapshot'>>;
interface Identity {
 id:string;firstName:string|null;primaryEmailAddressId:string|null;
 externalAccounts:{provider:string;emailAddress:string;verification:{status:string}|null}[];
 emailAddresses:{id:string;emailAddress:string;verification:{status:string}|null}[];
}
export interface PaperHandlerDependencies {
 env?:NodeJS.ProcessEnv;
 getStore?:()=>StoreAPI;
 verifySession?:(token:string,secret:string,origins:string[])=>Promise<{sub:string;azp?:string}>;
 getIdentity?:(subject:string,secret:string)=>Promise<Identity>;
 now?:()=>number;
}
const json=(res:ServerResponse,status:number,data:unknown)=>{
 res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data));
};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown)=>{if(typeof value!=='string'||!value||value.length>200)throw failure('MARKET_ID',400);return value;};
async function body(req:IncomingMessage):Promise<Record<string,unknown>>{
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw failure('CONTENT_TYPE',415);
 const length=req.headers['content-length'];if(length&&(!/^\d+$/.test(length)||Number(length)>16000))throw failure('BODY_TOO_LARGE',413);
 let bytes=0;const chunks:Buffer[]=[];
 for await(const value of req){const chunk=Buffer.isBuffer(value)?value:Buffer.from(value);bytes+=chunk.length;if(bytes>16000)throw failure('BODY_TOO_LARGE',413);chunks.push(chunk);}
 let parsed:unknown;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure('BAD_JSON',400);}
 if(!record(parsed))throw failure('BAD_JSON',400);return parsed;
}
function action(value:unknown):PaperAction{
 if(!record(value)||typeof value.type!=='string')throw failure('ACTION',400);
 const type=value.type;
 if(['CLAIM_MARKET','CLAIM_CORE','CLAIM_CREATOR_FEES'].includes(type))return {type} as PaperAction;
 if(!['GENESIS_BUY','GENESIS_SELL','FORMAL_BUY','FORMAL_BUY_SHARES','FORMAL_SELL','CORE_STAKE','REDEEM_PAIRS'].includes(type))throw failure('ACTION',400);
 const side=value.side;
 if(['FORMAL_BUY','FORMAL_BUY_SHARES','FORMAL_SELL','CORE_STAKE'].includes(type)&&!['YES','NO',...(type==='CORE_STAKE'?['INVALID']:[])].includes(String(side)))throw failure('SIDE',400);
 if(['GENESIS_BUY','FORMAL_BUY','CORE_STAKE'].includes(type)){
  if(typeof value.budgetUSD!=='string'||parseUSD(value.budgetUSD)<=0n)throw failure('AMOUNT',400);
  return {type,budgetUSD:value.budgetUSD,...(type==='GENESIS_BUY'?{}:{side})} as PaperAction;
 }
 if(typeof value.quantity!=='string'||value.quantity.length>64||! /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value.quantity)||!Number.isFinite(Number(value.quantity))||Number(value.quantity)<=0||Number(value.quantity)>1e15)throw failure('QUANTITY',400);
 return {type,quantity:value.quantity,...(['GENESIS_SELL','REDEEM_PAIRS'].includes(type)?{}:{side})} as PaperAction;
}
function createInput(b:Record<string,unknown>):PaperCreateInput{
 for(const field of ['title','yesRule','noRule','invalidRule','assetSymbol'])if(typeof b[field]!=='string')throw failure('METADATA',400);
 const fields=['requestId','title','yesRule','noRule','invalidRule','assetSymbol','coreHours','coreDeadline'];
 if(Object.keys(b).some(key=>!fields.includes(key)))throw failure('TIME',400);
 // 此处只验字段格式；剩余时长由锁内engine校验，成功请求过期后重试仍可命中幂等记录。
 const hasHours=Object.hasOwn(b,'coreHours'),hasDeadline=Object.hasOwn(b,'coreDeadline');
 if(hasHours===hasDeadline)throw failure('TIME',400);
 if(hasHours&&(typeof b.coreHours!=='number'||!Number.isSafeInteger(b.coreHours*3600)||b.coreHours<=4))throw failure('TIME',400);
 if(hasDeadline&&!validDeadlineTimestamp(b.coreDeadline))throw failure('TIME',400);
 const deadline=hasDeadline?{coreDeadline:b.coreDeadline}:{coreHours:b.coreHours};
 return {title:b.title,yesRule:b.yesRule,noRule:b.noRule,invalidRule:b.invalidRule,assetSymbol:b.assetSymbol,...deadline} as PaperCreateInput;
}
function allowedOrigins(env:NodeJS.ProcessEnv):string[]{
 const configured=env.PAPER_ALLOWED_ORIGINS||((env.NODE_ENV==='production'||env.VERCEL)?'':'http://127.0.0.1:5189,http://localhost:5189');
 const origins=configured.split(',').map(x=>x.trim()).filter(Boolean);
 if(!origins.length)throw failure('NOT_CONFIGURED',503);
 for(const origin of origins){let parsed:URL;try{parsed=new URL(origin);}catch{throw failure('NOT_CONFIGURED',503);}
  if(parsed.origin!==origin||!['https:','http:'].includes(parsed.protocol)||(parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))throw failure('NOT_CONFIGURED',503);
 }
 return origins;
}
// Only explicit engine validation codes are public. Database/Clerk/internal messages may contain secrets.
const validationCodes=new Set(['USD_AMOUNT','USD_RANGE','AMOUNT','QUANTITY','METADATA','ASSET','TIME','CONFIG','BALANCE','HOLDINGS','INVENTORY','CAPACITY','CASH','CLAIM','CORE_CLAIM','CORE_CLOSED','CORE_PENDING','FORMAL_CLOSED','GENESIS_CLOSED','PHASE','SIDE','SIDE_LOCKED','FEE_OWNER','NO_FEES','TINY','COLLATERAL']);
function canonical(value:unknown):unknown {return Array.isArray(value)?value.map(canonical):record(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}

/** Dependencies are server composition only; no request field can replace authentication or storage. */
export function createPaperHandler(deps:PaperHandlerDependencies={}){
 let store:PaperStore|undefined;
 const identities=new Map<string,{expires:number;auth:{subject:string;email:string;name:string}}>();
 return async(req:IncomingMessage,res:ServerResponse)=>{try{
  const env=deps.env??process.env,now=deps.now??Date.now;
  const url=new URL(req.url||'/','http://paper.invalid'),op=url.searchParams.get('op');
  if(!['GET','POST'].includes(req.method||'')){res.setHeader('Allow','GET, POST');throw failure('METHOD',405);}
  const read=['session','markets','market'].includes(op||''),write=['quote','create','trade','share'].includes(op||'');
  if(!read&&!write)throw failure('NOT_FOUND',404);
  if((read&&req.method!=='GET')||(write&&req.method!=='POST'))throw failure('METHOD',405);
  const databaseConfigured=!!env.DATABASE_URL,configured=!!env.CLERK_SECRET_KEY&&databaseConfigured;
  const bearer=req.headers.authorization;
  if(bearer&&!configured)throw failure('AUTH_REQUIRED',401);
  if(!configured&&op==='session')return json(res,200,{configured:false,user:null,balanceUSD:'0.000000',initialGrantUSD:'100000.000000'});
  if(!databaseConfigured||(!configured&&write))throw failure('NOT_CONFIGURED',503);
  const origins=configured?allowedOrigins(env):[],origin=req.headers.origin;
  // Public reads do not require authentication. Bearer tokens are never silently ignored.
  if(configured&&((origin&&!origins.includes(origin))||(req.method==='POST'&&!origin)))throw failure('ORIGIN',403);
  const db=deps.getStore?deps.getStore():(store??=new PaperStore({connectionString:env.DATABASE_URL}));
  let user:Awaited<ReturnType<StoreAPI['ensureUser']>>|null=null;
  if(bearer){
   if(!/^Bearer [^\s]+$/.test(bearer)||bearer.length>16384)throw failure('AUTH_REQUIRED',401);
   let claims:{sub:string;azp?:string};
   try{claims=await(deps.verifySession??(async(token,secret,parties)=>verifyToken(token,{secretKey:secret,authorizedParties:parties})))(bearer.slice(7),env.CLERK_SECRET_KEY!,origins);}
   catch{throw failure('AUTH_REQUIRED',401);}
   if(typeof claims.sub!=='string'||!claims.sub||!claims.azp||!origins.includes(claims.azp))throw failure('AUTH_REQUIRED',401);
   const cached=identities.get(claims.sub);
   let auth: {subject:string;email:string;name:string};
   if(cached&&cached.expires>now())auth=cached.auth;
   else{
    if(cached)identities.delete(claims.sub);
    const identity=await(deps.getIdentity??(async(subject,secret)=>createClerkClient({secretKey:secret}).users.getUser(subject)))(claims.sub,env.CLERK_SECRET_KEY!);
    if(identity.id!==claims.sub)throw failure('AUTH_REQUIRED',401);
    // 只信任认证服务验证过的主邮箱；客户端提交的邮箱不能领取首次赠金。
    const email=identity.emailAddresses.find(e=>e.id===identity.primaryEmailAddressId&&e.verification?.status==='verified');
    if(!email)throw failure('EMAIL_REQUIRED',403);
    auth={subject:identity.id,email:email.emailAddress,name:identity.firstName?.trim()||'Player'};
    // Only already verified identities enter the bounded, process-local 60-second cache.
    if(identities.size>=1000)identities.delete(identities.keys().next().value!);
    identities.set(claims.sub,{auth,expires:now()+60_000});
   }
   user=await db.ensureUser(auth);
  }
  if(op==='session')return json(res,200,{configured:true,user:user?{id:user.id,name:user.name,email:user.email}:null,balanceUSD:formatUSD(user?.balanceMicros??0n),initialGrantUSD:'100000.000000'});
  if(op==='markets')return json(res,200,{markets:(await db.listMarkets()).map(m=>projectPaperMarket(m,user?.id??null,now()))});
  if(op==='market'){const m=await db.getMarket(id(url.searchParams.get('id')));if(!m)throw failure('NOT_FOUND',404);return json(res,200,projectPaperMarket(m,user?.id??null,now()));}
  if(!user)throw failure('AUTH_REQUIRED',401);
  const b=await body(req);
  if(op==='quote'){const m=await db.getMarket(id(b.marketId));if(!m)throw failure('NOT_FOUND',404);return json(res,200,quotePaperAction(m,user.id,action(b.action),now()));}
  if(typeof b.requestId!=='string'||! /^[a-zA-Z0-9_-]{16,100}$/.test(b.requestId))throw failure('REQUEST_ID',400);
  if(op==='share'){
   if(Object.keys(b).some(k=>!['marketId','theme','requestId'].includes(k))||typeof b.theme!=='string'||!['light','dark'].includes(b.theme))throw failure('SHARE_INPUT',400);
   if(!db.createShareSnapshot)throw failure('SERVICE_UNAVAILABLE',503);
   const snapshot=await db.createShareSnapshot(user.id,id(b.marketId),b.theme as 'light'|'dark',b.requestId,now);
   return json(res,200,{url:marketSnapshotUrl(snapshot.id),snapshot});
  }
  const marketId=op==='trade'?id(b.marketId):null;
  const input=op==='create'?createInput(b):null;
  const tradeAction=op==='trade'?action(b.action):null;
  if(op==='trade'&&(!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0))throw failure('STALE_QUOTE',409);
  if(b.maxPayUSD!==undefined){if(typeof b.maxPayUSD!=='string')throw failure('USD_AMOUNT',400);parseUSD(b.maxPayUSD);}
  if(b.minReceiveUSD!==undefined){if(typeof b.minReceiveUSD!=='string')throw failure('USD_AMOUNT',400);parseUSD(b.minReceiveUSD);}
  const hash=createHash('sha256').update(JSON.stringify(canonical({op,body:b}))).digest('hex');const actor=user;
  const result=await db.mutate(actor.id,b.requestId,hash,marketId,({user:locked,market})=>{
   // Sample time after wallet/market locks are acquired, not before potentially lengthy waits.
   const executionNow=now();let next,wallet=locked.balanceMicros;
   if(op==='create')next=createPaperMarket(randomUUID(),actor.id,input!,executionNow);
   else{
    if(!market)throw failure('NOT_FOUND',404);
    const current=advancePaperMarket(market,executionNow);
    if(current.revision!==b.expectedRevision)throw failure('STALE_QUOTE',409);
    const applied=applyPaperAction(market,actor.id,wallet,tradeAction!,executionNow);next=applied.market;const diff=wallet-applied.walletMicros;
    if(b.maxPayUSD!==undefined&&(diff>0n?diff:0n)>parseUSD(b.maxPayUSD as string))throw failure('SLIPPAGE',409);
    if(b.minReceiveUSD!==undefined&&(diff<0n?-diff:0n)<parseUSD(b.minReceiveUSD as string))throw failure('SLIPPAGE',409);
    wallet=applied.walletMicros;
   }
   const response:PaperMutationResult={market:projectPaperMarket(next,actor.id,executionNow),balanceUSD:formatUSD(wallet)};
   return {market:next,walletMicros:wallet,response};
  });
  return json(res,200,result);
 }catch(error){
  if(error instanceof HttpError||error instanceof PaperStoreError)return json(res,error.status,{error:error.status>=500?'SERVICE_UNAVAILABLE':error.message});
  if(error instanceof Error&&validationCodes.has(error.message))return json(res,400,{error:error.message});
  return json(res,503,{error:'SERVICE_UNAVAILABLE'});
 }};
}
export const paperHandler=createPaperHandler();
