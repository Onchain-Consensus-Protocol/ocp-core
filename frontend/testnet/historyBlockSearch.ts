export interface TimestampHeader {number:number;timestamp:number}

/** Locate exact timestamp bounds. A sampled rate only seeds the search: every
 * returned boundary is bracketed by real headers and finished by binary search.
 * Requires the chain's usual nondecreasing block timestamps. */
export async function findTimestampRange(
 head:TimestampHeader,createdAt:bigint,header:(n:number)=>Promise<TimestampHeader>,
):Promise<{first:number;last:number}>{
 const valid=(h:TimestampHeader)=>Number.isSafeInteger(h.number)&&h.number>=1&&Number.isSafeInteger(h.timestamp)&&h.timestamp>=0;
 if(!valid(head)||head.number>=Number.MAX_SAFE_INTEGER||createdAt<0n||createdAt>BigInt(head.timestamp))throw Error('Invalid creation timestamp or chain head');
 // Retain a small local cache as well: both bounds often inspect adjacent blocks.
 const cache=new Map<number,TimestampHeader>([[head.number,head]]);
 const read=async(n:number)=>{
  let h=cache.get(n);
  if(!h){h=await header(n);if(!valid(h)||h.number!==n)throw Error('Invalid block header');cache.set(n,h);}
  return h;
 };
 const oldest=await read(1);
 if(createdAt<BigInt(oldest.timestamp))throw Error('Creation timestamp predates block one');
 const sample=await read(Math.max(1,head.number-10000));
 if(sample.timestamp>head.timestamp||oldest.timestamp>sample.timestamp)throw Error('Nonmonotonic block timestamps');
 const elapsed=BigInt(head.timestamp-sample.timestamp),distance=BigInt(head.number-sample.number);
 const predict=(target:bigint)=>{
  if(elapsed===0n)return head.number;
  const estimate=BigInt(head.number)-(BigInt(head.timestamp)-target)*distance/elapsed;
  return Number(estimate<1n?1n:estimate>BigInt(head.number)?BigInt(head.number):estimate);
 };
 const lowerBound=async(target:bigint)=>{
  if(target>BigInt(head.timestamp))return head.number+1;
  if(target<=BigInt(oldest.timestamp))return 1;
  const guess=predict(target);
  let low:number,high:number;
  if(BigInt((await read(guess)).timestamp)>=target){
   high=guess;low=1;
   for(let step=1,iterations=0;;step=Math.min(head.number,step*2)){
    if(++iterations>64)throw Error('Timestamp bracket search exceeded bounds');
    const n=Math.max(1,guess-step);
    if(BigInt((await read(n)).timestamp)<target){low=n;break;}
    high=n;
    if(n===1)return 1;
   }
  }else{
   low=guess;high=head.number;
   for(let step=1,iterations=0;;step=Math.min(head.number,step*2)){
    if(++iterations>64)throw Error('Timestamp bracket search exceeded bounds');
    const n=Math.min(head.number,guess+step);
    if(BigInt((await read(n)).timestamp)>=target){high=n;break;}
    low=n;
    if(n===head.number)throw Error('Timestamp boundary unavailable');
   }
  }
  for(let iterations=0;high-low>1;iterations++){
   if(iterations>=64)throw Error('Timestamp binary search exceeded bounds');
   const middle=low+Math.floor((high-low)/2);
   if(BigInt((await read(middle)).timestamp)>=target)high=middle;else low=middle;
  }
  return high;
 };
 const first=await lowerBound(createdAt);
 const last=(await lowerBound(createdAt+1n))-1;
 return {first,last}; // first > last means a timestamp gap, never a guessed match.
}
