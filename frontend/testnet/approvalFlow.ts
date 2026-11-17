export interface FlowTransaction {hash:string;wait:()=>Promise<unknown>}
export type ApprovalProgress='approval-sign'|'approval-pending'|'approval-confirmed'|'business-sign';
export class ApprovalFlowError extends Error {
  constructor(public readonly original:unknown,public readonly approvalConfirmed:boolean){super(original instanceof Error?original.message:String(original));this.name='ApprovalFlowError';}
}
export function requireSuccessfulReceipt(receipt:unknown):void {
  if(!receipt || (receipt as {status?:unknown}).status!==1)throw new Error('TRANSACTION_NOT_CONFIRMED');
}
/** One page action, two independent wallet transactions when approval is needed. Never reprices. */
export async function approveThenExecute(options:{
  approve?:()=>Promise<FlowTransaction>;execute:()=>Promise<FlowTransaction>;validate:()=>void|Promise<void>;
  allowance?:()=>Promise<bigint>;required?:bigint;progress?:(step:ApprovalProgress,hash?:string)=>void;
}):Promise<FlowTransaction>{
  let confirmed=false;
  try{
    await options.validate();
    if(options.approve){
      options.progress?.('approval-sign');const tx=await options.approve();options.progress?.('approval-pending',tx.hash);
      requireSuccessfulReceipt(await tx.wait());confirmed=true;options.progress?.('approval-confirmed',tx.hash);
      await options.validate();
      if(options.allowance && await options.allowance()<(options.required??0n))throw new Error('ALLOWANCE_NOT_UPDATED');
      await options.validate();
    }
    options.progress?.('business-sign');const tx=await options.execute();
    return {hash:tx.hash,wait:async()=>{try{const receipt=await tx.wait();requireSuccessfulReceipt(receipt);return receipt;}catch(error){throw new ApprovalFlowError(error,confirmed);}}};
  }catch(error){throw new ApprovalFlowError(error,confirmed);}
}
/** The lock is acquired synchronously, before the first wallet or RPC await. */
export async function withPendingAction<T>(lock:{current:boolean},action:()=>Promise<T>):Promise<T|undefined>{
  if(lock.current)return;lock.current=true;
  try{return await action();}finally{lock.current=false;}
}
