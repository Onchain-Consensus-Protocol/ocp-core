import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, Coins, Flag, Pause, Play, RotateCcw, Wallet } from "lucide-react";
import type { Language } from "../types";
import { advanceTime, claimPayout, cost, createMarket, graduationStatus, isTrading, newMarket, prices, publishResult, scenario, trade,
  type LifecycleMarket, type MarketEvent, type Outcome, type Side } from "./marketLifecycleModel";

interface Props {
  lang: Language; isWalletConnected: boolean; balance: number;
  setBalance: (amount: number) => void; connectWallet: () => void;
}
const amountText = (n: number, digits = 2) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = (n: number, digits = 2) => `$${amountText(n, digits)}`;
const timerText = (n: number) => `${Math.floor(Math.max(0, n) / 60).toString().padStart(2, "0")}:${Math.floor(Math.max(0, n) % 60).toString().padStart(2, "0")}`;
const control = "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export const MarketLifecycleDemo: React.FC<Props> = ({ lang, isWalletConnected, setBalance, connectWallet }) => {
  const zh = lang === "zh";
  const t = (cn: string, en: string) => zh ? cn : en;
  const [market, setMarket] = useState<LifecycleMarket>(() => newMarket());
  const [active, setActive] = useState(0);
  const [side, setSide] = useState<Side>("YES");
  const [mode, setMode] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("2");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const account = market.accounts[active];
  const live = isTrading(market);
  const ended = ["FAILED", "SETTLED"].includes(market.phase);
  const graduated = ["FORMAL", "WAIT_CORE", "SETTLED"].includes(market.phase);
  const failed = market.phase === "FAILED";
  const payout = market.payouts?.[active];
  const durationLeft = Math.max(0, market.deadline - market.now);
  const quote = useMemo(() => {
    if (!live || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return null;
    try { return trade(market, active, side, mode, Number(amount)); } catch { return null; }
  }, [market, active, side, mode, amount, live]);
  const price = useMemo(() => prices(market), [market]);
  const cover = (market.frozen?.R ?? market.R) / cost(market.frozen?.q ?? market.q, market.b);
  const gate = graduationStatus(market);
  const feeTotal = market.fees.core + market.fees.capital + market.fees.protocol;
  const totalCash = market.accounts.reduce((n, a) => n + a.wallet, 0) + market.R + feeTotal;
  const unclaimed = market.payouts?.reduce((n, p, i) => n + (market.accounts[i].claimed ? 0 : p.total), 0) ?? 0;
  const names = [t("你", "You"), t("交易员 A", "Trader A"), t("交易员 B", "Trader B")];
  const phaseName = {
    CREATE: t("尚未创建", "Not created"), GENESIS: t("Genesis · 筹资中", "Genesis · funding"),
    FORMAL: t("正式 LMSR · 交易中", "Formal LMSR · trading"), WAIT_CORE: t("已停盘 · 等待 Core", "Closed · awaiting Core"),
    FAILED: t("未毕业 · 失败清算", "Unfunded · liquidation"), SETTLED: t("结果已发布 · 可领取", "Resolved · claimable"),
  }[market.phase];
  const currentStep = market.phase === "CREATE" ? 0 : market.phase === "GENESIS" ? 1 : market.phase === "FORMAL" ? 2 : market.phase === "WAIT_CORE" ? 3 : 4;
  const explainError = (e: unknown) => {
    const key = e instanceof Error ? e.message : "";
    if (key === "BALANCE") return t("模拟余额不足，请减少支付金额。", "Insufficient demo balance. Reduce your payment.");
    if (key === "SHARES") return t("份额不足，请减少卖出数量。", "Not enough shares. Reduce the quantity.");
    if (key === "CLOSED") return t("已到共同截止时间，不能继续交易。", "The shared deadline has passed. Trading is closed.");
    if (key === "CLAIMED") return t("这个账户已经领取，不能重复领取。", "This account has already claimed.");
    return t("无法完成这次操作，请检查阶段和输入金额。", "This action is unavailable. Check the stage and amount.");
  };
  const apply = (fn: (m: LifecycleMarket) => LifecycleMarket, message: string) => {
    try { setMarket(fn(market)); setNotice(message); } catch (e) { setNotice(explainError(e)); }
  };
  useEffect(() => { setBalance(account.wallet); }, [account.wallet, setBalance]);
  useEffect(() => {
    if (!running || !["GENESIS", "FORMAL"].includes(market.phase)) return;
    const id = window.setInterval(() => setMarket(m => advanceTime(m, 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, market.phase]);
  useEffect(() => { if (!live) setRunning(false); }, [live]);
  const reset = (kind?: "FORMAL" | "FAILURE" | "BALANCED") => {
    try {
      setMarket(kind ? scenario(kind) : newMarket()); setActive(0); setRunning(false);
      setSide("YES"); setMode("BUY"); setAmount("2");
      if (kind && !isWalletConnected) connectWallet();
      setNotice(kind ? t("已载入真实计算的预置交易。可继续买卖或快进至截止。", "Loaded calculated sample trades. Continue trading or advance to the deadline.") : "");
    } catch (e) { setNotice(explainError(e)); }
  };
  const execute = () => {
    if (!isWalletConnected) connectWallet();
    try {
      const q = trade(market, active, side, mode, Number(amount)); setMarket(q.next);
      setNotice(mode === "BUY"
        ? t(`支付 ${money(q.actual)}，买到 ${amountText(q.quantity, 4)} 份 ${side}${q.unused > .000001 ? `；未用预算 ${money(q.unused)} 保留在钱包` : ""}。`,
          `Paid ${money(q.actual)} for ${amountText(q.quantity, 4)} ${side} shares${q.unused > .000001 ? `; ${money(q.unused)} of budget stays in your wallet` : ""}.`)
        : t(`卖出 ${amountText(q.quantity, 4)} 份 ${side}，净到账 ${money(q.actual)}。`, `Sold ${amountText(q.quantity, 4)} ${side} for ${money(q.actual)} net.`));
    } catch (e) { setNotice(explainError(e)); }
  };
  const eventText = (e: MarketEvent) => {
    const who = names[e.actor ?? 0];
    if (e.kind === "CREATE") return t("零本金创建市场，开始 Genesis", "Market created with zero seed capital; Genesis opens");
    if (e.kind === "GRADUATE") return t("资金足额且卖值保护满足，毕业进入正式 LMSR；截止不变", "Funding and exit protection passed: standard LMSR; deadline unchanged");
    if (e.kind === "BUY") return t(`${who} 支付 ${money(e.cash ?? 0)} → ${amountText(e.quantity ?? 0, 3)} 份 ${e.side}`, `${who} paid ${money(e.cash ?? 0)} → ${amountText(e.quantity ?? 0, 3)} ${e.side}`);
    if (e.kind === "SELL") return t(`${who} 卖出 ${amountText(e.quantity ?? 0, 3)} 份 ${e.side} → ${money(e.cash ?? 0)}`, `${who} sold ${amountText(e.quantity ?? 0, 3)} ${e.side} → ${money(e.cash ?? 0)}`);
    if (e.kind === "CLOSE") return t("共同截止到达，买卖停止，冻结资金与持仓", "Shared deadline reached; trading stops and the ledger freezes");
    if (e.kind === "RESULT") return t(`OCP Core 最终结果：${e.side}`, `OCP Core final result: ${e.side}`);
    return t(`${who} 领取 ${money(e.cash ?? 0)}`, `${who} claimed ${money(e.cash ?? 0)}`);
  };

  return <div className="mx-auto max-w-6xl text-text" data-testid="market-lifecycle-demo">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-accent">{t("市场全生命周期", "THE COMPLETE MARKET LIFECYCLE")}</p>
        <h2 className="text-2xl font-display font-bold tracking-tight">{t("从零启动，到最后一笔领取。", "From zero capital to the final claim.")}</h2>
      </div>
      <span className="rounded-full border border-border bg-white px-3 py-1.5 text-xs text-text-muted">{t("独立 Genesis v2 · 模拟资金", "Independent Genesis v2 · simulated funds")}</span>
    </div>

    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white/70 p-3">
      <span className="mr-1 text-xs text-text-muted">{t("验收场景", "Try a scenario")}</span>
      <button className={`${control} border-border hover:border-accent`} onClick={() => reset()}><RotateCcw size={13} />{t("从零创建", "Start from zero")}</button>
      <button className={`${control} border-border hover:border-accent`} onClick={() => reset("FORMAL")}>{t("载入周转毕业示例", "Load turnover graduation")}<ArrowRight size={13} /></button>
      <button className={`${control} border-border hover:border-accent`} onClick={() => reset("FAILURE")}>{t("载入未毕业示例", "Load unfunded market")}<ArrowRight size={13} /></button>
      <button className={`${control} border-border hover:border-accent`} onClick={() => reset("BALANCED")}>{t("载入双边纯买示例", "Load balanced buys")}</button>
      <span className="text-[11px] text-text-muted sm:ml-auto">{t("切换示例会重置模拟资金", "Scenarios reset demo balances")}</span>
    </div>

    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="grid gap-5 border-b border-border p-5 sm:p-7 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${failed ? "bg-amber-50 text-amber-700" : "bg-orange-50 text-accent"}`}>{phaseName}</span>
            <span className="text-[11px] text-text-muted">{t("演示深度", "Demo depth")} b = {market.b}</span>
          </div>
          <h3 className="text-xl font-bold leading-snug sm:text-2xl">{t("这场比赛，蓝队会获胜吗？", "Will the blue team win this match?")}</h3>
          <p className="mt-2 text-xs leading-5 text-text-muted">{t("YES：获胜 · NO：未获胜 · INVALID：无法有效判定", "YES: wins · NO: does not win · INVALID: cannot be validly determined")}</p>
        </div>
        <div className="rounded-xl border border-border bg-slate-50/70 px-5 py-3 lg:min-w-[250px]">
          <div className="flex items-center justify-between gap-5 text-[11px] text-text-muted"><span className="flex items-center gap-1.5"><Clock3 size={13} />{t("共同截止倒计时", "Shared trading deadline")}</span><span>{running ? t("运行中", "Running") : t("演示时钟已暂停", "Demo clock paused")}</span></div>
          <div className="my-2 flex items-center justify-between gap-4"><strong className="font-mono text-3xl tracking-tight tabular-nums" data-testid="shared-clock">{timerText(durationLeft)}</strong>
            <button className={`${control} border-border bg-white`} disabled={!live} onClick={() => setRunning(v => !v)} aria-label={running ? t("暂停时钟", "Pause clock") : t("运行时钟", "Run clock")}>{running ? <Pause size={13} /> : <Play size={13} />}</button>
          </div>
          <p className="text-[11px] text-text-muted">{t("Genesis 与正式市场共用；毕业不延期", "Shared by Genesis & Formal; graduation adds no time")}</p>
        </div>
      </div>

      <div className="overflow-x-auto border-b border-border bg-slate-50/40 px-4 py-4 sm:px-7">
        <div className="flex min-w-[470px] items-center justify-between gap-2">
          {[t("创建", "Create"), "Genesis", t("正式交易", "Formal"), t("共同截止", "Close"), failed ? t("失败清算", "Liquidate") : t("结果与领取", "Resolve & claim")].map((label, i) => {
            const skipped = failed && i === 2, done = i < currentStep && !skipped, current = i === currentStep;
            return <React.Fragment key={i}><div className={`flex items-center gap-2 text-xs font-semibold ${current ? "text-accent" : done ? "text-text" : "text-text-muted"}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${current ? "border-accent bg-accent text-white" : done ? "border-orange-200 bg-orange-50 text-accent" : "border-border bg-white"}`}>{done ? <Check size={12} /> : i + 1}</span>{label}{skipped && <span className="text-[10px] font-normal">{t("跳过", "skipped")}</span>}
            </div>{i < 4 && <ChevronRight size={13} className="shrink-0 text-slate-300" />}</React.Fragment>;
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
        {[
          [t("池内真实本金", "Pool principal"), money(market.R), t("不包含手续费", "Excludes fee assets")],
          [t("正式市场启动资金达标率", "Formal funding progress"), `${(cover * 100).toFixed(1)}%`, market.frozen ? t("停盘时的覆盖率", "Coverage at close") : t("资金足额还需通过卖值保护", "Funding also needs exit protection")],
          [t("Genesis 锁定出资", "Genesis locked capital"), money(market.L), graduated ? t("毕业后已并入做市本金", "Unified with market funds after graduation") : t("Genesis卖出不能动用", "Protected from Genesis share sales")],
          [t("累计待分配手续费", "Remaining fee assets"), money(feeTotal, 4), t("与赔付本金分别记账", "Accounted separately from principal")],
        ].map(([label, value, note]) => <div key={label} className="bg-white p-4 sm:px-6"><div className="text-[11px] text-text-muted">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div><div className="mt-1 text-[10px] leading-4 text-text-muted">{note}</div></div>)}
      </div>

      {(market.phase === "CREATE" || market.phase === "GENESIS") && <div className="border-b border-border bg-orange-50/40 px-5 py-4 sm:px-7" data-testid="genesis-rules">
        <p className="text-sm font-semibold">{t("Genesis：买哪边，只涨哪边；卖哪边，只跌哪边。", "Genesis: buying or selling changes only that side’s price.")}</p>
        <p className="mt-1 text-xs leading-5 text-text-muted">{t("无交易价格不动。毕业后采用标准LMSR，YES／NO恢复联动。", "No trade means no price change. After graduation, standard LMSR links YES and NO.")}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs"><strong>{t("① 真实资金足额", "① Fully funded")} · {gate.fundingReady ? t("已满足", "Passed") : t("未满足", "Pending")}</strong><p className="mt-1 text-text-muted">{money(market.R)} / {money(gate.required)}{t("（正式LMSR所需）", " required by Formal LMSR")}</p></div>
          <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs"><strong>{t("② 毕业卖值保护", "② Exit-value protection")} · {gate.protectionReady ? t("已满足", "Passed") : t("未满足", "Pending")}</strong><p className="mt-1 text-text-muted">{gate.protectionReady ? t("当前持仓的任意减仓可安全衔接", "All reductions of current holdings can safely migrate") : t("此时毕业会降低部分持仓的卖值，继续Genesis", "Some exits would lose value; remain in Genesis")}</p></div>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-text-muted">{t("两项同时满足才毕业。普通纯买不会让本候选毕业；买卖周转可累积9%出资，但仍须通过卖值保护。每轮周转都会产生费用。", "Both checks are required. Pure buying cannot graduate this candidate. Turnover can accumulate the 9% capital, but exit protection must also pass. Each round trip incurs fees.")}</p>
      </div>}

      <div className="grid lg:grid-cols-[1fr_330px]">
        <div className="min-w-0 p-5 sm:p-7">
          {market.phase === "CREATE" ? <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/40 p-6">
            <Flag size={25} className="mb-4 text-accent" /><h4 className="text-lg font-bold">{t("创建者零本金启动", "Launch with zero seed capital")}</h4>
            <p className="mt-2 text-sm leading-6 text-text-muted">{t("创建时池内余额为零。玩家买入后，90%进入交易资金，9%锁定为出资，1%作为手续费。", "The pool starts empty. Genesis payments allocate 90% to trading, 9% to locked capital, and 1% to fees.")}</p>
            <label className="mt-5 block text-xs text-text-muted">{t("演示深度 b", "Demo depth b")}<select className="ml-3 rounded-lg border border-border bg-white px-3 py-2 text-text" value={market.b} onChange={e => setMarket(newMarket(Number(e.target.value)))}><option value={150}>150</option><option value={300}>300</option><option value={1000}>1000</option></select></label>
            <button className={`${control} mt-5 w-full border-accent bg-accent text-white hover:brightness-110`} onClick={() => { if (!isWalletConnected) connectWallet(); apply(createMarket, t("市场已创建。现在可以用模拟账户买入。", "Market created. Buy shares with the demo accounts.")); }}><Flag size={14} />{t("创建零本金市场", "Create zero-capital market")}</button>
          </div> : live ? <>
            <div className="mb-5 grid grid-cols-2 gap-3">{(["YES", "NO"] as Side[]).map((s, i) => <button key={s} onClick={() => setSide(s)} className={`rounded-xl border p-4 text-left transition-colors ${side === s ? (i === 0 ? "border-emerald-500 bg-emerald-50/60" : "border-rose-400 bg-rose-50/50") : "border-border hover:bg-slate-50"}`}>
              <div className={`flex items-center justify-between text-xs font-bold ${i === 0 ? "text-emerald-700" : "text-rose-600"}`}><span>{s}</span>{side === s && <Check size={13} />}</div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums">{money(price.ask[i], 4)}</div><div className="mt-1 text-[10px] text-text-muted">{t("每份实付买价", "Marginal buy price, all-in")}</div>
              <div className="mt-2 text-[10px] text-text-muted">{t("净卖出报价", "Net marginal sell")} {money(price.bid[i], 4)}</div>
            </button>)}</div>
            <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1">{(["BUY", "SELL"] as const).map(v => <button key={v} onClick={() => { setMode(v); setAmount(v === "BUY" ? "2" : ""); }} className={`rounded-md py-2 text-xs font-bold transition-colors ${mode === v ? "bg-white text-text shadow-sm" : "text-text-muted"}`}>{v === "BUY" ? t("买入", "Buy") : t("卖出", "Sell")}</button>)}</div>
            <label className="block text-xs font-semibold" htmlFor="lifecycle-order-amount">{mode === "BUY" ? t("支付预算（dUSD）", "Payment budget (dUSD)") : t("卖出份额", "Shares to sell")}</label>
            <div className="relative mt-2"><input id="lifecycle-order-amount" type="number" inputMode="decimal" min="0" step="any" placeholder={mode === "BUY" ? "2.00" : "0.0000"} value={amount} onChange={e => setAmount(e.target.value)} className="w-full rounded-lg border border-border bg-white px-4 py-3 pr-16 text-xl font-medium outline-none focus:border-accent" /><span className="absolute right-4 top-4 text-xs text-text-muted">{mode === "BUY" ? "dUSD" : side}</span></div>
            <div className="mt-2 flex flex-wrap gap-2">{mode === "BUY" ? [2, 10, 100, 500].map(v => <button key={v} className={`${control} border-border py-1.5 text-[11px] hover:border-accent`} onClick={() => setAmount(String(v))}>{money(v, 0)}</button>) : [25, 50, 100].map(v => <button key={v} className={`${control} border-border py-1.5 text-[11px] hover:border-accent`} onClick={() => setAmount(String(account.shares[side === "YES" ? 0 : 1] * v / 100))}>{v}%</button>)}</div>
            <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-4 text-xs">
              <div className="flex justify-between"><span className="text-text-muted">{mode === "BUY" ? t("预计买到", "Estimated shares") : t("预计净到账", "Estimated net receipt")}</span><strong className="tabular-nums">{quote ? mode === "BUY" ? `${amountText(quote.quantity, 4)} ${side}` : money(quote.actual, 4) : "—"}</strong></div>
              <div className="flex justify-between"><span className="text-text-muted">{t("实付 / 到账均价", "Average all-in / net price")}</span><span>{quote ? money(quote.average, 4) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">{t("手续费", "Fee")}</span><span>{quote ? money(quote.fee, 4) : "—"}</span></div>
              {mode === "BUY" && <div className="flex justify-between"><span className="text-text-muted">{t("本笔锁定出资", "New locked capital")}</span><span>{quote ? money(quote.contribution, 4) : "—"}</span></div>}
              {!!quote?.unused && quote.unused > .000001 && <div className="flex justify-between text-accent"><span>{t("未用预算留在钱包", "Unused budget stays in wallet")}</span><strong>{money(quote.unused)}</strong></div>}
              {quote?.graduated && <div className="border-t border-border pt-2 text-accent">{t("本笔通过两项毕业检查；切换后YES／NO联动，截止不变。", "This trade passes both checks; prices become linked and the deadline stays unchanged.")}</div>}
            </div>
            <button disabled={!quote} onClick={execute} className={`${control} mt-4 w-full border-accent bg-accent py-3 text-sm text-white hover:brightness-110`}>
              {mode === "BUY" ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
              {mode === "BUY" ? t(`买入 ${side}${quote ? ` · 支付 ${money(quote.actual)}` : ""}`, `Buy ${side}${quote ? ` · Pay ${money(quote.actual)}` : ""}`) : t(`卖出 ${side}${quote ? ` · 到账 ${money(quote.actual)}` : ""}`, `Sell ${side}${quote ? ` · Receive ${money(quote.actual)}` : ""}`)}
            </button>
            <p className="mt-3 text-[11px] leading-5 text-text-muted">{market.phase === "GENESIS" ? t("实付90%用于份额交易，9%锁定出资，1%手续费。毕业只改变资金用途，不向钱包返还出资。", "Genesis: 90% trading, 9% locked capital, 1% fee. Graduation changes capital use; it does not refund contributions.") : t("正式市场：实付99%进入LMSR，1%手续费；不再新增9%出资。", "Formal: 99% of payment enters LMSR; 1% is the fee. No new 9% contribution.")}</p>
          </> : market.phase === "WAIT_CORE" ? <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5">
            <Clock3 className="mb-3 text-blue-600" size={25} /><h4 className="text-lg font-bold">{t("市场已停盘，等待 OCP Core", "Trading closed. Waiting for OCP Core.")}</h4>
            <p className="mt-2 text-sm leading-6 text-text-muted">{t("Genesis 和正式市场的共同截止已经到达。买卖均已停止；Core 可以在之后发布最终结果，持仓和资金已冻结。", "The shared deadline has passed. Trading is stopped and the ledger is frozen. Core may publish the final result later.")}</p>
            <div className="mt-5 rounded-lg border border-blue-100 bg-white p-4"><p className="mb-3 text-xs font-semibold">{t("演示控制：模拟 Core 发布最终结果", "Demo control: simulate a final Core result")}</p><div className="grid grid-cols-3 gap-2">{(["YES", "NO", "INVALID"] as Outcome[]).map(v => <button key={v} className={`${control} border-border hover:border-accent`} onClick={() => apply(m => publishResult(m, v), t(`Core 已发布 ${v}，可以领取结算。`, `Core published ${v}. Claims are now available.`))}>{v}</button>)}</div><p className="mt-3 text-[10px] leading-4 text-text-muted">{t("仅供本地验收；真实玩家不能自行选择结果。", "Local testing only. Real traders cannot choose the outcome.")}</p></div>
          </div> : <div className={`rounded-xl border p-5 ${failed ? "border-amber-200 bg-amber-50/40" : "border-emerald-100 bg-emerald-50/40"}`}>
            <Coins size={25} className={failed ? "mb-3 text-amber-600" : "mb-3 text-emerald-600"} /><h4 className="text-lg font-bold">{failed ? t("到期未毕业，按现有资金清算", "Unfunded at expiry: liquidate actual funds") : t(`最终结果：${market.result}`, `Final outcome: ${market.result}`)}</h4>
            <p className="mt-2 text-sm leading-6 text-text-muted">{failed ? t("交易资金按最终YES＋NO总份额分配，锁定出资按各自实际贡献返还。不按原买入成本退款，也不承诺每份$1或$0.50。", "Trading funds are distributed by final YES + NO shares; locked capital is returned by actual contribution. This is not a cost refund or a face-value payout.") : market.result === "INVALID" ? t("每份YES和NO各赔$0.50；剩余资本按历史出资权重分配，另领已归属的手续费奖励。", "Each YES and NO share pays $0.50. Residual capital follows contribution weights; accrued rewards are separate.") : t(`每份${market.result}赔$1，另一侧赔$0；资本贡献者只分赔付后的真实余款。`, `Each ${market.result} share pays $1; the other side pays $0. Contributors receive only actual residual capital.`)}</p>
            <div className="mt-5 space-y-2.5 rounded-lg border border-border bg-white p-4 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">{failed ? t("份额分配款", "Share-weighted distribution") : t("份额赔付款", "Share redemption")}</span><strong>{money(payout?.shares ?? 0, 4)}</strong></div>
              <div className="flex justify-between"><span className="text-text-muted">{failed ? t("锁定出资返还", "Locked contribution returned") : t("结算剩余资本", "Residual capital")}</span><strong>{money(payout?.capital ?? 0, 4)}</strong></div>
              <div className="flex justify-between"><span className="text-text-muted">{t("贡献者手续费奖励", "Contributor fee rewards")}</span><strong>{money(payout?.reward ?? 0, 4)}</strong></div>
              <div className="flex justify-between border-t border-border pt-3"><span>{account.claimed ? t("本账户已领取", "This account claimed") : t("本账户可领取", "Claimable by this account")}</span><strong className="text-lg">{money(payout?.total ?? 0, 4)}</strong></div>
            </div>
            <button className={`${control} mt-4 w-full border-accent bg-accent py-3 text-sm text-white`} disabled={account.claimed} onClick={() => apply(m => claimPayout(m, active), t("已领取，资金进入当前模拟钱包。不能重复领取。", "Claimed to this demo wallet. A second claim is blocked."))}>{account.claimed ? <Check size={15} /> : <ArrowDownLeft size={15} />}{account.claimed ? t("已领取 · 不可重复", "Claimed · no repeat claims") : t(`领取 ${money(payout?.total ?? 0)}`, `Claim ${money(payout?.total ?? 0)}`)}</button>
            <p className="mt-3 text-[11px] text-text-muted">{t("历史手续费不退；不另收清算费；出资不会重复返还。", "Historical fees are not refunded. No liquidation fee or duplicate capital refund.")}</p>
          </div>}
          {notice && <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50/50 px-3 py-2.5 text-xs leading-5 text-orange-800" role="status">{notice}</div>}
        </div>

        <aside className="border-t border-border bg-slate-50/50 p-5 sm:p-7 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Wallet size={15} />{t("模拟账户", "Demo account")}</div>
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg border border-border bg-white p-1">{names.map((name, i) => <button key={name} onClick={() => setActive(i)} className={`rounded-md px-1 py-2 text-[11px] font-semibold ${active === i ? "bg-slate-900 text-white" : "text-text-muted hover:bg-slate-50"}`}>{name}</button>)}</div>
          <div className="rounded-xl border border-border bg-white p-4"><p className="text-[11px] text-text-muted">{t("钱包可用余额", "Available wallet balance")}</p><strong className="mt-1 block text-2xl tabular-nums">{money(account.wallet)}</strong><p className="mt-1 text-[10px] text-text-muted">{t("初始模拟余额 $10,000", "Initial demo balance $10,000")}</p></div>
          <div className="mt-5 space-y-3 text-xs">
            <div className="flex justify-between"><span className="text-text-muted">{t("持有YES", "YES held")}</span><strong className="text-emerald-700">{amountText(account.claimed ? 0 : account.shares[0], 4)}</strong></div>
            <div className="flex justify-between"><span className="text-text-muted">{t("持有NO", "NO held")}</span><strong className="text-rose-600">{amountText(account.claimed ? 0 : account.shares[1], 4)}</strong></div>
            <div className="flex justify-between"><span className="text-text-muted">{t("历史实际出资", "Historical contribution")}</span><strong>{money(account.credit, 4)}</strong></div>
            <div className="flex justify-between"><span className="text-text-muted">{t("累计买入支付", "Total buy payments")}</span><strong>{money(account.paid)}</strong></div>
            <div className="flex justify-between border-t border-border pt-3"><span className="text-text-muted">{ended && account.claimed ? t("最终净盈亏", "Final net P&L") : t("钱包净变化", "Wallet cash change")}</span><strong className={account.wallet >= 10000 ? "text-emerald-700" : "text-rose-600"}>{account.wallet >= 10000 ? "+" : "−"}{money(Math.abs(account.wallet - 10000))}</strong></div>
            {ended && !account.claimed && <div className="flex justify-between"><span className="text-text-muted">{t("领取后净盈亏", "Net P&L after claim")}</span><strong className={account.wallet + (payout?.total ?? 0) >= 10000 ? "text-emerald-700" : "text-rose-600"}>{money(account.wallet + (payout?.total ?? 0) - 10000)}</strong></div>}
          </div>
          <div className="mt-6 border-t border-border pt-4"><div className="mb-3 text-[11px] font-semibold">{t("手续费去向", "Fee allocation")}</div><div className="space-y-2 text-[11px] text-text-muted"><div className="flex justify-between"><span>OCP Core</span><span>{money(market.fees.core, 4)}</span></div><div className="flex justify-between"><span>{t("贡献者待领奖励", "Unclaimed contributor rewards")}</span><span>{money(market.fees.capital, 4)}</span></div><div className="flex justify-between"><span>{t("协议费用", "Protocol fees")}</span><span>{money(market.fees.protocol, 4)}</span></div></div><p className="mt-3 text-[10px] leading-4 text-text-muted">{t("Genesis手续费全部归协议。正式手续费：70% Core、20%贡献者、10%协议。", "Genesis fees go to the protocol. Formal fees: 70% Core, 20% contributors, 10% protocol.")}</p></div>
        </aside>
      </div>

      <div className="border-t border-border bg-slate-50/70 px-5 py-4 sm:px-7">
        <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[11px] font-semibold text-text-muted">{t("演示控制", "Demo controls")}</span>
          <button disabled={!live} className={`${control} border-border bg-white`} onClick={() => apply(m => advanceTime(m, 30), t("演示时间已前进30秒。", "Demo time advanced by 30 seconds."))}>+30s</button>
          <button disabled={!live} className={`${control} border-orange-200 bg-white text-accent`} onClick={() => apply(m => advanceTime(m, m.deadline - m.now), t("已到共同截止：交易停止，按是否毕业进入对应终结路径。", "Shared deadline reached. Trading stopped; the terminal path follows graduation status."))}><Clock3 size={13} />{t("快进至共同截止", "Advance to shared deadline")}</button>
          <button disabled={!ended || market.accounts.every(a => a.claimed)} className={`${control} border-border bg-white`} onClick={() => apply(m => m.accounts.reduce((n, a, i) => a.claimed ? n : claimPayout(n, i), m), t("所有模拟账户已领取。Core和协议费用仍属于各自费用账户。", "All demo accounts claimed. Core and protocol fees remain separate."))}>{t("模拟全部账户领取", "Claim for all demo accounts")}</button>
        </div>
      </div>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_330px]">
      <div className="rounded-xl border border-border bg-white p-5"><h4 className="mb-4 text-xs font-semibold">{t("市场事件", "Market events")}</h4><div className="max-h-52 space-y-3 overflow-y-auto pr-2" aria-label={t("市场事件记录", "Market event log")}>{market.events.length ? [...market.events].reverse().slice(0, 20).map(e => <div key={e.id} className="flex gap-3 text-xs leading-5"><span className="shrink-0 font-mono text-[10px] text-text-muted">{timerText(e.at)}</span><span className={e.kind === "GRADUATE" || e.kind === "RESULT" ? "font-semibold text-accent" : "text-text-muted"}>{eventText(e)}</span></div>) : <p className="text-xs text-text-muted">{t("创建市场后，操作记录会显示在这里。", "Create a market to start its event history.")}</p>}</div></div>
      <div className="rounded-xl border border-border bg-white p-5"><h4 className="mb-3 text-xs font-semibold">{t("资金核对", "Cash reconciliation")}</h4><div className="space-y-2 text-[11px] text-text-muted"><div className="flex justify-between"><span>{t("三个模拟钱包", "Three demo wallets")}</span><span>{money(market.accounts.reduce((n, a) => n + a.wallet, 0))}</span></div><div className="flex justify-between"><span>{t("池内剩余本金", "Remaining principal")}</span><span>{money(market.R, 4)}</span></div><div className="flex justify-between"><span>{t("剩余手续费资产", "Remaining fee assets")}</span><span>{money(feeTotal, 4)}</span></div>{ended && <div className="flex justify-between"><span>{t("待领取总额", "Unclaimed payouts")}</span><span>{money(unclaimed, 4)}</span></div>}<div className="flex justify-between border-t border-border pt-2 font-semibold text-text"><span>{t("资金合计", "Total cash")}</span><span>{money(totalCash, 4)}</span></div></div><p className="mt-3 text-[10px] leading-4 text-text-muted">{t("模拟资金总额始终为$30,000。领取是资金转移，不是额外增发。", "Demo cash totals $30,000. Claims transfer existing money; they do not mint more.")}</p></div>
    </div>
    <p className="mt-4 text-[10px] leading-5 text-text-muted">{t("独立 Genesis v2：各侧价格只随自身净份额变化，固定90／9／1；毕业需资金足额且保护卖值。默认 b=150、开盘实付价$0.01为演示参数，尚非生产合约。", "Independent Genesis v2: each side follows its own outstanding shares, with 90/9/1 payments. Graduation needs funding and exit protection. b=150 and a $0.01 opening ask are demo parameters, not production contracts.")}</p>
  </div>;
};
