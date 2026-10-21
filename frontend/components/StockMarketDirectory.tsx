import React, { useEffect, useState } from "react";
import { Contract, JsonRpcProvider, formatUnits, ZeroAddress } from "ethers";
import { ArrowUpRight, Search, RefreshCw, Plus, AlertTriangle } from "lucide-react";
import { config, FACTORY_ABI, VAULT_ABI, MARKET_ABI, ERC20_ABI } from "../config";

type Stock = { address: string; symbol: string };
type Topic = { vault: string; asset: string; symbol: string; title: string; phase: string; deadline: number; yes: number | null; no: number | null; progress: number | null; principal: string; result: string | null };
const GENESIS_ABI = ["function phase() view returns (uint8)", "function totalRetainedCapital() view returns (uint256)", "function graduationThreshold() view returns (uint256)"];
const DIRECTORY_VAULT_ABI = [...VAULT_ABI,"function effectiveResolutionTime() view returns (uint256)"];
const DIRECTORY_ABI = [...FACTORY_ABI,
  "function genesisTopicCount() view returns (uint256)",
  "function genesisVaultAt(uint256) view returns (address)",
  "function genesisByVault(address) view returns (address)",
  "function assetCount() view returns (uint256)",
  "function assetAt(uint256) view returns (address)",
];

/** 从链上资产地址分类；股票代币名称不用于推断权限或真实股票价格。 */
export function StockMarketDirectory({ lang }: { lang: "zh" | "en" }) {
  const zh = lang === "zh";
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [asset, setAsset] = useState("all");
  const [phase, setPhase] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chainNow, setChainNow] = useState(0);

  async function load() {
    setLoading(true); setError("");
    try {
      const rpc = new JsonRpcProvider(config.rpcUrl);
      const factory = new Contract(config.factoryAddress, DIRECTORY_ABI, rpc);
      // 旧 Factory 不支持 Genesis/资产目录时，仍可浏览它的正式市场。
      const [formalVaults, count, assetCount, block] = await Promise.all([
        factory.getVaults(), factory.genesisTopicCount().catch(() => 0n),
        factory.assetCount().catch(() => 0n), rpc.getBlock("latest"),
      ]);
      const supported = await Promise.all(Array.from({ length: Number(assetCount) }, (_, i) => factory.assetAt(i)));
      const genesisVaults = await Promise.all(Array.from({ length: Number(count) }, (_, i) => factory.genesisVaultAt(i)));
      const vaults = [...new Set<string>([...formalVaults, ...genesisVaults].map((v: string) => v.toLowerCase()))];
      const failures: string[] = [];
      const rows = await Promise.all(vaults.map(async (address): Promise<Topic | null> => {
        try {
          const vault = new Contract(address, DIRECTORY_VAULT_ABI, rpc);
          const [tokenAddress, deadline, resolved, outcome, principal, meta, marketAddress, genesisAddress] = await Promise.all([
            vault.stakeToken(), vault.effectiveResolutionTime().catch(() => vault.resolutionTime()), vault.resolved(), vault.outcome(), vault.totalPrincipal(),
            factory.getVaultMeta(address), factory.marketByVault(address), factory.genesisByVault(address).catch(() => ZeroAddress),
          ]);
          const token = new Contract(tokenAddress, ERC20_ABI, rpc);
          const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
          let topicPhase = resolved ? "settled" : "formal";
          let yes: number | null = null, no: number | null = null, progress: number | null = null;
          if (genesisAddress !== ZeroAddress && marketAddress === ZeroAddress) {
            const genesis = new Contract(genesisAddress, GENESIS_ABI, rpc);
            const [state, retained, threshold] = await Promise.all([genesis.phase(), genesis.totalRetainedCapital(), genesis.graduationThreshold()]);
            topicPhase = Number(state) === 2 ? "failed" : "genesis";
            progress = Number(threshold) > 0 ? Math.min(100, Number(retained) / Number(threshold) * 100) : 0;
          } else if (marketAddress !== ZeroAddress && !resolved) {
            const prices = await new Contract(marketAddress, MARKET_ABI, rpc).getYesNoPrice();
            yes = Number(prices[0]) / 1e18; no = Number(prices[1]) / 1e18;
          }
          return { vault: address, asset: String(tokenAddress).toLowerCase(), symbol, title: meta[0] || address,
            phase: topicPhase, deadline: Number(deadline), yes, no, progress,
            principal: formatUnits(principal, Number(decimals)), result: resolved ? ["PENDING", "YES", "NO", "INVALID"][Number(outcome)] : null };
        } catch { failures.push(address); return null; }
      }));
      const valid = rows.filter((row): row is Topic => row !== null);
      const catalog = new Map(valid.map(row => [row.asset, { address: row.asset, symbol: row.symbol }]));
      await Promise.all(supported.map(async (address: string) => {
        const key = address.toLowerCase();
        if (!catalog.has(key)) {
          const symbol = await new Contract(address, ERC20_ABI, rpc).symbol().catch(() => address.slice(0, 8));
          catalog.set(key, { address: key, symbol });
        }
      }));
      setStocks([...catalog.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)));
      setTopics(valid.reverse()); setChainNow(block?.timestamp ?? 0);
      if (failures.length) setError(zh ? `${failures.length} 个主题读取失败，请刷新重试。` : `${failures.length} topics could not be loaded. Please retry.`);
    } catch { setError(zh ? "无法读取链上市场，请检查网络并重试。" : "Unable to load onchain markets. Check the network and retry."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const visible = topics.filter(row => (asset === "all" || row.asset === asset) && (phase === "all" || row.phase === phase) && `${row.title} ${row.symbol}`.toLowerCase().includes(query.toLowerCase()));
  const label = (value: string) => ({ genesis: "Genesis", formal: zh ? "正式市场" : "Live markets", settled: zh ? "已结算" : "Settled", failed: zh ? "未毕业" : "Not graduated" }[value] ?? value);
  const activeStock = stocks.find(stock => stock.address === asset);

  return <div className="max-w-7xl mx-auto">
    <section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-slate-50 p-6 sm:p-10 mb-6">
      <div className="text-xs tracking-widest font-bold text-accent mb-3">OCP MARKET</div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div><h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">{zh ? "围绕你关注的股票发起话题，参与交易。" : "Ticker. Topic. Trade."}</h1>
          <p className="text-sm text-slate-500 mt-4 max-w-xl leading-relaxed">{zh ? "Pump式价格发现 + 可见毕业进度 + 毕业后转入有真实结果赔付的话题市场。" : "Pump-style price discovery + visible graduation progress + a topic market with outcome-based payouts after graduation."}</p></div>
        <button type="button" disabled aria-disabled="true" title={zh ? "暂未开放" : "Coming soon"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 text-sm font-bold shrink-0 opacity-50 cursor-not-allowed"><Plus size={16}/>{zh ? "创建市场" : "Create Market"}</button>
      </div>
      <div className="flex gap-6 mt-8 text-sm"><span><strong>{stocks.length}</strong> {zh ? "抵押资产" : "assets"}</span><span><strong>{topics.filter(row => row.phase === "genesis").length}</strong> Genesis</span><span><strong>{topics.filter(row => row.phase === "formal").length}</strong> {zh ? "正式市场" : "live markets"}</span></div>
    </section>
    <div className="grid lg:grid-cols-[220px_1fr] gap-6">
      <aside className="rounded-2xl border bg-white p-4 self-start"><div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{zh ? "股票 / 抵押资产" : "Stocks / collateral"}</div>
        <div className="flex lg:flex-col gap-2 overflow-x-auto">
          {[{ address: "all", symbol: zh ? "全部股票" : "All stocks" }, ...stocks].map(stock => <button key={stock.address} aria-pressed={asset === stock.address} onClick={() => setAsset(stock.address)} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm whitespace-nowrap ${asset === stock.address ? "bg-orange-50 text-accent font-bold" : "text-slate-600 hover:bg-slate-50"}`}><span>{stock.symbol}</span><span className="text-xs">{stock.address === "all" ? topics.length : topics.filter(row => row.asset === stock.address).length}</span></button>)}
        </div><p className="hidden lg:block text-xs text-slate-400 leading-relaxed mt-4">{zh ? "分类依据链上抵押代币。YES / NO 是主题份额，不是股票本身。" : "Grouped by onchain collateral token. YES / NO are question shares, not stocks."}</p>
      </aside>
      <section>
        <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">{activeStock?.symbol ?? (zh ? "全部市场" : "All markets")}</h2><button onClick={() => void load()} disabled={loading} aria-label={zh ? "刷新市场" : "Refresh markets"} className="p-2 rounded-lg border"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/></button></div>
        <div className="flex flex-col sm:flex-row gap-3 mb-5"><div className="flex items-center gap-2 bg-white border rounded-xl px-3 flex-1"><Search size={16} className="text-slate-400"/><input aria-label={zh ? "搜索市场" : "Search markets"} placeholder={zh ? "搜索主题或股票…" : "Search questions or stocks…"} value={query} onChange={event => setQuery(event.target.value)} className="py-3 bg-transparent text-sm w-full outline-none"/></div><select aria-label={zh ? "市场阶段" : "Market phase"} value={phase} onChange={event => setPhase(event.target.value)} className="border rounded-xl bg-white px-3 py-3 text-sm"><option value="all">{zh ? "全部阶段" : "All stages"}</option>{["genesis", "formal", "settled", "failed"].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></div>
        {error && <p role="alert" className="flex gap-2 text-sm text-red-700 bg-red-50 p-3 rounded-xl mb-4"><AlertTriangle size={16}/>{error}</p>}
        {loading ? <p className="text-slate-500 p-8">{zh ? "正在读取链上市场…" : "Loading onchain markets…"}</p> : <div className="grid sm:grid-cols-2 gap-4">{visible.map(row => <a key={row.vault} href={`/explore/vault.html?vault=${row.vault}`} className="rounded-2xl border bg-white p-5 hover:border-orange-300 hover:shadow-md transition-all flex flex-col gap-4">
          <div className="flex justify-between items-center"><span className="text-xs font-bold text-accent bg-orange-50 px-2 py-1 rounded-lg">{row.symbol}</span><span className="text-xs text-slate-500">{label(row.phase)}</span></div>
          <h3 className="font-bold text-lg text-slate-900 leading-snug min-h-[3rem]">{row.title}</h3>
          {row.result ? <div className="rounded-xl bg-slate-50 p-3 text-sm flex justify-between"><span>{zh ? "最终结果" : "Final result"}</span><strong>{row.result}</strong></div> : row.progress !== null ? <div><div className="flex justify-between text-sm mb-2"><span>{zh ? "毕业进度" : "Graduation progress"}</span><strong>{row.progress.toFixed(1)}%</strong></div><div className="h-2 bg-orange-50 rounded-full overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${row.progress}%` }}/></div><p className="text-xs text-slate-400 mt-2">{zh ? "Genesis 曲线价格不代表结果概率" : "Genesis curve prices are not outcome probabilities"}</p></div> : <div className="grid grid-cols-2 gap-2 text-sm"><div className="bg-green-50 text-green-800 rounded-xl p-3">YES <strong className="float-right">{row.yes === null ? "—" : `${(row.yes * 100).toFixed(1)}%`}</strong></div><div className="bg-red-50 text-red-800 rounded-xl p-3">NO <strong className="float-right">{row.no === null ? "—" : `${(row.no * 100).toFixed(1)}%`}</strong></div></div>}
          <div className="text-xs text-slate-500 flex justify-between mt-auto"><span>{zh ? "Vault 质押" : "Vault stake"} {Number(row.principal).toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.symbol}</span><ArrowUpRight size={16}/></div>
          <div className="text-xs text-slate-400">{row.deadline <= chainNow ? (zh ? "已截止" : "Deadline reached") : `${zh ? "截止" : "Closes"} ${new Date(row.deadline * 1000).toLocaleString(zh ? "zh-CN" : "en-US")}`}</div>
        </a>)}{visible.length === 0 && <div className="sm:col-span-2 rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">{zh ? "当前分类没有匹配的市场。创建功能暂未开放。" : "No matching markets. Market creation is not available yet."}</div>}</div>}
      </section>
    </div>
  </div>;
}
