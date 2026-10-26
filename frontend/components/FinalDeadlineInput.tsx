import React from 'react';
import {deadlineTimeZone,formatLocalDeadline,parseLocalDeadline} from '../shared/deadlineDate';
export function FinalDeadlineInput({lang,value,onChange,now}:{lang:'zh'|'en';value:string;onChange:(value:string)=>void;now:number}){
 const zh=lang==='zh';
 return <div><label className="block text-sm">{zh?'最终截止（Core／话题）':'Final deadline (Core / topic)'}<input aria-label="Core deadline" type="datetime-local" lang={zh?'zh-CN':'en'} required step="60" max="9999-12-31T23:59" min={formatLocalDeadline(Math.floor(now)+14460)} value={value} onChange={e=>onChange(e.target.value)} className="block w-full rounded-lg border p-3 mt-2"/></label><p className="mt-2 text-xs text-slate-500">{zh?'时区：':'Time zone: '}{deadlineTimeZone(parseLocalDeadline(value))}</p></div>;
}
