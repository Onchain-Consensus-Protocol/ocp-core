/** Mirrors OCPCore fee allocation, without treating a paid liability as zero lifetime fees. */
export function protocolFeeAttribution(v:{total:bigint;yesDistributed:bigint;noDistributed:bigint;invalidDistributed:bigint;yesStake:bigint;noStake:bigint;settled:boolean;outcome:number}):bigint{
 const distributed=[v.yesDistributed,v.noDistributed,v.invalidDistributed];
 if(distributed.some(n=>n<0n||n>v.total))throw Error('Inconsistent Core fee snapshot');
 if(!v.settled)return v.total-v.invalidDistributed;
 if(v.outcome<1||v.outcome>3)throw Error('Invalid Core outcome');
 const eligible=v.outcome===1?v.yesStake:v.outcome===2?v.noStake:v.yesStake+v.noStake;
 return v.total-(eligible>0n?distributed[v.outcome-1]:0n);
}
