import {CURRENT_TESTNET_FACTORY,CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK} from '../../shared/testnetDeployment.js';
import {Contract,Interface,ZeroAddress,getAddress,zeroPadValue,type ContractRunner,type Provider} from 'ethers';
import factoryAbi from '../../testnet/abi/TopicMarketStockFactory.json';
import marketAbi from '../../testnet/abi/TopicMarket.json';
import {findTimestampRange} from '../../testnet/historyBlockSearch.js';
import {getLogsInChunks,readChainPriceHistory,replayCheckpoint,type TimestampedMarketLog} from '../../testnet/priceHistory.js';
import type {HistoryStore,IndexedHistoryRow,HistoryKey,HistoryDescriptor,HistoryPatch} from './types.js';
const fi=new Interface(factoryAbi);
interface Options {provider:Provider;factory:string;market:string;store:HistoryStore;maxBlocks?:number;budgetMs?:number;now?:()=>number}
export async function syncIndexedMarket({provider,factory,market,store,maxBlocks=250000,budgetMs=20000,now=Date.now}:Options):Promise<{status:'updated'|'busy'|'not-market'|'failed';row?:IndexedHistoryRow}>{
 let key:HistoryKey,globalKey:HistoryKey;
 try{factory=getAddress(factory);market=getAddress(market);if(factory===ZeroAddress||market===ZeroAddress)throw Error();key={chainId:46630,factory,market};globalKey={...key,market:ZeroAddress};}catch{return {status:'not-market'};}
 maxBlocks=Math.max(1,Math.min(250000,Math.floor(maxBlocks)));budgetMs=Math.max(1,Math.min(20000,budgetMs));
 if(!Number.isFinite(maxBlocks)||!Number.isFinite(budgetMs))return {status:'failed'};
 const start=now();let globalToken:string|undefined,token:string|undefined,errorCode:string|undefined;
 const guard=()=>{if(now()-start>=budgetMs)throw Error('BUDGET_EXCEEDED');};
 const rpc=async<T>(fn:()=>Promise<T>)=>{guard();const value=await fn();guard();return value;};
 try{
  const lease=await store.claim(globalKey,0,45000);if(!lease)return {status:'busy'};globalToken=lease.token;
  if((await rpc(()=>provider.getNetwork())).chainId!==46630n)throw Error('WRONG_CHAIN');
  const runner={call:(tx:Parameters<Provider['call']>[0])=>rpc(()=>provider.call(tx))} as ContractRunner;
  const f=new Contract(factory,factoryAbi,runner),m=new Contract(market,marketAbi,runner);
  if(!await f.isMarket(market))return {status:'not-market'};
  const record=await f.marketRecord(market),stock=getAddress(await f.marketCollateral(market)),k=BigInt(await m.k());
  const descriptor:HistoryDescriptor={createdAt:String(record.createdAt),k:String(k),stock,genesisCutoff:String(BigInt(record.coreCutoff)-7200n),formalCutoff:String(record.formalCutoff)};
  if(BigInt(descriptor.createdAt)<=0n||k<=0n||stock===ZeroAddress)throw Error('INVALID_DESCRIPTOR');
  const target=await store.claim(key,15000,45000);if(!target)return {status:'busy',row:(await store.get(key))??undefined};token=target.token;
  const save=async(patch:HistoryPatch)=>{guard();if(!await store.save(key,token!,patch))throw Error('LEASE_LOST');};
  await save({descriptor});
  const block=async(n:number|'latest')=>{const value=await rpc(()=>provider.getBlock(n));if(!value?.hash||!Number.isSafeInteger(value.number)||value.number<1||!Number.isSafeInteger(value.timestamp)||value.timestamp<0||(typeof n==='number'&&value.number!==n))throw Error('INVALID_HEADER');return value;};
  const head=await block('latest');let cp=target.row.checkpoint,origin=target.row.origin;
  if(cp){
   let canonical=false;
   let replayValid=true;try{replayCheckpoint(cp,factory,market);}catch{replayValid=false;}
   if(replayValid&&cp.k===descriptor.k&&cp.createdAt===descriptor.createdAt&&cp.latestBlock<=head.number){const anchor=await block(cp.latestBlock),first=await block(cp.creation.log.blockNumber);canonical=anchor.hash===cp.latestHash&&first.hash===cp.creation.log.blockHash&&String(first.timestamp)===descriptor.createdAt;if(canonical)origin=cp.creation;}
   if(!canonical){cp=null;await save({checkpoint:null,throughTimestamp:null});}
  }
  const wrapped={getBlock:(n:number|'latest')=>block(n),getLogs:(filter:Parameters<Provider['getLogs']>[0])=>rpc(()=>provider.getLogs(filter))} as unknown as Provider;
  const verifyOrigin=async(hint:TimestampedMarketLog|null)=>{
   if(!hint||hint.log.blockNumber>head.number||getAddress(hint.log.address)!==factory)return null;
   const h=await block(hint.log.blockNumber);if(h.hash!==hint.log.blockHash||String(h.timestamp)!==descriptor.createdAt)return null;
   const logs=await getLogsInChunks(wrapped,factory,h.number,h.number,[fi.getEvent('MarketCreated')!.topicHash,zeroPadValue(market,32)],1);
   const matches=logs.filter(l=>{const e=fi.parseLog(l);return !l.removed&&l.blockHash===h.hash&&e?.name==='MarketCreated'&&getAddress(e.args.market)===market;});
   return matches.length===1?{log:matches[0],timestamp:h.timestamp}:null;
  };
  if(!cp){
   origin=await verifyOrigin(origin);
   if(!origin){
    await save({origin:null});
    const topics=[fi.getEvent('MarketCreated')!.topicHash,zeroPadValue(market,32)];
    let logs;
    if(factory===getAddress(CURRENT_TESTNET_FACTORY)&&head.number>=CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK){
      // 当前工厂的已核实部署区块是扫描下界；按indexed market找创建事件，不逐市场重做时间搜索。
      try{logs=await wrapped.getLogs({address:factory,fromBlock:CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK,toBlock:head.number,topics});}
      catch{logs=await getLogsInChunks(wrapped,factory,CURRENT_TESTNET_FACTORY_DEPLOYMENT_BLOCK,head.number,topics,4,50000);}
    }else{
      const {first,last}=await findTimestampRange(head,BigInt(descriptor.createdAt),block);if(first>last)throw Error('ORIGIN_MISSING');
      logs=await getLogsInChunks(wrapped,factory,first,last,topics,1);
    }
    const matches=logs.filter(l=>{const e=fi.parseLog(l);return !l.removed&&e?.name==='MarketCreated'&&getAddress(e.args.market)===market;});
    if(matches.length!==1)throw Error('ORIGIN_NOT_UNIQUE');
    const h=await block(matches[0].blockNumber);if(h.hash!==matches[0].blockHash||String(h.timestamp)!==descriptor.createdAt)throw Error('ORIGIN_REORG');
    origin={log:matches[0],timestamp:h.timestamp};
   }
   await save({origin});
  }
  if(!origin)throw Error('ORIGIN_MISSING');
  const end=await block(Math.min(head.number,(cp?.latestBlock??(origin.log.blockNumber-1))+maxBlocks));
  const scanStart=cp?cp.latestBlock+1:origin.log.blockNumber;
  const bounded={getBlock:(n:number|'latest')=>n==='latest'?Promise.resolve(end):block(n),getLogs:(filter:Parameters<Provider['getLogs']>[0])=>{
   if(typeof filter.address==='string'&&getAddress(filter.address)===market&&(!('fromBlock' in filter)||!('toBlock' in filter)||Number(filter.fromBlock)<scanStart||Number(filter.toBlock)>end.number))throw Error('SCAN_BOUND_EXCEEDED');
   return wrapped.getLogs(filter);
  }} as unknown as Provider;
  const history=await readChainPriceHistory(bounded,factory,market,BigInt(descriptor.createdAt),k,cp,{origin,concurrency:4,logChunkSize:50000});
  if(!history.checkpoint)throw Error('CHECKPOINT_MISSING');
  replayCheckpoint(history.checkpoint,factory,market);
  // 较老状态可能已被公共节点裁剪。回填中的前缀以真实日志、块头及重放验证，
  // 显式标为尚未追到target；只有追到本次链头才必须再核对同块供应量。
  try{
    const phase=Number(await m.phase({blockTag:end.number})),expected=BigInt(await (phase===4?m.failedSupply({blockTag:end.number}):m.S({blockTag:end.number})));
    if(history.genesis.at(-1)?.supply!==expected)throw Error('SUPPLY_MISMATCH');
  }catch(error){
    if(end.number===head.number||(error as {code?:string})?.code!=='CALL_EXCEPTION')throw error;
  }
  if((await block(end.number)).hash!==history.checkpoint.latestHash)throw Error('SNAPSHOT_REORG');
  await save({checkpoint:history.checkpoint,origin:history.checkpoint.creation,targetBlock:head.number,throughTimestamp:end.timestamp});
  return {status:'updated',row:(await store.get(key))??undefined};
 }catch(error){errorCode=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'INDEX_FAILED';return {status:'failed',row:(await store.get(key).catch(()=>null))??undefined};}
 finally{
  try{if(token)await store.release(key,token,15000,errorCode);}finally{if(globalToken)await store.release(globalKey,globalToken,1000,errorCode);}
 }
}
