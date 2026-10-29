import {describe,it,expect} from 'vitest';
import {Interface, type Log, type Provider} from 'ethers';
import factoryAbi from './abi/TopicMarketStockFactory.json';
import marketAbi from './abi/TopicMarket.json';
import {readChainPriceHistory,replayMarketPriceHistory} from './priceHistory';

const WAD=10n**18n;
const FACTORY='0x1111111111111111111111111111111111111111';
const MARKET='0x2222222222222222222222222222222222222222';
const USER='0x3333333333333333333333333333333333333333';
const iface=new Interface(marketAbi), factory=new Interface(factoryAbi);
const hash=(value:number)=>`0x${value.toString(16).padStart(64,'0')}`;
function event(contract:Interface,name:string,args:unknown[],blockNumber:number,index=0):Log {
  const encoded=contract.encodeEventLog(contract.getEvent(name)!,args);
  return {address:contract===factory?FACTORY:MARKET,blockNumber,blockHash:hash(blockNumber),
    transactionHash:hash(10000+blockNumber),transactionIndex:0,index,removed:false,...encoded} as unknown as Log;
}
function creation(){return event(factory,'MarketCreated',[
  MARKET,USER,USER,USER,30n,100n,200n,300n,300n,WAD,
],3);}
const stamped=(log:Log)=>({log,timestamp:log.blockNumber*10});

describe('current TopicMarket price history',()=>{
  it('replays actual supply deltas and keeps genuine timestamps even within one block',()=>{
    const buy=event(iface,'GenesisTrade',[USER,true,10n*WAD,3n*WAD],4,0);
    const sell=event(iface,'GenesisTrade',[USER,false,4n*WAD,WAD],4,1);
    const result=replayMarketPriceHistory(stamped(creation()),[stamped(sell),stamped(buy),stamped(buy)],2n*WAD,6);
    expect(result.genesis.map(p=>p.price)).toEqual([0n,12n*WAD,8n*WAD]);
    expect(result.genesis.map(p=>p.at)).toEqual([30,40,40]);
    expect(result.events.map(p=>p.kind)).toEqual(['GENESIS_BUY','GENESIS_SELL']);
    expect(result.events[0].transactionHash).toBe(buy.transactionHash);
    expect(result.genesis[2].supply).toBe(2n*WAD);
  });

  it('retains the real Genesis curve after graduation/claims and counts only actual formal turnover',()=>{
    const logs=[
      event(iface,'GenesisTrade',[USER,true,10n*WAD,3n*WAD],4,0),
      event(iface,'Graduated',[USER,true,10n*WAD,WAD],4,1),
      event(iface,'FormalTrade',[USER,true,true,WAD,2n*WAD],5,0),
      event(iface,'FormalTrade',[USER,false,false,WAD/2n,WAD],5,1),
      event(iface,'Finalized',[1,0n,10n*WAD,WAD],6,0),
      event(iface,'Claimed',[USER,hash(99),WAD],6,1),
    ];
    const result=replayMarketPriceHistory(stamped(creation()),logs.map(stamped),WAD,6);
    expect(result.genesis.map(p=>p.price)).toEqual([0n,6n*WAD]);
    expect(result.formalVolume).toBe(3n*WAD);
    expect(result.events.find(e=>e.kind==='FINALIZED')?.outcome).toBe(1);
    expect(result.genesis.at(-1)?.at).toBe(40);
  });

  it('rejects missing prefix history instead of clamping a negative supply or manufacturing a start',()=>{
    const sell=event(iface,'GenesisTrade',[USER,false,WAD,WAD],4);
    expect(()=>replayMarketPriceHistory(stamped(creation()),[stamped(sell)],WAD,6)).toThrow('历史不完整');
    const formal=event(iface,'FormalTrade',[USER,true,true,WAD,WAD],4);
    expect(()=>replayMarketPriceHistory(stamped(creation()),[stamped(formal)],WAD,6)).toThrow('缺少毕业事件');
  });

  it('contains only a verified creation-state point if no trades exist',()=>{
    const result=replayMarketPriceHistory(stamped(creation()),[],WAD,6);
    expect(result.events).toEqual([]);
    expect(result.genesis).toHaveLength(1);
    expect(result.genesis[0]).toMatchObject({kind:'CREATE',at:30,price:0n,blockNumber:3});
    expect(result.formalVolume).toBe(0n);
  });
});

function providerFixture(options:{missingTimestamp?:boolean;reorg?:boolean;wrongCreation?:boolean;sharedTimestamp?:boolean}={}){
  const ranges:{address?:string;fromBlock?:number;toBlock?:number;topics?:unknown[]}[]=[];
  const source=event(iface,'GenesisTrade',[USER,true,WAD,WAD],options.sharedTimestamp?5:4);
  const trade=options.reorg?{...source,blockHash:hash(99)} as Log:source;
  const provider={
    async getBlock(value:'latest'|number){
      const number=value==='latest'?6:value;
      if(options.missingTimestamp && number===4)return null;
      return {number,timestamp:options.sharedTimestamp && number===4?30:number*10,hash:hash(number)};
    },
    async getLogs(filter:{address:string;fromBlock:number;toBlock:number;topics?:unknown[]}){
      ranges.push(filter);
      if(filter.address.toLowerCase()===FACTORY.toLowerCase())return options.wrongCreation?[]:
        [options.sharedTimestamp?{...creation(),blockNumber:4,blockHash:hash(4)} as Log:creation()];
      return [trade];
    },
  } as unknown as Provider;
  return {provider,ranges};
}

describe('bounded chain history discovery',()=>{
  it('locates creation using timestamp headers plus exact indexed market event, never block-zero log scanning',async()=>{
    const {provider,ranges}=providerFixture();
    const result=await readChainPriceHistory(provider,FACTORY,MARKET,30n,WAD);
    expect(result.creationBlock).toBe(3);expect(result.latestBlock).toBe(6);
    expect(ranges.every(r=>(r.fromBlock??0)>0)).toBe(true);
    expect(ranges[0]).toMatchObject({address:FACTORY,fromBlock:3,toBlock:3});
    expect(ranges[0].topics).toHaveLength(2);
    expect(ranges[1]).toMatchObject({address:MARKET,fromBlock:3,toBlock:6});
    expect(result.genesis[1].at).toBe(40);
  });
  it('fails closed without fabricating dates if historical headers or creation evidence are unavailable',async()=>{
    const missing=providerFixture({missingTimestamp:true});
    await expect(readChainPriceHistory(missing.provider,FACTORY,MARKET,30n,WAD)).rejects.toThrow('区块时间不可用');
    const noEvent=providerFixture({wrongCreation:true});
    await expect(readChainPriceHistory(noEvent.provider,FACTORY,MARKET,30n,WAD)).rejects.toThrow('创建事件');
  });
  it('handles multiple blocks sharing the creation timestamp and verifies the exact factory event',async()=>{
    const {provider,ranges}=providerFixture({sharedTimestamp:true});
    const result=await readChainPriceHistory(provider,FACTORY,MARKET,30n,WAD);
    expect(ranges[0]).toMatchObject({fromBlock:3,toBlock:4});
    expect(result.creationBlock).toBe(4);
    expect(result.genesis.map(point=>point.at)).toEqual([30,50]);
  });
  it('rejects a log whose block hash no longer matches the canonical header',async()=>{
    const {provider}=providerFixture({reorg:true});
    await expect(readChainPriceHistory(provider,FACTORY,MARKET,30n,WAD)).rejects.toThrow('重组');
  });
});
