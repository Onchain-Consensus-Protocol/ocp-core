import React, { useMemo, useState } from "react";
import { Activity, ArrowUpRight, Clock3 } from "lucide-react";

type RangeKey = "1D" | "5D" | "1M";

const SERIES: Record<RangeKey, number[]> = {
  "1D": [244.61, 243.92, 245.08, 244.73, 246.12, 245.67, 247.46, 246.98, 248.21, 247.84, 248.98],
  "5D": [239.42, 241.18, 240.36, 243.24, 242.71, 245.63, 244.89, 246.45, 247.12, 248.98],
  "1M": [227.11, 231.84, 229.67, 235.42, 238.15, 234.91, 241.73, 244.08, 242.66, 248.98],
};

function chartPoints(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / spread) * (height - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function StockQuoteDemo({ lang }: { lang: "zh" | "en" }) {
  const [range, setRange] = useState<RangeKey>("1D");
  const values = SERIES[range];
  const points = useMemo(() => chartPoints(values, 640, 116), [values]);
  const areaPoints = `0,116 ${points} 640,116`;
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const changePct = (change / first) * 100;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_45px_-34px_rgba(15,23,42,0.55)]" aria-label={lang === "zh" ? "特斯拉股票行情演示" : "Tesla stock quote demo"}>
      <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e82127] text-lg font-black tracking-[-0.08em] text-white shadow-sm">
            T
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-bold tracking-wide text-slate-950">Tesla, Inc.</h3>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Demo</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
              <span className="font-bold text-slate-700">TSLA</span>
              <span>NASDAQ</span>
              <span>·</span>
              <span>USD</span>
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="flex items-baseline gap-2 sm:justify-end">
            <span className="font-display text-2xl font-bold tabular-nums text-slate-950">${last.toFixed(2)}</span>
            <span className="flex items-center text-xs font-bold tabular-nums text-emerald-600">
              <ArrowUpRight className="mr-0.5 h-3.5 w-3.5" />+{change.toFixed(2)} ({changePct.toFixed(2)}%)
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400 sm:justify-end">
            <Clock3 className="h-3 w-3" />
            {lang === "zh" ? "演示快照 · 非实时行情" : "Demo snapshot · Not live market data"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              {lang === "zh" ? "价格走势" : "Price trend"}
            </div>
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {(Object.keys(SERIES) as RangeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRange(key)}
                  className={`rounded-md px-2 py-1 text-[10px] font-bold transition ${range === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-700"}`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
          <div className="relative h-28 overflow-hidden rounded-xl bg-gradient-to-b from-emerald-50/80 to-white">
            <svg viewBox="0 0 640 116" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`${range} TSLA demo chart`}>
              <defs>
                <linearGradient id="tsla-demo-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="29" x2="640" y2="29" stroke="#e2e8f0" strokeDasharray="4 6" />
              <line x1="0" y1="58" x2="640" y2="58" stroke="#e2e8f0" strokeDasharray="4 6" />
              <line x1="0" y1="87" x2="640" y2="87" stroke="#e2e8f0" strokeDasharray="4 6" />
              <polygon points={areaPoints} fill="url(#tsla-demo-fill)" />
              <polyline points={points} fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <circle cx="640" cy={points.split(" ").at(-1)?.split(",")[1]} r="4" fill="#059669" />
            </svg>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs lg:grid-cols-1 lg:gap-y-2.5">
          {[
            [lang === "zh" ? "开盘" : "Open", "$244.61"],
            [lang === "zh" ? "最高" : "High", "$250.14"],
            [lang === "zh" ? "最低" : "Low", "$243.52"],
            [lang === "zh" ? "前收" : "Prev. close", "$244.61"],
            [lang === "zh" ? "成交量" : "Volume", "92.4M"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-200/70 pb-2 last:border-0 last:pb-0">
              <dt className="text-[10px] uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className="font-bold tabular-nums text-slate-700">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
