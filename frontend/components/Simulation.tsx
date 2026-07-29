import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, LayoutDashboard, ShieldAlert, Zap } from "lucide-react";
import { Button } from "./Button";
import type { Language } from "../types";

interface Props {
  lang: Language;
  isWalletConnected: boolean;
  balance: number;
  setBalance: (amount: number) => void;
  connectWallet: () => void;
}

export type VaultSide = "YES" | "NO" | "INVALID";
export type MarketSide = "YES" | "NO";
export type TradeMode = "BUY" | "SELL";
type Phase = "STAKING" | "READY" | "FINALIZED";
type Tab = "PROTOCOL" | "MARKET";

const INITIAL_BALANCE = 10_000;
const INITIAL_STAKES: Record<VaultSide, number> = { YES: 40, NO: 30, INVALID: 0 };
const INITIAL_MARKET_SHARES: Record<MarketSide, number> = { YES: 0, NO: 0 };
const INITIAL_USER_SHARES: Record<MarketSide, number> = { YES: 0, NO: 0 };
const INITIAL_FEES: Record<VaultSide, number> = { YES: 0, NO: 0, INVALID: 0 };
const LIQUIDITY_PARAMETER = 100;
const REQUIRED_SUBSIDY = LIQUIDITY_PARAMETER * Math.log(2);
const MIN_STAKE = 1;
const TOTAL_FEE_RATE = 0.012;
const VAULT_FEE_RATE = 0.01;
const PROTOCOL_LP_FEE_RATE = 0.002;
const SLIPPAGE_RATE = 0.01;

function lmsrCost(yesShares: number, noShares: number): number {
  const yes = yesShares / LIQUIDITY_PARAMETER;
  const no = noShares / LIQUIDITY_PARAMETER;
  const max = Math.max(yes, no);
  return LIQUIDITY_PARAMETER * (
    max + Math.log(Math.exp(yes - max) + Math.exp(no - max)) - Math.log(2)
  );
}

export function lmsrYesPrice(yesShares: number, noShares: number): number {
  return 1 / (1 + Math.exp((noShares - yesShares) / LIQUIDITY_PARAMETER));
}

export function deriveOutcome(stakes: Record<VaultSide, number>): VaultSide {
  const total = stakes.YES + stakes.NO + stakes.INVALID;
  if (stakes.YES > total - stakes.YES) return "YES";
  if (stakes.NO > total - stakes.NO) return "NO";
  return "INVALID";
}

export function buildQuote(
  amount: number,
  marketShares: Record<MarketSide, number>,
  side: MarketSide,
  mode: TradeMode,
) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (mode === "SELL" && amount > marketShares[side]) return null;

  const currentYesPrice = lmsrYesPrice(marketShares.YES, marketShares.NO);
  const currentSidePrice = side === "YES" ? currentYesPrice : 1 - currentYesPrice;
  const beforeCost = lmsrCost(marketShares.YES, marketShares.NO);
  const nextShares = { ...marketShares };
  nextShares[side] += mode === "BUY" ? amount : -amount;
  const afterCost = lmsrCost(nextShares.YES, nextShares.NO);
  const gross = mode === "BUY" ? afterCost - beforeCost : beforeCost - afterCost;
  if (gross <= 0) return null;

  const fee = gross * TOTAL_FEE_RATE;
  const cashFlow = mode === "BUY" ? gross + fee : gross - fee;
  const nextYesPrice = lmsrYesPrice(nextShares.YES, nextShares.NO);
  const nextPrice = side === "YES" ? nextYesPrice : 1 - nextYesPrice;

  return {
    gross,
    fee,
    cashFlow,
    averagePrice: gross / amount,
    nextPrice,
    priceImpact: Math.abs(((nextPrice - currentSidePrice) / currentSidePrice) * 100),
    protectedCashFlow:
      mode === "BUY"
        ? cashFlow * (1 + SLIPPAGE_RATE)
        : cashFlow * (1 - SLIPPAGE_RATE),
  };
}

export function marketRedemption(
  outcome: VaultSide,
  shares: Record<MarketSide, number>,
): number {
  if (outcome === "YES") return shares.YES;
  if (outcome === "NO") return shares.NO;
  return (shares.YES + shares.NO) / 2;
}

function formatAmount(value: number, digits = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function sideTextColor(side: VaultSide): string {
  if (side === "YES") return "text-success";
  if (side === "NO") return "text-danger";
  return "text-yellow-600";
}

export const Simulation: React.FC<Props> = ({
  lang,
  isWalletConnected,
  balance,
  setBalance,
  connectWallet,
}) => {
  const zh = lang === "zh";
  const [phase, setPhase] = useState<Phase>("STAKING");
  const [timeLeft, setTimeLeft] = useState(60);
  const [activeTab, setActiveTab] = useState<Tab>("PROTOCOL");
  const [amount, setAmount] = useState(10);
  const [tradeMode, setTradeMode] = useState<TradeMode>("BUY");
  const [stakes, setStakes] = useState<Record<VaultSide, number>>(INITIAL_STAKES);
  const [userVaultSide, setUserVaultSide] = useState<VaultSide | null>(null);
  const [userStake, setUserStake] = useState(0);
  const [marketShares, setMarketShares] =
    useState<Record<MarketSide, number>>(INITIAL_MARKET_SHARES);
  const [userShares, setUserShares] =
    useState<Record<MarketSide, number>>(INITIAL_USER_SHARES);
  const [totalVolume, setTotalVolume] = useState(0);
  const [vaultFees, setVaultFees] = useState(0);
  const [protocolLpFees, setProtocolLpFees] = useState(0);
  const [distributedFees, setDistributedFees] =
    useState<Record<VaultSide, number>>(INITIAL_FEES);
  const [userConditionalFees, setUserConditionalFees] =
    useState<Record<VaultSide, number>>(INITIAL_FEES);
  const [finalOutcome, setFinalOutcome] = useState<VaultSide | null>(null);
  const [vaultClaimed, setVaultClaimed] = useState(false);
  const [marketRedeemed, setMarketRedeemed] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (phase !== "STAKING") return;
    const timer = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setPhase("READY");
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const totalStake = stakes.YES + stakes.NO + stakes.INVALID;
  const yesStakePct = totalStake > 0 ? (stakes.YES / totalStake) * 100 : 0;
  const noStakePct = totalStake > 0 ? (stakes.NO / totalStake) * 100 : 0;
  const invalidStakePct = Math.max(0, 100 - yesStakePct - noStakePct);
  const yesPrice = lmsrYesPrice(marketShares.YES, marketShares.NO);
  const noPrice = 1 - yesPrice;
  const feeRoi = totalStake > 0 ? (vaultFees / totalStake) * 100 : 0;
  const provisionalOutcome = deriveOutcome(stakes);
  const quoteYes = useMemo(
    () => buildQuote(amount, marketShares, "YES", tradeMode),
    [amount, marketShares, tradeMode],
  );
  const quoteNo = useMemo(
    () => buildQuote(amount, marketShares, "NO", tradeMode),
    [amount, marketShares, tradeMode],
  );

  const requireWallet = (): boolean => {
    if (isWalletConnected) return true;
    connectWallet();
    setNotice(zh ? "模拟钱包已连接，请再次操作。" : "Demo wallet connected. Try again.");
    return false;
  };

  const accrueVaultFee = (grossCashFlow: number) => {
    const vaultFee = grossCashFlow * VAULT_FEE_RATE;
    const lpFee = grossCashFlow * PROTOCOL_LP_FEE_RATE;
    const totalYes = stakes.YES;
    const totalNo = stakes.NO;
    const totalEligible = totalYes + totalNo;

    setVaultFees((value) => value + vaultFee);
    setProtocolLpFees((value) => value + lpFee);
    setDistributedFees((value) => ({
      YES: value.YES + (totalYes > 0 ? vaultFee : 0),
      NO: value.NO + (totalNo > 0 ? vaultFee : 0),
      INVALID: value.INVALID + (totalEligible > 0 ? vaultFee : 0),
    }));

    // 与 OCPVault 的三套条件账一致：交易发生时按在场资本记账，
    // 后续新增质押只能参与未来手续费，不能追溯领取历史手续费。
    if (userStake > 0 && userVaultSide === "YES") {
      setUserConditionalFees((value) => ({
        ...value,
        YES: value.YES + vaultFee * userStake / totalYes,
        INVALID: value.INVALID + vaultFee * userStake / totalEligible,
      }));
    } else if (userStake > 0 && userVaultSide === "NO") {
      setUserConditionalFees((value) => ({
        ...value,
        NO: value.NO + vaultFee * userStake / totalNo,
        INVALID: value.INVALID + vaultFee * userStake / totalEligible,
      }));
    }
  };

  const stake = (side: VaultSide) => {
    if (!requireWallet() || phase !== "STAKING") return;
    if (!Number.isFinite(amount) || amount < MIN_STAKE) {
      setNotice(zh ? `最小质押为 ${MIN_STAKE} dUSDC。` : `Minimum stake is ${MIN_STAKE} dUSDC.`);
      return;
    }
    if (amount > balance) {
      setNotice(zh ? "模拟钱包余额不足。" : "Insufficient demo balance.");
      return;
    }
    if (userVaultSide && userVaultSide !== side) {
      setNotice(zh ? "质押方向已经锁定，不能换边。" : "Your stake side is locked.");
      return;
    }

    setUserVaultSide(side);
    setUserStake((value) => value + amount);
    setStakes((value) => ({ ...value, [side]: value[side] + amount }));
    setBalance(balance - amount);
    setNotice(
      zh
        ? `已在 ${side} 方向质押 ${formatAmount(amount)} dUSDC。`
        : `Staked ${formatAmount(amount)} dUSDC on ${side}.`,
    );
  };

  const trade = (side: MarketSide) => {
    if (!requireWallet() || phase !== "STAKING") return;
    const quote = side === "YES" ? quoteYes : quoteNo;
    if (!quote) {
      setNotice(
        tradeMode === "SELL"
          ? (zh ? `可卖出的 ${side} 份额不足。` : `Not enough ${side} shares to sell.`)
          : (zh ? "请输入有效份额。" : "Enter a valid share amount."),
      );
      return;
    }
    if (tradeMode === "BUY" && quote.cashFlow > balance) {
      setNotice(zh ? "模拟钱包余额不足。" : "Insufficient demo balance.");
      return;
    }
    if (tradeMode === "SELL" && amount > userShares[side]) {
      setNotice(
        zh ? `可卖出的 ${side} 份额不足。` : `Not enough ${side} shares to sell.`,
      );
      return;
    }

    const direction = tradeMode === "BUY" ? 1 : -1;
    setMarketShares((value) => ({
      ...value,
      [side]: value[side] + direction * amount,
    }));
    setUserShares((value) => ({
      ...value,
      [side]: value[side] + direction * amount,
    }));
    setBalance(
      tradeMode === "BUY" ? balance - quote.cashFlow : balance + quote.cashFlow,
    );
    setTotalVolume((value) => value + quote.gross);
    accrueVaultFee(quote.gross);
    setNotice(
      zh
        ? `${tradeMode === "BUY" ? "买入" : "卖出"} ${formatAmount(amount)} 份 ${side}；报价成交并完成手续费分流。`
        : `${tradeMode === "BUY" ? "Bought" : "Sold"} ${formatAmount(amount)} ${side} shares; fees were routed.`,
    );
  };

  const fastForward = () => {
    if (phase !== "STAKING") return;
    setTimeLeft(0);
    setPhase("READY");
    setNotice(zh ? "模拟时间已推进到质押截止。" : "Demo advanced to the deadline.");
  };

  const finalize = () => {
    if (!requireWallet() || phase !== "READY") return;
    const outcome = deriveOutcome(stakes);
    setFinalOutcome(outcome);
    setPhase("FINALIZED");
    setNotice(
      zh
        ? `Vault 已 finalize，市场同步解析为 ${outcome}。`
        : `Vault finalized; the market resolved to ${outcome}.`,
    );
  };

  const selectedFeePayout =
    finalOutcome === null ? 0 : userConditionalFees[finalOutcome];
  const principalPayout = (() => {
    if (!finalOutcome || !userVaultSide || userStake <= 0) return 0;
    if (finalOutcome === "INVALID") return userStake;
    if (userVaultSide !== finalOutcome) return 0;
    return totalStake * userStake / stakes[finalOutcome];
  })();
  const vaultPayout = principalPayout + selectedFeePayout;
  const marketPayout =
    finalOutcome === null ? 0 : marketRedemption(finalOutcome, userShares);
  const officialUnallocatedVaultFees =
    finalOutcome === null
      ? 0
      : Math.max(0, vaultFees - distributedFees[finalOutcome]);

  const withdrawVault = () => {
    if (!requireWallet() || phase !== "FINALIZED" || vaultClaimed || userStake <= 0) return;
    setBalance(balance + vaultPayout);
    setVaultClaimed(true);
    setNotice(
      zh
        ? `Vault 已领取 ${formatAmount(vaultPayout)} dUSDC，其中手续费 ${formatAmount(selectedFeePayout, 4)}。`
        : `Claimed ${formatAmount(vaultPayout)} dUSDC from the Vault, including ${formatAmount(selectedFeePayout, 4)} in fees.`,
    );
  };

  const redeemMarket = () => {
    if (
      !requireWallet()
      || phase !== "FINALIZED"
      || marketRedeemed
      || userShares.YES + userShares.NO <= 0
    ) return;
    setBalance(balance + marketPayout);
    setMarketRedeemed(true);
    setNotice(
      zh
        ? `市场份额已兑换 ${formatAmount(marketPayout)} dUSDC。`
        : `Market shares redeemed for ${formatAmount(marketPayout)} dUSDC.`,
    );
  };

  const reset = () => {
    setPhase("STAKING");
    setTimeLeft(60);
    setActiveTab("PROTOCOL");
    setAmount(10);
    setTradeMode("BUY");
    setStakes(INITIAL_STAKES);
    setUserVaultSide(null);
    setUserStake(0);
    setMarketShares(INITIAL_MARKET_SHARES);
    setUserShares(INITIAL_USER_SHARES);
    setTotalVolume(0);
    setVaultFees(0);
    setProtocolLpFees(0);
    setDistributedFees(INITIAL_FEES);
    setUserConditionalFees(INITIAL_FEES);
    setFinalOutcome(null);
    setVaultClaimed(false);
    setMarketRedeemed(false);
    setNotice("");
    setBalance(INITIAL_BALANCE);
  };

  const phaseLabel =
    phase === "STAKING"
      ? (zh ? "质押期" : "STAKE PERIOD")
      : phase === "READY"
        ? (zh ? "可结算" : "READY TO FINALIZE")
        : (zh ? "已完结" : "FINALIZED");
  const phaseBadgeClass =
    phase === "STAKING"
      ? "border-accent/50 text-accent bg-accent/10"
      : "border-success/50 text-success bg-success/10";
  const maxStake = Math.max(stakes.YES, stakes.NO, stakes.INVALID);
  const leaders = (["YES", "NO", "INVALID"] as VaultSide[]).filter(
    (side) => stakes[side] === maxStake,
  );
  const leaderSide = leaders.length === 1 ? leaders[0] : null;
  const primaryActionTitle =
    phase === "STAKING"
      ? activeTab === "MARKET"
        ? (zh ? "交易预测份额" : "Trade prediction shares")
        : (zh ? "选择方向并质押" : "Choose a side and stake")
      : phase === "READY"
        ? (zh ? "任何人都可以链上结算" : "Anyone can finalize on-chain")
        : (zh ? "领取结算资金" : "Claim settlement");
  const primaryActionDescription =
    phase === "STAKING"
      ? activeTab === "MARKET"
        ? (zh
          ? "买入或卖出 YES / NO 份额。输入数量后查看实时成交报价与价格影响。"
          : "Buy or sell YES / NO shares. Enter an amount to preview execution and price impact.")
        : (zh
          ? "选择 YES、NO 或 INVALID。选定后只能同侧追加，不能换边。"
          : "Choose YES, NO or INVALID. Once selected, you may only add to that side.")
      : phase === "READY"
        ? (zh ? "质押截止后即可结算。" : "The Vault can be finalized after staking closes.")
        : (zh ? "根据最终结果领取 Vault 资金并兑换市场份额。" : "Claim Vault funds and redeem shares using the final result.");

  const quoteRows = (side: MarketSide) => {
    const quote = side === "YES" ? quoteYes : quoteNo;
    return (
      <div className="rounded-lg border border-border bg-white/60 px-2.5 py-2 text-[10px] font-mono">
        <div className={`mb-1.5 font-bold ${sideTextColor(side)}`}>{side}</div>
        <div className="space-y-1 text-text-muted">
          <div className="flex justify-between gap-2">
            <span>{zh ? "平均成交价" : "Avg. price"}</span>
            <strong className="text-text">{quote ? quote.averagePrice.toFixed(4) : "—"}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span>{zh ? "价格影响" : "Price impact"}</span>
            <strong className={
              quote && quote.priceImpact >= 5
                ? "text-danger"
                : quote && quote.priceImpact >= 2
                  ? "text-amber-600"
                  : "text-success"
            }>
              {quote ? `${quote.priceImpact.toFixed(2)}%` : "—"}
            </strong>
          </div>
          <div className="flex justify-between gap-2">
            <span>{zh ? "手续费" : "Fee"}</span>
            <strong className="text-text">{quote ? formatAmount(quote.fee, 4) : "—"}</strong>
          </div>
          <div className="flex justify-between gap-2 border-t border-border pt-1">
            <span>{tradeMode === "BUY" ? (zh ? "预计支付" : "Est. payment") : (zh ? "预计到账" : "Est. receipt")}</span>
            <strong className="text-text">{quote ? formatAmount(quote.cashFlow, 2) : "—"}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span>
              {tradeMode === "BUY"
                ? (zh ? "最大支付（滑点上限 1%）" : "Max payment (1% slippage)")
                : (zh ? "最低到账（滑点上限 1%）" : "Min receipt (1% slippage)")}
            </span>
            <strong className="text-text">{quote ? formatAmount(quote.protectedCashFlow, 2) : "—"}</strong>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="vault-shell bg-white/80 border-y sm:border border-border sm:rounded-2xl shadow-sm sm:shadow-2xl flex flex-col md:flex-row max-w-6xl mx-auto md:min-h-[600px] overflow-hidden backdrop-blur-xl relative">
      <div className="absolute top-10 right-10 w-72 sm:w-96 h-72 sm:h-96 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="md:hidden w-full px-4 pt-5 pb-4 border-b border-border relative z-10 bg-gradient-to-b from-orange-50/70 to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl leading-7 font-bold text-text tracking-tight font-display">
              {zh ? "OCP 会成为巨头吗？" : "Will OCP become a major player in crypto?"}
            </h2>
            <p className="mt-2 text-xs leading-5 text-text-muted font-mono">
              {zh ? "YES：会成为巨头 · NO：不会成为巨头 · INVALID：条件无法有效判断" : "YES: becomes a major player · NO: does not become a major player · INVALID: cannot be resolved"}
            </p>
          </div>
          <span className={`inline-flex shrink-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border font-mono ${phaseBadgeClass}`}>
            {phaseLabel}
          </span>
        </div>
        <div className="flex items-end justify-between rounded-xl border border-border bg-white/70 px-3.5 py-3 mt-3">
          <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
            {zh ? "阶段剩余时间" : "Phase time left"}
          </div>
          <div className="text-lg leading-none font-bold text-text tabular-nums font-display">
            {timeLeft > 0 ? `0h 0m ${timeLeft}s` : "—"}
          </div>
        </div>
      </div>

      <div className="px-4 py-5 sm:p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-border bg-transparent flex flex-col gap-4 sm:gap-6 relative z-10">
        {!isWalletConnected && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-xs font-mono text-accent flex items-center justify-between gap-3">
            <span>{zh ? "连接模拟钱包后执行操作。" : "Connect the demo wallet to act."}</span>
            <Button onClick={connectWallet} variant="outline" size="sm" className="shrink-0 border-accent/40 text-accent">
              {zh ? "连接" : "Connect"}
            </Button>
          </div>
        )}

        <div>
          <h3 className="text-lg font-display font-bold text-text mb-1 flex items-center gap-2 tracking-wide text-glow">
            {activeTab === "MARKET"
              ? <ArrowLeftRight className="text-purple-600 w-5 h-5" />
              : <LayoutDashboard className="text-accent w-5 h-5" />}
            {primaryActionTitle}
          </h3>
          <p className="text-text-muted text-xs font-mono">{primaryActionDescription}</p>
        </div>

        <div className="flex p-1 bg-transparent border border-border rounded-lg mb-2">
          <button
            type="button"
            onClick={() => setActiveTab("PROTOCOL")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all font-display tracking-wider ${
              activeTab === "PROTOCOL"
                ? "bg-transparent text-text shadow-glow border border-accent"
                : "text-text-muted hover:text-text"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            {zh ? "底层协议 (OCP)" : "Protocol (OCP)"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("MARKET")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all font-display tracking-wider ${
              activeTab === "MARKET"
                ? "bg-transparent text-text shadow-glow border border-purple-500"
                : "text-text-muted hover:text-text"
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {zh ? "预测市场 (LMSR)" : "Prediction Market (LMSR)"}
          </button>
        </div>

        {phase === "STAKING" && activeTab === "PROTOCOL" && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-transparent border border-border rounded-xl p-4 mb-2 text-xs text-text-muted">
              <h5 className="font-bold text-text flex items-center gap-1.5 mb-2 font-display">
                <ShieldAlert className="w-3.5 h-3.5 text-accent" />
                {zh ? "底层协议 (OCP)" : "Protocol (OCP)"}
              </h5>
              <p className="leading-relaxed font-mono">
                {zh ? "质押资本决定最终结果。资金锁定至结算；市场交易不会改变结果。" : "Staked capital decides the result. Funds remain locked until settlement; market trades do not change it."}
              </p>
            </div>
            <div className="text-xs font-mono text-text-muted">
              {zh ? "可用余额" : "Available balance"}:{" "}
              <strong className="text-text">{formatAmount(balance)} dUSDC</strong>
            </div>
            <div className="bg-transparent border border-border rounded-xl p-3 text-xs font-mono text-text-muted">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-text-muted font-display">
                {zh ? "我的质押" : "My Stake"}
              </div>
              {(["YES", "NO", "INVALID"] as VaultSide[]).map((side) => (
                <div key={side} className="flex justify-between mt-1">
                  <span className={sideTextColor(side)}>{side}</span>
                  <strong className="text-text">
                    {formatAmount(userVaultSide === side ? userStake : 0)} dUSDC
                  </strong>
                </div>
              ))}
            </div>
            <label className="block">
              <span className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-2 font-display">
                {zh ? "质押金额" : "Stake amount"}{" "}
                <span className="font-mono normal-case">({zh ? "最小" : "Min"} {MIN_STAKE} dUSDC)</span>
              </span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
                className="w-full bg-transparent border border-border rounded-lg px-3 py-3 text-text font-mono text-sm"
              />
            </label>
            <p className="text-[10px] leading-5 text-text-muted font-mono">
              {zh ? "YES、NO、INVALID 全程开放。选定方向后只能同侧追加，不能撤回或换边。" : "YES, NO and INVALID stay open until the deadline. Once selected, you may only add to that side."}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => stake("YES")} disabled={Boolean(userVaultSide && userVaultSide !== "YES")} variant="success" className="w-full">
                {zh ? "质押 YES" : "Stake YES"}
              </Button>
              <Button onClick={() => stake("NO")} disabled={Boolean(userVaultSide && userVaultSide !== "NO")} variant="danger" className="w-full">
                {zh ? "质押 NO" : "Stake NO"}
              </Button>
            </div>
            <Button onClick={() => stake("INVALID")} disabled={Boolean(userVaultSide && userVaultSide !== "INVALID")} variant="secondary" className="w-full text-yellow-700">
              {zh ? "质押 INVALID" : "Stake INVALID"}
            </Button>
          </div>
        )}

        {phase === "STAKING" && activeTab === "MARKET" && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-transparent border border-border rounded-xl p-4">
              <div className="mb-4 flex items-start gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
                  <Zap className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h5 className="font-bold text-text text-sm font-display tracking-wide">
                    {zh ? "预测市场 (LMSR)" : "Prediction Market (LMSR)"}
                  </h5>
                  <p className="text-xs text-text-muted mt-1 font-mono">
                    {zh ? "无需外部 LP，由 LMSR 连续报价 YES / NO 份额。" : "LMSR continuously quotes YES / NO shares without external LPs."}
                  </p>
                </div>
              </div>
              <div className="flex bg-transparent border border-border rounded-lg p-1 mb-3">
                <button type="button" onClick={() => setTradeMode("BUY")} className={`flex-1 py-1.5 text-xs font-bold rounded-md font-display tracking-wider ${tradeMode === "BUY" ? "bg-success/20 text-success border border-success/50" : "text-text-muted"}`}>
                  {zh ? "买入" : "BUY"}
                </button>
                <button type="button" onClick={() => setTradeMode("SELL")} className={`flex-1 py-1.5 text-xs font-bold rounded-md font-display tracking-wider ${tradeMode === "SELL" ? "bg-danger/20 text-danger border border-danger/50" : "text-text-muted"}`}>
                  {zh ? "卖出" : "SELL"}
                </button>
              </div>
              <label className="flex justify-between text-xs font-bold text-text-muted uppercase tracking-wider mb-2 font-display">
                <span>{zh ? "份额" : "Shares"}</span>
                <span className="text-[10px] text-accent font-mono">{zh ? "手续费 1.2%" : "Fee 1.2%"}</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
                className="w-full bg-transparent border border-border rounded-lg px-3 py-3 text-text text-lg font-mono"
              />
              <div className="text-[10px] text-text-muted my-2 px-1 font-mono">
                {zh ? "两个方向均按当前 LMSR 状态显示精确报价。" : "Both sides show exact quotes from the current LMSR state."}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {quoteRows("YES")}
                {quoteRows("NO")}
              </div>
              <div role="note" className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 text-text">
                <div className="text-xs font-bold text-accent">{zh ? "手续费说明" : "Fee details"}</div>
                <p className="mt-1 text-[10px] leading-relaxed text-text-muted font-mono">
                  {zh ? "1.0% 原子进入 Vault，并按交易发生时的在场质押累计；0.2% 进入官方初始流动性池。" : "1.0% enters the Vault and is indexed to stake present at the trade; 0.2% goes to official initial liquidity."}
                </p>
              </div>
              <div className="flex justify-end text-[10px] text-text-muted mb-3 font-mono">
                {tradeMode === "BUY"
                  ? <span>{zh ? "可用余额" : "Available"}: <strong className="text-text">{formatAmount(balance)} dUSDC</strong></span>
                  : <span>YES: <strong className="text-text">{formatAmount(userShares.YES)}</strong> · NO: <strong className="text-text">{formatAmount(userShares.NO)}</strong></span>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["YES", "NO"] as MarketSide[]).map((side) => (
                  <button
                    type="button"
                    key={side}
                    onClick={() => trade(side)}
                    disabled={tradeMode === "SELL" && amount > userShares[side]}
                    className={`flex flex-col items-center border rounded-lg p-3 transition-all active:scale-95 disabled:opacity-50 ${
                      side === "YES"
                        ? "bg-success/10 border-success/30 hover:border-success"
                        : "bg-danger/10 border-danger/30 hover:border-danger"
                    }`}
                  >
                    <span className={`font-bold text-sm font-display tracking-wider ${sideTextColor(side)}`}>{side}</span>
                    <span className="text-text-muted text-xs font-mono mt-1">
                      {(side === "YES" ? yesPrice : noPrice).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === "READY" && (
          <div className="border-t border-border pt-4 mt-2 space-y-3">
            <p className="p-3 rounded border border-border text-xs text-text-muted text-center font-mono uppercase tracking-widest">
              {zh ? "质押期已结束，可以结算" : "Staking has ended; finalization is available"}
            </p>
            <Button onClick={finalize} className="w-full">
              {zh ? "结算金库" : "Finalize Vault"}
            </Button>
          </div>
        )}

        {phase === "FINALIZED" && finalOutcome && (
          <div className="border-t border-border pt-4 mt-2 space-y-3">
            <div className="bg-transparent border border-border rounded-lg p-3 text-xs font-mono text-text-muted">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-text-muted font-display">
                {zh ? "可提取金额" : "Withdrawable"}
              </div>
              <div className="flex justify-between">
                <span>{zh ? "Vault 本金与手续费" : "Vault principal + fees"}</span>
                <strong className="text-text">{formatAmount(vaultPayout)} dUSDC</strong>
              </div>
              <div className="flex justify-between mt-1">
                <span>{zh ? "其中 PM 手续费" : "Includes PM fees"}</span>
                <strong className="text-text">{formatAmount(selectedFeePayout, 4)} dUSDC</strong>
              </div>
              <div className="flex justify-between mt-1">
                <span>{zh ? "市场份额兑换" : "Market redemption"}</span>
                <strong className="text-text">{formatAmount(marketPayout)} dUSDC</strong>
              </div>
            </div>
            <Button onClick={withdrawVault} disabled={vaultClaimed || userStake <= 0} className="w-full">
              {vaultClaimed ? (zh ? "已领取" : "Claimed") : (zh ? "领取 Vault" : "Claim Vault")}
            </Button>
            <Button onClick={redeemMarket} disabled={marketRedeemed || userShares.YES + userShares.NO <= 0} variant="secondary" className="w-full">
              {marketRedeemed ? (zh ? "已兑换" : "Redeemed") : (zh ? "兑换市场份额" : "Redeem market shares")}
            </Button>
            <Button onClick={reset} variant="ghost" className="w-full">
              {zh ? "重新模拟" : "Reset simulation"}
            </Button>
          </div>
        )}

        {phase === "STAKING" && (
          <Button onClick={fastForward} variant="ghost" size="sm" className="w-full">
            {zh ? "演示：快进到截止" : "Demo: skip to deadline"}
          </Button>
        )}
        <div className={`rounded-lg border p-3 text-[10px] leading-relaxed font-mono ${notice ? "border-accent/40 bg-accent/5 text-text" : "border-border text-text-muted"}`}>
          {notice || (zh ? "这是本地机制模拟，不会发起链上交易。" : "This is a local mechanism simulation; it does not submit transactions.")}
        </div>
      </div>

      <div className="px-4 py-5 sm:p-6 md:w-2/3 bg-slate-50/40 md:bg-transparent relative flex flex-col font-mono md:rounded-r-2xl">
        <div className="hidden md:flex justify-between items-start mb-6 animate-fade-in border-b border-border pb-4">
          <div className="min-w-0 pr-8">
            <h2 className="text-2xl font-bold text-text mb-3 tracking-wide font-display text-glow break-words leading-tight">
              {zh ? "OCP 会成为巨头吗？" : "Will OCP become a major player in crypto?"}
            </h2>
            <div className="mb-3 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20">
              <p className="text-sm leading-6 text-text font-mono">
                {zh ? "YES：会成为巨头。NO：不会成为巨头。INVALID：条件无法有效判断。" : "YES: becomes a major player. NO: does not become a major player. INVALID: the premise cannot be resolved."}
              </p>
            </div>
            <span className={`px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded border font-mono ${phaseBadgeClass}`}>
              {phaseLabel}
            </span>
          </div>
          <div className="text-right shrink-0">
            <div className="text-4xl font-bold text-text tabular-nums font-display tracking-widest text-glow">
              {timeLeft > 0 ? `0h 0m ${timeLeft}s` : "—"}
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 mb-6 text-xs text-text-muted font-mono uppercase">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-success rounded-full" />
            {zh ? "系统在线" : "SYSTEM ONLINE"}
          </div>
        </div>

        <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-8 animate-fade-in">
          <div className="text-center text-xs font-bold uppercase tracking-widest mb-2 text-text-muted font-display">
            {activeTab === "MARKET"
              ? (zh ? "正在显示：市场流动性（交易赔率）" : "Showing: Market liquidity (trading odds)")
              : (zh ? "正在显示：协议资本（结果权重）" : "Showing: Protocol capital (outcome weight)")}
          </div>
          {activeTab === "MARKET" ? (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-text-muted font-display">
                  {zh ? "预测市场行情" : "Market odds"}
                </div>
                <div className="h-6 bg-transparent border border-border rounded overflow-hidden flex">
                  <div className="h-full bg-success transition-all" style={{ width: `${yesPrice * 100}%` }} />
                  <div className="h-full bg-danger transition-all" style={{ width: `${noPrice * 100}%` }} />
                </div>
                <div className="flex justify-between text-xs font-bold font-mono mt-1">
                  <span className="text-success">YES {(yesPrice * 100).toFixed(0)}%</span>
                  <span className="text-danger">NO {(noPrice * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-text-muted font-display">
                  {zh ? "LMSR 未结算份额" : "Outstanding LMSR shares"}
                </div>
                <div className="text-xs font-mono text-text-muted space-y-1">
                  <div>YES: <strong className="text-text">{formatAmount(marketShares.YES)} {zh ? "份" : "shares"}</strong></div>
                  <div>NO: <strong className="text-text">{formatAmount(marketShares.NO)} {zh ? "份" : "shares"}</strong></div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {(["YES", "NO", "INVALID"] as VaultSide[]).map((side) => {
                const pct = side === "YES" ? yesStakePct : side === "NO" ? noStakePct : invalidStakePct;
                return (
                  <div key={side}>
                    <div className="flex justify-between text-xs mb-1.5 font-bold font-mono">
                      <span className={sideTextColor(side)}>{side} {pct.toFixed(1)}%</span>
                      <span className="text-text-muted">{formatAmount(stakes[side])} dUSDC</span>
                    </div>
                    <div className="h-6 bg-transparent border border-border rounded overflow-hidden">
                      <div className={`h-full transition-all ${side === "YES" ? "bg-success" : side === "NO" ? "bg-danger" : "bg-yellow-500/90"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="hidden md:grid grid-cols-2 gap-4 mb-6">
          <div className="border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {activeTab === "MARKET" ? (zh ? "市场总交易量" : "Market total volume") : (zh ? "总质押本金" : "Total principal")}
            </div>
            <div className="text-sm text-text font-bold font-mono">
              {formatAmount(activeTab === "MARKET" ? totalVolume : totalStake)} dUSDC
            </div>
          </div>
          <div className={`border rounded-xl p-4 ${phase === "FINALIZED" ? "border-success/30 bg-success/5" : "border-border"}`}>
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {phase === "FINALIZED" ? (zh ? "最终结果" : "Final result") : (zh ? "当前公开领先" : "Current public leader")}
            </div>
            <div className={`text-sm font-bold font-mono ${sideTextColor(finalOutcome ?? leaderSide ?? "INVALID")}`}>
              {finalOutcome ?? leaderSide ?? (zh ? "平局" : "Tied")}
            </div>
          </div>
          <div className="border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {zh ? "Vault 累计手续费" : "Vault cumulative fees"}
            </div>
            <div className="text-sm text-text font-bold font-mono">
              {formatAmount(vaultFees, 4)} dUSDC
            </div>
          </div>
          <div className="border border-accent/30 bg-accent/5 rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {zh ? "手续费 ROI（非年化）" : "Fee ROI (non-annualized)"}
            </div>
            <div className="text-sm text-accent font-bold font-mono">
              {feeRoi.toFixed(3)}%
            </div>
          </div>
        </div>

        <div className="border border-border rounded-xl p-4 text-[10px] text-text-muted font-mono mt-auto">
          <div className="flex justify-between gap-3">
            <span>LMSR b / {zh ? "初始补贴" : "initial subsidy"}</span>
            <strong className="text-text">{LIQUIDITY_PARAMETER} / {formatAmount(REQUIRED_SUBSIDY)} dUSDC</strong>
          </div>
          <div className="flex justify-between gap-3 mt-1.5">
            <span>{zh ? "官方 0.2% / 未分配 Vault 手续费" : "Official 0.2% / unallocated Vault fees"}</span>
            <strong className="text-text">{formatAmount(protocolLpFees + officialUnallocatedVaultFees, 4)} dUSDC</strong>
          </div>
          {userVaultSide && (
            <div className="flex justify-between gap-3 mt-1.5">
              <span>{zh ? "当前结果对应的我的条件手续费" : "My conditional fee for current outcome"}</span>
              <strong className="text-text">{formatAmount(userConditionalFees[finalOutcome ?? provisionalOutcome], 4)} dUSDC</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
