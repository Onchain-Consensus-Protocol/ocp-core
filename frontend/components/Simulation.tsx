import React, { useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import type { Language } from "../types";

interface Props {
  lang: Language;
  isWalletConnected: boolean;
  balance: number;
  setBalance: (amount: number) => void;
  connectWallet: () => void;
}

type VaultSide = "YES" | "NO" | "INVALID";
type MarketSide = "YES" | "NO";
type TradeMode = "BUY" | "SELL";

const INITIAL_BALANCE = 10_000;
const LIQUIDITY_PARAMETER = 100;
const TOTAL_FEE_RATE = 0.012;
const VAULT_FEE_RATE = 0.01;
const PROTOCOL_LP_FEE_RATE = 0.002;

function lmsrCost(yesShares: number, noShares: number): number {
  const yes = yesShares / LIQUIDITY_PARAMETER;
  const no = noShares / LIQUIDITY_PARAMETER;
  const max = Math.max(yes, no);
  return LIQUIDITY_PARAMETER * (max + Math.log(Math.exp(yes - max) + Math.exp(no - max)));
}

function yesPrice(yesShares: number, noShares: number): number {
  return 1 / (1 + Math.exp((noShares - yesShares) / LIQUIDITY_PARAMETER));
}

function buildQuote(
  amount: number,
  marketShares: Record<MarketSide, number>,
  side: MarketSide,
  mode: TradeMode,
) {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currentSidePrice =
    side === "YES"
      ? yesPrice(marketShares.YES, marketShares.NO)
      : 1 - yesPrice(marketShares.YES, marketShares.NO);
  const beforeCost = lmsrCost(marketShares.YES, marketShares.NO);
  const nextShares = { ...marketShares };
  nextShares[side] += mode === "BUY" ? amount : -amount;
  const afterCost = lmsrCost(nextShares.YES, nextShares.NO);
  const gross = mode === "BUY" ? afterCost - beforeCost : beforeCost - afterCost;
  const fee = gross * TOTAL_FEE_RATE;
  const cashFlow = mode === "BUY" ? gross + fee : gross - fee;
  const nextYesPrice = yesPrice(nextShares.YES, nextShares.NO);
  const nextPrice = side === "YES" ? nextYesPrice : 1 - nextYesPrice;

  return {
    gross,
    fee,
    cashFlow,
    averagePrice: gross / amount,
    nextPrice,
    priceImpact:
      currentSidePrice > 0
        ? ((nextPrice - currentSidePrice) / currentSidePrice) * 100
        : 0,
  };
}

function formatAmount(value: number, digits = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export const Simulation: React.FC<Props> = ({
  lang,
  isWalletConnected,
  balance,
  setBalance,
  connectWallet,
}) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [amount, setAmount] = useState(10);
  const [selectedVaultSide, setSelectedVaultSide] = useState<VaultSide | null>(null);
  const [stakes, setStakes] = useState<Record<VaultSide, number>>({
    YES: 40,
    NO: 30,
    INVALID: 0,
  });
  const [tradeMode, setTradeMode] = useState<TradeMode>("BUY");
  const [marketSide, setMarketSide] = useState<MarketSide>("YES");
  const [marketShares, setMarketShares] = useState<Record<MarketSide, number>>({
    YES: 0,
    NO: 0,
  });
  const [userShares, setUserShares] = useState<Record<MarketSide, number>>({
    YES: 0,
    NO: 0,
  });
  const [vaultFees, setVaultFees] = useState(0);
  const [officialFees, setOfficialFees] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = window.setInterval(
      () => setTimeLeft((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [timeLeft]);

  const totalStake = stakes.YES + stakes.NO + stakes.INVALID;
  const outcome: VaultSide =
    stakes.YES * 2 > totalStake ? "YES" : stakes.NO * 2 > totalStake ? "NO" : "INVALID";
  const currentYesPrice = yesPrice(marketShares.YES, marketShares.NO);
  const quote = useMemo(
    () => buildQuote(amount, marketShares, marketSide, tradeMode),
    [amount, marketShares, marketSide, tradeMode],
  );

  const requireWallet = (): boolean => {
    if (isWalletConnected) return true;
    connectWallet();
    setNotice(lang === "zh" ? "模拟钱包已连接，请再次操作。" : "Demo wallet connected. Try again.");
    return false;
  };

  const stake = (side: VaultSide) => {
    if (!requireWallet()) return;
    if (timeLeft === 0 || amount <= 0 || amount > balance) return;
    if (selectedVaultSide && selectedVaultSide !== side) {
      setNotice(lang === "zh" ? "OCP 质押方向已经锁定。" : "Your OCP stake side is locked.");
      return;
    }
    setSelectedVaultSide(side);
    setStakes((value) => ({ ...value, [side]: value[side] + amount }));
    setBalance(balance - amount);
    setNotice(
      lang === "zh"
        ? `已向 OCP ${side} 质押 ${formatAmount(amount)} dUSDC。`
        : `Staked ${formatAmount(amount)} dUSDC on OCP ${side}.`,
    );
  };

  const trade = (side: MarketSide) => {
    const tradeQuote = buildQuote(amount, marketShares, side, tradeMode);
    setMarketSide(side);
    if (!requireWallet() || timeLeft === 0 || !tradeQuote || tradeQuote.gross <= 0) return;
    if (tradeMode === "BUY" && tradeQuote.cashFlow > balance) {
      setNotice(lang === "zh" ? "模拟钱包余额不足。" : "Insufficient demo balance.");
      return;
    }
    if (tradeMode === "SELL" && amount > userShares[side]) {
      setNotice(
        lang === "zh"
          ? `可卖出的 ${side} 份额不足。`
          : `Not enough ${side} shares to sell.`,
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
      tradeMode === "BUY"
        ? balance - tradeQuote.cashFlow
        : balance + tradeQuote.cashFlow,
    );
    setVaultFees((value) => value + tradeQuote.gross * VAULT_FEE_RATE);
    setOfficialFees((value) => value + tradeQuote.gross * PROTOCOL_LP_FEE_RATE);
    setNotice(
      lang === "zh"
        ? `${tradeMode === "BUY" ? "买入" : "卖出"} ${formatAmount(amount)} 份 ${side}，1.2% 手续费已分流。`
        : `${tradeMode === "BUY" ? "Bought" : "Sold"} ${formatAmount(amount)} ${side} shares; the 1.2% fee was routed.`,
    );
  };

  const reset = () => {
    setTimeLeft(60);
    setSelectedVaultSide(null);
    setStakes({ YES: 40, NO: 30, INVALID: 0 });
    setTradeMode("BUY");
    setMarketSide("YES");
    setMarketShares({ YES: 0, NO: 0 });
    setUserShares({ YES: 0, NO: 0 });
    setVaultFees(0);
    setOfficialFees(0);
    setNotice("");
    setBalance(INITIAL_BALANCE);
  };

  const sideColor = (side: VaultSide) =>
    side === "YES" ? "text-success" : side === "NO" ? "text-danger" : "text-yellow-500";

  return (
    <div className="border border-border rounded-2xl p-5 md:p-6 bg-transparent">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-6">
        <div>
          <h3 className="text-xl font-bold text-text font-display">
            {lang === "zh" ? "OCP × Market 联动模拟" : "OCP × Market Simulation"}
          </h3>
          <p className="text-xs text-text-muted font-mono mt-1">
            {lang === "zh"
              ? "OCP 资本决定最终结果；LMSR 市场负责交易价格，并把手续费持续送入 Vault。"
              : "OCP capital decides the outcome; the LMSR market prices trades and continuously routes fees to the Vault."}
          </p>
        </div>
        <div className="flex items-center gap-4 font-mono text-sm">
          <span className="text-text-muted">
            {lang === "zh" ? "余额" : "Balance"}{" "}
            <strong className="text-text">{formatAmount(balance)} dUSDC</strong>
          </span>
          <span className="text-accent">{timeLeft}s</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
        <section className="border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-xs text-text-muted font-mono">
                {lang === "zh" ? "结果层" : "OUTCOME LAYER"}
              </div>
              <h4 className="font-display font-bold text-text mt-1">OCP Vault</h4>
            </div>
            <div className="text-xs font-mono text-text-muted">
              {lang === "zh" ? "总质押" : "Total stake"}{" "}
              <strong className="text-text">{formatAmount(totalStake, 0)}</strong>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {(["YES", "NO", "INVALID"] as VaultSide[]).map((side) => (
              <div key={side} className="border border-border rounded-lg p-2.5 text-center">
                <div className={`text-xs ${sideColor(side)}`}>{side}</div>
                <div className="font-bold text-text font-mono mt-1">
                  {formatAmount(stakes[side], 0)}
                </div>
              </div>
            ))}
          </div>

          {timeLeft > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {(["YES", "NO", "INVALID"] as VaultSide[]).map((side) => (
                <Button
                  key={side}
                  onClick={() => stake(side)}
                  disabled={Boolean(selectedVaultSide && selectedVaultSide !== side)}
                  variant={side === "YES" ? "success" : side === "NO" ? "danger" : "secondary"}
                  className="px-2"
                >
                  {lang === "zh" ? `质押 ${side}` : `Stake ${side}`}
                </Button>
              ))}
            </div>
          ) : (
            <div className="border border-border rounded-lg p-3 text-center">
              <span className="text-xs text-text-muted">
                {lang === "zh" ? "OCP 最终结果：" : "OCP final outcome: "}
              </span>
              <strong className={`ml-2 ${sideColor(outcome)}`}>{outcome}</strong>
            </div>
          )}

          <p className="text-[11px] text-text-muted font-mono mt-3">
            {selectedVaultSide
              ? lang === "zh"
                ? `你的方向已锁定为 ${selectedVaultSide}，只能同侧追加。`
                : `Your side is locked to ${selectedVaultSide}; only same-side additions are allowed.`
              : lang === "zh"
                ? "质押影响最终结果；首次质押后方向锁定。"
                : "Staking affects the outcome; your side locks after the first stake."}
          </p>
        </section>

        <div className="hidden lg:flex items-center justify-center text-2xl font-display font-bold text-accent">
          ×
        </div>

        <section className="border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-xs text-text-muted font-mono">
                {lang === "zh" ? "交易层" : "TRADING LAYER"}
              </div>
              <h4 className="font-display font-bold text-text mt-1">
                Prediction Market
              </h4>
            </div>
            <div className="text-xs font-mono text-text-muted">LMSR · b=100</div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            {(["YES", "NO"] as MarketSide[]).map((side) => {
              const price = side === "YES" ? currentYesPrice : 1 - currentYesPrice;
              return (
                <button
                  type="button"
                  key={side}
                  onClick={() => setMarketSide(side)}
                  className={`border rounded-lg p-3 text-left transition-colors ${
                    marketSide === side
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-text-muted"
                  }`}
                >
                  <div className={`text-xs ${sideColor(side)}`}>{side}</div>
                  <div className="font-bold text-text font-mono mt-1">
                    {formatAmount(price, 3)} dUSDC
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">
                    {lang === "zh" ? "我的份额" : "My shares"}{" "}
                    {formatAmount(userShares[side], 2)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            {(["BUY", "SELL"] as TradeMode[]).map((mode) => (
              <button
                type="button"
                key={mode}
                onClick={() => setTradeMode(mode)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                  tradeMode === mode
                    ? "border-accent text-accent bg-accent/5"
                    : "border-border text-text-muted"
                }`}
              >
                {lang === "zh" ? (mode === "BUY" ? "买入" : "卖出") : mode}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(["YES", "NO"] as MarketSide[]).map((side) => (
              <Button
                key={side}
                onClick={() => trade(side)}
                disabled={timeLeft === 0}
                variant={side === "YES" ? "success" : "danger"}
                className="w-full"
              >
                {lang === "zh"
                  ? `${tradeMode === "BUY" ? "买入" : "卖出"} ${side}`
                  : `${tradeMode} ${side}`}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-mono">
            <div>
              <div className="text-text-muted">{lang === "zh" ? "平均成交价" : "Avg. price"}</div>
              <div className="text-text mt-1">
                {quote ? formatAmount(quote.averagePrice, 3) : "—"}
              </div>
            </div>
            <div>
              <div className="text-text-muted">{lang === "zh" ? "价格影响" : "Price impact"}</div>
              <div className="text-text mt-1">
                {quote ? `${quote.priceImpact >= 0 ? "+" : ""}${formatAmount(quote.priceImpact, 2)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-text-muted">
                {tradeMode === "BUY"
                  ? lang === "zh" ? "预计支付" : "Est. payment"
                  : lang === "zh" ? "预计到账" : "Est. proceeds"}
              </div>
              <div className="text-text mt-1">
                {quote ? formatAmount(quote.cashFlow, 2) : "—"}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-4 border border-border rounded-xl p-4">
        <div className="grid sm:grid-cols-[1fr_1fr_1fr] gap-3 items-end">
          <label className="block">
            <span className="block text-[11px] text-text-muted font-mono mb-1.5">
              {lang === "zh" ? "质押金额 / 交易份额" : "Stake amount / trade shares"}
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="w-full bg-transparent border border-border rounded-lg px-3 py-2.5 text-text font-mono"
            />
          </label>
          <div className="text-xs font-mono">
            <div className="text-text-muted">
              {lang === "zh" ? "Vault 已累计手续费" : "Vault fees accrued"}
            </div>
            <div className="text-text mt-1">{formatAmount(vaultFees, 4)} dUSDC</div>
          </div>
          <div className="text-xs font-mono">
            <div className="text-text-muted">
              {lang === "zh" ? "官方初始流动性手续费" : "Official liquidity fees"}
            </div>
            <div className="text-text mt-1">{formatAmount(officialFees, 4)} dUSDC</div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
          <p className="text-[11px] text-text-muted font-mono">
            {notice ||
              (lang === "zh"
                ? "市场交易不改变 OCP 结果；每笔交易收取 1.2%，其中 1.0% 进入 Vault，0.2% 补贴官方初始流动性。"
                : "Market trades do not change the OCP outcome. Each trade pays 1.2%: 1.0% to the Vault and 0.2% to official initial liquidity.")}
          </p>
          {timeLeft === 0 && (
            <Button onClick={reset} variant="outline">
              {lang === "zh" ? "重新模拟" : "Reset"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
