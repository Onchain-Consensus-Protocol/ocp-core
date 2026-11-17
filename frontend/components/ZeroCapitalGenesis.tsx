import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract, JsonRpcProvider, formatUnits, parseUnits, keccak256, toUtf8Bytes, type JsonRpcSigner } from "ethers";
import { config, GENESIS_ABI, MARKET_ABI, MARKET_FACTORY_ABI, VAULT_ABI, ERC20_MINT_ABI } from "../config";
import { StockQuoteDemo } from "./StockQuoteDemo";
import { MarketPriceHistory } from "./MarketPriceHistory";
import { quoteGenesisShares, readGenesisCapitalBps } from "./genesisShareQuote";

const ZERO = "0x0000000000000000000000000000000000000000";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

interface Snapshot {
  phase: number; asset: string; symbol: string; decimals: number; creator: string;
  title: string; description: string; deadline: number; now: number; market: string;
  threshold: bigint; retained: bigint; yesReserve: bigint; noReserve: bigint; capital: bigint;
  totalCapital: bigint; myCapital: bigint; gYes: bigint; gNo: bigint; cashYes: bigint; cashNo: bigint;
  priceYes: bigint; priceNo: bigint; formalB: bigint; payout: bigint; failureClaimed: boolean;
  marketResolved: boolean; balance: bigint; totalRetainedIn: bigint; capitalBps: bigint;
}

/** Genesis 的 g、固定现金和做市份额使用独立账本，绝不作为正式份额展示。 */
export function ZeroCapitalGenesis({ vaultAddr, genesisAddr, signer, walletAddress, onConnectWallet, onGraduated, embedded = false }: {
  vaultAddr: string; genesisAddr: string; signer: JsonRpcSigner | null; walletAddress: string;
  onConnectWallet: () => void; onGraduated: (market: string) => void;
  embedded?: boolean;
}) {
  const provider = useMemo(() => new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 }), []);
  const [state, setState] = useState<Snapshot | null>(null);
  const [amount, setAmount] = useState("10");
  const [tradeMode, setTradeMode] = useState<"BUY" | "SELL">("BUY");
  const [migrationShares, setMigrationShares] = useState("1");
  const [quotes, setQuotes] = useState<Partial<Record<"YES" | "NO", { cash: bigint; fee: bigint; shares: bigint; average: number; impact: number; graduates: boolean }>>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteErrors, setQuoteErrors] = useState<Partial<Record<"YES" | "NO", string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(0);
  const latestClockBlock = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const registry = new Contract(config.factoryAddress, MARKET_FACTORY_ABI, provider);
    const genesis = new Contract(genesisAddr, GENESIS_ABI, provider);
    const vault = new Contract(vaultAddr, VAULT_ABI, provider);
    // 链上双向登记和资产绑定相当于入口 modifier，防止 URL 冒充官方话题。
    const [canonical, reverse, factory, bound, asset, vaultAsset] = await Promise.all([
      registry.genesisByVault(vaultAddr), registry.vaultByGenesis(genesisAddr), genesis.factory(),
      genesis.vaultContract(), genesis.asset(), vault.stakeToken(),
    ]);
    if (!same(canonical, genesisAddr) || !same(reverse, vaultAddr) || !same(factory, config.factoryAddress)
      || !same(bound, vaultAddr) || !same(asset, vaultAsset)) throw new Error("话题未通过 Factory 的双向登记校验");
    const token = new Contract(asset, ERC20_MINT_ABI, provider);
    const [phase, meta, creator, deadline, block, symbol, decimals, market, threshold, retained,
      yesReserve, noReserve, capital, totalCapital, myCapital, gYes, gNo, cashYes, cashNo,
      priceYes, priceNo, formalB, failureClaimed, balance, capitalBps] = await Promise.all([
      genesis.phase(), registry.getGenesisTopicMeta(vaultAddr), genesis.creator(), vault.effectiveResolutionTime(),
      provider.getBlock("latest"), token.symbol(), token.decimals(), genesis.formalMarket(),
      genesis.graduationThreshold(), genesis.totalRetainedCapital(), genesis.realYesReserve(),
      genesis.realNoReserve(), genesis.lockedGraduationCapital(), genesis.totalMarketMakingShares(),
      walletAddress ? genesis.marketMakingShares(walletAddress) : 0n,
      walletAddress ? genesis.gYes(walletAddress) : 0n, walletAddress ? genesis.gNo(walletAddress) : 0n,
      walletAddress ? genesis.previewCashEntitlement(walletAddress, true) : 0n,
      walletAddress ? genesis.previewCashEntitlement(walletAddress, false) : 0n,
      genesis.spotPriceX18(true), genesis.spotPriceX18(false), genesis.selectedFormalB(),
      walletAddress ? genesis.failureClaimed(walletAddress) : false,
      walletAddress ? token.balanceOf(walletAddress) : 0n,
      readGenesisCapitalBps(genesis),
    ]);
    const totalRetainedIn = BigInt(await genesis.cumulativeRetainedIn());
    // 权益来源是毕业时冻结的 Genesis 份额，待领金额与付款账本均由正式 Market 计算。
    const payout = walletAddress && !same(market, ZERO)
      ? BigInt(await new Contract(market, MARKET_ABI, provider).previewMarketMakingPayout(walletAddress)) : 0n;
    const marketResolved = Boolean(await vault.resolved()) || (!same(market, ZERO) && Boolean(await new Contract(market, MARKET_ABI, provider).resolved()));
    setState({ phase: Number(phase), asset, symbol, decimals: Number(decimals), creator,
      title: meta[0], description: meta[1], deadline: Number(deadline), now: block!.timestamp, market,
      threshold, retained, yesReserve, noReserve, capital, totalCapital, myCapital, gYes, gNo, cashYes, cashNo,
      priceYes, priceNo, formalB, payout,
      failureClaimed, marketResolved, balance, totalRetainedIn, capitalBps });
    // Anvil 停止出块时保留实时倒计时；仅在新区块或推进测试时间后校准。
    if (latestClockBlock.current !== block!.number) {
      latestClockBlock.current = block!.number;
      setClock(block!.timestamp);
    }
    if (Number(phase) === 1 && !same(market, ZERO)) onGraduated(market);
  }, [provider, genesisAddr, vaultAddr, walletAddress, onGraduated]);

  useEffect(() => {
    const update = () => void refresh().catch(e => setError(e.shortMessage || e.message));
    update(); const timer = window.setInterval(update, 5000);
    window.addEventListener("ocp-genesis-updated", update);
    return () => { window.clearInterval(timer); window.removeEventListener("ocp-genesis-updated", update); };
  }, [refresh]);
  useEffect(() => { const timer = window.setInterval(() => setClock(t => t + 1), 1000); return () => window.clearInterval(timer); }, []);

  useEffect(() => { setNotice(""); setError(""); }, [walletAddress]);

  // 与正式市场一致：输入金额后自动并行读取两侧报价，过期请求不能覆盖新输入。
  useEffect(() => {
    let cancelled = false;
    setQuotes({});
    setQuoteErrors({});
    setQuoteLoading(false);
    if (!state || state.phase !== 0 || !amount.trim() || clock >= state.deadline) return;
    let input: bigint;
    try { input = parseUnits(amount.trim(), state.decimals); } catch { return; }
    if (input <= 0n) return;
    setQuoteLoading(true);
    const timer = window.setTimeout(async () => {
      const g = new Contract(genesisAddr, GENESIS_ABI, provider);
      const results = await Promise.allSettled(([true, false] as const).map(async isYes => {
        const q = tradeMode === "BUY" ? (await quoteGenesisShares(g, isYes, input, state.decimals)).quote : await g.quoteSell(isYes, input);
        const cash = BigInt(q[0]), fee = BigInt(q[1]);
        const shares = tradeMode === "BUY" ? BigInt(q[4]) : input;
        const curve = BigInt(q[2]);
        const average = shares > 0n ? Number(curve) / Number(shares) : 0;
        const spot = Number(formatUnits(isYes ? state.priceYes : state.priceNo, 18));
        const impact = Math.max(0, (tradeMode === "BUY" ? average / spot - 1 : 1 - average / spot) * 100);
        return { side: isYes ? "YES" as const : "NO" as const, value: {cash, fee, shares, average, impact, graduates: tradeMode === "BUY" && Boolean(q[5])} };
      }));
      if (cancelled) return;
      const next: typeof quotes = {};
      const errors: typeof quoteErrors = {};
      results.forEach((result, i) => {
        if (result.status === "fulfilled") next[result.value.side] = result.value.value;
        else errors[i === 0 ? "YES" : "NO"] = result.reason?.shortMessage || result.reason?.message || "暂无报价";
      });
      setQuotes(next); setQuoteErrors(errors); setQuoteLoading(false);
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [amount, tradeMode, state?.decimals, state?.phase, state?.priceYes, state?.priceNo, state?.deadline, clock >= (state?.deadline ?? Infinity), genesisAddr, provider]);

  const run = async (action: (genesis: Contract, vault: Contract) => Promise<string>) => {
    if (!signer || !walletAddress) { onConnectWallet(); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      // 钱包网络与只读 RPC 必须一致，避免在错误链授权同名地址。
      if (Number((await signer.provider.getNetwork()).chainId) !== config.chainId) throw new Error("请切换到目标网络");
      const registry = new Contract(config.factoryAddress, MARKET_FACTORY_ABI, signer);
      if (!same(await registry.genesisByVault(vaultAddr), genesisAddr)) throw new Error("Genesis 登记已变化");
      setNotice(await action(new Contract(genesisAddr, GENESIS_ABI, signer), new Contract(vaultAddr, VAULT_ABI, signer)));
      setQuotes({}); await refresh();
      window.dispatchEvent(new Event("ocp-genesis-updated"));
    } catch (e) { const err = e as { shortMessage?: string; message?: string }; setError(err.shortMessage || err.message || String(e)); }
    finally { setBusy(false); }
  };
  const txDeadline = async () => (await provider.getBlock("latest"))!.timestamp + 600;
  const buy = (isYes: boolean) => void run(async g => {
    const requestedShares = parseUnits(amount, state!.decimals);
    const {budget, quote: q} = await quoteGenesisShares(g, isYes, requestedShares, state!.decimals);
    const token = new Contract(state!.asset, ERC20_MINT_ABI, signer);
    if (BigInt(await token.allowance(walletAddress, genesisAddr)) < q[0]) await (await token.approve(genesisAddr, q[0])).wait();
    // 输入的是目标份额：预算封顶，且 minGOut 使用目标数量；价格变化不得静默少买。
    const receipt = await (await g.buy(isYes, budget, requestedShares, await txDeadline())).wait();
    return `Genesis 买入成功 · ${receipt.hash}${q[5] ? "；末笔部分成交，正式市场已部署并从 50/50 开始。" : ""}`;
  });
  const sell = (isYes: boolean) => void run(async g => {
    const gIn = parseUnits(amount, state!.decimals);
    if (gIn <= 0n || gIn > (isYes ? state!.gYes : state!.gNo)) throw new Error("请输入持仓内的 g 份额");
    const q = await g.quoteSell(isYes, gIn);
    const receipt = await (await g.sell(isYes, gIn, q[0] * 99n / 100n, await txDeadline())).wait();
    return `Genesis 卖出成功，做市份额保留 · ${receipt.hash}`;
  });
  const migrate = (isYes: boolean) => void run(async g => {
    const shares = parseUnits(migrationShares, state!.decimals);
    if (shares <= 0n) throw new Error("正式份额必须大于零");
    const market = new Contract(state!.market, MARKET_ABI, signer);
    const q = await market.quoteBuy(isYes, shares);
    const cash = BigInt(await g.previewCashEntitlement(walletAddress, isYes));
    if (q[0] > cash) throw new Error(`现金不足：实时价格需 ${fmt(q[0])}，本侧余额 ${fmt(cash)}`);
    // cash 和 quote 均为链上实时值，maxCashCost 同时受余额和 1% 滑点限制。
    const max = q[0] * 101n / 100n + 1n;
    const receipt = await (await g.migrateCash(isYes, shares, max < cash ? max : cash, await txDeadline())).wait();
    return `已自愿按实时 LMSR 价格买入正式 ${isYes ? "YES" : "NO"} · ${receipt.hash}`;
  });

  const fmt = (value: bigint) => state ? formatUnits(value, state.decimals) : "0";
  // 小额测试中 0.001 pTSLA 仍有价值，不能按两位小数显示成零。
  const compact = (value: bigint) => { const n = Number(fmt(value)); return n.toFixed(n > 0 && n < 1 ? Math.min(state?.decimals ?? 6, 6) : 2); };
  const button = (label: string, action: () => void, disabled = false) => <button type="button" disabled={busy || disabled} onClick={action} className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-40 hover:bg-slate-100">{label}</button>;
  if (!state) return <section className="p-8" role="status">{error || "正在读取 Genesis…"}</section>;
  const expired = clock >= state.deadline;
  const progress = state.phase === 1 ? 100 : Math.min(100, Number(state.retained * 10000n / state.threshold) / 100);
  return <>
    {!embedded && <div className="mx-auto max-w-6xl px-4 sm:px-0"><StockQuoteDemo lang="zh" /></div>}
    <section className={embedded ? "p-4 sm:p-6 space-y-4" : "max-w-6xl mx-auto rounded-2xl border border-border bg-white/80 shadow-sm overflow-hidden p-4 sm:p-6 grid md:grid-cols-2 gap-5"} aria-label={embedded ? "我的启动权益" : "话题市场 · Genesis"}>
    {!embedded && <div className="space-y-3 md:col-start-2 md:row-start-1">
      <h1 className="text-2xl font-bold">{state.title}</h1>
      <p className="font-bold">{state.phase === 0 ? "Genesis · Pump 双侧价格发现" : state.phase === 1 ? "Genesis 已毕业 · 固定现金与做市份额" : "Genesis 失败 · 可领取退款"}</p>
      {state.phase === 0 && <p className="text-sm text-text-muted">Vault 质押与正式交易将在毕业时同时开放。</p>}
      <p className="text-sm whitespace-pre-wrap">{state.description}</p>
      <p className="text-xs text-text-muted">截止 <time>{new Date(state.deadline * 1000).toLocaleString()}</time> · {expired ? "已到期" : `剩余 ${Math.floor((state.deadline - clock) / 3600)} 小时 ${Math.floor((state.deadline - clock) % 3600 / 60)} 分钟`}</p>
      <MarketPriceHistory address={genesisAddr} genesis symbol={state.symbol} />
      <details className="text-xs text-text-muted"><summary className="cursor-pointer">交易风险</summary><p className="mt-2">临近截止仍允许毕业，知晓结果的交易者可能有优势。毕业后创建者可选择提前结算时点；做市份额本金可能损失至零。</p></details>
      <details className="text-xs break-all"><summary className="cursor-pointer text-text-muted">合约信息</summary>Genesis：{genesisAddr}<br />正式市场：{same(state.market, ZERO) ? "毕业时部署" : state.market}</details>
      <div className="flex gap-3 flex-wrap">{button("刷新 Genesis", () => void refresh().catch(e => setError(e.message)))}
        {!signer && button("连接钱包", onConnectWallet)}
        {config.isLocalDev && button("领取本地测试代币", () => void run(async () => { await (await new Contract(state.asset, ERC20_MINT_ABI, signer).mint(walletAddress, parseUnits("1000", state.decimals))).wait(); return "已领取 1000 个本地测试代币"; }))}
      </div>
      <p className="text-xs text-text-muted">钱包 {compact(state.balance)} {state.symbol} · 做市份额 {compact(state.myCapital)}</p>
    </div>}
    {embedded && <div><h2 className="text-lg font-bold">我的启动权益</h2><p className="text-sm text-text-muted mt-1">Genesis 现金与正式仓位分别记账，做市份额结算后由本市场支付。</p><p className="text-sm mt-2">我的做市份额 {fmt(state.myCapital)} / {fmt(state.totalCapital)}</p></div>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700 break-words">{error}</div>}
    {notice && <div role="status" className="rounded-lg bg-green-50 p-3 text-green-800 break-all">{notice}</div>}
    {busy && <p role="status">正在确认交易…</p>}
    {state.phase === 0 && <div className="rounded-xl border border-border bg-white p-5 space-y-4 md:col-start-1 md:row-start-1">
      <h2 className="text-xl font-bold">交易 · Genesis</h2>
      <div className="flex justify-between text-sm"><span className="text-text-muted">毕业进度</span><strong>{progress.toFixed(1)}%</strong></div>
      <div role="progressbar" aria-label="毕业进度" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-green-600 rounded-full" style={{width: `${progress}%`}} /></div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><p className="text-text-muted">Genesis 资金池</p><p className="font-bold mt-1">{compact(state.yesReserve + state.noReserve)} {state.symbol}</p></div>
        <div><p className="text-text-muted">正式市场做市资金</p><p className="font-bold mt-1">{compact(state.capital)} {state.symbol}</p></div>
      </div>
      <p className="text-xs text-text-muted">合计 {compact(state.retained)} / 毕业目标 {compact(state.threshold)} {state.symbol}</p>
      <div className="grid grid-cols-2 gap-3">{([true, false] as const).map(yes => <div key={String(yes)} className={`rounded-xl p-4 ${yes ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}><span className="text-xs font-bold">{yes ? "YES" : "NO"}</span><p className="text-2xl font-bold mt-1">{Number(formatUnits(yes ? state.priceYes : state.priceNo, 18)).toFixed(4)}</p><span className="text-xs">{state.symbol} / g</span></div>)}</div>
      <p className="text-xs text-text-muted">Genesis 单价，非结果概率。</p>
      <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">{(["BUY", "SELL"] as const).map(mode => <button key={mode} type="button" onClick={() => setTradeMode(mode)} aria-pressed={tradeMode === mode} className={`py-2 rounded-md text-sm font-bold ${tradeMode === mode ? "bg-white shadow-sm" : "text-text-muted"}`}>{mode === "BUY" ? "买入" : "卖出"}</button>)}</div>
      <label className="block text-sm">{tradeMode === "BUY" ? "买入份额 · g" : "卖出份额 · g"}<input aria-label="Genesis 份额" className="block w-full border rounded-lg p-3 mt-2" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      {!expired && (quoteLoading || quotes.YES || quotes.NO || quoteErrors.YES || quoteErrors.NO) && <div className="grid grid-cols-2 gap-2" aria-label="Genesis 自动报价">
        {(["YES", "NO"] as const).map(side => { const q = quotes[side]; const row = (label: string, value: string) => <div className="flex justify-between gap-2"><span>{label}</span><strong className="text-text">{value}</strong></div>; return <div key={side} className="rounded-lg border border-border bg-white/60 px-2.5 py-2 text-[10px] text-text-muted space-y-1">
          <div className={`font-bold mb-1.5 ${side === "YES" ? "text-green-700" : "text-red-600"}`}>{side}</div>
          {q ? <>{row("平均成交价", q.average.toFixed(4))}{row("价格影响", `${q.impact.toFixed(2)}%`)}{row("手续费", fmt(q.fee))}{tradeMode === "BUY" && row("预计获得 · g", Number(fmt(q.shares)).toFixed(4))}<div className="border-t border-border pt-1">{row(tradeMode === "BUY" ? "预计支付" : "预计到账", `${fmt(q.cash)} ${state.symbol}`)}</div>{row(tradeMode === "BUY" ? "最少获得 · g" : "最低到账（1%）", tradeMode === "BUY" ? amount : fmt(q.cash * 99n / 100n))}{q.graduates && <p className="text-amber-700">本笔将毕业。</p>}</> : <p className="break-words">{quoteLoading ? "报价中…" : quoteErrors[side] || "暂无报价"}</p>}
        </div>; })}
      </div>}
      <div className="flex justify-between text-xs text-text-muted"><span>持仓 YES {Number(fmt(state.gYes)).toFixed(2)} g</span><span>NO {Number(fmt(state.gNo)).toFixed(2)} g</span></div>
      {!expired && <div className="grid grid-cols-2 gap-3">{button(`${tradeMode === "BUY" ? "买入" : "卖出"} YES`, () => tradeMode === "BUY" ? buy(true) : sell(true), tradeMode === "BUY" ? quoteLoading || !quotes.YES : state.gYes === 0n)}{button(`${tradeMode === "BUY" ? "买入" : "卖出"} NO`, () => tradeMode === "BUY" ? buy(false) : sell(false), tradeMode === "BUY" ? quoteLoading || !quotes.NO : state.gNo === 0n)}</div>}
      <p className="text-xs text-amber-800">买入含 {Number(state.capitalBps) / 100}% 做市资金和 1% 手续费；卖出不退做市资金。</p>
      <details className="text-xs text-text-muted space-y-2"><summary className="cursor-pointer">资金分配详情</summary><p className="mt-2">买入 100 单位：约 {99 - Number(state.capitalBps) / 100} 进入 Genesis 资金池，{Number(state.capitalBps) / 100} 锁定用于毕业后做市，1 为协议费用。卖出只退曲线计算金额。</p><p>YES 资金池 {fmt(state.yesReserve)} {state.symbol} · NO 资金池 {fmt(state.noReserve)} {state.symbol}</p></details>
      {expired && button("确认 Genesis 失败", () => void run(async g => { await (await g.fail()).wait(); return "Genesis 已失败，退款权益已冻结"; }))}
      {!expired && same(walletAddress, state.creator) && state.totalRetainedIn === 0n && button("取消空 Genesis", () => void run(async g => { await (await g.cancel(keccak256(toUtf8Bytes("Cancel empty Genesis")))).wait(); return "空 Genesis 已取消"; }))}
    </div>}
    {state.phase === 1 && <div className="space-y-4">
      <h3 className="font-bold">Genesis 现金</h3>
      <p>YES 现金 {fmt(state.cashYes)} · NO 现金 {fmt(state.cashNo)} {state.symbol}</p>
      <p className="text-sm">正式 b = {fmt(state.formalB)}，按毕业时实际锁定资本计算。g 仓位不会自动转换为正式 YES/NO。每份现金只能领取或花费一次，余额可永久领取。</p>
      <div className="flex flex-wrap gap-3">
        {button("领取 YES 现金", () => void run(async g => { const receipt = await (await g.claimCash(true, 0)).wait(); return `YES 现金已领取 · ${receipt.hash}`; }), state.cashYes === 0n)}
        {button("领取 NO 现金", () => void run(async g => { const receipt = await (await g.claimCash(false, 0)).wait(); return `NO 现金已领取 · ${receipt.hash}`; }), state.cashNo === 0n)}
      </div>
      {!expired && !state.marketResolved && <>
        <label className="block text-sm">迁移购买的正式份额<input aria-label="迁移正式份额" className="block w-full border rounded p-2 mt-1" inputMode="decimal" value={migrationShares} onChange={e => setMigrationShares(e.target.value)} /></label>
        <p className="text-sm">可用同侧现金按实时价格买入正式份额；换方向时先领取现金，再使用本页交易区。迁移保护 1% 滑点。</p>
        <div className="flex gap-3 flex-wrap">{button("YES 现金迁移为正式 YES", () => migrate(true), state.cashYes === 0n)}{button("NO 现金迁移为正式 NO", () => migrate(false), state.cashNo === 0n)}</div>
      </>}
      {(expired || state.marketResolved) && <div className="space-y-3">
        <h3 className="font-bold">做市份额结算领取</h3>
        <p>正式 Market 可领取 {fmt(state.payout)} {state.symbol}。剩余做市本金与做市手续费由正式 Market 直接支付，保留 YES/NO 赔付及其他费用负债；Genesis 现金仍在上方领取。</p>
        <div className="flex gap-3 flex-wrap">
          {button("领取做市份额赔付", () => void run(async g => {
            // 从已登记的 Genesis 读取正式 Market，避免把资金领取发送到 URL 提供的任意地址。
            const market = await g.formalMarket();
            if (same(market, ZERO) || !same(market, state.market)) throw new Error("正式 Market 地址不一致");
            const receipt = await (await new Contract(market, MARKET_ABI, signer!).claimMarketMakingPayout()).wait();
            return `正式 Market 已支付做市份额赔付 · ${receipt.hash}`;
          // 到期后首次领取会在 Market 内自动触发终局；尚未终局时预览为零不应阻断领取。
          }), state.marketResolved ? state.payout <= 0n : !expired || state.myCapital <= 0n)}
        </div>
      </div>}
    </div>}
    {state.phase === 2 && <div className="rounded-2xl border bg-white p-6 space-y-3">
      <p>未毕业退款由冻结曲线仓位与做市份额分别计算，已付手续费不退。</p>
      {button(state.failureClaimed ? "退款已领取" : "领取 Genesis 失败退款", () => void run(async g => { const receipt = await (await g.claimFailureRefund()).wait(); return `Genesis 退款已领取 · ${receipt.hash}`; }), state.failureClaimed || (state.gYes + state.gNo + state.myCapital === 0n))}
    </div>}
  </section></>;
}
