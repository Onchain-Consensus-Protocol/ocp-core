import {getAddress} from 'ethers';
import {replayCheckpoint,type ChainPriceHistory} from './priceHistory';
import type {SharedHistoryResponse} from '../server/chain/types';
interface Options {fetcher?:typeof fetch;signal?:AbortSignal;requestTimeoutMs?:number;warmupMs?:number;pollMs?:number}
/** A display cache, never a transaction oracle. Scope and replay checks reject malformed/stale-chain payloads.
 * A missing/unavailable backend returns null so the existing direct-chain reader remains usable. */
export async function readSharedHistory(factory:string,market:string,options:Options={}):Promise<ChainPriceHistory|null>{
 if(typeof window==='undefined'&&!options.fetcher)return null;
 const fetcher=options.fetcher??fetch,f=getAddress(factory),m=getAddress(market),started=Date.now();
 const url=`/api/chain-history?market=${m}&factory=${f}&chainId=46630`;
 do{
  if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,options.requestTimeoutMs??5000);
  let warming=false;
  try{
   const res=await fetcher(url,{method:'GET',headers:{Accept:'application/json'},signal:controller.signal});
   if(res.status!==200&&res.status!==202)return null;
   const value=await res.json() as SharedHistoryResponse;
   if(value.version!==1||value.chainId!==46630||getAddress(value.factory)!==f||getAddress(value.market)!==m)return null;
   if(value.checkpoint){
    if(!Number.isSafeInteger(value.throughTimestamp)||value.throughTimestamp!<Number(value.checkpoint.createdAt)||!Number.isSafeInteger(value.targetBlock)||value.targetBlock!<value.checkpoint.latestBlock)return null;
    const history=replayCheckpoint(value.checkpoint,f,m);
    if(history.events.some(e=>e.at>value.throughTimestamp!))return null;
    return {...history,checkpoint:value.checkpoint,asOf:value.throughTimestamp!,cacheStatus:'shared',serverSyncing:value.syncing};
   }
   warming=res.status===202;
  }catch{if(options.signal?.aborted)throw new DOMException('Cancelled','AbortError');return null;}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
  if(!warming||Date.now()-started>=(options.warmupMs??20000))return null;
  await new Promise<void>((resolve,reject)=>{
   const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
   const timer=setTimeout(()=>{options.signal?.removeEventListener('abort',abort);resolve();},options.pollMs??2000);
   options.signal?.addEventListener('abort',abort,{once:true});
   if(options.signal?.aborted){options.signal.removeEventListener('abort',abort);abort();}
  });
 }while(true);
}
