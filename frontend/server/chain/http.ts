import type {IncomingMessage,ServerResponse} from 'node:http';
import {JsonRpcProvider,FetchRequest,getAddress,ZeroAddress} from 'ethers';
import {waitUntil} from '@vercel/functions';
import {CURRENT_TESTNET_FACTORY} from '../../shared/testnetDeployment.js';
import {replayCheckpoint} from '../../testnet/priceHistory.js';
import {ChainHistoryStore} from './store.js';
import {syncIndexedMarket} from './indexer.js';
import type {HistoryStore,HistoryKey,SharedHistoryResponse,IndexedHistoryRow} from './types.js';
const RPC='https://rpc.testnet.chain.robinhood.com';
let store:ChainHistoryStore|undefined,provider:JsonRpcProvider|undefined;
const scheduled=new Map<string,Promise<unknown>>();
function chainProvider(){if(!provider){const request=new FetchRequest(RPC);request.timeout=8000;provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1,batchMaxCount:40});}return provider;}
export interface ChainHistoryHttpDependencies {
 store?:HistoryStore;factory?:string;now?:()=>number;
 sync?:(market:string)=>Promise<unknown>;
 defer?:(task:Promise<unknown>)=>void;
}
const send=(res:ServerResponse,status:number,body:unknown,cache='no-store')=>{
 res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control',cache);res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));
};
/** Public display index only. RPC/factory/chain are server selected; query values never choose upstream URLs.
 * Both indexer global leases and per-market leases bound concurrent scanning across function instances. */
export function createChainHistoryHandler(deps:ChainHistoryHttpDependencies={}){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  if(req.method!=='GET'){res.setHeader('Allow','GET');send(res,405,{error:'METHOD_NOT_ALLOWED'});return;}
  const factory=getAddress(deps.factory??CURRENT_TESTNET_FACTORY),now=deps.now??Date.now;
  let market:string;
  try{
   const url=new URL(req.url??'','https://market.ocp-protocol.org');
   const raw=url.searchParams.getAll('market');
   if(raw.length!==1||raw[0].length!==42)throw Error('market');market=getAddress(raw[0]);if(market===ZeroAddress)throw Error('market');
   const requestedFactory=url.searchParams.get('factory'),chain=url.searchParams.get('chainId');
   if(requestedFactory&&getAddress(requestedFactory)!==factory)throw Error('factory');
   if(chain&&chain!=='46630')throw Error('chain');
   if([...url.searchParams.keys()].some(key=>!['market','factory','chainId'].includes(key)))throw Error('query');
  }catch{send(res,400,{error:'INVALID_HISTORY_SCOPE'});return;}
  const key:HistoryKey={chainId:46630,factory,market};
  try{
   const database=deps.store??(store??=new ChainHistoryStore());
   const row=await database.get(key);
   let checkpoint=row?.checkpoint??null;
   if(checkpoint){try{replayCheckpoint(checkpoint,factory,market);}catch{checkpoint=null;}}
   // 响应只读已提交检查点。同步由响应后的受控任务推进，不等待RPC才绘图。
   if(!row||!checkpoint||now()-row.updatedAt>=15000||checkpoint.latestBlock<(row.targetBlock??checkpoint.latestBlock)){
    const scope=`${factory}:${market}`;
    if(!scheduled.has(scope)){
     const work=Promise.resolve().then(()=>deps.sync?deps.sync(market):syncIndexedMarket({provider:chainProvider(),factory,market,store:database})).catch(()=>{/* Never leak DB/RPC errors or credentials into public responses. */}).finally(()=>{if(scheduled.get(scope)===work)scheduled.delete(scope);});
     scheduled.set(scope,work);(deps.defer??waitUntil)(work);
    }
   }
   const response:SharedHistoryResponse={version:1,chainId:46630,factory,market,checkpoint,
    throughTimestamp:checkpoint?row!.throughTimestamp:null,targetBlock:row?.targetBlock??null,
    syncing:!checkpoint||!!row?.leaseUntil&&row.leaseUntil>now()||!!checkpoint&&checkpoint.latestBlock<(row?.targetBlock??checkpoint.latestBlock),updatedAt:row?.updatedAt??0};
   const body=JSON.stringify(response);
   if(Buffer.byteLength(body)>3_500_000){send(res,413,{error:'HISTORY_RESPONSE_TOO_LARGE'});return;}
   if(!checkpoint)res.setHeader('Retry-After','3');
   send(res,checkpoint?200:202,response,checkpoint?'public, max-age=0, s-maxage=3, stale-while-revalidate=10':'no-store');
  }catch{send(res,503,{error:'HISTORY_TEMPORARILY_UNAVAILABLE'});}
 };
}
export const chainHistoryHandler=createChainHistoryHandler();
