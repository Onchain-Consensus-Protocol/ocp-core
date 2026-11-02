import React from 'react';
export function MarketCard({symbol,phase,title,status,trend,footer,disabled,onClick}:{symbol:string;phase:string;title:string;status:React.ReactNode;trend?:React.ReactNode;footer:React.ReactNode;disabled?:boolean;onClick:()=>void}){
 return <button type="button" className="group flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-3.5 text-left hover:border-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-50" disabled={disabled} onClick={onClick}>
  <div className="flex w-full items-center justify-between gap-3 text-xs"><strong className="rounded-md bg-slate-100 px-1.5 py-0.5 tracking-wide">{symbol}</strong><span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-500">{phase}</span></div>
  <h3 className="mt-2 mb-3 w-full break-words text-base font-bold leading-6 line-clamp-2" title={title}>{title}</h3>
  <div className="w-full flex-1 space-y-2.5">{trend&&<div>{trend}</div>}{status}</div>
  <div className="mt-3 w-full border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500">{footer}</div>
 </button>;
}
