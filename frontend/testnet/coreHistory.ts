import {Interface,getAddress,type Log,type Provider} from 'ethers';
import coreAbi from './abi/OCPCore.json';
import {getLogsInChunks,replayCheckpoint,type HistoryCheckpoint,type TimestampedMarketLog,type ChainActivity} from './priceHistory';
import {loadHistoryCheckpoint,saveHistoryCheckpoint} from './coreHistoryCache';
const iface=new Interface(coreAbi);
export interface CoreHistoryCheckpoint {
  version:1;factory:string;market:string;core:string;creationBlock:number;creationHash:string;
  latestBlock:number;latestHash:string;logs:TimestampedMarketLog[];
}
export interface CoreHistory {events:ChainActivity[];latestBlock:number;complete:true}

/** Core events identify the protocol actor, including forwarded stakes. Never infer an actor from tx.from. */
export function replayCoreHistory(logs:TimestampedMarketLog[],core:string):ChainActivity[]{
  const unique=new Map<string,TimestampedMarketLog>();
  for(const item of logs){
    if(getAddress(item.log.address)!==getAddress(core))throw Error('Core history address mismatch');
    if(!item.log.removed)unique.set(`${item.log.blockHash}:${item.log.transactionHash}:${item.log.index}`,item);
  }
  const ordered=[...unique.values()].sort((a,b)=>a.log.blockNumber-b.log.blockNumber||a.log.index-b.log.index);
  // withdraw emits its fee component immediately before the aggregate payout. Hide only that exact
  // component, retaining separate fee claims made earlier in the same multicall transaction.
  const includedFees=new Set<Log>();
  ordered.forEach(({log},i)=>{
    const current=iface.parseLog(log),prior=ordered[i-1]?.log;
    if(current?.name!=='Withdrawn'||!prior||prior.transactionHash!==log.transactionHash)return;
    const fee=iface.parseLog(prior);
    if(fee?.name==='MarketFeesClaimed'&&String(fee.args.user).toLowerCase()===String(current.args.user).toLowerCase()&&fee.args.amount===current.args.marketFeePayout)includedFees.add(prior);
  });
  return ordered.flatMap(({log,timestamp})=>{
    const e=iface.parseLog(log);if(!e)return [];
    const event:ChainActivity={id:`${log.blockHash}:${log.transactionHash}:${log.index}`,kind:e.name,
      actor:undefined,at:timestamp,blockNumber:log.blockNumber,blockHash:log.blockHash,transactionHash:log.transactionHash,logIndex:log.index};
    if(e.name==='Staked'){event.kind='CORE_STAKE';event.actor=e.args.user;event.amount=e.args.amount;event.outcome=Number(e.args.side);}
    else if(e.name==='StakeExited'){event.kind='CORE_EXIT';event.actor=e.args.user;event.amount=e.args.refund;event.quantity=e.args.penalty;event.outcome=Number(e.args.side);}
    else if(e.name==='Withdrawn'){event.kind='CLAIM_CORE';event.actor=e.args.user;event.amount=e.args.principalPayout+e.args.marketFeePayout;}
    else if(e.name==='MarketFeesClaimed'){if(includedFees.has(log))return [];event.kind='CLAIM_FEES';event.actor=e.args.user;event.amount=e.args.amount;}
    else return [];
    return [event];
  });
}

/** Scan this Core only, from its verified market creation block, with an independent persistent cursor.
 * A canonical head anchor detects cached-prefix chain reorganizations. Any reorg/corruption triggers a full rebuild.
 * The caller supplies the factory-verified market origin, never a guessed deployment block.
 */
export async function readCoreHistory(provider:Provider,core:string,origin:HistoryCheckpoint):Promise<CoreHistory>{
  if(Number((await provider.getNetwork()).chainId)!==46630)throw Error('Wrong history chain');
  replayCheckpoint(origin,origin.factory,origin.market);
  core=getAddress(core);
  const head=await provider.getBlock('latest');if(!head?.hash)throw Error('Core history head unavailable');
  const creation=origin.creation.log;
  const start=await provider.getBlock(creation.blockNumber);
  if(!start||start.hash!==creation.blockHash)throw Error('Core origin reorganized');
  const old=await loadHistoryCheckpoint(origin.factory,origin.market,core);
  let prefix:TimestampedMarketLog[]=[];let from=creation.blockNumber;
  if(old){try{
    if(old.version!==1||getAddress(old.factory)!==getAddress(origin.factory)||getAddress(old.market)!==getAddress(origin.market)||getAddress(old.core)!==core||old.creationBlock!==from||old.creationHash!==creation.blockHash||!Number.isSafeInteger(old.latestBlock)||old.latestBlock<from||old.latestBlock>head.number||!Array.isArray(old.logs))throw Error('Invalid Core cache');
    for(const item of old.logs){if(!Number.isSafeInteger(item.timestamp)||!Number.isSafeInteger(item.log.blockNumber)||item.log.blockNumber<from||item.log.blockNumber>old.latestBlock||!/^0x[0-9a-fA-F]{64}$/.test(item.log.blockHash)||!/^0x[0-9a-fA-F]{64}$/.test(item.log.transactionHash))throw Error('Invalid Core log');}
    replayCoreHistory(old.logs,core);
    if((await provider.getBlock(old.latestBlock))?.hash===old.latestHash){prefix=old.logs;from=old.latestBlock+1;}
  }catch{/* Invalid cache is never accepted as a complete history. */}}
  const logs=await getLogsInChunks(provider,core,from,head.number);
  const headers=new Map<number,{hash:string;timestamp:number}>();
  const blocks=[...new Set(logs.map(log=>log.blockNumber))];
  for(let i=0;i<blocks.length;i+=8)await Promise.all(blocks.slice(i,i+8).map(async number=>{
    const block=await provider.getBlock(number);if(!block?.hash)throw Error('Core event timestamp unavailable');headers.set(number,{hash:block.hash,timestamp:block.timestamp});
  }));
  const all=[...prefix];
  for(const log of logs){const header=headers.get(log.blockNumber)!;if(header.hash!==log.blockHash)throw Error('Core event reorganized');all.push({timestamp:header.timestamp,log:{address:log.address,blockNumber:log.blockNumber,blockHash:log.blockHash,transactionHash:log.transactionHash,transactionIndex:log.transactionIndex,index:log.index,data:log.data,topics:[...log.topics],removed:log.removed} as unknown as Log});}
  if((await provider.getBlock(head.number))?.hash!==head.hash)throw Error('Core head reorganized');
  const events=replayCoreHistory(all,core);
  await saveHistoryCheckpoint({version:1,factory:origin.factory,market:origin.market,core,creationBlock:creation.blockNumber,creationHash:creation.blockHash,latestBlock:head.number,latestHash:head.hash,logs:all},from===creation.blockNumber?old?.latestHash:undefined);
  return {events,latestBlock:head.number,complete:true};
}
