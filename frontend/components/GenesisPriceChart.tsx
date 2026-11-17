import React, { useId, useRef, useState } from "react";
import { genesisPrice } from "./genesisDisplay";
import type { TopicMarketEvent } from "./topicMarketDemoModel";

interface Props { source?:"chain"; history?:{price:number;at:number;kind:string}[]; events: TopicMarketEvent[]; supply: number; k: number; zh: boolean; unit?:string }
const fmt = (v: number) => v === 0 ? "0" : Math.abs(v) < .0001 ? v.toExponential(2) : v.toLocaleString("en-US", { maximumSignificantDigits: 5 });

export function GenesisPriceChart({ history, events, supply, k, zh, unit="dUSDC", source }: Props) {
  const clipId=useId();
  const [verticalZoom,setVerticalZoom]=useState(1);
  const [viewport, setViewport] = useState<{start:number; size:number} | null>(null);
  const drag = useRef<{x:number; start:number} | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const trades = events.filter(e => (e.kind === "GENESIS_BUY" || e.kind === "GENESIS_SELL") && e.quantity !== undefined);
  // 从当前真实供应倒推窗口起点；事件窗口截断后也不伪造从零开始的历史。
  const delta = (e: TopicMarketEvent) => (e.kind === "GENESIS_BUY" ? 1 : -1) * e.quantity!;
  let runningSupply = Math.max(0, supply - trades.reduce((n, e) => n + delta(e), 0));
  const localPoints = [{ price: 2 * k * runningSupply, at: trades[0]?.at ?? 0, kind: "START" }];
  for (const e of trades) {
    runningSupply = Math.max(0, runningSupply + delta(e));
    localPoints.push({ price: 2 * k * runningSupply, at: e.at, kind: e.kind });
  }
  if(source==='chain'&&!history?.length)return <div className="border-t border-border pt-3" data-testid="genesis-price-chart"><strong className="text-xs">{zh?'Genesis价格走势':'Genesis price history'}</strong><p role="status" className="text-xs text-text-muted mt-3">{zh?'链上价格历史尚未加载。':'On-chain price history has not loaded.'}</p></div>;
  const allPoints=history?.length?history:localPoints;
  const size = Math.min(allPoints.length, viewport?.size ?? allPoints.length);
  const start = Math.max(0, Math.min(viewport?.start ?? 0, allPoints.length-size));
  const points = allPoints.slice(start, start+size);
  const zoom = (factor:number) => {
    setVerticalZoom(value=>Math.max(.25,Math.min(64,value/factor)));
    const nextSize=Math.max(Math.min(2,allPoints.length),Math.min(allPoints.length,Math.round(size*factor)));
    const anchor=hovered ?? size-1;
    const nextStart=Math.max(0,Math.min(allPoints.length-nextSize,Math.round(start+anchor-anchor*nextSize/size)));
    setViewport({start:nextStart,size:nextSize}); setHovered(null);
  };
  const tradeCount=history?Math.max(0,history.length-1):trades.length;
  const w = 680, h = 218, left = 62, right = 18, top = 18, bottom = 36;
  const low = Math.min(...points.map(p => p.price)), high = Math.max(...points.map(p => p.price));
  const padding = Math.max((high - low) * .12, Math.abs(high) * .04, Number.EPSILON);
  const center=(low+high)/2;
  const span=(high-low+2*padding)/verticalZoom;
  const min = Math.max(0,center-span/2), max = Math.max(min+Number.EPSILON,center+span/2);
  const x = (i: number) => left + i / Math.max(1, points.length - 1) * (w - left - right);
  const y = (v: number) => top + (max - v) / (max - min) * (h - top - bottom);
  const line = points.map((p, i) => `${x(i)},${y(p.price)}`).join(" ");
  const selectedIndex = hovered === null ? points.length - 1 : Math.min(hovered, points.length - 1);
  const selected = points[selectedIndex];
  return <div className="border-t border-border pt-3" data-testid="genesis-price-chart">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <strong>{zh ? "Genesis价格走势" : "Genesis price history"}</strong>
      <span className="text-text-muted font-mono">{zh ? `价格轴 ${unit}／枚` : `Price axis ${unit}/token`}</span>
    </div>
    <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
      <button type="button" className="border border-border rounded px-3 py-1" aria-label={zh?"放大价格图表":"Zoom in price chart"} disabled={size<=2&&verticalZoom>=64} onClick={()=>zoom(.5)}>＋</button>
      <button type="button" className="border border-border rounded px-3 py-1" aria-label={zh?"缩小价格图表":"Zoom out price chart"} disabled={size>=allPoints.length&&verticalZoom<=.25} onClick={()=>zoom(2)}>−</button>
      <button type="button" className="border border-border rounded px-3 py-1" onClick={()=>{setViewport(null);setVerticalZoom(1);setHovered(null);}}>{zh?"重置":"Reset"}</button>
      <span className="text-text-muted">{zh?"滚轮缩放 · 拖动查看":"Scroll to zoom · Drag to pan"}</span>
    </div>
    <svg onWheel={e=>{zoom(e.deltaY<0?.5:2);}} onPointerDown={e=>{drag.current={x:e.clientX,start};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{
      if(!drag.current)return;
      const width=e.currentTarget.getBoundingClientRect().width*(w-left-right)/w;
      const next=Math.round(drag.current.start-(e.clientX-drag.current.x)/Math.max(1,width)*Math.max(1,size-1));
      setViewport({start:Math.max(0,Math.min(allPoints.length-size,next)),size});setHovered(null);
    }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} style={{touchAction:"pan-y",cursor:size<allPoints.length?"grab":"default"}} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={zh ? "Genesis价格走势，横轴按成交顺序" : "Genesis price history by trade sequence"} className="block w-full mt-2 overflow-visible">
      {[0, 1, 2, 3].map(i => {
        const value = min + (max - min) * i / 3;
        return <g key={i}><line x1={left} y1={y(value)} x2={w-right} y2={y(value)} stroke="currentColor" className="text-border" strokeDasharray="3 4"/><text x={left-8} y={y(value)+4} textAnchor="end" fontSize="10" fill="currentColor" className="text-text-muted">{fmt(value)}</text></g>;
      })}
      <line x1={left} y1={h-bottom} x2={w-right} y2={h-bottom} stroke="currentColor" className="text-border"/>
      <defs><clipPath id={clipId}><rect x={left-5} y={top-5} width={w-left-right+10} height={h-top-bottom+10}/></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
      {points.length > 1 && <polygon points={`${left},${h-bottom} ${line} ${x(points.length-1)},${h-bottom}`} fill="currentColor" className="text-accent" opacity=".07"/>}
      <polyline points={line} fill="none" stroke="currentColor" className="text-accent" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.price)} r={selectedIndex===i?5:3} fill="currentColor" className={p.kind === "GENESIS_SELL" ? "text-danger" : p.kind === "GENESIS_BUY" ? "text-success" : "text-accent"} tabIndex={0} role="button" aria-label={`${start+i}: ${genesisPrice(p.price)} ${unit}`} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(i)} onBlur={()=>setHovered(null)} onClick={()=>setHovered(i)}><title>{`${genesisPrice(p.price)} ${unit}`}</title></circle>)}
      </g>
      <text x={left} y={h-12} fontSize="10" fill="currentColor" className="text-text-muted">{zh ? "窗口起点" : "Window start"}</text>
      <text x={w-right} y={h-12} textAnchor="end" fontSize="10" fill="currentColor" className="text-text-muted">{tradeCount} {zh ? "笔成交" : "trades"}</text>
    </svg>
    <div className="flex flex-wrap justify-between gap-2 text-[10px] font-mono text-text-muted">
      <span><span className="text-success">● {zh ? "买入" : "Buy"}</span>　<span className="text-danger">● {zh ? "卖出" : "Sell"}</span></span>
      <span>{selectedIndex+start === 0 ? (zh ? "窗口起点" : "Window start") : `${zh ? "第" : "Trade "}${selectedIndex+start}${zh ? "笔" : ""}`} · <strong className="text-text">{genesisPrice(selected.price)} {unit}</strong></span>
    </div>
    <p className="mt-2 text-[10px] leading-5 text-text-muted">{source==="chain" ? (zh ? "按链上成交顺序展示；悬停或点选圆点查看。" : "On-chain trades in order. Hover or select a point.") : tradeCount ? (zh ? "按成交顺序连接真实模拟价格；悬停或点选圆点查看。" : "Actual simulated prices in trade order. Hover or select a point to inspect.") : (zh ? "暂无成交。买入或卖出后，价格走势会实时更新。" : "No trades yet. Buy or sell to build the price history.")}</p>
  </div>;
}
