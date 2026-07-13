import React, { useEffect, useState } from "react";
import { Button } from "./Button";
import type { Language } from "../types";

interface Props {
  lang: Language;
  isWalletConnected: boolean;
  balance: number;
  setBalance: (amount: number) => void;
  connectWallet: () => void;
}

type Side = "YES" | "NO" | "INVALID";

export const Simulation: React.FC<Props> = ({ lang, isWalletConnected, balance, setBalance, connectWallet }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [amount, setAmount] = useState(10);
  const [selected, setSelected] = useState<Side | null>(null);
  const [stakes, setStakes] = useState<Record<Side, number>>({ YES: 40, NO: 30, INVALID: 0 });

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = window.setInterval(() => setTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [timeLeft]);

  const total = stakes.YES + stakes.NO + stakes.INVALID;
  const outcome: Side = stakes.YES * 2 > total ? "YES" : stakes.NO * 2 > total ? "NO" : "INVALID";

  const stake = (side: Side) => {
    if (!isWalletConnected) return connectWallet();
    if (timeLeft === 0 || amount <= 0 || amount > balance) return;
    if (selected && selected !== side) return;
    setSelected(side);
    setStakes((value) => ({ ...value, [side]: value[side] + amount }));
    setBalance(balance - amount);
  };

  const reset = () => {
    setTimeLeft(60);
    setSelected(null);
    setStakes({ YES: 40, NO: 30, INVALID: 0 });
  };

  return (
    <div className="border border-border rounded-2xl p-6 bg-transparent">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-text font-display">{lang === "zh" ? "OCP Stake War 模拟" : "OCP Stake War Simulation"}</h3>
          <p className="text-xs text-text-muted font-mono mt-1">{lang === "zh" ? "一个质押期、固定时间截止、方向不可更改" : "One staking period, fixed end time, immutable side"}</p>
        </div>
        <div className="font-mono text-accent">{timeLeft}s</div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {(["YES", "NO", "INVALID"] as Side[]).map((side) => (
          <div key={side} className="border border-border rounded-xl p-3 text-center">
            <div className={side === "YES" ? "text-success" : side === "NO" ? "text-danger" : "text-yellow-500"}>{side}</div>
            <div className="text-lg font-bold text-text font-mono mt-1">{stakes[side]}</div>
          </div>
        ))}
      </div>

      {timeLeft > 0 ? (
        <>
          <input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="w-full mb-3 bg-transparent border border-border rounded-lg px-3 py-3 text-text font-mono" />
          <div className="grid grid-cols-3 gap-3">
            {(["YES", "NO", "INVALID"] as Side[]).map((side) => (
              <Button key={side} onClick={() => stake(side)} disabled={Boolean(selected && selected !== side)} variant={side === "YES" ? "success" : side === "NO" ? "danger" : "secondary"}>{lang === "zh" ? `质押 ${side}` : `Stake ${side}`}</Button>
            ))}
          </div>
          <p className="text-xs text-text-muted font-mono mt-3">{selected ? (lang === "zh" ? `当前方向：${selected}。只能继续同侧追加。` : `Current side: ${selected}. You may only add to this side.`) : (lang === "zh" ? "首次质押后方向锁定。" : "Your side locks after the first stake.")}</p>
        </>
      ) : (
        <div className="text-center border border-border rounded-xl p-5">
          <div className="text-xs text-text-muted">{lang === "zh" ? "最终结果" : "Final outcome"}</div>
          <div className="text-2xl font-bold text-accent mt-1">{outcome}</div>
          <Button onClick={reset} variant="outline" className="mt-4">{lang === "zh" ? "重新模拟" : "Reset"}</Button>
        </div>
      )}
    </div>
  );
};
