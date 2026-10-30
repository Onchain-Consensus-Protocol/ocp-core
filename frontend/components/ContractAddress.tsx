import React,{useState} from 'react';
import type {Language} from '../types';
export function ContractAddress({address,label,explorer,lang}:{address:string;label:string;explorer:string;lang:Language}){
 const [status,setStatus]=useState<'idle'|'copied'|'failed'>('idle');
 async function copy(){
  try{await navigator.clipboard.writeText(address);setStatus('copied');}
  catch{setStatus('failed');}
 }
 return <div className="mt-4 pt-3 border-t border-border text-xs space-y-2">
  <div className="text-text-muted">{label}</div>
  <div className="flex flex-wrap items-center gap-2">
   <a className="text-accent underline break-all font-mono min-w-0" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">{address}</a>
   <button type="button" className="border border-border rounded px-2 py-1 shrink-0" onClick={()=>void copy()}>{status==='copied'?(lang==='zh'?'已复制':'Copied'):(lang==='zh'?'复制':'Copy')}</button>
  </div>
  {status==='failed'&&<p role="status" className="text-text-muted">{lang==='zh'?'复制失败，请手动复制地址。':'Copy failed. Please copy the address manually.'}</p>}
 </div>;
}
