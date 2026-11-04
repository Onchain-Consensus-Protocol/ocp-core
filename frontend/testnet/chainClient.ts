import {createHistoryReadQueue} from './historyReadQueue';
import {loadHistoryOrigin,saveHistoryOrigin} from './historyOriginCache';
import {protocolFeeAttribution} from './coreProtocolFees';
import {loadHistoryCheckpoint,saveHistoryCheckpoint} from './historyCache';
import { Contract, Interface, concat, getBytes, hexlify, toUtf8Bytes, toUtf8String, toBeHex, zeroPadValue, ZeroAddress, ZeroHash, getAddress, id, type Provider, type Signer, type ContractTransactionResponse } from 'ethers';
import factoryAbi from './abi/TopicMarketStockFactory.json';
import marketAbi from './abi/TopicMarket.json';
import vaultAbi from './abi/OCPCore.json';
import adapterAbi from './abi/VaultCoreAdapter.json';
import routerAbi from './abi/TopicMarketAssetRouter.json';
import oracleAbi from './abi/TopicMarketStockPriceSnapshot.json';
import {quoteExchange as quoteV3Exchange} from './exchangeQuote';
import {getLogsInChunks, readChainPriceHistory, replayCheckpoint, type ChainPriceHistory} from './priceHistory';

export const TESTNET_CHAIN_ID = 46630n;
const tokenAbi = ['function symbol() view returns(string)', 'function decimals() view returns(uint8)', 'function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'];
export interface StockState { address:string; symbol:string; decimals:number; enabled:boolean; oracle:string; router:string; k:bigint; snapshot?:bigint; snapshotError?:string; balance?:bigint; fixedRTarget?:bigint; }
export interface MarketSummary { address:string; stock:string; creator:string; adapter:string; vault:string; topic:string; yesRule:string; noRule:string; invalidRule:string; createdAt:bigint; genesisCutoff:bigint; formalCutoff:bigint; coreCutoff:bigint; snapshot:bigint;earlyRequest?:Pick<CoreLifecycle,'requestId'|'requestedOutcome'|'processAfter'>;phase?:number;outcome?:number;priceYes?:bigint;R?:bigint;rTarget?:bigint; }
export interface AccountPosition { balance:bigint; genesisShares:bigint; yes:bigint; no:bigint; lp:bigint; coreYes:bigint; coreNo:bigint; coreInvalid:bigint; marketAllowance:bigint; vaultAllowance:bigint; routerAllowance:bigint }
export interface CoreLifecycle {proposer?:string;reasonHash?:string;reasonText?:string;bond:bigint; requestId:bigint; requestedOutcome:number; processAfter:bigint; effectiveCutoff:bigint; due:boolean; refund?:bigint; penalty?:bigint; bondRefund?:bigint}
/** Prices/quantities are WAD; money and payouts use collateral native units. Unknown metrics stay absent. */
export interface MarketPresentation {
  priceYes?:bigint;priceNo?:bigint;basisWad:bigint;bWad:bigint;
  inventoryYes:bigint;inventoryNo:bigint;totalYes:bigint;totalNo:bigint;
  formalVolume?:bigint;totalFees:bigint;feeYes?:bigint;feeNo?:bigint;feeInvalid?:bigint;
  corePayout?:bigint;marketPayout?:bigint;genesisPrice:bigint;
}
export interface MarketState extends MarketSummary { feeClaims?:{creator:string;protocol:string;creatorAmount:bigint;protocolAmount:bigint;coreAmount:bigint;coreRecipient:string;coreAccrued?:bigint;coreProtocolTotal?:bigint;coreProtocolFinal?:boolean}; poolStockBalance?:bigint;lpSupply?:bigint; presentation?:MarketPresentation;early?:CoreLifecycle; phase:number; outcome:number; failedSupply?:bigint;failedRInitial?:bigint;failedRRemaining?:bigint;collateralCash?:bigint; R:bigint; S:bigint; rTarget:bigint; k:bigint; cash:bigint; lpFees:bigint; lpBudgetRemaining:bigint; vaultResolved:boolean; vaultOutcome:number; vaultSettlementReady:boolean; totalStakeYes:bigint; totalStakeNo:bigint; totalStakeInvalid:bigint; position?:AccountPosition }
export interface DirectoryState { factory:string; owner:string; fixedTestTargets?:boolean; stocks:StockState[]; markets:MarketSummary[]; blockNumber:number; timestamp:bigint }
export interface PaymentRoute {router:string;exchange:string;stock:string;stable:string;stableSymbol:string;stableDecimals:number;stableBalance?:bigint;stableAllowance?:bigint}
export interface CreateMarketInput { stock:string; topic:string; yesRule:string; noRule:string; invalidRule:string; coreEnd:bigint }
export enum RouterAction { GenesisBuy, FormalBuy, CoreStake, GenesisSell, FormalSell, ClaimMarket, ClaimOutcome, ClaimLP, ClaimFailed, ClaimCore, RedeemPairs, ProposeEarly, ClaimEarlyBond }
export interface RouterRequest { market:string; action:RouterAction; paymentAsset:string; inputAmount:bigint; quantity:bigint; minCollateral:bigint; businessLimit:bigint; minOutput:bigint; deadline:bigint; side:0|1|2; graduationIntent:0|1|2; reasonHash:string }

const REASON_MAGIC=id('OCP_EARLY_REASON_V1');
export function normalizeEarlyReason(value:string):string {
  const text=value.trim();
  if(!text || text.length>1000 || toUtf8Bytes(text).length>4000)throw new Error('提前结算原因须为1至1000字符');
  return text;
}
/** Versioned envelope outside ABI calldata: magic | UTF8 | uint32 byteLength | magic. */
export function appendEarlyReason(data:string,reason:string):string {
  const bytes=toUtf8Bytes(normalizeEarlyReason(reason));
  return concat([data,REASON_MAGIC,bytes,toBeHex(bytes.length,4),REASON_MAGIC]);
}
export function decodeEarlyReason(data:string,reasonHash:string):string|undefined {
  try {
    const bytes=getBytes(data),end=bytes.length;
    if(end<68 || hexlify(bytes.slice(end-32)).toLowerCase()!==REASON_MAGIC.toLowerCase())return;
    const length=Number(BigInt(hexlify(bytes.slice(end-36,end-32))));
    if(length<1||length>4000||end<68+length)return;
    const start=end-36-length;
    if(hexlify(bytes.slice(start-32,start)).toLowerCase()!==REASON_MAGIC.toLowerCase())return;
    const text=toUtf8String(bytes.slice(start,end-36));
    if(text!==normalizeEarlyReason(text)||id(text).toLowerCase()!==reasonHash.toLowerCase())return;
    return text;
  }catch{return;}
}
export interface PublishedEarlyReason {
  factory:string;market:string;vault:string;router:string;createdAt:bigint;
  requestId:bigint;proposedAt:bigint;proposer:string;requestedOutcome:number;processAfter:bigint;bond:bigint;reasonHash:string;
}
/** Public chain provenance only; failure leaves the immutable hash available, never a guessed preimage. */
export async function readPublishedEarlyReason(provider:Provider,r:PublishedEarlyReason):Promise<string|undefined> {
  const core=new Interface(vaultAbi),router=new Interface(routerAbi),factory=new Interface(factoryAbi);
  const head=await provider.getBlock('latest');if(!head)return;
  const lowerBound=async(time:bigint)=>{let low=1,high=head.number+1;while(low<high){const mid=Math.floor((low+high)/2),b=await provider.getBlock(mid);if(!b)throw new Error('Missing block');if(BigInt(b.timestamp)>=time)high=mid;else low=mid+1;}return low;};
  const first=await lowerBound(r.createdAt),last=await lowerBound(r.createdAt+1n)-1;
  const origins=await getLogsInChunks(provider,r.factory,first,last,[factory.getEvent('MarketCreated')!.topicHash,zeroPadValue(r.market,32)]);
  const origin=origins.find(log=>!log.removed&&getAddress(log.address)===getAddress(r.factory)&&factory.parseLog(log)?.args.market.toLowerCase()===r.market.toLowerCase());if(!origin)return;
  const originHeader=await provider.getBlock(origin.blockNumber);if(!originHeader||originHeader.hash!==origin.blockHash||BigInt(originHeader.timestamp)!==r.createdAt)return;
  const eventFirst=Math.max(origin.blockNumber,await lowerBound(r.proposedAt)),eventLast=Math.min(head.number,await lowerBound(r.proposedAt+1n)-1);
  if(eventFirst>eventLast)return;
  const events=await getLogsInChunks(provider,r.vault,eventFirst,eventLast,[core.getEvent('EarlyTerminationProposed')!.topicHash,toBeHex(r.requestId,32)]);
  for(const log of events){
    if(log.removed||getAddress(log.address)!==getAddress(r.vault))continue;
    const event=core.parseLog(log);if(!event)continue;const a=event.args;
    if(a.requestId!==r.requestId||getAddress(a.proposer)!==getAddress(r.proposer)||Number(a.requestedOutcome)!==r.requestedOutcome||a.processAfter!==r.processAfter||a.bond!==r.bond||a.reasonHash.toLowerCase()!==r.reasonHash.toLowerCase())continue;
    const [tx,block]=await Promise.all([provider.getTransaction(log.transactionHash),provider.getBlock(log.blockNumber)]);
    if(!tx||!block||block.hash!==log.blockHash||tx.blockHash!==log.blockHash||tx.hash!==log.transactionHash||!tx.to||getAddress(tx.from)!==getAddress(r.proposer))continue;
    if(getAddress(tx.to)===getAddress(r.vault)){
      const call=core.parseTransaction({data:tx.data});if(call?.name!=='proposeEarlyTermination'||Number(call.args[0])!==r.requestedOutcome||call.args[1].toLowerCase()!==r.reasonHash.toLowerCase())continue;
    }else if(getAddress(tx.to)===getAddress(r.router)){
      const call=router.parseTransaction({data:tx.data}),q=call?.args[0];
      if(call?.name!=='execute'||getAddress(q.market)!==getAddress(r.market)||Number(q.action)!==RouterAction.ProposeEarly||Number(q.side)+1!==r.requestedOutcome||q.reasonHash.toLowerCase()!==r.reasonHash.toLowerCase())continue;
      if(getAddress(await new Contract(r.router,routerAbi,provider).factory())!==getAddress(r.factory))continue;
    }else continue;
    return decodeEarlyReason(tx.data,r.reasonHash);
  }
}

export function nonzeroAddress(value:string):string {
  const address=getAddress(value);
  if(address===ZeroAddress) throw new Error('未配置合约地址');
  return address;
}
export async function assertTestnet(provider:Provider):Promise<void> {
  if((await provider.getNetwork()).chainId!==TESTNET_CHAIN_ID) throw new Error('请切换到 Robinhood Chain Testnet（46630）');
}

/** Raw amounts use collateral decimals; outcome/LP quantities use 18 decimals. No write runs on construction/read. */
export function createChainClient(provider:Provider, factoryAddress:string) {
  const address=nonzeroAddress(factoryAddress);
  const factory=new Contract(address,factoryAbi,provider);
  const reasonReads=new Map<string,Promise<string|undefined>>();
  const historyQueue=createHistoryReadQueue();
  const foregroundHistory=new Map<string,number>();
  const historyMemory=new Map<string,ChainPriceHistory>();
  const historyMetadata=new Map<string,Promise<{base:MarketSummary;k:bigint}>>();
  async function ready() {
    await assertTestnet(provider);
    if(await provider.getCode(address)==='0x') throw new Error('测试网工厂地址没有合约代码');
    const version=await new Contract(address,['function interfaceVersion() view returns(uint256)'],provider).interfaceVersion().catch(()=>0n);
    if(version!==4n)throw new Error('测试网合约版本不支持：需要 interfaceVersion 4，请更新部署配置');
  }
  async function summary(marketAddress:string,includePresentation=false):Promise<MarketSummary> {
    const market=nonzeroAddress(marketAddress);
    if(!await factory.isMarket(market)) throw new Error('市场未登记在当前工厂');
    const [r,stock]=await Promise.all([factory.marketRecord(market),factory.marketCollateral(market)]);
    const result:MarketSummary={address:market,stock,creator:r.creator,adapter:r.adapter,vault:r.vault,topic:r.topic,yesRule:r.yesRule,noRule:r.noRule,invalidRule:r.invalidRule,createdAt:r.createdAt,genesisCutoff:r.coreCutoff-7200n,formalCutoff:r.formalCutoff,coreCutoff:r.coreCutoff,snapshot:r.snapshot};
    if(includePresentation){
      const m=new Contract(market,marketAbi,provider);
      const metrics=await Promise.allSettled([m.phase(),m.R(),m.rTarget()]);
      const names=['phase','R','rTarget'] as const;
      metrics.forEach((value,i)=>{if(value.status==='fulfilled'){
        if(names[i]==='phase')result.phase=Number(value.value);
        else result[names[i] as 'R'|'rTarget']=value.value;
      }});
      if(result.phase===3){try{result.outcome=Number(await m.outcome());}catch{/* Final result remains unavailable instead of reusing trading odds. */}}
      if(result.phase===1||result.phase===2){
        const v=new Contract(result.vault,vaultAbi,provider);
        await Promise.all([
          m.priceYes().then((price:bigint)=>{result.priceYes=price;}).catch(()=>{}),
          v.pendingEarlyTermination().then((request:{id:bigint;requestedOutcome:bigint;processAfter:bigint})=>{
            if(request.id>0n)result.earlyRequest={requestId:request.id,requestedOutcome:Number(request.requestedOutcome),processAfter:request.processAfter};
          }).catch(()=>{}),
        ]);
      }
    }
    return result;
  }
  async function readDirectory(account?:string,onMetadata?:(value:DirectoryState)=>void):Promise<DirectoryState> {
    await ready();
    if(account) account=nonzeroAddress(account);
    const [owner,ns,nm,block]=await Promise.all([factory.owner(),factory.stockCount(),factory.marketCount(),provider.getBlock('latest')]);
    if(!block) throw new Error('无法读取最新区块');
    const fixedTestTargets=await new Contract(address,['function fixedTestnetGraduation() view returns(bool)'],provider).fixedTestnetGraduation().catch(()=>false);
    const stocks=await Promise.all(Array.from({length:Number(ns)},async(_,i):Promise<StockState>=>{
      const stock=await factory.stockTokens(i);const token=new Contract(stock,tokenAbi,provider);
      const config=await factory.stocks(stock);
      const [symbol,decimals,balance]=await Promise.all([token.symbol().catch(()=>stock.slice(0,10)),token.decimals(),account?token.balanceOf(account):undefined]);
      const result:StockState={address:stock,symbol,decimals:Number(decimals),enabled:config.enabled,oracle:config.priceOracle,router:config.trustedForwarder,k:config.k,balance};
      try {
        const oracle=new Contract(result.oracle,oracleAbi,provider);
        if(fixedTestTargets){
          if(getAddress(stock)!==getAddress('0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E') || result.decimals!==18) throw new Error('TESTNET_TSLA_ONLY');
          await oracle.collateralForUsd(500n*10n**18n); // Bond still needs a valid USD conversion.
          result.fixedRTarget=4200000000000000n;
        } else result.snapshot=await oracle.ethPrice6();
      }
      catch {result.snapshotError='价格快照不可用：请检查喂价时效、状态和配置';}
      return result;
    }));
    onMetadata?.({factory:address,owner,fixedTestTargets,stocks,markets:[],blockNumber:block.number,timestamp:BigInt(block.timestamp)});
    const markets=await Promise.all(Array.from({length:Number(nm)},async(_,i)=>summary(await factory.markets(i),true)));
    return {factory:address,owner,fixedTestTargets,stocks,markets,blockNumber:block.number,timestamp:BigInt(block.timestamp)};
  }
  async function readMarket(marketAddress:string,account?:string,details=true):Promise<MarketState> {
    await ready();const base=await summary(marketAddress);
    const m=new Contract(base.address,marketAbi,provider);const v=new Contract(base.vault,vaultAbi,provider);
    const keys=['phase','outcome','R','S','rTarget','k','cash','lpFees','lpBudgetRemaining'] as const;
    const values=await Promise.all(keys.map(key=>m[key]()));
    const state={...base,...Object.fromEntries(keys.map((key,i)=>[key,values[i]]))} as MarketState;
    state.phase=Number(state.phase);state.outcome=Number(state.outcome);
    if(state.phase===3)state.collateralCash=await m.collateralCash();
    if(state.phase===4){[state.failedSupply,state.failedRInitial,state.failedRRemaining]=await Promise.all([m.failedSupply(),m.failedRInitial(),m.failedRRemaining()]);}
    // 独立读请求同时发出；可选详情不阻塞简洁版的报价、持仓和生命周期。
    await Promise.all([
      (async()=>{
    try{state.lpSupply=await m.liquiditySupply();}catch{/* Keep total LP supply unknown if unavailable. */}
      })(),
      (async()=>{
    if(details){
    try{const [creator,protocol,creatorAmount,protocolAmount,coreAmount,coreRecipient]=await Promise.all([m.creator(),m.protocol(),m.creatorFees(),m.protocolFees(),v.officialMarketFeesClaimable(),v.emptySettlementRecipient()]);state.feeClaims={creator,protocol,creatorAmount,protocolAmount,coreAmount,coreRecipient};}catch{/* 无法读取时不假定手续费为零。 */}
    if(state.feeClaims)try{
      const blockTag=await provider.getBlockNumber(),at={blockTag};
      const [total,yesDistributed,noDistributed,invalidDistributed,yesStake,noStake,settled,result,pending]=await Promise.all([
        v.totalMarketFeesAccrued(at),v.distributedYesMarketFees(at),v.distributedNoMarketFees(at),v.distributedInvalidMarketFees(at),
        v.totalStakeYes(at),v.totalStakeNo(at),v.settlementReady(at),v.outcome(at),v.officialMarketFeesClaimable(at),
      ]);
      state.feeClaims.coreAccrued=total;state.feeClaims.coreProtocolTotal=protocolFeeAttribution({total,yesDistributed,noDistributed,invalidDistributed,yesStake,noStake,settled,outcome:Number(result)});
      state.feeClaims.coreProtocolFinal=settled;state.feeClaims.coreAmount=pending;
    }catch{/* Unknown attribution stays absent, never confused with zero or paid fees. */}
    }
      })(),
      (async()=>{
    if(details){
    try{state.poolStockBalance=await new Contract(base.stock,tokenAbi,provider).balanceOf(base.address);}catch{/* 未读到真实余额时保持未知，不用cash或0代替。 */}
    }
      })(),
      (async()=>{
    [state.vaultResolved,state.vaultOutcome,state.vaultSettlementReady,state.totalStakeYes,state.totalStakeNo,state.totalStakeInvalid]=await Promise.all([v.resolved(),v.outcome(),v.settlementReady(),v.totalStakeYes(),v.totalStakeNo(),v.totalStakeInvalid()]);
    state.vaultOutcome=Number(state.vaultOutcome);
      })(),
      (async()=>{
    if(account){
      account=nonzeroAddress(account);const token=new Contract(base.stock,tokenAbi,provider);
      const [lp,router]=await Promise.all([m.lpToken(),m.trustedForwarder()]);
      const [balance,genesisShares,yes,no,lpBalance,stake,marketAllowance,vaultAllowance,routerAllowance]=await Promise.all([token.balanceOf(account),m.shares(account),m.yes(account),m.no(account),new Contract(lp,tokenAbi,provider).balanceOf(account),v.stakeOf(account),token.allowance(account,base.address),token.allowance(account,base.vault),token.allowance(account,router)]);
      state.position={balance,genesisShares,yes,no,lp:lpBalance,coreYes:stake[0],coreNo:stake[1],coreInvalid:stake[2],marketAllowance,vaultAllowance,routerAllowance};
    }
      })(),
      (async()=>{
    try {
      const [bond, request, due, effectiveCutoff] = await Promise.all([v.earlyTerminationBondRequired(),v.pendingEarlyTermination(),v.earlyTerminationProcessingDue(),v.effectiveResolutionTime()]);
      state.early={bond,proposer:request.proposer,reasonHash:request.reasonHash,requestId:request.id,requestedOutcome:Number(request.requestedOutcome),processAfter:request.processAfter,effectiveCutoff,due};
      if(request.id>0n){let timer:ReturnType<typeof setTimeout>|undefined;try{
        const key=`${base.vault}:${request.id}:${request.reasonHash}:${request.proposer}`;
        let read=reasonReads.get(key);
        if(!read){read=(async()=>readPublishedEarlyReason(provider,{...base,factory:address,market:base.address,router:await m.trustedForwarder(),bond,requestId:request.id,proposedAt:request.proposedAt,proposer:request.proposer,requestedOutcome:Number(request.requestedOutcome),processAfter:request.processAfter,reasonHash:request.reasonHash}))().catch(()=>undefined);reasonReads.set(key,read);void read.then(text=>{if(text===undefined)reasonReads.delete(key);});}
        state.early.reasonText=await Promise.race([read,new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),5000);})]);
      }catch{/* RPC/pruned history: show only the verified pending hash. */}finally{clearTimeout(timer);}}
      if(account){const [exit,bondRefund]=await Promise.all([v.previewExitStake(account),v.claimableEarlyBond(account)]);state.early.refund=exit[0];state.early.penalty=exit[1];state.early.bondRefund=bondRefund;}
    } catch { /* Leave unavailable RPC metrics absent; never synthesize lifecycle values. */ }
      })(),
      (async()=>{
    try {
      const [basisWad,bWad,inventoryYes,inventoryNo,totalYes,totalNo,totalFees]=await Promise.all([
        m.poolBasisWad(),m.bWad(),m.inventoryY(),m.inventoryN(),m.yesSupply(),m.noSupply(),v.totalMarketFeesAccrued(),
      ]);
      state.presentation={basisWad,bWad,inventoryYes,inventoryNo,totalYes,totalNo,totalFees,
        genesisPrice:2n*state.k*(state.failedSupply??state.S)/(10n**18n)};
      if(state.phase===1 || state.phase===2){
        try {const priceYes=await m.priceYes();state.presentation.priceYes=priceYes;
          state.presentation.priceNo=10n**18n-priceYes;}catch{/* No synthetic 50/50 fallback. */}
      }
      if(account){
        try {const fees=await v.conditionalMarketFees(account);
          [state.presentation.feeYes,state.presentation.feeNo,state.presentation.feeInvalid]=[fees[0],fees[1],fees[2]];
        }catch{/* Optional account view unavailable. */}
        if(state.phase===3 || state.phase===4){
          try {const payout=await m.previewAccount(account,state.phase===4?1:state.outcome);
            state.presentation.marketPayout=payout[0]+payout[1]+payout[2];
          }catch{/* Do not fabricate a zero claim when a view fails. */}
        }
      }
    }catch{/* Presentation failure never blocks custody, positions or withdrawal controls. */}
      })(),
    ]);
    return state;
  }
  async function readPaymentRoute(marketAddress:string,account?:string):Promise<PaymentRoute>{
    await ready();const base=await summary(marketAddress),m=new Contract(base.address,marketAbi,provider);
    const router=nonzeroAddress(await m.trustedForwarder()),r=new Contract(router,routerAbi,provider);
    if(getAddress(await r.factory())!==address)throw new Error('路由未绑定当前工厂');
    const exchange=nonzeroAddress(await r.exchange()),e=new Contract(exchange,['function stock() view returns(address)','function stable() view returns(address)'],provider);
    if(getAddress(await e.stock())!==getAddress(base.stock))throw new Error('兑换器股票不匹配');
    const stable=nonzeroAddress(await e.stable());if(!await r.stablecoin(stable))throw new Error('稳定币未登记');
    const token=new Contract(stable,tokenAbi,provider),[symbol,decimals]=await Promise.all([token.symbol(),token.decimals()]);
    const route:PaymentRoute={router,exchange,stock:base.stock,stable,stableSymbol:symbol,stableDecimals:Number(decimals)};
    if(account){const owner=nonzeroAddress(account);[route.stableBalance,route.stableAllowance]=await Promise.all([token.balanceOf(owner),token.allowance(owner,router)]);}
    return route;
  }
  async function quotePaymentSwap(marketAddress:string,input:string,output:string,amount:bigint,exact:'input'|'output'){
    const route=await readPaymentRoute(marketAddress);
    return quoteV3Exchange(provider,route.exchange,input,output,amount,exact);
  }
  async function quoteEarlyProposalStable(marketAddress:string,side:0|1,reason:string,deadline:bigint){
    const text=normalizeEarlyReason(reason);
    const [state,route]=await Promise.all([readMarket(marketAddress),readPaymentRoute(marketAddress)]);
    if(!state.early || state.early.requestId>0n || state.vaultResolved || ![1,2].includes(state.phase))throw new Error('提前结算申请当前不可用');
    const bond=state.early.bond;
    const swap=await quoteV3Exchange(provider,route.exchange,route.stable,route.stock,bond,'output');
    return {quotedAt:Date.now(),cash:swap.amountIn,request:{market:state.address,action:RouterAction.ProposeEarly,paymentAsset:route.stable,
      inputAmount:(swap.amountIn*101n+99n)/100n,quantity:0n,minCollateral:bond,businessLimit:bond,minOutput:0n,deadline,side,graduationIntent:0,reasonHash:id(text)} as RouterRequest};
  }
  async function loadPriceHistory(marketAddress:string,concurrency:number):Promise<ChainPriceHistory> {
    const key=nonzeroAddress(marketAddress).toLowerCase();
    await assertTestnet(provider);
    // 历史元数据不可变，只在本reader内复用；交易报价与签名仍走原实时校验。
    let metadata=historyMetadata.get(key);
    if(!metadata){metadata=(async()=>{await ready();const base=await summary(marketAddress);return {base,k:await new Contract(base.address,marketAbi,provider).k() as bigint};})();historyMetadata.set(key,metadata);void metadata.catch(()=>{if(historyMetadata.get(key)===metadata)historyMetadata.delete(key);});}
    const [info,persisted,origin]=await Promise.all([metadata,loadHistoryCheckpoint(address,marketAddress),loadHistoryOrigin(address,marketAddress)]);
    const {base,k}=info,market=new Contract(base.address,marketAbi,provider);
    const cached=historyMemory.get(key)?.checkpoint??persisted;
    const options={origin,concurrency:()=>foregroundHistory.has(key)?4:concurrency,onOrigin:(value:import('./priceHistory').TimestampedMarketLog)=>{void saveHistoryOrigin(address,base.address,value);}};
    let history=await readChainPriceHistory(provider,address,base.address,base.createdAt,k,cached,options);
    const supplyMatches=async(value:ChainPriceHistory)=>{
      const blockTag=value.latestBlock,phase=Number(await market.phase({blockTag}));
      const expected=phase===4?await market.failedSupply({blockTag}):await market.S({blockTag});
      return value.genesis.at(-1)?.supply===expected;
    };
    if(!await supplyMatches(history)){
      if(!cached)throw new Error('Genesis历史与链上供应快照不一致，请重试');
      history=await readChainPriceHistory(provider,address,base.address,base.createdAt,k,null,options);
      if(!await supplyMatches(history))throw new Error('Genesis历史与链上供应快照不一致，请重试');
    }
    historyMemory.set(key,history);
    // 校验完成即可绘图，不让浏览器持久化延迟卡住图表。
    if(history.checkpoint)void saveHistoryCheckpoint(history.checkpoint,history.cacheStatus==='updated'?undefined:cached?.latestHash);
    return history;
  }
  function readPriceHistory(marketAddress:string,signal?:AbortSignal):Promise<ChainPriceHistory>{
    const key=nonzeroAddress(marketAddress).toLowerCase();
    foregroundHistory.set(key,(foregroundHistory.get(key)??0)+1);
    return historyQueue.run(key,'foreground',()=>loadPriceHistory(marketAddress,4),signal).finally(()=>{
      const remaining=(foregroundHistory.get(key)??1)-1;if(remaining>0)foregroundHistory.set(key,remaining);else foregroundHistory.delete(key);
    });
  }
  function readBackgroundPriceHistory(marketAddress:string,signal?:AbortSignal):Promise<ChainPriceHistory>{
    const key=nonzeroAddress(marketAddress).toLowerCase();
    return historyQueue.run(key,'background',()=>loadPriceHistory(marketAddress,1),signal);
  }
  async function readCachedPriceHistory(marketAddress:string){
    try{const memory=historyMemory.get(nonzeroAddress(marketAddress).toLowerCase());if(memory)return {...memory,cacheStatus:'local' as const};const cached=await loadHistoryCheckpoint(address,marketAddress);return cached?replayCheckpoint(cached,address,marketAddress):null;}catch{return null;}
  }
  async function quote(marketAddress:string,method:string,args:unknown[]) {
    await ready();const base=await summary(marketAddress);
    return new Contract(base.address,marketAbi,provider)[method](...args);
  }
  function withSigner(signer:Signer,validateSession?:()=>void) {
    async function writeReady(){if(!signer.provider) throw new Error('钱包未连接');await assertTestnet(signer.provider);await ready();}
    async function submit(contract:Contract,method:string,args:unknown[],paymentGas=0n,reasonText?:string):Promise<ContractTransactionResponse>{
      if(!signer.provider) throw new Error('钱包未连接');
      if(reasonText!==undefined){
        const tx=await contract[method].populateTransaction(...args,{chainId:TESTNET_CHAIN_ID});
        const data=appendEarlyReason(tx.data!,reasonText);
        const gasLimit=await signer.estimateGas({...tx,data,chainId:TESTNET_CHAIN_ID})+paymentGas;
        await assertTestnet(signer.provider);validateSession?.();
        return signer.sendTransaction({...tx,data,gasLimit,chainId:TESTNET_CHAIN_ID}) as Promise<ContractTransactionResponse>;
      }
      // 在估算值上另加发费预算；避免估算绕过发费后钱包只提供冻结结算的gas。
      const gasLimit=paymentGas>0n?await contract[method].estimateGas(...args,{chainId:TESTNET_CHAIN_ID})+paymentGas:undefined;
      // 读取登记或授权配置期间用户可能切链；发送前再核验，并把链ID写入交易，
      // 让钱包即使在此后切链也只能拒绝，不能在其他链发送同地址交易。
      await assertTestnet(signer.provider);
      validateSession?.();
      return contract[method](...args,{chainId:TESTNET_CHAIN_ID,...(gasLimit===undefined?{}:{gasLimit})});
    }
    async function send(marketAddress:string,target:'market'|'vault'|'adapter',method:string,args:unknown[],reasonText?:string):Promise<ContractTransactionResponse>{
      await writeReady();const base=await summary(marketAddress);
      const paymentGas=target==='adapter'&&method==='finalizeMarket'?600000n:target==='market'&&(method==='closeExpired'||method==='claimFees')?600000n:target==='vault'&&method==='claimOfficialMarketFees'?600000n:0n;
      return submit(new Contract(target==='market'?base.address:base[target],target==='market'?marketAbi:target==='vault'?vaultAbi:adapterAbi,signer),method,args,paymentGas,reasonText);
    }
    return {
      async createMarket(input:CreateMarketInput):Promise<ContractTransactionResponse>{
        await writeReady();const stock=nonzeroAddress(input.stock);const config=await factory.stocks(stock);
        if(!config.enabled) throw new Error('该股票未启用');
        const block=await provider.getBlock('latest');
        if(!block || input.coreEnd<=BigInt(block.timestamp)+14400n) throw new Error('最终截止时间须距当前链上时间超过4小时');
        return submit(new Contract(address,factoryAbi,signer),'createMarket',[stock,input.topic,input.yesRule,input.noRule,input.invalidRule,input.coreEnd]);
      },
      async approveStock(marketAddress:string,target:'market'|'vault'|'router',amount:bigint):Promise<ContractTransactionResponse>{
        await writeReady();const base=await summary(marketAddress);if(amount<0n) throw new Error('授权金额不能为负');
        const spender=target==='market'?base.address:target==='vault'?base.vault:await new Contract(base.address,marketAbi,provider).trustedForwarder();
        return submit(new Contract(base.stock,tokenAbi,signer),'approve',[nonzeroAddress(spender),amount]);
      },
      genesisBuy:(market:string,paid:bigint,minShares:bigint,expiry:bigint,intent:0|1|2=0)=>send(market,'market','genesisBuy',[paid,minShares,expiry,intent]),
      genesisSell:(market:string,quantity:bigint,minOut:bigint,expiry:bigint,intent:0|1|2=0)=>send(market,'market','genesisSell',[quantity,minOut,expiry,intent]),
      formalBuy:(market:string,isYes:boolean,quantity:bigint,maxPaid:bigint,expiry:bigint)=>send(market,'market','formalBuy',[isYes,quantity,maxPaid,expiry]),
      formalSell:(market:string,isYes:boolean,quantity:bigint,minOut:bigint,expiry:bigint)=>send(market,'market','formalSell',[isYes,quantity,minOut,expiry]),
      stakeCore:(market:string,side:0|1|2,amount:bigint)=>send(market,'vault','stake',[side,amount]),
      materializeLP:async(market:string)=>send(market,'market','materializeLP',[await signer.getAddress()]),
      exitCore:(market:string)=>send(market,'vault','exitStake',[]),
      proposeEarlyTermination:(market:string,outcome:1|2,reason:string)=>{
        const text=normalizeEarlyReason(reason);
        return send(market,'vault','proposeEarlyTermination',[outcome,id(text)],text);
      },
      processEarlyTermination:(market:string)=>send(market,'adapter','finalizeMarket',[]),
      claimEarlyBond:(market:string)=>send(market,'vault','claimEarlyTerminationBond',[]),
      closeExpired:(market:string)=>send(market,'market','closeExpired',[]),
      finalizeMarket:(market:string)=>send(market,'adapter','finalizeMarket',[]),
      claimMarket:(market:string)=>send(market,'market','claimAll',[]),
      claimMarketFees:(market:string)=>send(market,'market','claimFees',[]),
      claimProtocolFees:(market:string)=>send(market,'vault','claimOfficialMarketFees',[]),
      claimCore:(market:string)=>send(market,'vault','withdraw',[]),
      async executeRouter(request:RouterRequest,reasonText?:string):Promise<ContractTransactionResponse>{
        if(request.action===RouterAction.ProposeEarly){if(reasonText===undefined||id(normalizeEarlyReason(reasonText)).toLowerCase()!==request.reasonHash.toLowerCase())throw new Error('提前结算原因与链上哈希不一致');}
        else if(reasonText!==undefined)throw new Error('此操作不支持原因原文');
        await writeReady();const base=await summary(request.market);const m=new Contract(base.address,marketAbi,provider);
        const router=nonzeroAddress(await m.trustedForwarder());const r=new Contract(router,routerAbi,provider);
        if(getAddress(await r.factory())!==address) throw new Error('路由未绑定当前工厂');
        const asset=nonzeroAddress(request.paymentAsset);
        if(asset!==getAddress(base.stock) && !await r.stablecoin(asset)) throw new Error('路由不支持该支付资产');
        return submit(new Contract(router,routerAbi,signer),'execute',[request],0n,reasonText);
      },
      async previewRouter(request:RouterRequest):Promise<bigint>{
        await writeReady();const route=await readPaymentRoute(request.market);
        const asset=nonzeroAddress(request.paymentAsset);
        if(asset!==getAddress(route.stock)&&asset!==getAddress(route.stable))throw new Error('支付资产未登记');
        validateSession?.();
        return new Contract(route.router,routerAbi,signer).execute.staticCall(request,{chainId:TESTNET_CHAIN_ID});
      },
      async approveRouterAsset(marketAddress:string,paymentAsset:string,amount:bigint):Promise<ContractTransactionResponse>{
        await writeReady();const base=await summary(marketAddress);const router=nonzeroAddress(await new Contract(base.address,marketAbi,provider).trustedForwarder());
        const r=new Contract(router,routerAbi,provider);const asset=nonzeroAddress(paymentAsset);
        if(getAddress(await r.factory())!==address || (asset!==getAddress(base.stock) && !await r.stablecoin(asset))) throw new Error('支付资产或路由不受支持');
        return submit(new Contract(asset,tokenAbi,signer),'approve',[router,amount]);
      },
    };
  }
  return {readDirectory,readMarket,readPriceHistory,readBackgroundPriceHistory,readCachedPriceHistory,readPaymentRoute,quotePaymentSwap,quoteEarlyProposalStable,withSigner,
    quoteGenesisBuy:(market:string,paid:bigint):Promise<bigint>=>quote(market,'quoteGenesisBuy',[paid]),
    async quoteGenesisSell(market:string,quantity:bigint,account?:string):Promise<{gross:bigint;seller:bigint}>{const r=await quote(market,'quoteGenesisSell',[quantity]);return {gross:r[0],seller:r[1]};},
    quoteFormalBuy:(market:string,isYes:boolean,quantity:bigint):Promise<bigint>=>quote(market,'quoteFormalBuy',[isYes,quantity]),
    async quoteFormalSell(market:string,isYes:boolean,quantity:bigint,account?:string):Promise<{gross:bigint;seller:bigint}>{const r=await quote(market,'quoteFormalSell',[isYes,quantity]);return {gross:r[0],seller:r[1]};},
  };
}
export type ChainClient=ReturnType<typeof createChainClient>;
export type ChainWriter=ReturnType<ChainClient['withSigner']>;
