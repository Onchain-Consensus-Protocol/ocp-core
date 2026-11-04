import {describe,it,expect} from 'vitest';
import {findTimestampRange} from './historyBlockSearch';
const run=async(size:number,time:(n:number)=>number,target:number)=>{
 const calls=new Set<number>();
 const result=await findTimestampRange({number:size,timestamp:time(size)},BigInt(target),async n=>{
  expect(n).toBeGreaterThanOrEqual(1);expect(n).toBeLessThanOrEqual(size);calls.add(n);return {number:n,timestamp:time(n)};
 });
 return {result,calls};
};
describe('exact sampled timestamp block search',()=>{
 it('uses fewer unique headers than two full binary searches on a recent 150m-block chain',async()=>{
  const size=150_000_000,time=(n:number)=>1_000_000+n*2,target=time(size-3500);
  const {result,calls}=await run(size,time,target);expect(result).toEqual({first:size-3500,last:size-3500});
  const baseline=new Set<number>();
  for(const t of [target,target+1]){let low=1,high=size+1;while(low<high){const middle=low+Math.floor((high-low)/2);baseline.add(middle);if(time(middle)>=t)high=middle;else low=middle+1;}}
  expect(calls.size).toBeLessThan(baseline.size);expect(calls.size).toBeLessThan(12);
 });
 it('returns the full run of equal timestamps, including at the head',async()=>{
  expect((await run(1000,n=>Math.floor(n/17),30)).result).toEqual({first:510,last:526});
  expect((await run(1000,n=>Math.floor(n/17),58)).result).toEqual({first:986,last:1000});
 });
 it('returns an exact empty interval for a timestamp gap',async()=>{
  expect((await run(1000,n=>n*3,301)).result).toEqual({first:101,last:100});
 });
 it('handles a fully stalled sampled rate without division by zero',async()=>{
  const time=(n:number)=>Math.min(n,20_000);
  expect((await run(100_000,time,19_990)).result).toEqual({first:19_990,last:19_990});
  expect((await run(100_000,time,20_000)).result).toEqual({first:20_000,last:100_000});
 });
 it('expands to exact bounds across an abrupt rate change',async()=>{
  const size=150_000_000,time=(n:number)=>n<=size-5000?n: size-5000+(n-(size-5000))*100;
  for(const block of [1,10_000,size-9000,size-4999,size-1]){
   expect((await run(size,time,time(block))).result).toEqual({first:block,last:block});
  }
 });
 it('handles one-block chains and rejects timestamps outside the available chain',async()=>{
  expect((await run(1,()=>10,10)).result).toEqual({first:1,last:1});
  await expect(run(1,()=>10,9)).rejects.toThrow('predates');
  await expect(run(1,()=>10,11)).rejects.toThrow('Invalid');
 });
 it('matches exhaustive bounds on irregular timestamps with gaps and plateaus',async()=>{
  const timestamps=Array.from({length:350},(_,i)=>50+Math.floor(i/7)*3+Math.floor(i/31));
  for(let target=50;target<=timestamps.at(-1)!;target++){
   const first=timestamps.findIndex(t=>t>=target)+1;
   const next=timestamps.findIndex(t=>t>=target+1);
   expect((await run(timestamps.length,n=>timestamps[n-1],target)).result).toEqual({first,last:next===-1?timestamps.length:next});
  }
 });
 it('rejects malformed header responses',async()=>{
  await expect(findTimestampRange({number:100,timestamp:200},100n,async n=>({number:n+1,timestamp:n}))).rejects.toThrow('Invalid block header');
 });
});
