import {describe,it,expect,vi} from 'vitest';
import {approveThenExecute,ApprovalFlowError,withPendingAction} from './approvalFlow';
const deferred=<T>()=>{let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tx=(status:unknown=1)=>({hash:'0xapprove',wait:vi.fn(async()=>({status}))});
describe('one page action approval orchestration',()=>{
 it('waits for successful exact approval and allowance before asking for the business signature',async()=>{
  const approval=deferred<unknown>(),order:string[]=[];
  const approve=vi.fn(async()=>{order.push('approve');return {hash:'0xa',wait:()=>{order.push('wait');return approval.promise;}};});
  const execute=vi.fn(async()=>{order.push('execute');return tx();});
  const result=approveThenExecute({approve,execute,required:101n,allowance:async()=>{order.push('allowance');return 101n;},validate:()=>{order.push('validate');}});
  await vi.waitFor(()=>expect(approve).toHaveBeenCalledTimes(1));expect(execute).not.toHaveBeenCalled();
  approval.resolve({status:1});await result;
  expect(order).toEqual(['validate','approve','wait','validate','allowance','validate','execute']);
 });
 for(const status of [0,undefined,null])it(`does not execute after failed/missing approval status ${status}`,async()=>{
  const execute=vi.fn(async()=>tx());await expect(approveThenExecute({approve:async()=>({hash:'a',wait:async()=>({status})}),execute,validate:()=>{}})).rejects.toMatchObject({approvalConfirmed:false});expect(execute).not.toHaveBeenCalled();
 });
 for(const failure of ['cancelled','reverted','receipt unavailable'])it(`stops on approval ${failure}`,async()=>{
  const execute=vi.fn(async()=>tx()),approve=async()=>{if(failure==='cancelled')throw new Error(failure);return {hash:'a',wait:async()=>{throw new Error(failure);}};};
  await expect(approveThenExecute({approve,execute,validate:()=>{}})).rejects.toMatchObject({approvalConfirmed:false});expect(execute).not.toHaveBeenCalled();
 });
 for(const change of ['wallet session','market','amount','side','payment asset','reason','expired quote','unmounted page'])it(`stops when ${change} changes during approval wait`,async()=>{
  let changed=false;const execute=vi.fn(async()=>tx());
  await expect(approveThenExecute({approve:async()=>({hash:'a',wait:async()=>{changed=true;return {status:1};}}),execute,validate:()=>{if(changed)throw new Error(change);}})).rejects.toMatchObject({approvalConfirmed:true,message:change});expect(execute).not.toHaveBeenCalled();
 });
 it('checks allowance after confirmation instead of assuming a successful receipt changed it',async()=>{
  const execute=vi.fn(async()=>tx());await expect(approveThenExecute({approve:async()=>tx(),execute,validate:()=>{},required:101n,allowance:async()=>100n})).rejects.toMatchObject({approvalConfirmed:true,message:'ALLOWANCE_NOT_UPDATED'});expect(execute).not.toHaveBeenCalled();
 });
 it('keeps approval success visible if business broadcast or mined receipt fails',async()=>{
  await expect(approveThenExecute({approve:async()=>tx(),execute:async()=>{throw new Error('business rejected');},validate:()=>{}})).rejects.toMatchObject({approvalConfirmed:true});
  const business=await approveThenExecute({approve:async()=>tx(),execute:async()=>tx(0),validate:()=>{}});
  await expect(business.wait()).rejects.toBeInstanceOf(ApprovalFlowError);await expect(business.wait()).rejects.toMatchObject({approvalConfirmed:true,message:'TRANSACTION_NOT_CONFIRMED'});
 });
 it('skips approval for existing allowance and still validates before execution',async()=>{
  const execute=vi.fn(async()=>tx()),validate=vi.fn();const result=await approveThenExecute({execute,validate});expect(validate).toHaveBeenCalledOnce();expect(execute).toHaveBeenCalledOnce();await expect(result.wait()).resolves.toMatchObject({status:1});
 });
 it('holds the click lock until the business receipt, not merely its signature',async()=>{
  const lock={current:false},businessReceipt=deferred<unknown>(),execute=vi.fn(async()=>({hash:'b',wait:()=>businessReceipt.promise}));
  const run=()=>withPendingAction(lock,async()=>{const business=await approveThenExecute({approve:async()=>tx(),execute,validate:()=>{}});return business.wait();});
  const first=run();await vi.waitFor(()=>expect(execute).toHaveBeenCalledOnce());expect(lock.current).toBe(true);
  await expect(run()).resolves.toBeUndefined();expect(execute).toHaveBeenCalledOnce();businessReceipt.resolve({status:1});await first;expect(lock.current).toBe(false);
 });
 it('prevents duplicate clicks across the entire approval/business sequence and releases on failure',async()=>{
  const lock={current:false},approval=deferred<unknown>(),execute=vi.fn(async()=>tx());
  const run=()=>withPendingAction(lock,()=>approveThenExecute({approve:async()=>({hash:'a',wait:()=>approval.promise}),execute,validate:()=>{}}));
  const first=run();expect(lock.current).toBe(true);await expect(run()).resolves.toBeUndefined();expect(execute).not.toHaveBeenCalled();
  approval.reject(new Error('cancel'));await expect(first).rejects.toThrow('cancel');expect(lock.current).toBe(false);expect(execute).not.toHaveBeenCalled();
 });
});
