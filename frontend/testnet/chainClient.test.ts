import {ZeroHash} from 'ethers';
import { describe, expect, it, vi } from 'vitest';
import { Interface, id, type Provider, type Signer } from 'ethers';
import { createChainClient, decodeEarlyReason, nonzeroAddress, RouterAction } from './chainClient';
import factoryAbi from '../../contracts/topic-market/abi/TopicMarketStockFactory.json';
import marketAbi from '../../contracts/topic-market/abi/TopicMarket.json';
import routerAbi from '../../contracts/topic-market/abi/TopicMarketAssetRouter.json';
import vaultAbi from './abi/OCPCore.json';
import {quoteExchange} from './exchangeQuote';
vi.mock('./exchangeQuote',()=>({quoteExchange:vi.fn()}));

const factory='0x0000000000000000000000000000000000001234';
const market='0x0000000000000000000000000000000000005678';
function provider(chainId:bigint,code='0x01') {
  return {getNetwork:vi.fn(async()=>({chainId})),getCode:vi.fn(async()=>code)};
}
function transactionFixture(){
  const abi=new Interface([...factoryAbi,...marketAbi,...routerAbi].filter(item=>item.type==='function').concat(['function interfaceVersion() view returns(uint256)'] as never));
  const p={...provider(46630n),getBlock:vi.fn(async()=>({timestamp:1000})),call:vi.fn(async(tx:{data:string})=>{
    const fragment=abi.getFunction(tx.data.slice(0,10))!;
    const results:Record<string,unknown[]>={interfaceVersion:[4n],isMarket:[true],marketCollateral:[market],
      marketRecord:[[market,market,market,1n,20000n,23600n,23600n,1n,'topic','yes','no','invalid']],
      stocks:[market,market,1n,18,true],trustedForwarder:[market],factory:[factory],stablecoin:[true]};
    return abi.encodeFunctionResult(fragment,results[fragment.name]);
  })};
  const wallet=provider(46630n);const sendTransaction=vi.fn(async(tx:unknown)=>({hash:'0x01',request:tx}));
  const writer=createChainClient(p as unknown as Provider,factory).withSigner({provider:wallet,sendTransaction,estimateGas:vi.fn(async()=>200000n)} as unknown as Signer);
  return {writer,wallet,sendTransaction,readerProvider:p};
}
describe('testnet transaction boundary',()=>{
  it('uses the current router action numbering',()=>{expect(RouterAction.ClaimFailed).toBe(8);expect(RouterAction.ClaimCore).toBe(9);expect(RouterAction.RedeemPairs).toBe(10);});
  it('reads fixed TSLA targets without an ETH feed',async()=>{
    const stock='0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E';
    const abi=new Interface([...factoryAbi,
      'function fixedTestnetGraduation() view returns(bool)',
      'function interfaceVersion() view returns(uint256)',
      'function symbol() view returns(string)','function decimals() view returns(uint8)',
      'function collateralForUsd(uint256) view returns(uint256)',
      'function ethPrice6() view returns(uint256)']);
    const calls:string[]=[];
    const p={...provider(46630n),getBlock:vi.fn(async()=>({number:42,timestamp:1000})),call:vi.fn(async(tx:{data:string})=>{
      const fragment=abi.getFunction(tx.data.slice(0,10))!;calls.push(fragment.name);
      if(fragment.name==='ethPrice6')throw new Error('ETH feed unavailable');
      const results:Record<string,unknown[]>={owner:[factory],stockCount:[1n],marketCount:[0n],
        fixedTestnetGraduation:[true],interfaceVersion:[4n],stockTokens:[stock],stocks:[market,market,1n,18,true],
        symbol:['TSLA'],decimals:[18],collateralForUsd:[2n*10n**18n]};
      return abi.encodeFunctionResult(fragment,results[fragment.name]);
    })};
    const directory=await createChainClient(p as unknown as Provider,factory).readDirectory();
    expect(directory.fixedTestTargets).toBe(true);
    expect(directory.stocks[0]).toMatchObject({fixedRTarget:4200000000000000n});
    expect(directory.stocks[0].snapshotError).toBeUndefined();
    expect(calls).toContain('collateralForUsd');expect(calls).not.toContain('ethPrice6');
  });
  it('reads LP and holdings without querying unsupported token contracts',async()=>{
    const abi=new Interface([...factoryAbi,...marketAbi,...vaultAbi].filter(item=>item.type==='function').concat([
      'function interfaceVersion() view returns(uint256)', 'function balanceOf(address) view returns(uint256)',
      'function allowance(address,address) view returns(uint256)',
    ] as never));
    const seen:string[]=[];
    const p={...provider(46630n),call:vi.fn(async(tx:{data:string;to:string})=>{
      seen.push(tx.to);if(BigInt(tx.to)===0n)throw new Error('ZERO_TOKEN_CALL');
      const f=abi.getFunction(tx.data.slice(0,10))!;
      const results:Record<string,unknown[]>={interfaceVersion:[4n],isMarket:[true],marketCollateral:[market],
        marketRecord:[[market,market,market,1n,20000n,23600n,23600n,1n,'topic','yes','no','invalid']],
        phase:[0n],outcome:[0n],R:[1n],S:[1n],rTarget:[42n],k:[1n],cash:[0n],lpFees:[0n],
        lpBudgetRemaining:[0n],resolved:[false],settlementReady:[false],totalStakeYes:[0n],totalStakeNo:[0n],totalStakeInvalid:[0n],
        lpToken:[market],trustedForwarder:[market],
        balanceOf:[7n],shares:[1n],yes:[0n],no:[0n],stakeOf:[0n,0n,0n],allowance:[0n]};
      if(!results[f.name])throw new Error('optional view absent');
      return abi.encodeFunctionResult(f,results[f.name]);
    })};
    const state=await createChainClient(p as unknown as Provider,factory).readMarket(market,market);
    expect(state.position?.lp).toBe(7n);
    expect(seen.every(to=>BigInt(to)!==0n)).toBe(true);
  });
  it.each([3n,0n])('rejects unsupported factory version %s before any wallet signature',async(version)=>{
    const abi=new Interface(['function interfaceVersion() view returns(uint256)']);
    const p={...provider(46630n),call:vi.fn(async()=>abi.encodeFunctionResult('interfaceVersion',[version]))};
    const sendTransaction=vi.fn();const client=createChainClient(p as unknown as Provider,factory);
    await expect(client.readDirectory()).rejects.toThrow('interfaceVersion 4');
    await expect(client.withSigner({provider:p,sendTransaction} as unknown as Signer).claimMarket(market)).rejects.toThrow('interfaceVersion 4');
    expect(sendTransaction).not.toHaveBeenCalled();
  });
  it('quotes USDG for the fixed stock bond with exact-output conversion and a rounded 1% input ceiling',async()=>{
    const stable='0x0000000000000000000000000000000000009999',bond=1250000000000000000n;
    const abi=new Interface([...factoryAbi,...marketAbi,...vaultAbi,...routerAbi].filter(item=>item.type==='function').concat([
      'function interfaceVersion() view returns(uint256)','function stock() view returns(address)','function stable() view returns(address)',
      'function symbol() view returns(string)','function decimals() view returns(uint8)',
    ] as never));
    const p={...provider(46630n),call:vi.fn(async(tx:{data:string})=>{
      const f=abi.getFunction(tx.data.slice(0,10))!;
      const results:Record<string,unknown[]>={interfaceVersion:[4n],isMarket:[true],marketCollateral:[market],
        marketRecord:[[market,market,market,1n,20000n,23600n,23600n,1n,'topic','yes','no','invalid']],
        phase:[1n],outcome:[0n],R:[0n],S:[1n],rTarget:[42n],k:[1n],cash:[0n],lpFees:[0n],lpBudgetRemaining:[0n],
        resolved:[false],settlementReady:[false],totalStakeYes:[100n],totalStakeNo:[0n],totalStakeInvalid:[0n],
        earlyTerminationBondRequired:[bond],pendingEarlyTermination:[[0n,market,0n,0n,0n,0n,ZeroHash]],earlyTerminationProcessingDue:[false],effectiveResolutionTime:[23600n],
        trustedForwarder:[market],factory:[factory],exchange:[market],stock:[market],stable:[stable],stablecoin:[true],symbol:['USDG'],decimals:[6n]};
      if(!results[f.name])throw new Error('optional metric unavailable');return abi.encodeFunctionResult(f,results[f.name]);
    })};
    vi.mocked(quoteExchange).mockResolvedValueOnce({amountIn:500000001n,amountOut:bond} as never);
    const client=createChainClient(p as unknown as Provider,factory),q=await client.quoteEarlyProposalStable(market,1,'  Conditions met  ',2000n);
    expect(quoteExchange).toHaveBeenLastCalledWith(p,market,stable,market,bond,'output');
    expect(q.request).toMatchObject({action:11,paymentAsset:stable,inputAmount:505000002n,minCollateral:bond,businessLimit:bond,side:1,reasonHash:id('Conditions met'),deadline:2000n});
    expect(q.cash).toBe(500000001n);expect(q.quotedAt).toBeGreaterThan(0);
    await expect(client.quoteEarlyProposalStable(market,0,' ',2000n)).rejects.toThrow('原因');
  });
  it('encodes routed early actions with reason hash, testnet chain and protected refund output',async()=>{
    const {writer,sendTransaction}=transactionFixture();
    const request={market,action:RouterAction.ProposeEarly,paymentAsset:market,inputAmount:100n,quantity:0n,minCollateral:99n,businessLimit:99n,minOutput:0n,deadline:2000n,side:1 as const,graduationIntent:0 as const,reasonHash:id('reason')};
    await writer.executeRouter(request,'reason');
    await writer.executeRouter({...request,action:RouterAction.ClaimEarlyBond,inputAmount:0n,minCollateral:0n,businessLimit:0n,minOutput:98n,reasonHash:ZeroHash});
    const abi=new Interface(routerAbi);
    const first=sendTransaction.mock.calls[0][0] as {data:string;chainId:bigint},second=sendTransaction.mock.calls[1][0] as {data:string;chainId:bigint};
    expect(first.chainId).toBe(46630n);expect(second.chainId).toBe(46630n);
    const a=abi.decodeFunctionData('execute',first.data)[0];expect(a.action).toBe(11n);expect(a.reasonHash).toBe(id('reason'));expect(a.minCollateral).toBe(99n);
    const b=abi.decodeFunctionData('execute',second.data)[0];expect(b.action).toBe(12n);expect(b.minOutput).toBe(98n);expect(b.reasonHash).toBe(ZeroHash);
  });
  it('estimates and sends the same reason envelope for direct and routed proposals',async()=>{
    const {readerProvider,wallet}=transactionFixture(),sendTransaction=vi.fn(async(_tx:unknown)=>({hash:'0x01'})),estimateGas=vi.fn(async(_tx:unknown)=>300000n);
    const writer=createChainClient(readerProvider as unknown as Provider,factory).withSigner({provider:wallet,sendTransaction,estimateGas} as unknown as Signer);
    const reason='所有人可读取的原因',hash=id(reason);
    await writer.proposeEarlyTermination(market,1,reason);
    await writer.executeRouter({market,action:RouterAction.ProposeEarly,paymentAsset:market,inputAmount:100n,quantity:0n,minCollateral:99n,businessLimit:99n,minOutput:0n,deadline:2000n,side:0,graduationIntent:0,reasonHash:hash},reason);
    for(let i=0;i<2;i++){const estimated=estimateGas.mock.calls[i][0] as {data:string};const sent=sendTransaction.mock.calls[i][0] as {data:string;chainId:bigint};expect(sent.data).toBe(estimated.data);expect(decodeEarlyReason(sent.data,hash)).toBe(reason);expect(sent.chainId).toBe(46630n);}
    await expect(writer.executeRouter({market,action:RouterAction.ProposeEarly,paymentAsset:market,inputAmount:1n,quantity:0n,minCollateral:1n,businessLimit:1n,minOutput:0n,deadline:2000n,side:0,graduationIntent:0,reasonHash:hash},'wrong')).rejects.toThrow('哈希');
    expect(sendTransaction).toHaveBeenCalledTimes(2);
  });
  it('rejects a missing factory before creating a client',()=>{
    expect(()=>nonzeroAddress('0x0000000000000000000000000000000000000000')).toThrow('未配置');
    expect(()=>createChainClient({} as Provider,'')).toThrow();
  });
  it('blocks reads and approvals on mainnet before touching contract state',async()=>{
    const p=provider(4663n);const client=createChainClient(p as unknown as Provider,factory);
    await expect(client.readDirectory()).rejects.toThrow('46630');
    await expect(client.withSigner({provider:p} as unknown as Signer).approveStock(market,'market',1n)).rejects.toThrow('46630');
    expect(p.getCode).not.toHaveBeenCalled();
  });
  it('blocks a wrong-chain wallet even with a valid testnet read provider',async()=>{
    const p=provider(46630n);const wallet=provider(4663n);
    const writer=createChainClient(p as unknown as Provider,factory).withSigner({provider:wallet} as unknown as Signer);
    await expect(writer.claimMarket(market)).rejects.toThrow('46630');
    await expect(writer.createMarket({stock:market,topic:'t',yesRule:'y',noRule:'n',invalidRule:'i',coreEnd:9999999999n})).rejects.toThrow('46630');
    expect(wallet.getCode).not.toHaveBeenCalled();
  });
  it('rejects an address without factory bytecode',async()=>{
    const p=provider(46630n,'0x');const client=createChainClient(p as unknown as Provider,factory);
    await expect(client.readMarket(market)).rejects.toThrow('没有合约代码');
  });
  it('pins every transaction path to chain 46630 in the actual signer request',async()=>{
    const {writer,sendTransaction}=transactionFixture();
    await writer.genesisBuy(market,1n,0n,2000n);
    await writer.formalBuy(market,true,1n,2n,2000n);
    await writer.stakeCore(market,0,1n);
    await writer.finalizeMarket(market);
    await writer.claimMarket(market);
    await writer.claimCore(market);
    await writer.exitCore(market);
    await writer.proposeEarlyTermination(market,1,'public outcome evidence');
    await writer.processEarlyTermination(market);
    await writer.claimEarlyBond(market);
    await writer.createMarket({stock:market,topic:'t',yesRule:'y',noRule:'n',invalidRule:'i',coreEnd:20000n});
    await writer.approveStock(market,'market',1n);
    await writer.approveRouterAsset(market,market,1n);
    await writer.executeRouter({market,action:RouterAction.GenesisBuy,paymentAsset:market,inputAmount:1n,quantity:0n,minCollateral:0n,businessLimit:0n,minOutput:0n,deadline:2000n,side:0,graduationIntent:0,reasonHash:ZeroHash});
    await writer.claimMarketFees(market);
    await writer.claimProtocolFees(market);
    await writer.closeExpired(market);
    expect(sendTransaction).toHaveBeenCalledTimes(17);
    for(const [request] of sendTransaction.mock.calls) expect(request).toMatchObject({chainId:46630n});
    expect(sendTransaction.mock.calls[3][0]).toMatchObject({gasLimit:800000n});
    expect(sendTransaction.mock.calls[8][0]).toMatchObject({gasLimit:800000n});
    for(const index of [14,15,16])expect(sendTransaction.mock.calls[index][0]).toMatchObject({gasLimit:800000n});
  });
  it('blocks a stale wallet session after asynchronous registry reads and before signing',async()=>{
    const {readerProvider,wallet,sendTransaction}=transactionFixture();
    const client=createChainClient(readerProvider as unknown as Provider,factory).withSigner(
      {provider:wallet,sendTransaction,estimateGas:vi.fn(async()=>200000n)} as unknown as Signer,()=>{throw new Error('Wallet session changed');});
    await expect(client.claimMarket(market)).rejects.toThrow('Wallet session changed');
    expect(readerProvider.call).toHaveBeenCalled();expect(sendTransaction).not.toHaveBeenCalled();
  });
  it('delivers escrowed LP only to the connected signer on testnet',async()=>{
    const {readerProvider,wallet,sendTransaction}=transactionFixture();
    const account='0x0000000000000000000000000000000000009999';
    const client=createChainClient(readerProvider as unknown as Provider,factory).withSigner(
      {provider:wallet,sendTransaction,getAddress:async()=>account} as unknown as Signer);
    await client.materializeLP(market);
    const [request]=sendTransaction.mock.calls[0] as [{to:string;data:string;chainId:bigint}];
    expect(request).toMatchObject({to:market,chainId:46630n});
    expect(new Interface(marketAbi).decodeFunctionData('materializeLP',request.data)[0]).toBe(account);
  });
  it('requires a reason before preparing an early proposal signature',async()=>{
    const {writer,sendTransaction}=transactionFixture();
    expect(()=>writer.proposeEarlyTermination(market,1,'   ')).toThrow('原因');
    expect(sendTransaction).not.toHaveBeenCalled();
  });
  it('catches a wallet chain switch after asynchronous factory reads',async()=>{
    const {writer,wallet,sendTransaction}=transactionFixture();
    wallet.getNetwork.mockResolvedValueOnce({chainId:46630n}).mockResolvedValue({chainId:4663n});
    await expect(writer.claimMarket(market)).rejects.toThrow('46630');
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
