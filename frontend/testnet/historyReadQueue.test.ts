import {describe,it,expect,vi} from 'vitest';
import {createHistoryReadQueue} from './historyReadQueue';
const deferred=()=>{let resolve!:(v:number)=>void,reject!:(e:unknown)=>void;const promise=new Promise<number>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
describe('shared history read queue',()=>{
 it('caps total at two and background at one',async()=>{
  const q=createHistoryReadQueue(),a=deferred(),b=deferred(),c=deferred(),d=deferred();
  const la=vi.fn(()=>a.promise),lb=vi.fn(()=>b.promise),lc=vi.fn(()=>c.promise),ld=vi.fn(()=>d.promise);
  const pa=q.run('a','background',la),pb=q.run('b','background',lb),pc=q.run('c','foreground',lc),pd=q.run('d','foreground',ld);
  await tick();expect(la).toHaveBeenCalledOnce();expect(lc).toHaveBeenCalledOnce();expect(lb).not.toHaveBeenCalled();expect(ld).not.toHaveBeenCalled();
  c.resolve(3);await pc;await tick();expect(ld).toHaveBeenCalledOnce();expect(lb).not.toHaveBeenCalled();
  a.resolve(1);await pa;await tick();expect(lb).toHaveBeenCalledOnce();b.resolve(2);d.resolve(4);expect(await Promise.all([pb,pd])).toEqual([2,4]);
 });
 it('puts foreground ahead of waiting background with stable same-class order',async()=>{
  const q=createHistoryReadQueue(1),gate=deferred(),order:string[]=[];
  const p=q.run('active','foreground',()=>gate.promise),bg=q.run('bg','background',async()=>{order.push('bg');return 0;}),a=q.run('a','foreground',async()=>{order.push('a');return 1;}),b=q.run('b','foreground',async()=>{order.push('b');return 2;});
  gate.resolve(0);await Promise.all([p,bg,a,b]);expect(order).toEqual(['a','b','bg']);
 });
 it('coalesces queued and active keys using the original loader',async()=>{
  const q=createHistoryReadQueue(1),gate=deferred(),value=deferred(),load=vi.fn(()=>value.promise),other=vi.fn(async()=>99);
  const first=q.run('gate','foreground',()=>gate.promise),a=q.run('same','background',load),b=q.run('same','background',other);
  gate.resolve(0);await first;await tick();const c=q.run('same','foreground',other);value.resolve(7);
  expect(await Promise.all([a,b,c])).toEqual([7,7,7]);expect(load).toHaveBeenCalledOnce();expect(other).not.toHaveBeenCalled();
 });
 it('promotes queued background when foreground subscribes',async()=>{
  const q=createHistoryReadQueue(1),gate=deferred(),order:string[]=[];
  const p=q.run('active','foreground',()=>gate.promise),a=q.run('promoted','background',async()=>{order.push('promoted');return 1;}),b=q.run('other','foreground',async()=>{order.push('other');return 2;}),c=q.run('promoted','foreground',async()=>99);
  gate.resolve(0);await Promise.all([p,a,b,c]);expect(order).toEqual(['promoted','other']);
 });
 it('releases failed slots and keys for immediate retries including sync throws',async()=>{
  const q=createHistoryReadQueue(1),gate=deferred(),err=Error('RPC'),a=q.run('key','background',()=>gate.promise),b=q.run('key','foreground',async()=>99),all=Promise.allSettled([a,b]);
  gate.reject(err);expect(await all).toEqual([{status:'rejected',reason:err},{status:'rejected',reason:err}]);expect(await q.run('key','background',async()=>5)).toBe(5);
  await expect(q.run('throw','foreground',()=>{throw err;})).rejects.toBe(err);expect(await q.run('after','foreground',async()=>6)).toBe(6);
 });
 it('cancels one queued subscriber without cancelling the other',async()=>{
  const q=createHistoryReadQueue(1),gate=deferred(),ctrl=new AbortController(),load=vi.fn(async()=>7);
  const p=q.run('active','foreground',()=>gate.promise),cancel=q.run('same','background',load,ctrl.signal),keep=q.run('same','background',load),rejected=expect(cancel).rejects.toMatchObject({name:'AbortError'});
  ctrl.abort();await rejected;gate.resolve(0);await p;expect(await keep).toBe(7);expect(load).toHaveBeenCalledOnce();
 });
 it('skips a queued loader if all consumers cancel, and allows a fresh request',async()=>{
  const q=createHistoryReadQueue(1),gate=deferred(),ctrl=new AbortController(),load=vi.fn(async()=>7);
  const p=q.run('active','foreground',()=>gate.promise),cancel=q.run('same','background',load,ctrl.signal),rejected=expect(cancel).rejects.toMatchObject({name:'AbortError'});
  ctrl.abort();await rejected;gate.resolve(0);await p;await tick();expect(load).not.toHaveBeenCalled();expect(await q.run('same','foreground',load)).toBe(7);
 });
 it('does not cancel active provider work or duplicate it after consumer cancellation',async()=>{
  const q=createHistoryReadQueue(),gate=deferred(),ctrl=new AbortController(),load=vi.fn(()=>gate.promise),cancel=q.run('same','background',load,ctrl.signal);await tick();
  const rejected=expect(cancel).rejects.toMatchObject({name:'AbortError'});ctrl.abort();await rejected;
  const keep=q.run('same','foreground',async()=>99);gate.resolve(8);expect(await keep).toBe(8);expect(load).toHaveBeenCalledOnce();
 });
 it('never schedules already-aborted requests',async()=>{
  const q=createHistoryReadQueue(),ctrl=new AbortController(),load=vi.fn(async()=>1);ctrl.abort();
  await expect(q.run('key','foreground',load,ctrl.signal)).rejects.toMatchObject({name:'AbortError'});expect(load).not.toHaveBeenCalled();expect(await q.run('key','foreground',async()=>2)).toBe(2);
 });
 it('rejects invalid concurrency',()=>{for(const n of [0,-1,1.5,Infinity])expect(()=>createHistoryReadQueue(n)).toThrow();});
});
