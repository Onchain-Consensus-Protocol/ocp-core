import {describe,it,expect,vi} from 'vitest';
import {Interface,id,ZeroHash,type Provider,type Log} from 'ethers';
import {appendEarlyReason,decodeEarlyReason,normalizeEarlyReason,readPublishedEarlyReason,type PublishedEarlyReason} from './chainClient';
import coreAbi from './abi/OCPCore.json';
import factoryAbi from './abi/TopicMarketStockFactory.json';
import routerAbi from './abi/TopicMarketAssetRouter.json';
const factory='0x1111111111111111111111111111111111111111',market='0x2222222222222222222222222222222222222222',vault='0x3333333333333333333333333333333333333333',router='0x4444444444444444444444444444444444444444',proposer='0x5555555555555555555555555555555555555555';
const core=new Interface(coreAbi),fi=new Interface(factoryAbi),ri=new Interface(routerAbi),reason='公开原因：已满足条件 <script>文字</script>',reasonHash=id(reason);
const hash=(n:number)=>id(`block${n}`);
function fixture(routed=false){
 const config:PublishedEarlyReason={factory,market,vault,router,createdAt:30n,requestId:1n,proposedAt:40n,proposer,requestedOutcome:2,processAfter:3640n,bond:125n,reasonHash};
 const log=(abi:Interface,name:string,args:unknown[],address:string,blockNumber:number)=>({...abi.encodeEventLog(abi.getEvent(name)!,args),address,blockNumber,blockHash:hash(blockNumber),transactionHash:id(`tx${blockNumber}`),transactionIndex:0,index:0,removed:false}) as unknown as Log;
 const origin=log(fi,'MarketCreated',[market,proposer,router,vault,30n,100n,200n,300n,300n,1n],factory,3);
 const event=log(core,'EarlyTerminationProposed',[1n,proposer,2,3640n,125n,reasonHash],vault,4);
 const request={market,action:11,paymentAsset:market,inputAmount:125n,quantity:0n,minCollateral:125n,businessLimit:125n,minOutput:0n,deadline:100n,side:1,graduationIntent:0,reasonHash};
 const tx={from:proposer,to:routed?router:vault,hash:event.transactionHash,blockHash:hash(4),data:appendEarlyReason(routed?ri.encodeFunctionData('execute',[request]):core.encodeFunctionData('proposeEarlyTermination',[2,reasonHash]),reason)};
 const p={getBlock:vi.fn(async(n:number|'latest')=>{const number=n==='latest'?8:n;return {number,timestamp:number*10,hash:hash(number)};}),
  getLogs:vi.fn(async(filter:{address:string;fromBlock:number;toBlock:number})=>{expect(filter.fromBlock).toBeGreaterThanOrEqual(3);expect(filter.toBlock).toBeLessThanOrEqual(8);return filter.address.toLowerCase()===factory?[origin]:[event];}),
  getTransaction:vi.fn(async()=>tx),call:vi.fn(async()=>ri.encodeFunctionResult('factory',[factory]))};
 return {p,config,tx,event};
}
describe('shared early reason calldata provenance',()=>{
 it('roundtrips versioned UTF8 with bounded text and rejects missing, mismatched or damaged envelopes',()=>{
  const data=appendEarlyReason('0x12345678',reason);expect(decodeEarlyReason(data,reasonHash)).toBe(reason);
  expect(decodeEarlyReason('0x12345678',reasonHash)).toBeUndefined();expect(decodeEarlyReason(data,id('other'))).toBeUndefined();expect(decodeEarlyReason(data.slice(0,-2),reasonHash)).toBeUndefined();
  expect(()=>normalizeEarlyReason(' '.repeat(10))).toThrow();expect(()=>appendEarlyReason('0x','x'.repeat(1001))).toThrow();
  expect(decodeEarlyReason(appendEarlyReason('0x','文'.repeat(1000)),id('文'.repeat(1000)))).toBe('文'.repeat(1000));
 });
 for(const routed of [false,true])it(`reads public preimage from ${routed?'router':'direct Core'} transaction for an independent viewer`,async()=>{
  const f=fixture(routed);expect(await readPublishedEarlyReason(f.p as unknown as Provider,f.config)).toBe(reason);
  expect(f.p.getTransaction).toHaveBeenCalledWith(f.event.transactionHash);
  const coreScan=f.p.getLogs.mock.calls.find(([filter])=>filter.address===vault)![0];expect(coreScan.fromBlock).toBe(4);expect(coreScan.toBlock).toBe(4);
 });
 for(const invalid of ['actor','block','event','preimage','target'] as const)it(`does not attribute text when ${invalid} binding fails`,async()=>{
  const f=fixture();
  if(invalid==='actor')f.tx.from=market;
  if(invalid==='block')f.tx.blockHash=hash(7);
  if(invalid==='event')f.config.requestId=2n;
  if(invalid==='preimage')f.tx.data=appendEarlyReason(core.encodeFunctionData('proposeEarlyTermination',[2,reasonHash]),'different');
  if(invalid==='target')f.tx.to=market;
  expect(await readPublishedEarlyReason(f.p as unknown as Provider,f.config)).toBeUndefined();
 });
 it('rejects a routed transaction naming another market even with the correct public hash',async()=>{
  const f=fixture(true),q=ri.decodeFunctionData('execute',f.tx.data)[0];
  f.tx.data=appendEarlyReason(ri.encodeFunctionData('execute',[[factory,q.action,q.paymentAsset,q.inputAmount,q.quantity,q.minCollateral,q.businessLimit,q.minOutput,q.deadline,q.side,q.graduationIntent,q.reasonHash]]),reason);
  expect(await readPublishedEarlyReason(f.p as unknown as Provider,f.config)).toBeUndefined();
 });
});
