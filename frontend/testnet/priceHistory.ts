import {Interface, getAddress, zeroPadValue, type Log, type Provider} from 'ethers';
import factoryAbi from './abi/TopicMarketStockFactory.json';
import marketAbi from './abi/TopicMarket.json';

const WAD=10n**18n;
const LOG_CHUNK=2000;
const factoryInterface=new Interface(factoryAbi);
const marketInterface=new Interface(marketAbi);

export interface ChainActivity {
  id:string;kind:string;at:number;blockNumber:number;blockHash:string;
  transactionHash:string;logIndex:number;actor?:string;quantity?:bigint;
  amount?:bigint;isYes?:boolean;phase?:number;outcome?:number;
}
export interface ChainGenesisPoint {
  /** WAD collateral per internal Genesis share; displayed gToken denomination is 10 million per share. */
  price:bigint;supply:bigint;at:number;kind:string;blockNumber:number;blockHash:string;
  transactionHash:string;logIndex:number;
}
export interface ChainPriceHistory {
  genesis:ChainGenesisPoint[];events:ChainActivity[];creationBlock:number;latestBlock:number;
  complete:true;formalVolume:bigint;
}
export interface TimestampedMarketLog {log:Log;timestamp:number}

/** Replay only the current TopicMarket ABI. No current-state backfill, invented timestamps or legacy feeds. */
export function replayMarketPriceHistory(
  creation:TimestampedMarketLog, marketLogs:TimestampedMarketLog[], k:bigint, latestBlock:number,
):ChainPriceHistory {
  if(k<=0n)throw new Error('无效Genesis曲线参数');
  const initial=creation.log;
  const genesis:ChainGenesisPoint[]=[{price:0n,supply:0n,at:creation.timestamp,kind:'CREATE',
    blockNumber:initial.blockNumber,blockHash:initial.blockHash,
    transactionHash:initial.transactionHash,logIndex:initial.index}];
  const events:ChainActivity[]=[];
  const unique=new Map<string,TimestampedMarketLog>();
  for(const item of marketLogs){
    if(item.log.removed)continue;
    unique.set(`${item.log.blockHash}:${item.log.transactionHash}:${item.log.index}`,item);
  }
  const ordered=[...unique.values()].sort((a,b)=>a.log.blockNumber-b.log.blockNumber
    ||a.log.transactionIndex-b.log.transactionIndex||a.log.index-b.log.index);
  let supply=0n;let graduated=false;let formalVolume=0n;
  for(const {log,timestamp} of ordered){
    if(log.blockNumber<initial.blockNumber)throw new Error('历史日志早于市场创建');
    const parsed=marketInterface.parseLog(log);
    if(!parsed)continue;
    const point={at:timestamp,blockNumber:log.blockNumber,blockHash:log.blockHash,
      transactionHash:log.transactionHash,logIndex:log.index};
    const event:ChainActivity={...point,id:`${log.blockHash}:${log.transactionHash}:${log.index}`,kind:parsed.name};
    const a=parsed.args;
    if(parsed.name==='GenesisTrade'){
      if(graduated)throw new Error('毕业后出现不支持的Genesis交易日志');
      supply+=a.buy?a.quantity:-a.quantity;
      if(supply<0n)throw new Error('Genesis历史不完整：供应量为负');
      event.kind=a.buy?'GENESIS_BUY':'GENESIS_SELL';
      event.actor=a.user;event.quantity=a.quantity;event.amount=a.base;
      genesis.push({...point,kind:event.kind,supply,price:2n*k*supply/WAD});
    }else if(parsed.name==='Graduated'){
      graduated=true;event.kind='GRADUATE';event.actor=a.trigger;event.amount=a.collateral;
    }else if(parsed.name==='FormalTrade'){
      if(!graduated)throw new Error('正式交易历史缺少毕业事件');
      event.kind=a.buy?'FORMAL_BUY':'FORMAL_SELL';event.actor=a.user;
      event.quantity=a.amount;event.amount=a.base;event.isYes=a.isYes;
      formalVolume+=a.base;
    }else if(parsed.name==='Finalized'){
      event.kind='FINALIZED';event.outcome=Number(a.result);
    }else if(parsed.name==='Closed'){
      event.kind='CLOSED';event.phase=Number(a.phase);
    }else if(parsed.name==='PairsRedeemed'){
      event.kind='REDEEM_PAIRS';event.actor=a.user;event.amount=a.cashReleased;event.quantity=a.tokensBurned;
    }else if(parsed.name==='Claimed'){
      event.kind='CLAIM';event.actor=a.user;event.amount=a.amount;
    }else if(parsed.name==='LPMaterialized'){
      event.kind='MATERIALIZE_LP';event.actor=a.account;event.quantity=a.amount;
    }else continue;
    events.push(event);
  }
  return {genesis,events,creationBlock:initial.blockNumber,latestBlock,complete:true,formalVolume};
}

async function getLogsInChunks(provider:Provider, address:string, from:number, to:number, topics?:string[]) {
  const logs:Log[]=[];
  for(let start=from;start<=to;start+=LOG_CHUNK){
    logs.push(...await provider.getLogs({address,fromBlock:start,toBlock:Math.min(to,start+LOG_CHUNK-1),topics}));
  }
  return logs;
}

/** Locate creation by the factory's timestamp AND indexed event, then read a bounded market-only log range. */
export async function readChainPriceHistory(
  provider:Provider, factory:string, market:string, createdAt:bigint, k:bigint,
):Promise<ChainPriceHistory> {
  const latest=await provider.getBlock('latest');
  if(!latest || !latest.hash)throw new Error('无法读取历史区块头');
  if(createdAt<=0n || createdAt>BigInt(latest.timestamp))throw new Error('市场创建时间无效');
  const headers=new Map<number,Promise<{number:number;hash:string;timestamp:number}>>();
  headers.set(latest.number,Promise.resolve({number:latest.number,hash:latest.hash,timestamp:latest.timestamp}));
  const header=(number:number)=>{
    let entry=headers.get(number);
    if(!entry){
      entry=provider.getBlock(number).then(block=>{
        if(!block || !block.hash)throw new Error('历史区块时间不可用');
        return {number:block.number,hash:block.hash,timestamp:block.timestamp};
      });
      headers.set(number,entry);
    }
    return entry;
  };
  // Binary search block headers, never scan logs from block zero. Multiple blocks may share one timestamp.
  const lowerBound=async(timestamp:bigint)=>{
    let low=1,high=latest.number+1;
    while(low<high){
      const middle=Math.floor((low+high)/2);
      if(BigInt((await header(middle)).timestamp)>=timestamp)high=middle;
      else low=middle+1;
    }
    return low;
  };
  const first=await lowerBound(createdAt);
  const last=(await lowerBound(createdAt+1n))-1;
  if(first>last)throw new Error('未找到市场创建区块');
  const creationLogs=await getLogsInChunks(provider,getAddress(factory),first,last,[
    factoryInterface.getEvent('MarketCreated')!.topicHash,zeroPadValue(getAddress(market),32),
  ]);
  const matching=creationLogs.filter(log=>{
    const event=factoryInterface.parseLog(log);
    return !log.removed && event?.name==='MarketCreated'
      && getAddress(event.args.market)===getAddress(market);
  });
  if(matching.length!==1)throw new Error('无法唯一验证市场创建事件');
  const creation=matching[0];
  const creationHeader=await header(creation.blockNumber);
  if(creationHeader.hash!==creation.blockHash || BigInt(creationHeader.timestamp)!==createdAt){
    throw new Error('市场创建区块已变化，请重试');
  }
  const logs=await getLogsInChunks(provider,getAddress(market),creation.blockNumber,latest.number);
  const blocks=[...new Set(logs.map(log=>log.blockNumber))];
  for(let start=0;start<blocks.length;start+=8){await Promise.all(blocks.slice(start,start+8).map(header));}
  const timestamped:TimestampedMarketLog[]=[];
  for(const log of logs){
    const block=await header(log.blockNumber);
    if(block.hash!==log.blockHash)throw new Error('历史区块已重组，请重试');
    timestamped.push({log,timestamp:block.timestamp});
  }
  const confirmedHead=await provider.getBlock(latest.number);
  if(!confirmedHead || confirmedHead.hash!==latest.hash)throw new Error('读取期间链头已重组，请重试');
  return replayMarketPriceHistory({log:creation,timestamp:creationHeader.timestamp},timestamped,k,latest.number);
}
