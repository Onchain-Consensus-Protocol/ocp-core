import React,{useEffect,useId,useRef,useState} from 'react';
import {marketPricePercent} from './marketPricePercent';
export interface TimePricePoint {at:number;yes:number;no?:number}
interface Props {points:TimePricePoint[];probability:boolean;unit:string;lang:'zh'|'en';asOf?:number}
const finite=(p:TimePricePoint)=>Number.isFinite(p.at)&&Number.isFinite(p.yes)&&(p.no===undefined||Number.isFinite(p.no));
export function chartWindow(start:number,end:number,domainStart:number,domainEnd:number){
 const domainSpan=Math.max(1,domainEnd-domainStart),span=Math.max(Math.min(10,domainSpan),Math.min(domainSpan,end-start));
 const left=Math.max(domainStart,Math.min(start,domainEnd-span));return {start:left,end:left+span};
}
export function stepPoints(points:TimePricePoint[],start:number,end:number){
 if(!points.length)return [];
 const before=points.filter(p=>p.at<=start).at(-1);const inside=points.filter(p=>p.at>start&&p.at<=end);
 const result:TimePricePoint[]=before?[{...before,at:start},...inside]:inside;
 const last=result.at(-1);if(last&&last.at<end)result.push({...last,at:end});return result;
}
export function TimePriceChart({points:input,probability,unit,lang,asOf}:Props){
 const points=input.filter(finite),t=(zh:string,en:string)=>lang==='zh'?zh:en;
 const domainStart=points[0]?.at??0,last=points.at(-1);
 const domainEnd=Math.max(domainStart+1,last?.at??0,asOf??0);
 const [preset,setPreset]=useState(0);
 const [view,setView]=useState<{start:number;end:number}|null>(null),[hover,setHover]=useState<number|null>(null),[width,setWidth]=useState(800);
 const ref=useRef<SVGSVGElement>(null),wrap=useRef<HTMLDivElement>(null),drag=useRef<{x:number;start:number;end:number}|null>(null),clip=useId();
 const window=view?chartWindow(view.start,view.end,domainStart,domainEnd):{start:domainStart,end:domainEnd};
 const h=width<600?270:350,left=12,right=104,top=22,bottom=34,plotWidth=Math.max(1,width-left-right),plotHeight=h-top-bottom;
 useEffect(()=>{if(!wrap.current||typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(280,entry.contentRect.width)));observer.observe(wrap.current);return()=>observer.disconnect();},[points.length>0]);
 useEffect(()=>{const svg=ref.current;if(!svg)return;const wheel=(event:WheelEvent)=>{event.preventDefault();setPreset(-1);const box=svg.getBoundingClientRect();const fraction=Math.max(0,Math.min(1,((event.clientX-box.left)/box.width*width-left)/plotWidth));setView(current=>{const old=current?chartWindow(current.start,current.end,domainStart,domainEnd):{start:domainStart,end:domainEnd};const span=(old.end-old.start)*(event.deltaY<0?.75:1.35),anchor=old.start+fraction*(old.end-old.start);return chartWindow(anchor-span*fraction,anchor+span*(1-fraction),domainStart,domainEnd);});};svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel);},[domainStart,domainEnd,width,plotWidth]);
 if(!points.length)return <div className="h-64 flex items-center justify-center text-sm text-text-muted" role="status">{t('等待真实行情记录…','Waiting for verified price history…')}</div>;
 const visible=stepPoints(points,window.start,window.end),values=visible.flatMap(p=>probability?[p.yes,p.no??1-p.yes]:[p.yes]);
 const low=Math.min(...values),high=Math.max(...values),padding=Math.max((high-low)*.14,probability ? .05 :Math.abs(high)*.05,Number.EPSILON);
 const min=Math.max(0,low-padding),max=probability?Math.min(1,high+padding):high+padding;
 const x=(at:number)=>left+(at-window.start)/(window.end-window.start)*plotWidth;
 const y=(v:number)=>top+(max-v)/Math.max(Number.EPSILON,max-min)*plotHeight;
 const fmt=(v:number)=>probability?marketPricePercent(v):v===0?'0':Math.abs(v)<.0001?v.toExponential(3):v.toLocaleString('en-US',{maximumSignificantDigits:6});
 const path=(no:boolean)=>visible.map((p,i)=>{const py=y(no?(p.no??1-p.yes):p.yes);return i===0?`M ${x(p.at)} ${py}`:`H ${x(p.at)} V ${py}`;}).join(' ');
 const end=visible.at(-1)!,labels=[{name:probability?'YES':'gToken',v:end.yes,color:'#ffad66'},...(probability?[{name:'NO',v:end.no??1-end.yes,color:'#8664ff'}]:[])];
 const labelY=labels.map(p=>y(p.v));if(labelY.length===2&&Math.abs(labelY[0]-labelY[1])<48){const center=(labelY[0]+labelY[1])/2;labelY[0]=center-24;labelY[1]=center+24;}
 const hoverTime=hover===null?null:window.start+hover*(window.end-window.start),selected=hoverTime===null?undefined:points.filter(p=>p.at<=hoverTime).at(-1);
 const time=(at:number)=>new Date(at*1000).toLocaleTimeString(lang==='zh'?'zh-CN':'en-US',{hour:'2-digit',minute:'2-digit'});
 const coordinate=(event:React.PointerEvent<SVGSVGElement>)=>{const box=event.currentTarget.getBoundingClientRect();return Math.max(0,Math.min(1,((event.clientX-box.left)/box.width*width-left)/plotWidth));};
 return <div ref={wrap} className="min-w-0" data-testid="time-price-chart"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-text-muted">{probability?t('市场价格走势','Market price history'):`gToken · ${unit}`}</span><div className="flex gap-1">{[3600,21600,86400,0].map((seconds,i)=><button type="button" key={seconds} aria-pressed={preset===seconds} className={"px-2 py-1 rounded border hover:text-accent "+(preset===seconds?"border-accent text-accent":"border-border text-text-muted")} onClick={()=>{setPreset(seconds);setView(seconds?chartWindow(domainEnd-seconds,domainEnd,domainStart,domainEnd):null);setHover(null);}}>{['1H','6H','1D','ALL'][i]}</button>)}</div></div>
 <svg ref={ref} viewBox={`0 0 ${width} ${h}`} className="w-full block mt-2 select-none" role="img" aria-label={t('按成交时间绘制的价格图，滚轮缩放、拖动查看','Price chart by trade time. Scroll to zoom and drag to pan.')} style={{touchAction:'pan-y',cursor:'crosshair'}} onPointerDown={e=>{drag.current={x:e.clientX,...window};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>{drag.current=null;setHover(coordinate(e));}} onPointerCancel={()=>{drag.current=null;}} onPointerLeave={()=>{if(!drag.current)setHover(null);}} onPointerMove={e=>{if(drag.current){setPreset(-1);const box=e.currentTarget.getBoundingClientRect(),shift=(e.clientX-drag.current.x)/(box.width*plotWidth/width)*(drag.current.end-drag.current.start);setView(chartWindow(drag.current.start-shift,drag.current.end-shift,domainStart,domainEnd));setHover(null);}else setHover(coordinate(e));}}>
 <defs><clipPath id={clip}><rect x={left-2} y={top-5} width={plotWidth+4} height={plotHeight+10}/></clipPath></defs>
 {[0,1,2,3,4].map(i=>{const v=min+(max-min)*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" opacity=".45"/>{!labelY.some(py=>Math.abs(Math.max(top+14,Math.min(h-bottom-14,py))-y(v))<32)&&<text x={width-right+12} y={y(v)+4} fontSize="11" fill="currentColor" className="text-text-muted">{fmt(v)}</text>}</g>;})}
 <g clipPath={`url(#${clip})`}><path d={path(false)} stroke="#ffad66" fill="none" strokeWidth="2.3" strokeLinejoin="round"/>{probability&&<path d={path(true)} stroke="#8664ff" fill="none" strokeWidth="2.3" strokeLinejoin="round"/>}{hover!==null&&<line x1={left+hover*plotWidth} x2={left+hover*plotWidth} y1={top} y2={h-bottom} stroke="currentColor" className="text-text-muted" strokeDasharray="3 4"/>}</g>
 {labels.map((p,i)=>{const py=Math.max(top+14,Math.min(h-bottom-14,labelY[i]));return <g key={p.name}><circle cx={width-right} cy={y(p.v)} r="4" fill={p.color}/><text x={width-right+12} y={py-8} fill="currentColor" className="text-text" fontSize="11" fontWeight="600">{p.name}</text><rect x={width-right+8} y={py-2} rx="9" width="91" height="23" fill={p.color}/><text x={width-right+53} y={py+14} textAnchor="middle" fill="#101217" fontSize="11" fontWeight="700">{fmt(p.v)}</text></g>;})}
 {[0,1,2,3].map(i=>{const at=window.start+(window.end-window.start)*i/3;return <text key={i} x={x(at)} y={h-9} textAnchor={i===0?'start':i===3?'end':'middle'} fontSize="11" fill="currentColor" className="text-text-muted">{time(at)}</text>;})}
 </svg><div className="min-h-5 text-[10px] text-text-muted font-mono">{selected&&hoverTime!==null?`${new Date(hoverTime*1000).toLocaleString(lang==='zh'?'zh-CN':'en-US')} · ${probability?'YES ':''}${fmt(selected.yes)}${probability?` · NO ${fmt(selected.no??1-selected.yes)}`:` ${unit}`}`:t('滚轮缩放 · 拖动查看 · 悬停查看成交价格','Scroll to zoom · Drag to pan · Hover to inspect')}</div></div>;
}
