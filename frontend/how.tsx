import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowDown,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  GitBranch,
  Landmark,
  Scale,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
  XCircle,
} from "lucide-react";

import "./index.css";
import { LanguageToggle } from "./components/LanguageToggle";
import { OCPMenu } from "./components/OCPMenu";
import type { Language } from "./types";

const copy = {
  en: {
    navExplore: "Open markets",
    eyebrow: "CAPITAL CONSENSUS × CONTINUOUS PRICING",
    title: "How OCP & Market Works",
    intro:
      "One proposition creates two connected ledgers. OCP locks capital to determine the final outcome. The LMSR market lets traders price that outcome continuously before the deadline.",
    notOracle: "OCP outputs capital confidence—not guaranteed objective truth.",
    vault: "OCP Vault",
    vaultDesc: "Participants lock capital on YES, NO, or INVALID. Capital cannot withdraw or switch sides before the fixed deadline.",
    market: "LMSR Market",
    marketDesc: "Traders buy and sell YES or NO shares instantly against a subsidized mathematical curve. No external LP is required.",
    shared: "Shared final outcome",
    sharedDesc: "The Vault finalizes once. The Market reads that exact OnChain outcome and settles every outstanding share.",
    lifecycle: "One market lifecycle",
    steps: [
      ["Official creation", "The Factory atomically creates a Vault and Market, then locks the LMSR subsidy."],
      ["Capital + trading", "Vault staking and Market trading remain open until the same fixed deadline."],
      ["Fees accrue", "Every buy and sell charges 1.2% on actual USDC cash flow."],
      ["Finalization", "Any address may trigger finalization after the deadline; the result cannot be changed."],
      ["Claims", "Vault principal, fee rewards, PM shares, and official fees are claimed from separate accounting buckets."],
    ],
    capitalLab: "Capital consensus lab",
    capitalLabDesc: "Adjust each side. YES or NO must hold strictly more than 50% of all Vault principal.",
    total: "Total capital",
    result: "Final result",
    perUnit: "Vault payout per 1 staked",
    allRefund: "All sides share the pool pro rata (normally a principal refund).",
    marketLab: "LMSR price lab",
    marketLabDesc: "Move the net YES share position. With b = 1,000, larger orders move the marginal price along the curve.",
    netShares: "Net YES shares − NO shares",
    marginal: "Current marginal price",
    curveNote: "A trade executes along the curve, so its average price differs from the final marginal price.",
    formula: "Core LMSR formulas",
    maxLoss: "Maximum market-maker loss",
    subsidy: "For b = 1,000, required initial subsidy ≈ 693.147183 USDC.",
    feeTitle: "Every trade: 1.2% fee",
    vaultFee: "1.0% → Vault fee ledger",
    protocolFee: "0.2% → official initial-liquidity pool",
    feeBasis: "Calculated on USDC actually paid or received—not on nominal share value.",
    outcomes: "What happens at settlement",
    yesResult: "YES > 50% of all Vault capital",
    noResult: "NO > 50% of all Vault capital",
    invalidResult: "Neither YES nor NO exceeds 50%",
    vaultSettlement: "Vault",
    pmSettlement: "Prediction Market",
    feeSettlement: "1% fee ledger",
    yesVault: "YES stakers share the entire Vault pool.",
    noVault: "NO stakers share the entire Vault pool.",
    invalidVault: "YES, NO, and INVALID participants share the pool pro rata.",
    yesPm: "YES share = 1 USDC · NO share = 0",
    noPm: "NO share = 1 USDC · YES share = 0",
    invalidPm: "YES share = 0.5 USDC · NO share = 0.5 USDC",
    yesFee: "Only the time-weighted YES ledger is paid.",
    noFee: "Only the time-weighted NO ledger is paid.",
    invalidFee: "YES + NO stakers share the combined time-weighted ledger. INVALID stakes receive no PM fees.",
    separation: "Two roles, two risks",
    staker: "Vault staker",
    stakerDesc: "Commits capital to determine the outcome. A losing binary side—including INVALID when YES/NO wins—can lose its principal.",
    trader: "PM trader",
    traderDesc: "Takes a priced YES/NO position. Shares can be sold before the deadline or redeemed after settlement.",
    coupling: "The same wallet may be both.",
    couplingDesc: "PM positions and Vault stakes are separate ledgers, but the Vault result settles the PM. Capital can therefore influence the outcome of a position it holds.",
    boundaries: "Important boundaries",
    boundariesList: [
      "The deadline is fixed; there is no extension or challenge phase.",
      "OCP is capital consensus, not an external evidence oracle.",
      "LMSR guarantees continuous quotes, not zero price impact.",
      "Buy and sell both charge 1.2%; a full round trip pays fees twice.",
      "INVALID is a risky veto position: successful INVALID normally refunds principal; failed INVALID loses to the binary winner.",
    ],
    cta: "See it live OnChain",
    ctaDesc: "Open Stake War to inspect Vault capital, LMSR prices, fees, positions, and settlement state.",
  },
  zh: {
    navExplore: "打开市场",
    eyebrow: "资本共识 × 连续定价",
    title: "OCP 与预测市场如何协作",
    intro: "一个命题对应两套相连的账本：OCP 用锁定资本决定最终结果；LMSR 预测市场在截止前持续为这个结果定价。",
    notOracle: "OCP 输出的是资本置信度，不保证等于客观事实。",
    vault: "OCP Vault",
    vaultDesc: "参与者把资本锁定在 YES、NO 或 INVALID。固定截止前不能撤回，也不能换边。",
    market: "LMSR 预测市场",
    marketDesc: "交易者直接沿数学曲线买卖 YES 或 NO 份额，无需外部 LP，即时获得链上报价。",
    shared: "共享同一个最终结果",
    sharedDesc: "Vault 只终局一次；Market 读取这个链上结果，并据此结算全部未兑付份额。",
    lifecycle: "一个市场的生命周期",
    steps: [
      ["官方创建", "Factory 原子创建 Vault 与 Market，同时锁定 LMSR 初始补贴。"],
      ["资本与交易", "Vault 质押和 Market 交易开放到同一个固定截止时间。"],
      ["手续费累计", "每次买入和卖出均按实际 USDC 现金流收取1.2%。"],
      ["终局", "截止后任何地址都可触发，结果一旦写入便不可更改。"],
      ["分别领取", "Vault 本金、手续费奖励、PM 份额与官方费用使用独立资金桶领取。"],
    ],
    capitalLab: "资本共识实验",
    capitalLabDesc: "调整三边资本。YES 或 NO 必须严格超过 Vault 全部本金的50%。",
    total: "总资本",
    result: "最终结果",
    perUnit: "每质押1单位的 Vault 兑付",
    allRefund: "所有方向按本金比例分享资金池，正常情况下等于退回本金。",
    marketLab: "LMSR 价格实验",
    marketLabDesc: "调整 YES 净份额。这里 b=1,000；订单越大，沿曲线推动边际价格越明显。",
    netShares: "YES 净份额 − NO 净份额",
    marginal: "当前边际价格",
    curveNote: "交易沿曲线成交，因此平均成交价不会等于交易后的最终边际价格。",
    formula: "LMSR 核心公式",
    maxLoss: "做市部分最大亏损",
    subsidy: "当 b=1,000 时，需要锁定的初始补贴约为693.147183 USDC。",
    feeTitle: "每笔交易：1.2%手续费",
    vaultFee: "1.0% → Vault 手续费账本",
    protocolFee: "0.2% → 官方初始流动性池",
    feeBasis: "按用户实际支付或收到的 USDC 计算，不按份额名义价值计算。",
    outcomes: "三种终局分别发生什么",
    yesResult: "YES > Vault 全部资本的50%",
    noResult: "NO > Vault 全部资本的50%",
    invalidResult: "YES 与 NO 都未超过50%",
    vaultSettlement: "Vault",
    pmSettlement: "预测市场",
    feeSettlement: "1%手续费账",
    yesVault: "YES 质押者瓜分整个 Vault 资金池。",
    noVault: "NO 质押者瓜分整个 Vault 资金池。",
    invalidVault: "YES、NO、INVALID 全部按本金比例分享资金池。",
    yesPm: "YES 每份=1 USDC · NO 每份=0",
    noPm: "NO 每份=1 USDC · YES 每份=0",
    invalidPm: "YES 每份=0.5 USDC · NO 每份=0.5 USDC",
    yesFee: "只兑现按在场时间累计的 YES 手续费账。",
    noFee: "只兑现按在场时间累计的 NO 手续费账。",
    invalidFee: "YES 与 NO 质押者共享合并的时间加权手续费账；INVALID 质押不获得 PM 手续费。",
    separation: "两个角色，两套风险",
    staker: "Vault 质押者",
    stakerDesc: "用资本决定终局。二元结果下，失败方向会损失本金；YES/NO 胜出时 INVALID 也属于失败方。",
    trader: "PM 交易者",
    traderDesc: "持有按价格买入的 YES/NO 份额；截止前可以卖出，终局后可以兑付。",
    coupling: "同一个钱包可以同时扮演两种角色。",
    couplingDesc: "PM 仓位与 Vault 质押是两套账，但 Vault 结果负责结算 PM，因此资本可以影响自己持有仓位的最终结果。",
    boundaries: "必须理解的边界",
    boundariesList: [
      "截止时间固定，没有延期或挑战期。",
      "OCP 是资本共识，不是外部证据 Oracle。",
      "LMSR 保证持续报价，不保证零价格影响。",
      "买入和卖出都收1.2%；完整进出会支付两次手续费。",
      "INVALID 是有风险的否决方向：INVALID 成功通常只退本金，失败则本金归二元胜方。",
    ],
    cta: "查看真实链上市场",
    ctaDesc: "进入 Stake War，查看 Vault 资本、LMSR 价格、手续费、个人仓位与结算状态。",
  },
} as const;

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-7">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">{eyebrow}</div>
      <h2 className="mt-2 font-display text-xl font-bold tracking-wide text-text sm:text-2xl">{title}</h2>
    </div>
  );
}

function CapitalLab({ lang }: { lang: Language }) {
  const t = copy[lang];
  const [yes, setYes] = useState(60);
  const [no, setNo] = useState(30);
  const [invalid, setInvalid] = useState(10);
  const total = Math.max(0, yes) + Math.max(0, no) + Math.max(0, invalid);
  const outcome = total > 0 && yes * 2 > total ? "YES" : total > 0 && no * 2 > total ? "NO" : "INVALID";
  const yesPct = total ? (yes / total) * 100 : 0;
  const noPct = total ? (no / total) * 100 : 0;
  const invalidPct = total ? (invalid / total) * 100 : 0;
  const winnerCapital = outcome === "YES" ? yes : outcome === "NO" ? no : total;
  const perUnit = winnerCapital > 0 ? total / winnerCapital : 0;

  const field = (label: string, value: number, setter: (value: number) => void, color: string) => (
    <label className="rounded-xl border border-border bg-white/60 p-3">
      <span className={`text-[10px] font-bold ${color}`}>{label}</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => setter(Math.max(0, Number(event.target.value) || 0))}
        className="mt-1 w-full bg-transparent text-lg font-bold text-text outline-none"
      />
    </label>
  );

  return (
    <div className="rounded-2xl border border-border bg-white/45 p-5 shadow-sm sm:p-6">
      <div className="grid grid-cols-3 gap-2">
        {field("YES", yes, setYes, "text-success")}
        {field("NO", no, setNo, "text-danger")}
        {field("INVALID", invalid, setInvalid, "text-yellow-600")}
      </div>
      <div className="mt-5 flex h-4 overflow-hidden rounded-full border border-border bg-white">
        <div className="bg-success transition-all" style={{ width: `${yesPct}%` }} />
        <div className="bg-danger transition-all" style={{ width: `${noPct}%` }} />
        <div className="bg-yellow-400 transition-all" style={{ width: `${invalidPct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 text-[10px] font-bold">
        <span className="text-success">YES {yesPct.toFixed(1)}%</span>
        <span className="text-center text-danger">NO {noPct.toFixed(1)}%</span>
        <span className="text-right text-yellow-600">INVALID {invalidPct.toFixed(1)}%</span>
      </div>
      <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
        <div><div className="text-[10px] text-text-muted">{t.total}</div><div className="mt-1 font-bold">{total.toFixed(2)}</div></div>
        <div><div className="text-[10px] text-text-muted">{t.result}</div><div className={`mt-1 font-bold ${outcome === "YES" ? "text-success" : outcome === "NO" ? "text-danger" : "text-yellow-600"}`}>{outcome}</div></div>
        <div><div className="text-[10px] text-text-muted">{t.perUnit}</div><div className="mt-1 font-bold">{perUnit.toFixed(4)}</div></div>
      </div>
      {outcome === "INVALID" && <p className="mt-4 text-xs leading-5 text-text-muted">{t.allRefund}</p>}
    </div>
  );
}

function LmsrLab({ lang }: { lang: Language }) {
  const t = copy[lang];
  const [netShares, setNetShares] = useState(0);
  const yesPrice = 1 / (1 + Math.exp(-netShares / 1000));
  return (
    <div className="rounded-2xl border border-border bg-white/45 p-5 shadow-sm sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] text-text-muted">{t.netShares}</div>
          <div className="mt-1 font-bold tabular-nums">{netShares.toLocaleString()} shares</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-muted">{t.marginal}</div>
          <div className="mt-1 font-bold"><span className="text-success">YES {(yesPrice * 100).toFixed(1)}%</span> · <span className="text-danger">NO {((1 - yesPrice) * 100).toFixed(1)}%</span></div>
        </div>
      </div>
      <input
        type="range"
        min="-3000"
        max="3000"
        step="50"
        value={netShares}
        onChange={(event) => setNetShares(Number(event.target.value))}
        className="mt-7 w-full accent-orange-600"
      />
      <div className="mt-2 flex justify-between text-[10px] text-text-muted"><span>NO</span><span>50 / 50</span><span>YES</span></div>
      <div className="mt-6 rounded-xl border border-border bg-white/70 p-4 font-mono text-xs leading-6">
        <div>C(q) = b · ln(e<sup>qᵧ/b</sup> + e<sup>qₙ/b</sup>)</div>
        <div>p(YES) = e<sup>qᵧ/b</sup> / (e<sup>qᵧ/b</sup> + e<sup>qₙ/b</sup>)</div>
      </div>
      <p className="mt-4 text-xs leading-5 text-text-muted">{t.curveNote}</p>
    </div>
  );
}

function HowPage() {
  const [lang, setLang] = useState<Language>("en");
  const t = copy[lang];
  const outcomeCards = useMemo(() => [
    { result: "YES", condition: t.yesResult, color: "border-success/35", text: "text-success", vault: t.yesVault, pm: t.yesPm, fee: t.yesFee, icon: CheckCircle2 },
    { result: "NO", condition: t.noResult, color: "border-danger/35", text: "text-danger", vault: t.noVault, pm: t.noPm, fee: t.noFee, icon: XCircle },
    { result: "INVALID", condition: t.invalidResult, color: "border-yellow-500/45", text: "text-yellow-600", vault: t.invalidVault, pm: t.invalidPm, fee: t.invalidFee, icon: TriangleAlert },
  ], [t]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-text">
      <nav className="sticky top-0 z-50 border-b border-border bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <OCPMenu lang={lang} suffix="HOW IT WORKS" />
          <div className="flex items-center gap-3">
            <a href="/explore.html" className="hidden items-center gap-2 rounded-lg border border-accent/40 px-3 py-2 text-xs font-bold text-accent transition-colors hover:bg-accent/5 sm:inline-flex">
              <Landmark className="h-3.5 w-3.5" />{t.navExplore}
            </a>
            <LanguageToggle lang={lang} setLang={setLang} />
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden border-b border-border px-4 py-20 sm:py-28">
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 20% 15%, rgba(234,88,12,.18), transparent 30%), radial-gradient(circle at 80% 75%, rgba(91,33,182,.13), transparent 32%)" }} />
          <div className="relative mx-auto max-w-4xl text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">{t.eyebrow}</div>
            <h1 className="mt-5 font-display text-3xl font-black tracking-wide text-text text-glow sm:text-5xl">{t.title}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 text-text-muted sm:text-base">{t.intro}</p>
            <div className="mx-auto mt-7 inline-flex items-center gap-2 rounded-full border border-yellow-500/40 bg-yellow-50 px-4 py-2 text-[11px] font-bold text-yellow-800">
              <TriangleAlert className="h-4 w-4" />{t.notOracle}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-2xl border border-accent/30 bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Scale className="h-5 w-5" /></div>
              <h2 className="mt-5 font-display text-lg font-bold">{t.vault}</h2><p className="mt-3 text-sm leading-6 text-text-muted">{t.vaultDesc}</p>
            </div>
            <div className="flex items-center justify-center text-accent"><ArrowRight className="hidden h-6 w-6 lg:block" /><ArrowDown className="h-6 w-6 lg:hidden" /></div>
            <div className="rounded-2xl border border-accent-2/30 bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-accent-2"><TrendingUp className="h-5 w-5" /></div>
              <h2 className="mt-5 font-display text-lg font-bold">{t.market}</h2><p className="mt-3 text-sm leading-6 text-text-muted">{t.marketDesc}</p>
            </div>
          </div>
          <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-border bg-slate-900 p-5 text-center text-white">
            <GitBranch className="mx-auto h-5 w-5 text-orange-400" /><h3 className="mt-2 font-display text-sm font-bold">{t.shared}</h3><p className="mt-2 text-xs leading-5 text-slate-300">{t.sharedDesc}</p>
          </div>
        </section>

        <section className="border-y border-border bg-white/55">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <SectionTitle eyebrow="01 / FLOW" title={t.lifecycle} />
            <div className="grid gap-3 md:grid-cols-5">
              {t.steps.map(([title, description], index) => (
                <div key={title} className="relative rounded-xl border border-border bg-white p-4">
                  <div className="text-[10px] font-bold text-accent">0{index + 1}</div>
                  <h3 className="mt-3 font-display text-xs font-bold">{title}</h3>
                  <p className="mt-2 text-[11px] leading-5 text-text-muted">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div><SectionTitle eyebrow="02 / OCP VAULT" title={t.capitalLab} /><p className="-mt-4 mb-6 text-sm leading-6 text-text-muted">{t.capitalLabDesc}</p><CapitalLab lang={lang} /></div>
          <div><SectionTitle eyebrow="03 / LMSR" title={t.marketLab} /><p className="-mt-4 mb-6 text-sm leading-6 text-text-muted">{t.marketLabDesc}</p><LmsrLab lang={lang} /></div>
        </section>

        <section className="border-y border-border bg-slate-950 text-white">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-14 sm:px-6 md:grid-cols-2 lg:px-8">
            <div className="rounded-2xl border border-slate-700 p-6">
              <CircleDollarSign className="h-6 w-6 text-orange-400" /><h2 className="mt-4 font-display text-lg font-bold">{t.formula}</h2>
              <div className="mt-5 font-mono text-sm text-slate-200">{t.maxLoss} = b · ln(2)</div><p className="mt-3 text-xs leading-6 text-slate-400">{t.subsidy}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 p-6">
              <BadgeDollarSign className="h-6 w-6 text-orange-400" /><h2 className="mt-4 font-display text-lg font-bold">{t.feeTitle}</h2>
              <div className="mt-5 space-y-2 text-sm"><div className="text-emerald-400">{t.vaultFee}</div><div className="text-purple-300">{t.protocolFee}</div></div>
              <p className="mt-3 text-xs leading-6 text-slate-400">{t.feeBasis}</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionTitle eyebrow="04 / SETTLEMENT" title={t.outcomes} />
          <div className="grid gap-4 lg:grid-cols-3">
            {outcomeCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.result} className={`rounded-2xl border bg-white p-5 ${card.color}`}>
                  <div className="flex items-center gap-3"><Icon className={`h-5 w-5 ${card.text}`} /><span className={`font-display font-bold ${card.text}`}>{card.result}</span></div>
                  <p className="mt-3 min-h-10 text-xs leading-5 text-text-muted">{card.condition}</p>
                  <div className="mt-5 space-y-4 border-t border-border pt-5 text-xs leading-5">
                    <div><div className="text-[10px] font-bold uppercase text-text-muted">{t.vaultSettlement}</div><div className="mt-1">{card.vault}</div></div>
                    <div><div className="text-[10px] font-bold uppercase text-text-muted">{t.pmSettlement}</div><div className="mt-1">{card.pm}</div></div>
                    <div><div className="text-[10px] font-bold uppercase text-text-muted">{t.feeSettlement}</div><div className="mt-1">{card.fee}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border bg-white/55">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <SectionTitle eyebrow="05 / ROLES" title={t.separation} />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-white p-6"><Users className="h-6 w-6 text-accent" /><h3 className="mt-4 font-display font-bold">{t.staker}</h3><p className="mt-3 text-sm leading-6 text-text-muted">{t.stakerDesc}</p></div>
              <div className="rounded-2xl border border-border bg-white p-6"><Banknote className="h-6 w-6 text-accent-2" /><h3 className="mt-4 font-display font-bold">{t.trader}</h3><p className="mt-3 text-sm leading-6 text-text-muted">{t.traderDesc}</p></div>
            </div>
            <div className="mt-4 rounded-2xl border border-accent/30 bg-orange-50 p-6"><h3 className="font-display text-sm font-bold text-accent">{t.coupling}</h3><p className="mt-2 text-sm leading-6 text-text-muted">{t.couplingDesc}</p></div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="rounded-3xl border border-border bg-white p-6 sm:p-9">
            <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-accent" /><h2 className="font-display text-xl font-bold">{t.boundaries}</h2></div>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {t.boundariesList.map((item) => <div key={item} className="flex gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-text-muted"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{item}</div>)}
            </div>
          </div>
          <div className="mt-8 rounded-3xl bg-accent px-6 py-9 text-center text-white">
            <h2 className="font-display text-xl font-bold">{t.cta}</h2><p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-orange-100">{t.ctaDesc}</p>
            <a href="/explore.html" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-xs font-bold text-accent transition-transform hover:scale-[1.02]">{t.navExplore}<ArrowRight className="h-4 w-4" /></a>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-7 text-center text-[10px] text-text-muted">OCP · OnChain Consensus Protocol</footer>
    </div>
  );
}

const root = document.getElementById("root");
if (root) ReactDOM.createRoot(root).render(<React.StrictMode><HowPage /></React.StrictMode>);
