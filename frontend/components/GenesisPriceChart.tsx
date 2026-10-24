import React, { useState } from "react";
import { genesisPrice } from "./genesisDisplay";
import type { DlpEvent } from "./dlpDemoModel";

interface Props { history?:{price:number;at:number;kind:string}[]; events: DlpEvent[]; supply: number; k: number; zh: boolean; unit?:string }
const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function GenesisPriceChart({ history, events, supply, k, zh, unit="dUSDC" }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const trades = events.filter(e => (e.kind === "GENESIS_BUY" || e.kind === "GENESIS_SELL") && e.quantity !== undefined);
  // 从当前真实供应倒推窗口起点；事件窗口截断后也不伪造从零开始的历史。
  const delta = (e: DlpEvent) => (e.kind === "GENESIS_BUY" ? 1 : -1) * e.quantity!;
  let runningSupply = Math.max(0, supply - trades.reduce((n, e) => n + delta(e), 0));
  const localPoints = [{ price: 2 * k * runningSupply, at: trades[0]?.at ?? 0, kind: "START" }];
  for (const e of trades) {
    runningSupply = Math.max(0, runningSupply + delta(e));
    localPoints.push({ price: 2 * k * runningSupply, at: e.at, kind: e.kind });
  }
  const points=history?.length?history:localPoints;
  const tradeCount=history?Math.max(0,history.length-1):trades.length;
  const w = 680, h = 218, left = 62, right = 18, top = 18, bottom = 36;
  const low = Math.min(...points.map(p => p.price)), high = Math.max(...points.map(p => p.price));
  const padding = Math.max((high - low) * .12, high * .04, .01);
  const min = Math.max(0, low - padding), max = high + padding;
  const x = (i: number) => left + i / Math.max(1, points.length - 1) * (w - left - right);
  const y = (v: number) => top + (max - v) / (max - min) * (h - top - bottom);
  const line = points.map((p, i) => `${x(i)},${y(p.price)}`).join(" ");
  const selectedIndex = hovered === null ? points.length - 1 : Math.min(hovered, points.length - 1);
  const selected = points[selectedIndex];
  return <div className="border-t border-border pt-3" data-testid="genesis-price-chart">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <strong>{zh ? "Genesis价格走势" : "Genesis price history"}</strong>
      <span className="text-text-muted font-mono">{zh ? `价格轴 ×10⁻⁷ ${unit}／枚` : `Price axis ×10⁻⁷ ${unit}/token`}</span>
    </div>
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={zh ? "Genesis价格走势，横轴按成交顺序" : "Genesis price history by trade sequence"} className="block w-full mt-2 overflow-visible">
      {[0, 1, 2, 3].map(i => {
        const value = min + (max - min) * i / 3;
        return <g key={i}><line x1={left} y1={y(value)} x2={w-right} y2={y(value)} stroke="currentColor" className="text-border" strokeDasharray="3 4"/><text x={left-8} y={y(value)+4} textAnchor="end" fontSize="10" fill="currentColor" className="text-text-muted">{fmt(value)}</text></g>;
      })}
      <line x1={left} y1={h-bottom} x2={w-right} y2={h-bottom} stroke="currentColor" className="text-border"/>
      {points.length > 1 && <polygon points={`${left},${h-bottom} ${line} ${x(points.length-1)},${h-bottom}`} fill="currentColor" className="text-accent" opacity=".07"/>}
      <polyline points={line} fill="none" stroke="currentColor" className="text-accent" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.price)} r={selectedIndex===i?5:3} fill="currentColor" className={p.kind === "GENESIS_SELL" ? "text-danger" : p.kind === "GENESIS_BUY" ? "text-success" : "text-accent"} tabIndex={0} role="button" aria-label={`${i}: ${genesisPrice(p.price)} {unit}`} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(i)} onBlur={()=>setHovered(null)} onClick={()=>setHovered(i)}><title>{`${genesisPrice(p.price)} {unit}`}</title></circle>)}
      <text x={left} y={h-12} fontSize="10" fill="currentColor" className="text-text-muted">{zh ? "窗口起点" : "Window start"}</text>
      <text x={w-right} y={h-12} textAnchor="end" fontSize="10" fill="currentColor" className="text-text-muted">{tradeCount} {zh ? "笔成交" : "trades"}</text>
    </svg>
    <div className="flex flex-wrap justify-between gap-2 text-[10px] font-mono text-text-muted">
      <span><span className="text-success">● {zh ? "买入" : "Buy"}</span>　<span className="text-danger">● {zh ? "卖出" : "Sell"}</span></span>
      <span>{selectedIndex === 0 ? (zh ? "窗口起点" : "Window start") : `${zh ? "第" : "Trade "}${selectedIndex}${zh ? "笔" : ""}`} · <strong className="text-text">{genesisPrice(selected.price)} {unit}</strong></span>
    </div>
    <p className="mt-2 text-[10px] leading-5 text-text-muted">{tradeCount ? (zh ? "按成交顺序连接真实模拟价格；悬停或点选圆点查看。" : "Actual simulated prices in trade order. Hover or select a point to inspect.") : (zh ? "暂无成交。买入或卖出后，价格走势会实时更新。" : "No trades yet. Buy or sell to build the price history.")}</p>
  </div>;
}
