import React, { useEffect, useState } from "react";
import { Contract, JsonRpcProvider, type EventLog } from "ethers";
import { config } from "../config";

/** 按链上成交顺序重放储备；不把 Genesis 曲线价格伪装成正式市场概率。 */
export function MarketPriceHistory({ address, genesis = false, symbol = "" }: { address: string; genesis?: boolean; symbol?: string }) {
  const [points, setPoints] = useState<{ yes: number; no: number }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const provider = new JsonRpcProvider(config.rpcUrl);
    let running = false;
    let nextBlock = 0;
    const logs: EventLog[] = [];
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const contract = new Contract(address, genesis ? [
          "function virtualQuote() view returns(uint256)", "function virtualGSupply() view returns(uint256)",
          "event GenesisTrade(address indexed user,bool indexed isYes,bool indexed isBuy,uint256 gAmount,uint256 grossAssetAmount,uint256 curveAmount,uint256 capitalAmount,uint256 fee)",
        ] : ["function liquidityParameter() view returns(uint256)", "function virtualYesOffset() view returns(uint256)", "function virtualNoOffset() view returns(uint256)", "event Trade(address indexed trader,bool indexed isYes,bool indexed isBuy,uint256 shares,uint256 collateral,uint256 fee)"], provider);
        const latest = await provider.getBlockNumber();
        // 分段读取，避免单次日志范围超出 RPC 限制；失败只影响图表，不阻断交易或提款。
        for (let from = nextBlock; from <= latest; from += 10000) {
          if (cancelled) return;
          logs.push(...await contract.queryFilter(genesis ? contract.filters.GenesisTrade() : contract.filters.Trade(), from, Math.min(latest, from + 9999)) as EventLog[]);
          nextBlock = Math.min(latest, from + 9999) + 1;
        }
        let yes = 0n, no = 0n, yesG = 0n, noG = 0n;
        const virtual = genesis ? BigInt(await contract.virtualQuote()) : 0n;
        const supply = genesis ? BigInt(await contract.virtualGSupply()) : 1n;
        const b = genesis ? 1 : Number(await contract.liquidityParameter());
        if (!genesis) { yes = BigInt(await contract.virtualYesOffset()); no = BigInt(await contract.virtualNoOffset()); }
        const price = () => {
          if (genesis) return { yes: Number(virtual + yes) / Number(supply - yesG), no: Number(virtual + no) / Number(supply - noG) };
          const probability = 1 / (1 + Math.exp(Number(no - yes) / b));
          return { yes: probability, no: 1 - probability };
        };
        const result = [price()];
        for (const log of logs) {
          const a = log.args, delta = a.isBuy ? 1n : -1n;
          if (genesis) {
            if (a.isYes) { yes += delta * a.curveAmount; yesG += delta * a.gAmount; }
            else { no += delta * a.curveAmount; noG += delta * a.gAmount; }
          } else if (a.isYes) yes += delta * a.shares;
          else no += delta * a.shares;
          result.push(price());
        }
        if (!cancelled) { setPoints(result); setError(""); }
      } catch { if (!cancelled) setError("价格历史暂时不可用，可继续交易或领取。"); }
      finally { running = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    const update = () => void load();
    window.addEventListener("ocp-genesis-updated", update);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("ocp-genesis-updated", update); provider.destroy(); };
  }, [address, genesis]);
  const values = points.flatMap(p => [p.yes, p.no]);
  const max = genesis ? values.reduce((a, b) => Math.max(a, b), 0.01) * 1.15 : 1;
  const path = (side: "yes" | "no") => points.map((p, i) => `${i ? "L" : "M"}${52 + i * 520 / Math.max(1, points.length - 1)},${190 - p[side] * 160 / max}`).join(" ");
  return <div className="rounded-xl border border-border bg-white p-4 space-y-3" aria-label="YES / NO 价格走势">
    <div className="flex justify-between items-center"><h3 className="font-bold text-sm">YES / NO 价格走势</h3><div className="flex gap-3 text-xs font-bold"><span className="text-green-700">● YES</span><span className="text-red-600">● NO</span></div></div>
    <p className="text-xs text-text-muted">{genesis ? `曲线单价 · ${symbol} / g` : "正式市场价格 · 0–1"} · 按链上成交顺序</p>
    {error ? <p role="status" className="text-xs text-text-muted">{error}</p> : !points.length ? <p role="status" className="text-xs">读取链上价格历史…</p> : <>
      <svg viewBox="0 0 600 225" className="w-full" role="img" aria-label={`YES 与 NO ${genesis ? "Genesis 曲线" : "正式市场"}价格折线图，${points.length - 1} 笔成交`}>
        {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="52" x2="572" y1={190 - i * 40} y2={190 - i * 40} stroke="#e2e8f0" /><text x="45" y={194 - i * 40} textAnchor="end" fill="#64748b" fontSize="11">{(max * i / 4).toFixed(genesis ? 4 : 2)}</text></g>)}
        <path d={path("yes")} fill="none" stroke="#15803d" strokeWidth="2.5" /><path d={path("no")} fill="none" stroke="#dc2626" strokeWidth="2.5" />
        {points.length === 1 && <><circle cx="52" cy={190 - points[0].yes * 160 / max} r="4" fill="#15803d" /><circle cx="52" cy={190 - points[0].no * 160 / max} r="2" fill="#dc2626" /></>}
        <text x="52" y="215" fill="#64748b" fontSize="11">启动</text><text x="572" y="215" textAnchor="end" fill="#64748b" fontSize="11">第 {points.length - 1} 笔成交</text>
      </svg>
      {points.length === 1 && <p className="text-xs text-text-muted">尚无成交，显示启动价格。</p>}
    </>}
  </div>;
}
