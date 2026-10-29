import { Contract, ZeroAddress, getAddress, type Provider, type Signer, type ContractTransactionResponse } from 'ethers';
import factoryAbi from './abi/TopicMarketStockFactory.json';
import marketAbi from './abi/TopicMarket.json';
import vaultAbi from './abi/OCPVault.json';
import adapterAbi from './abi/VaultCoreAdapter.json';
import routerAbi from './abi/TopicMarketAssetRouter.json';
import oracleAbi from './abi/TopicMarketStockPriceSnapshot.json';

export const TESTNET_CHAIN_ID = 46630n;
const tokenAbi = ['function symbol() view returns(string)', 'function decimals() view returns(uint8)', 'function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'];
export interface StockState { address:string; symbol:string; decimals:number; enabled:boolean; oracle:string; router:string; k:bigint; snapshot?:bigint; snapshotError?:string; balance?:bigint }
export interface MarketSummary { address:string; stock:string; creator:string; adapter:string; vault:string; topic:string; yesRule:string; noRule:string; invalidRule:string; createdAt:bigint; genesisCutoff:bigint; formalCutoff:bigint; coreCutoff:bigint; snapshot:bigint }
export interface AccountPosition { balance:bigint; genesisShares:bigint; yes:bigint; no:bigint; lp:bigint; b:bigint; coreYes:bigint; coreNo:bigint; coreInvalid:bigint; marketAllowance:bigint; vaultAllowance:bigint; routerAllowance:bigint }
export interface MarketState extends MarketSummary { phase:number; outcome:number; R:bigint; B:bigint; S:bigint; rTarget:bigint; bTarget:bigint; k:bigint; cash:bigint; lpFees:bigint; lpBudgetRemaining:bigint; bBudgetRemaining:bigint; vaultResolved:boolean; vaultOutcome:number; vaultSettlementReady:boolean; totalStakeYes:bigint; totalStakeNo:bigint; totalStakeInvalid:bigint; position?:AccountPosition }
export interface DirectoryState { factory:string; owner:string; stocks:StockState[]; markets:MarketSummary[]; blockNumber:number; timestamp:bigint }
export interface CreateMarketInput { stock:string; topic:string; yesRule:string; noRule:string; invalidRule:string; coreEnd:bigint }
export enum RouterAction { GenesisBuy, FormalBuy, CoreStake, GenesisSell, FormalSell, ClaimMarket, ClaimOutcome, ClaimLP, ClaimB, ClaimFailed, ClaimCore, RedeemPairs }
export interface RouterRequest { market:string; action:RouterAction; paymentAsset:string; inputAmount:bigint; quantity:bigint; minCollateral:bigint; businessLimit:bigint; minOutput:bigint; deadline:bigint; side:0|1|2; graduationIntent:0|1|2 }

export function nonzeroAddress(value:string):string {
  const address=getAddress(value);
  if(address===ZeroAddress) throw new Error('未配置合约地址');
  return address;
}
export async function assertTestnet(provider:Provider):Promise<void> {
  if((await provider.getNetwork()).chainId!==TESTNET_CHAIN_ID) throw new Error('请切换到 Robinhood Chain Testnet（46630）');
}

/** Raw amounts use collateral decimals; outcome/LP/B quantities use 18 decimals. No write runs on construction/read. */
export function createChainClient(provider:Provider, factoryAddress:string) {
  const address=nonzeroAddress(factoryAddress);
  const factory=new Contract(address,factoryAbi,provider);
  async function ready() {
    await assertTestnet(provider);
    if(await provider.getCode(address)==='0x') throw new Error('测试网工厂地址没有合约代码');
  }
  async function summary(marketAddress:string):Promise<MarketSummary> {
    const market=nonzeroAddress(marketAddress);
    if(!await factory.isMarket(market)) throw new Error('市场未登记在当前工厂');
    const [r,stock]=await Promise.all([factory.marketRecord(market),factory.marketCollateral(market)]);
    return {address:market,stock,creator:r.creator,adapter:r.adapter,vault:r.vault,topic:r.topic,yesRule:r.yesRule,noRule:r.noRule,invalidRule:r.invalidRule,createdAt:r.createdAt,genesisCutoff:r.coreCutoff-7200n,formalCutoff:r.formalCutoff,coreCutoff:r.coreCutoff,snapshot:r.snapshot};
  }
  async function readDirectory(account?:string):Promise<DirectoryState> {
    await ready();
    if(account) account=nonzeroAddress(account);
    const [owner,ns,nm,block]=await Promise.all([factory.owner(),factory.stockCount(),factory.marketCount(),provider.getBlock('latest')]);
    if(!block) throw new Error('无法读取最新区块');
    const stocks=await Promise.all(Array.from({length:Number(ns)},async(_,i):Promise<StockState>=>{
      const stock=await factory.stockTokens(i);const token=new Contract(stock,tokenAbi,provider);
      const config=await factory.stocks(stock);
      const [symbol,decimals,balance]=await Promise.all([token.symbol().catch(()=>stock.slice(0,10)),token.decimals(),account?token.balanceOf(account):undefined]);
      const result:StockState={address:stock,symbol,decimals:Number(decimals),enabled:config.enabled,oracle:config.priceOracle,router:config.trustedForwarder,k:config.k,balance};
      try {result.snapshot=await new Contract(result.oracle,oracleAbi,provider).ethPrice6();}
      catch {result.snapshotError='价格快照不可用：请检查喂价时效、状态和配置';}
      return result;
    }));
    const markets=await Promise.all(Array.from({length:Number(nm)},async(_,i)=>summary(await factory.markets(i))));
    return {factory:address,owner,stocks,markets,blockNumber:block.number,timestamp:BigInt(block.timestamp)};
  }
  async function readMarket(marketAddress:string,account?:string):Promise<MarketState> {
    await ready();const base=await summary(marketAddress);
    const m=new Contract(base.address,marketAbi,provider);const v=new Contract(base.vault,vaultAbi,provider);
    const keys=['phase','outcome','R','B','S','rTarget','bTarget','k','cash','lpFees','lpBudgetRemaining','bBudgetRemaining'] as const;
    const values=await Promise.all(keys.map(key=>m[key]()));
    const state={...base,...Object.fromEntries(keys.map((key,i)=>[key,values[i]]))} as MarketState;
    state.phase=Number(state.phase);state.outcome=Number(state.outcome);
    [state.vaultResolved,state.vaultOutcome,state.vaultSettlementReady,state.totalStakeYes,state.totalStakeNo,state.totalStakeInvalid]=await Promise.all([v.resolved(),v.outcome(),v.settlementReady(),v.totalStakeYes(),v.totalStakeNo(),v.totalStakeInvalid()]);
    state.vaultOutcome=Number(state.vaultOutcome);
    if(account){
      account=nonzeroAddress(account);const token=new Contract(base.stock,tokenAbi,provider);
      const [lp,b,router]=await Promise.all([m.lpToken(),m.bToken(),m.trustedForwarder()]);
      const [balance,genesisShares,yes,no,lpBalance,bBalance,stake,marketAllowance,vaultAllowance,routerAllowance]=await Promise.all([token.balanceOf(account),m.shares(account),m.yes(account),m.no(account),new Contract(lp,tokenAbi,provider).balanceOf(account),new Contract(b,tokenAbi,provider).balanceOf(account),v.stakeOf(account),token.allowance(account,base.address),token.allowance(account,base.vault),token.allowance(account,router)]);
      state.position={balance,genesisShares,yes,no,lp:lpBalance,b:bBalance,coreYes:stake[0],coreNo:stake[1],coreInvalid:stake[2],marketAllowance,vaultAllowance,routerAllowance};
    }
    return state;
  }
  async function quote(marketAddress:string,method:string,args:unknown[]) {
    await ready();const base=await summary(marketAddress);
    return new Contract(base.address,marketAbi,provider)[method](...args);
  }
  function withSigner(signer:Signer) {
    async function writeReady(){await ready();if(!signer.provider) throw new Error('钱包未连接');await assertTestnet(signer.provider);}
    async function submit(contract:Contract,method:string,args:unknown[]):Promise<ContractTransactionResponse>{
      if(!signer.provider) throw new Error('钱包未连接');
      // 读取登记或授权配置期间用户可能切链；发送前再核验，并把链ID写入交易，
      // 让钱包即使在此后切链也只能拒绝，不能在其他链发送同地址交易。
      await assertTestnet(signer.provider);
      return contract[method](...args,{chainId:TESTNET_CHAIN_ID});
    }
    async function send(marketAddress:string,target:'market'|'vault'|'adapter',method:string,args:unknown[]):Promise<ContractTransactionResponse>{
      await writeReady();const base=await summary(marketAddress);
      return submit(new Contract(target==='market'?base.address:base[target],target==='market'?marketAbi:target==='vault'?vaultAbi:adapterAbi,signer),method,args);
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
      closeExpired:(market:string)=>send(market,'market','closeExpired',[]),
      finalizeMarket:(market:string)=>send(market,'adapter','finalizeMarket',[]),
      claimMarket:(market:string)=>send(market,'market','claimAll',[]),
      claimCore:(market:string)=>send(market,'vault','withdraw',[]),
      async executeRouter(request:RouterRequest):Promise<ContractTransactionResponse>{
        await writeReady();const base=await summary(request.market);const m=new Contract(base.address,marketAbi,provider);
        const router=nonzeroAddress(await m.trustedForwarder());const r=new Contract(router,routerAbi,provider);
        if(getAddress(await r.factory())!==address) throw new Error('路由未绑定当前工厂');
        const asset=nonzeroAddress(request.paymentAsset);
        if(asset!==getAddress(base.stock) && !await r.stablecoin(asset)) throw new Error('路由不支持该支付资产');
        return submit(new Contract(router,routerAbi,signer),'execute',[request]);
      },
      async approveRouterAsset(marketAddress:string,paymentAsset:string,amount:bigint):Promise<ContractTransactionResponse>{
        await writeReady();const base=await summary(marketAddress);const router=nonzeroAddress(await new Contract(base.address,marketAbi,provider).trustedForwarder());
        const r=new Contract(router,routerAbi,provider);const asset=nonzeroAddress(paymentAsset);
        if(getAddress(await r.factory())!==address || (asset!==getAddress(base.stock) && !await r.stablecoin(asset))) throw new Error('支付资产或路由不受支持');
        return submit(new Contract(asset,tokenAbi,signer),'approve',[router,amount]);
      },
    };
  }
  return {readDirectory,readMarket,withSigner,
    quoteGenesisBuy:(market:string,paid:bigint):Promise<bigint>=>quote(market,'quoteGenesisBuy',[paid]),
    async quoteGenesisSell(market:string,quantity:bigint):Promise<{gross:bigint;seller:bigint}>{const r=await quote(market,'quoteGenesisSell',[quantity]);return {gross:r[0],seller:r[1]};},
    quoteFormalBuy:(market:string,isYes:boolean,quantity:bigint):Promise<bigint>=>quote(market,'quoteFormalBuy',[isYes,quantity]),
    async quoteFormalSell(market:string,isYes:boolean,quantity:bigint):Promise<{gross:bigint;seller:bigint}>{const r=await quote(market,'quoteFormalSell',[isYes,quantity]);return {gross:r[0],seller:r[1]};},
  };
}
export type ChainClient=ReturnType<typeof createChainClient>;
export type ChainWriter=ReturnType<ChainClient['withSigner']>;
