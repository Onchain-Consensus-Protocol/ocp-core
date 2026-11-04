import {describe,it,expect} from 'vitest';
import {Interface,type Provider} from 'ethers';
import marketAbi from './abi/TopicMarket.json';
import coreAbi from './abi/OCPCore.json';
import {readHolders} from './holders';
import type {ChainPriceHistory} from './priceHistory';
import type {CoreHistory} from './coreHistory';
import type {MarketSummary} from './chainClient';
const A='0x1111111111111111111111111111111111111111',B='0x2222222222222222222222222222222222222222',M='0x3333333333333333333333333333333333333333',C='0x4444444444444444444444444444444444444444',LP='0x5555555555555555555555555555555555555555';
const iface=new Interface([...marketAbi.filter(x=>x.type!=='constructor'),...coreAbi.filter(x=>x.type!=='constructor'),'function balanceOf(address) view returns(uint256)']),token=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const event=(kind:string,actor:string)=>({kind,actor,blockNumber:5});
const history=(events:unknown[])=>({events,latestBlock:10,complete:true} as ChainPriceHistory);
const market={address:M,vault:C} as MarketSummary;
function provider(values:(name:string,account:string)=>unknown[],logs:unknown[]=[]){return {getNetwork:async()=>({chainId:46630n}),getBlock:async()=>({hash:'0x'+'a'.repeat(64)}),getLogs:async()=>logs,call:async(tx:{data:string})=>{const f=iface.getFunction(tx.data.slice(0,10))!;const args=iface.decodeFunctionData(f,tx.data);return iface.encodeFunctionResult(f,values(f.name,String(args.length?args[0]:'')));}} as unknown as Provider;}
describe('chain holder discovery and current balances',()=>{
 it('excludes Genesis traders who no longer hold gToken',async()=>{const p=provider((name,a)=>[a===A?0n:7n]);const result=await readHolders(p,market,history([event('GENESIS_BUY',A),event('GENESIS_BUY',B)]),undefined,'GENESIS');expect(result.rows.map(r=>r.address)).toEqual([B]);});
 it('includes transferred LP recipients and escrowed graduation rights',async()=>{const encoded=token.encodeEventLog(token.getEvent('Transfer')!,[A,B,4n]);const logs=[{...encoded,blockNumber:6,removed:false}];const p=provider((name,a)=>name==='lpToken'?[LP]:name==='shares'?[a===A?3n:0n]:name==='balanceOf'?[a===A?2n:4n]:[0n],logs);const result=await readHolders(p,market,history([event('MATERIALIZE_LP',A)]),undefined,'FORMAL');expect(result.rows.find(r=>r.address===A)?.lp).toBe(5n);expect(result.rows.find(r=>r.address===B)?.lp).toBe(4n);});
 it('does not count retained historical Core principal after withdrawal',async()=>{const h=history([]),core={events:[event('CORE_STAKE',A),event('CORE_STAKE',B),event('CLAIM_CORE',A)],latestBlock:10,complete:true} as CoreHistory;const p=provider(()=>[0n,3n,4n]);const result=await readHolders(p,market,h,core,'CORE');expect(result.rows.map(r=>r.address)).toEqual([B]);expect(result.rows[0].invalid).toBe(4n);});
});
