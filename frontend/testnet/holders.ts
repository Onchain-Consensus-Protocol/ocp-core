import {Contract,Interface,ZeroAddress,getAddress,type Provider} from 'ethers';
import marketAbi from './abi/TopicMarket.json';
import coreAbi from './abi/OCPCore.json';
import {getLogsInChunks,type ChainPriceHistory} from './priceHistory';
import type {CoreHistory} from './coreHistory';
import type {MarketSummary} from './chainClient';
export type HolderKind='GENESIS'|'FORMAL'|'CORE';
export interface Holder {address:string;g:bigint;yes:bigint;no:bigint;lp:bigint;invalid:bigint}
export interface HolderSnapshot {rows:Holder[];block:number}
const tokenAbi=['function balanceOf(address) view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'];
const transfer=new Interface(tokenAbi);
const lpAddressCache=new Map<string,{block:number;hash:string;addresses:string[]}>();
export const holderTotal=(r:Holder,kind:HolderKind)=>kind==='GENESIS'?r.g:kind==='FORMAL'?r.yes+r.no+r.lp:r.yes+r.no+r.invalid;
export function currentHolders(rows:Holder[],kind:HolderKind){
 return rows.filter(r=>holderTotal(r,kind)>0n).sort((a,b)=>a.address.localeCompare(b.address));
}
/** Event history discovers addresses; fixed-block contract balances determine current ownership. */
export async function readHolders(provider:Provider,market:MarketSummary,history:ChainPriceHistory,coreHistory:CoreHistory|undefined,kind:HolderKind):Promise<HolderSnapshot>{
 if((await provider.getNetwork()).chainId!==46630n)throw Error('Wrong holder network');
 if(kind==='CORE'&&!coreHistory)throw Error('Core history unavailable');
 const block=kind==='CORE'?coreHistory!.latestBlock:history.latestBlock;
 const head=await provider.getBlock(block);if(!head?.hash)throw Error('Holder snapshot unavailable');
 const at={blockTag:block},m=new Contract(market.address,marketAbi,provider),v=new Contract(market.vault,coreAbi,provider);
 const events=kind==='CORE'?coreHistory!.events:history.events;
 const candidates=new Set<string>(),claimed=new Set<string>();
 for(const e of events){if(e.blockNumber>block||!e.actor)continue;const a=getAddress(e.actor);if(a!==ZeroAddress&&a!==getAddress(market.address))candidates.add(a);if(kind==='CORE'&&e.kind==='CLAIM_CORE')claimed.add(a);}
 let lp:Contract|undefined;
 if(kind==='FORMAL'){
  const lpAddress=await m.lpToken(at);lp=new Contract(lpAddress,tokenAbi,provider);
  // External transfers are possible only after LP materialization. Discover recipients too.
  const starts=history.events.filter(e=>e.kind==='MATERIALIZE_LP'&&e.blockNumber<=block).map(e=>e.blockNumber);
  if(starts.length){
   const cacheKey=getAddress(lpAddress),cached=lpAddressCache.get(cacheKey);
   const valid=cached&&cached.block<=block&&(await provider.getBlock(cached.block))?.hash===cached.hash;
   const transferred=new Set<string>(valid?cached.addresses:[]);
   const from=valid?cached.block+1:Math.min(...starts);
   const logs=from>block?[]:await getLogsInChunks(provider,lpAddress,from,block,[transfer.getEvent('Transfer')!.topicHash]);
   for(const l of logs){if(l.removed)throw Error('Holder logs reorganized');const e=transfer.parseLog(l);for(const value of [e!.args.from,e!.args.to]){const a=getAddress(value);if(a!==ZeroAddress&&a!==getAddress(market.address))transferred.add(a);}}
   for(const a of transferred)candidates.add(a);
   if(lpAddressCache.size>100)lpAddressCache.delete(lpAddressCache.keys().next().value!);
   // A later balance/header failure must not publish an unverified candidate cursor.
   if((await provider.getBlock(block))?.hash!==head.hash)throw Error('Holder logs reorganized');
   lpAddressCache.set(cacheKey,{block,hash:head.hash,addresses:[...transferred]});
  }
 }
 const addresses=[...candidates],rows:Holder[]=[];let next=0;
 await Promise.all(Array.from({length:Math.min(4,addresses.length)},async()=>{for(;;){const i=next++;if(i>=addresses.length)return;const address=addresses[i];let g=0n,yes=0n,no=0n,lpBalance=0n,invalid=0n;
  if(kind==='GENESIS')g=await m.shares(address,at);
  else if(kind==='FORMAL'){const values=await Promise.all([m.shares(address,at),m.yes(address,at),m.no(address,at),lp!.balanceOf(address,at)]);yes=values[1];no=values[2];lpBalance=values[0]+values[3];}
  else if(!claimed.has(address)){const stakes=await v.stakeOf(address,at);yes=stakes[0];no=stakes[1];invalid=stakes[2];}
  rows.push({address,g,yes,no,lp:lpBalance,invalid});
 }}));
 if((await provider.getBlock(block))?.hash!==head.hash)throw Error('Holder snapshot reorganized');
 return {rows:currentHolders(rows,kind),block};
}
