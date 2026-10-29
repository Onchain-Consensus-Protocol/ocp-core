import { describe, expect, it, vi } from 'vitest';
import { Interface, type Provider, type Signer } from 'ethers';
import { createChainClient, nonzeroAddress, RouterAction } from './chainClient';
import factoryAbi from '../../contracts/topic-market/abi/TopicMarketStockFactory.json';
import marketAbi from '../../contracts/topic-market/abi/TopicMarket.json';
import routerAbi from '../../contracts/topic-market/abi/TopicMarketAssetRouter.json';

const factory='0x0000000000000000000000000000000000001234';
const market='0x0000000000000000000000000000000000005678';
function provider(chainId:bigint,code='0x01') {
  return {getNetwork:vi.fn(async()=>({chainId})),getCode:vi.fn(async()=>code)};
}
function transactionFixture(){
  const abi=new Interface([...factoryAbi,...marketAbi,...routerAbi].filter(item=>item.type==='function'));
  const p={...provider(46630n),getBlock:vi.fn(async()=>({timestamp:1000})),call:vi.fn(async(tx:{data:string})=>{
    const fragment=abi.getFunction(tx.data.slice(0,10))!;
    const results:Record<string,unknown[]>={isMarket:[true],marketCollateral:[market],
      marketRecord:[[market,market,market,1n,20000n,23600n,23600n,1n,'topic','yes','no','invalid']],
      stocks:[market,market,1n,18,true],trustedForwarder:[market],factory:[factory],stablecoin:[true]};
    return abi.encodeFunctionResult(fragment,results[fragment.name]);
  })};
  const wallet=provider(46630n);const sendTransaction=vi.fn(async(tx:unknown)=>({hash:'0x01',request:tx}));
  const writer=createChainClient(p as unknown as Provider,factory).withSigner({provider:wallet,sendTransaction} as unknown as Signer);
  return {writer,wallet,sendTransaction};
}
describe('testnet transaction boundary',()=>{
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
    await writer.createMarket({stock:market,topic:'t',yesRule:'y',noRule:'n',invalidRule:'i',coreEnd:20000n});
    await writer.approveStock(market,'market',1n);
    await writer.approveRouterAsset(market,market,1n);
    await writer.executeRouter({market,action:RouterAction.GenesisBuy,paymentAsset:market,inputAmount:1n,quantity:0n,minCollateral:0n,businessLimit:0n,minOutput:0n,deadline:2000n,side:0,graduationIntent:0});
    expect(sendTransaction).toHaveBeenCalledTimes(10);
    for(const [request] of sendTransaction.mock.calls) expect(request).toMatchObject({chainId:46630n});
  });
  it('catches a wallet chain switch after asynchronous factory reads',async()=>{
    const {writer,wallet,sendTransaction}=transactionFixture();
    wallet.getNetwork.mockResolvedValueOnce({chainId:46630n}).mockResolvedValue({chainId:4663n});
    await expect(writer.claimMarket(market)).rejects.toThrow('46630');
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
