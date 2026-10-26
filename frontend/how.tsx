import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ArrowDown,
  ArrowLeftRight,
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
import {createTopicMarketDemo,topicMarketCreate,topicMarketBuy,topicMarketSell} from './components/topicMarketDemoModel';
import {genesisTokens,genesisPrice} from './components/genesisDisplay';

const copy = {
  en: {
    navExplore: "Open OCP Market",
    eyebrow: "CAPITAL CONSENSUS × CONTINUOUS PRICING",
    title: "How OCP Core & OCP Market Work",
    intro:
      "Launch a topic at zero initial capital. Trade gToken during Genesis. When both funding targets are met, Genesis ends and the formal market and OCP Core open together.",
    notOracle: "OCP Market is a multiplayer virtual trading game. Markets follow real elapsed time on the server; funds are virtual and no on-chain transactions are required.",
    vault: "OCP Core",
    vaultDesc: "Opens only after Genesis graduation. Stake on YES, NO or INVALID; your chosen side is locked until settlement. Core capital determines the final result.",
    market: "Market",
    marketDesc: "After graduation, buy and sell YES / NO shares. Trades change market prices; they do not directly change Core stakes or the final result.",
    shared: "Shared final outcome",
    sharedDesc: "Core finalizes one result: YES, NO or INVALID. Market shares and LP / B rights settle using that same result.",
    lifecycle: "One market lifecycle",
    steps: [["Launch a topic", "Define the question and YES / NO / INVALID criteria. Launch with zero creator capital and set one final Core deadline. Genesis closes one hour before the formal market, two hours before the final Core deadline, and may graduate earlier."], ["Trade gToken", "Buy and sell on the Genesis curve. For a buy of 100 dUSDC, 94.5 buys gToken, 4.5 enters the B risk reserve and earns B tokens, and 1 is the creator fee. Sales use the same split on the curve gross amount."], ["Graduate in either direction", "Targets are R = 3.6 ETH equivalent and B = 0.6 ETH equivalent, converted at creation and fixed in dUSDC. Each buy or sell checks both targets; the triggering order executes in full, then graduation is immediate. Genesis gToken becomes LP rights."], ["Formal Market + Core open", "Both open at graduation. Set one final Core deadline. The formal market closes 1 hour earlier, and Genesis closes 1 hour before the formal market. Deadlines follow server time, without fast-forward. Early graduation opens trading sooner; it does not reset deadlines."], ["Trade and stake", "Formal market trades allocate 98% to share purchases / seller proceeds, 0.5% to LP, 0.5% to B and 1% to Core rewards. Core staking is separate; eligible stakes earn fees only as those fees occur."], ["Settle and claim", "Core determines the result. Claim winning shares, Core principal / rewards and LP / B settlement amounts. Redeeming LP and B burns those tokens. If Genesis fails, R is distributed by gToken holdings and B by B-token holdings; creator fees are not refunded."]],
    capitalLab: "Capital consensus lab",
    capitalLabDesc: "An illustrative Core snapshot: YES or NO must exceed 50% of all three sides combined. Otherwise the result is INVALID.",
    total: "Total capital",
    result: "Final result",
    perUnit: "Winning-side Core payout per unit",
    allRefund: "For INVALID, each side receives its own staked principal back; rewards are accounted for separately.",
    marketLab: "Market price example",
    marketLabDesc: "Illustrative price curve, not a quote from an active market. Adjust the net share balance to see price impact.",
    netShares: "Net YES shares − NO shares",
    marginal: "Current marginal price",
    curveNote: "A trade executes along the curve, so its average price differs from the final marginal price.",
    formula: "LP and B at settlement",
    maxLoss: "B covers LP losses first",
    subsidy: "Pool cash, accumulated LP fees and outcome inventory form LP net assets. B first covers any shortfall against the fixed LP basis, up to the available B reserve. LP receives net assets plus that cover; B holders receive the reserve left over. Neither is guaranteed a profit.",
    feeTitle: "Market trades: 2% total allocation",
    vaultFee: "1% → eligible Core rewards",
    protocolFee: "0.5% → LP · 0.5% → B reserve · no fixed creator or protocol cut",
    feeBasis: "Buy 100 dUSDC: 98 buys shares. Sell for a curve gross amount of 100: receive 98. The remaining 2 is split as above; the pool pays the full gross amount on a sale.",
    outcomes: "What happens at settlement",
    yesResult: "YES exceeds 50% of all Core principal",
    noResult: "NO exceeds 50% of all Core principal",
    invalidResult: "Neither YES nor NO exceeds 50%",
    vaultSettlement: "OCP Core",
    pmSettlement: "Market shares",
    feeSettlement: "Core rewards (1%)",
    yesVault: "YES stakers share the entire Core principal pool. Other sides lose their principal.",
    noVault: "NO stakers share the entire Core principal pool. Other sides lose their principal.",
    invalidVault: "Each account receives its own Core principal back.",
    yesPm: "YES pays 1 dUSDC per share; NO pays 0.",
    noPm: "NO pays 1 dUSDC per share; YES pays 0.",
    invalidPm: "YES and NO each pay 0.5 dUSDC per share.",
    yesFee: "Pays the YES-eligible rewards accrued when fees occurred; late staking earns no past fees.",
    noFee: "Pays the NO-eligible rewards accrued when fees occurred; late staking earns no past fees.",
    invalidFee: "Pays the INVALID-conditional ledger to eligible YES / NO stakes. INVALID stakes receive no market-fee rewards.",
    separation: "Two roles, two risks",
    staker: "Core staker",
    stakerDesc: "Back an outcome with principal, locked until settlement without withdrawals or switching sides. Winners share losing-side principal and fees contributed by the market in proportion to their eligible stakes.",
    trader: "Market trader",
    traderDesc: "Takes a priced YES/NO position. Shares can be sold before the deadline or redeemed after settlement.",
    coupling: "The same wallet may be both.",
    couplingDesc: "Market holdings and Core stakes are separate. Holding LP or B does not automatically earn Core rewards; staking in Core does not automatically grant LP or B.",
    boundaries: "Important boundaries",
    boundariesList: ["The current release is a multiplayer virtual trading game. Creating and trading markets requires sign-in; no real funds are used.", "Core opens only after graduation. A failed Genesis never opens formal market trading or Core staking.", "Genesis has a single gToken curve: R = kS², P = 2kS. Price starts at zero with zero supply; buying and selling use curve integration.", "LP remains locked until settlement in the current demo. LP / B secondary trading is not offered. Their conditional payout estimates are not executable sale prices.", "B earns 0.5% of formal market trading amounts, but absorbs LP losses first. B fees do not mint new B tokens; remaining reserves can grow or be exhausted.", "At Genesis failure, fixed snapshot budgets and denominators determine refunds. Claim order does not change the per-token payout; paid creator fees are not refunded.", "Core measures capital consensus. Its outcome is not a guarantee of independently verified facts."],
    cta: "Enter OCP Market",
    ctaDesc: "Write a topic, trade through Genesis, and explore formal market trading, Core staking and conditional LP / B payouts.",
  },
  zh: {
    navExplore: "打开市场",
    eyebrow: "资本共识 × 连续定价",
    title: "OCP Core 与市场如何协作",
    intro: "零初始本金发射话题，在 Genesis 买卖 gToken。双池达标即毕业，正式市场与 OCP Core 同时开启，最后按 Core 结果结算。",
    notOracle: "OCP Market 是多人虚拟交易游戏。市场按服务器的真实时间运行，资金为虚拟资金，不发起链上交易。",
    vault: "OCP Core",
    vaultDesc: "Genesis 毕业后才开启。选择 YES、NO 或 INVALID 质押，选定后只能同侧追加，资金锁定至结算；Core 质押资本决定最终结果。",
    market: "市场",
    marketDesc: "毕业后买卖 YES／NO 份额。交易影响市场价格，不会直接改变 Core 质押或最终结果。",
    shared: "共享同一个最终结果",
    sharedDesc: "Core 产生 YES、NO 或 INVALID 结果；市场份额及 LP／B 权益使用同一结果结算。",
    lifecycle: "一个市场的生命周期",
    steps: [["发射话题", "填写话题内容，定义 YES／NO／INVALID 判定条件。创建者无需初始本金；Genesis比正式市场提前1小时截止，达标可提前毕业；只需设置最终Core截止时间。"], ["买卖 gToken", "Genesis 按曲线买卖。买入 100 dUSDC，94.5 买 gToken，4.5 计入 B 做市风险准备金并获得 B 代币，1 为创建者手续费。卖出按曲线毛额采用相同比例。"], ["买卖都可触发毕业", "R 目标为 3.6 ETH 等值，B 目标为 0.6 ETH 等值，创建时快照换算后固定。每笔买卖完成后检查双池，达标立即毕业。触发订单完整成交；gToken 转为 LP 权益。"], ["市场与 Core 同时开启", "仅毕业后开放。只需设置最终Core截止：正式市场提前1小时关闭，Genesis再提前1小时截止。所有截止时间按服务器时间计算，不能快进。提前毕业就提前开放，但不重置截止时间。"], ["交易与质押", "正式买卖的98%用于购买份额／卖家实收，0.5%归LP，0.5%进入B，1%归Core奖励。Core质押独立记账，只分参与期间符合条件的新增费用。"], ["结算并领取", "按Core结果领取份额赔付、Core本金及奖励，以及LP／B结算款。领取LP、B需销毁对应代币。未毕业则R按gToken份额、B按B代币份额清算，已付创建者手续费不退。"]],
    capitalLab: "资本共识实验",
    capitalLabDesc: "这是一个 Core 资本快照示例：YES 或 NO 必须严格超过三个方向全部质押的50%，否则为 INVALID。",
    total: "总资本",
    result: "最终结果",
    perUnit: "Core胜方每单位本金兑付",
    allRefund: "INVALID 时各账户领取自己的质押本金，费用奖励独立计算。",
    marketLab: "市场价格示例",
    marketLabDesc: "调整净份额，观察交易带来的价格影响。这里只是曲线示例，不是某个真实市场的可成交报价。",
    netShares: "YES 净份额 − NO 净份额",
    marginal: "当前边际价格",
    curveNote: "交易沿曲线成交，因此平均成交价不会等于交易后的最终边际价格。",
    formula: "LP 与 B 如何结算",
    maxLoss: "B 优先补偿 LP 做市亏损",
    subsidy: "池内现金、累计LP费用及YES／NO库存的结算价值形成LP净资产。低于固定LP本金基准时，B按实际余额优先补损。LP领取净资产加补损；B持有人分配补损后的剩余准备金，两者都不保证盈利。",
    feeTitle: "正式市场：费用合计2%",
    vaultFee: "1% → Core合格质押者奖励",
    protocolFee: "0.5% → LP · 0.5% → B准备金 · 创建者及协议固定分成均为0",
    feeBasis: "买入100 dUSDC，98用于购买份额；卖出曲线毛额100，98到账，其余2按上述比例分配。卖出时交易池支付完整毛额，不是只扣98。",
    outcomes: "三种终局分别发生什么",
    yesResult: "YES严格超过Core全部质押本金的50%",
    noResult: "NO严格超过Core全部质押本金的50%",
    invalidResult: "YES与NO均未严格超过50%",
    vaultSettlement: "OCP Core",
    pmSettlement: "市场份额",
    feeSettlement: "Core奖励（1%）",
    yesVault: "YES质押者按比例分享Core全部质押本金，其他方向损失本金。",
    noVault: "NO质押者按比例分享Core全部质押本金，其他方向损失本金。",
    invalidVault: "各账户领取自己的Core质押本金。",
    yesPm: "YES每份兑付1 dUSDC，NO为0。",
    noPm: "NO每份兑付1 dUSDC，YES为0。",
    invalidPm: "YES与NO每份各兑付0.5 dUSDC。",
    yesFee: "领取费用发生时累计的YES条件奖励；晚质押不分过去的费用。",
    noFee: "领取费用发生时累计的NO条件奖励；晚质押不分过去的费用。",
    invalidFee: "按INVALID条件账向合格YES／NO质押者分配；INVALID质押不获得市场费用奖励。",
    separation: "两个角色，两套风险",
    staker: "Core质押者",
    stakerDesc: "用本金支持一个结果，结算前不能撤回或换边。赢方按比例分享输方本金及市场输入的手续费。",
    trader: "市场交易者",
    traderDesc: "持有按价格买入的 YES/NO 份额；截止前可以卖出，终局后可以兑付。",
    coupling: "同一个钱包可以同时扮演两种角色。",
    couplingDesc: "市场持仓与Core质押独立记账。持有LP或B不会自动获得Core奖励；质押Core也不会自动获得LP或B。",
    boundaries: "必须理解的边界",
    boundariesList: ["当前发布的是多人虚拟交易游戏，登录后可以创建和交易市场；不使用真实资金。", "Core只在Genesis毕业后开启；未毕业清算不会开启正式交易或Core质押。", "Genesis采用单一gToken二次曲线：R = kS²，P = 2kS。零供应时价格为零，实际买卖按曲线积分成交。", "当前模拟中LP持有至结算，不提供中途撤走或LP／B二级交易。不同结果下的预计领取金额不是可直接卖出的价格。", "B获得正式交易额的0.5%收入，但优先承担LP做市亏损。新增费用不增发B代币；剩余准备金可能增加，也可能耗尽。", "未毕业清算使用失败时固定的预算与总份额，先领后领不改变每份兑付金额；创建者手续费不退。", "Core体现资本共识，不保证结果经过外部事实验证。"],
    cta: "进入 OCP Market",
    ctaDesc: "填写话题，从 Genesis 买卖开始，体验正式交易到最终结算的完整周期。",
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
      <details className="mt-6 rounded-xl border border-border bg-white/70 p-4 text-xs leading-6"><summary className="cursor-pointer text-text-muted">{lang==='zh'?'查看定价公式':'Pricing formulas'}</summary><div className="mt-3 font-mono">
        <div>C(q) = b · ln(e<sup>qᵧ/b</sup> + e<sup>qₙ/b</sup>)</div>
        <div>p(YES) = e<sup>qᵧ/b</sup> / (e<sup>qᵧ/b</sup> + e<sup>qₙ/b</sup>)</div>
      </div></details>
      <p className="mt-4 text-xs leading-5 text-text-muted">{t.curveNote}</p>
    </div>
  );
}

function GenesisLab({lang}:{lang:Language}) {
  const zh=lang==='zh';
  const initial=()=>topicMarketCreate(createTopicMarketDemo({Q:2000,b:150,creatorAccount:-1,protocolAccount:-1}));
  const [state,setState]=useState(initial),[amount,setAmount]=useState(100),[message,setMessage]=useState('');
  const active=state.phase==='GENESIS',account=state.accounts[0];
  const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:2});
  const transact=(buy:boolean)=>{try{setState(buy?topicMarketBuy(state,0,amount):topicMarketSell(state,0,account.g/2));setMessage('')}catch{setMessage(zh?'请检查金额、余额或持仓。':'Check amount, balance and holdings.')}};
  return <div className="rounded-2xl border border-border bg-white p-5 sm:p-6" data-testid="genesis-lab">
    <div className="flex justify-between items-center gap-3"><strong>{zh?'买卖 gToken，观察价格与毕业进度':'Trade gToken and watch graduation progress'}</strong><button type="button" onClick={()=>{setState(initial());setMessage('')}} className="text-xs underline text-accent">{zh?'重置':'Reset'}</button></div>
    <div className="grid grid-cols-2 gap-4 my-5"><div><p className="text-xs text-text-muted">{zh?'gToken价格':'gToken price'}</p><strong className="block mt-2">{genesisPrice(2*state.k*state.S)} dUSDC</strong></div><div><p className="text-xs text-text-muted">{zh?'我的gToken':'My gToken'}</p><strong className="block mt-2">{fmt(genesisTokens(account.g))}</strong></div></div>
    <label className="block text-xs text-text-muted">{zh?'买入金额（dUSDC）':'Buy amount (dUSDC)'}<input aria-label={zh?'Genesis买入金额':'Genesis buy amount'} type="number" min="0.01" step="1" disabled={!active} value={amount} onChange={e=>setAmount(Number(e.target.value))} className="mt-2 w-full border border-border rounded-lg p-3 text-text"/></label>
    <div className="flex gap-3 my-3"><button type="button" disabled={!active||!Number.isFinite(amount)||amount<=0||amount>account.wallet} onClick={()=>transact(true)} className="flex-1 border border-success/40 text-success rounded-lg p-3 text-sm font-bold disabled:opacity-40">{zh?'买入gToken':'Buy gToken'}</button><button type="button" disabled={!active||account.g<=0} onClick={()=>transact(false)} className="flex-1 border border-danger/40 text-danger rounded-lg p-3 text-sm font-bold disabled:opacity-40">{zh?'卖出一半':'Sell half'}</button></div>
    <div className="text-xs text-text-muted mb-5">{zh?'可用余额':'Available balance'}: {fmt(account.wallet)} dUSDC</div>
    {([['R',state.R,state.rTarget],['B',state.B,state.bTarget]] as const).map(([name,value,target])=><div key={name} className="mt-3"><div className="flex justify-between text-xs mb-2"><strong>{name}</strong><span>{fmt(value)} / {fmt(target)} dUSDC</span></div><div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className={name==='R'?'h-full bg-purple-500':'h-full bg-orange-500'} style={{width:`${Math.min(100,value/target*100)}%`}}/></div></div>)}
    <p className="mt-4 text-xs leading-6 text-text-muted">{active?(zh?'买入推动价格上涨；卖出使价格下降并继续增加B。R与B同时达标即毕业，买卖都可能触发。':'Buys raise the price. Sales lower it and still add to B. Either direction can trigger graduation when both targets are met.'):(zh?'已毕业：Genesis停止交易，Formal与Core同时开启。点击重置重新体验。':'Graduated: Genesis closes; Formal and Core open together. Reset to try again.')}</p>
    <details className="mt-3 text-xs text-text-muted"><summary className="cursor-pointer">{zh?'费用说明':'Cost details'}</summary><p className="mt-2 leading-6">{zh?'买入100：94.5买gToken，4.5计入B并获得B份额，1为创建者手续费。卖出毛额100：94.5到账，4.5计入B，1为创建者手续费。':'Buy 100: 94.5 buys gToken, 4.5 enters B and earns B shares, and 1 pays the creator. Sell gross 100: receive 94.5, B receives 4.5 and the creator receives 1.'}</p></details>
    {message&&<p role="alert" className="text-danger text-xs mt-2">{message}</p>}
  </div>;
}

function HowPage() {
  const [lang, setLang] = useState<Language>(() => new URLSearchParams(window.location.search).get("lang") === "zh" ? "zh" : "en");
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

        <section className="mx-auto max-w-3xl px-4 pt-10 pb-2 sm:px-6">
          <div className="rounded-2xl border border-border bg-white p-5 text-center text-sm font-bold leading-8">{lang==='zh'?'发射话题 → Genesis → 毕业 → LMSR二元市场交易与 Core 质押 → 结算':'Launch → Genesis → Graduation → LMSR binary market trading & Core staking → Settlement'}</div>
          <p className="mt-3 text-center text-xs leading-6 text-text-muted">{lang==='zh'?'填写话题及 YES／NO／INVALID 条件即可发射，创建者无需初始本金。以下为模拟演示，不使用真实资金。':'Define a topic and YES / NO / INVALID criteria to launch with no creator principal. The examples below are simulations with no real funds.'}</p>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6" id="genesis-guide"><SectionTitle eyebrow="01 / GENESIS" title={lang==='zh'?'Genesis · 启动与价格发现':'Genesis · Launch and price discovery'}/><p className="-mt-4 mb-6 text-sm leading-6 text-text-muted">{lang==='zh'?'通过早期投机交易实现话题冷启动、价格发现和做市资本积累，并筛选有真实市场需求的话题进入 Formal Market。采用二次储备曲线：买入推高价格，卖出降低价格，实际成交按曲线积分计算。':'Early trading bootstraps topics, discovers prices and builds market-making capital, filtering demand into the Formal Market. A quadratic reserve curve raises prices on buys and lowers them on sales; orders execute along the curve.'}</p><details className="mb-5 text-xs text-text-muted"><summary className="cursor-pointer">{lang==='zh'?'价格曲线与毕业条件':'Price curve and graduation rules'}</summary><p className="mt-3 leading-7">{lang==='zh'?'R = kS²，边际价格 P = 2kS。R 是真实储备，S 是内部计量供应量，k 是固定曲线参数；展示面额为每个内部份额 1,000 万枚 gToken，页面单价相应除以 1,000 万。零供应时价格为零。R 达到 3.6 ETH 等值、B 达到 0.6 ETH 等值时毕业，目标按创建时价格快照固定；买卖均可触发。':'R = kS²; marginal price P = 2kS. R is real reserve, S is internal supply and k is fixed. Each internal unit displays as 10 million gToken, with the displayed price divided accordingly. Price starts at zero supply. Graduation requires R ≥ 3.6 ETH equivalent and B ≥ 0.6 ETH equivalent, fixed at creation; buys or sales can trigger it.'}</p></details><GenesisLab lang={lang}/><div className="mt-8 rounded-2xl border border-border bg-white p-5 sm:p-6" id="graduation-guide"><h3 className="font-display text-xl font-bold mb-3">{lang==='zh'?'毕业转换':'Graduation conversion'}</h3><p className="text-sm leading-7 text-text">{lang==='zh'?'gToken → 正式LMSR二元市场的 LP 代币':'gToken → LP tokens in the formal LMSR binary market'}</p><p className="mt-2 text-sm leading-7 text-text-muted">{lang==='zh'?'按你持有的 gToken 占总供应量的比例，转换为 LP 代币，代表正式市场流动性池的份额，享有做市资产及 LP 费用的相应权益。':'Your share of the total gToken supply converts into LP tokens, representing proportional rights to the Formal Market liquidity pool’s assets and LP fees.'}</p><p className="mt-2 text-sm leading-7 text-text-muted">{lang==='zh'?'B 代币独立保留，代表做市风险准备金权益。gToken 不直接转换为 YES／NO 份额。':'B tokens remain separate rights to the market-making risk reserve. gToken does not convert directly into YES / NO shares.'}</p></div></section>

        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><SectionTitle eyebrow="02 / FORMAL" title={t.marketLab}/><p className="-mt-4 mb-6 text-sm leading-6 text-text-muted">{t.marketLabDesc}</p><p className="mb-5 text-sm leading-7 text-text-muted">{lang==='zh'?'毕业后与 Core 同时开启。买卖 YES／NO 份额，截止前可卖出，最终按 Core 结果兑付。交易费用合计 2%：LP 0.5%、B 0.5%、Core 1%。交易在创建时设定的Core截止前1小时停止，按服务器真实时间计算。':'Opens with Core at graduation. Trade YES / NO shares until the trading deadline; settlement follows Core. Trading fees total 2%: LP 0.5%, B 0.5%, Core 1%. Trading closes one hour before the Core deadline set at creation, following real elapsed server time.'}</p><LmsrLab lang={lang}/></section>
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><SectionTitle eyebrow="03 / OCP CORE" title={t.capitalLab}/><p className="-mt-4 mb-6 text-sm leading-6 text-text-muted">{t.capitalLabDesc}</p><p className="mb-5 text-sm leading-7 text-text-muted">{lang==='zh'?'用本金支持一个结果，结算前不能撤回或换边。赢方按比例分享输方本金及参与期间符合条件的市场费用。毕业后开启，在创建时设定的最终截止时间结束质押并确定结果，比市场交易晚1小时。':'Commit principal to an outcome; stakes cannot be withdrawn or switched before settlement. Winners share losing principal and eligible market fees accrued while participating. Opens at graduation. Staking closes and the result is determined at the final deadline set at creation, one hour after trading closes.'}</p><CapitalLab lang={lang}/></section>



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
          </div>          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white p-5"><h3 className="font-bold text-sm">{lang==='zh'?'LP 与 B':'LP and B'}</h3><p className="mt-3 text-sm leading-7 text-text-muted">{lang==='zh'?'LP 分享做市资产及 LP 费用，B 准备金优先补偿 LP 做市亏损。结算后，LP 领取对应资产及补偿，B 按份额领取补损后的剩余准备金。领取时销毁对应代币，两者均可能盈利或亏损。':'LP shares market-making assets and LP fees. B absorbs LP losses first. At settlement LP receives its assets and loss coverage; B holders share the remaining reserve. Claims burn the corresponding tokens. Both can gain or lose value.'}</p></div>
            <div className="rounded-2xl border border-border bg-white p-5"><h3 className="font-bold text-sm">{lang==='zh'?'如果 Genesis 未毕业':'If Genesis does not graduate'}</h3><p className="mt-3 text-sm leading-7 text-text-muted">{lang==='zh'?'到Genesis截止时（正式市场截止前1小时）仍未达标，则进入失败清算，市场与 Core 均不开启。R 按 gToken 份额领取，B 按 B 代币份额领取，销毁对应权益；已支付的创建者费用不退。':'If targets are not met by the Genesis deadline, one hour before the formal market closes, Genesis enters failure settlement. Neither the formal market nor Core opens. R is claimed by gToken share and B by B-token share, burning the corresponding rights. Creator fees already paid are not refunded.'}</p></div>
          </div>

        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="mt-8 rounded-3xl bg-accent px-6 py-9 text-center text-white">
            <h2 className="font-display text-xl font-bold">{t.cta}</h2><p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-orange-100">{t.ctaDesc}</p>
            <a href={`https://market.ocp-protocol.org/?lang=${lang}`} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-xs font-bold text-accent transition-transform hover:scale-[1.02]">{t.cta}<ArrowRight className="h-4 w-4" /></a>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-7 text-center text-[10px] text-text-muted">OCP · OnChain Consensus Protocol</footer>
    </div>
  );
}

const root = document.getElementById("root");
if (root) ReactDOM.createRoot(root).render(<React.StrictMode><HowPage /></React.StrictMode>);
