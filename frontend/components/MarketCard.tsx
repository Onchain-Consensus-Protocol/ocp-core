import React from 'react';
export function MarketCard({symbol,phase,title,status,trend,footer,disabled,onClick}:{symbol:string;phase:string;title:string;status:React.ReactNode;trend?:React.ReactNode;footer:React.ReactNode;disabled?:boolean;onClick:()=>void}){
 return <button type="button" className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-orange-300 space-y-4 min-w-0 disabled:opacity-50" disabled={disabled} onClick={onClick}>
  <div className="flex justify-between gap-3 text-xs"><strong>{symbol}</strong><span>{phase}</span></div>
  <h3 className="text-lg font-bold break-words">{title}</h3>
  {status}
  {trend}
  <p className="text-xs text-slate-500">{footer}</p>
 </button>;
}
