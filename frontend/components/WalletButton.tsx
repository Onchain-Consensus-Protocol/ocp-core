/**
 * 统一的钱包按钮组件：显示连接状态、网络徽标、地址，并在错误网络时提示切换。
 * 三个页面（explore、vault、App 主页模拟器）共用。
 */
import React from "react";
import { Wallet, LogOut, AlertTriangle, Zap } from "lucide-react";
import { Button } from "./Button";

interface Props {
  lang: "zh" | "en";
  connected: boolean;
  address: string;
  chainId: number | null;
  onTargetNetwork: boolean;
  targetChainId: number;
  onConnect: () => void;
  onDisconnect: () => void;
}

const NETWORK_LABELS: Record<number, string> = {
  8453: "Base",
  84532: "Base Sepolia",
  1: "Ethereum",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
};

export const WalletButton: React.FC<Props> = ({
  lang, connected, address, chainId, onTargetNetwork, targetChainId, onConnect, onDisconnect,
}) => {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
  const networkLabel = chainId ? (NETWORK_LABELS[chainId] ?? `Chain ${chainId}`) : "";

  if (connected && onTargetNetwork) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-success border border-success/40 bg-success/10 rounded-md px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          {networkLabel}
        </span>
        <div className="flex items-center gap-2 bg-transparent border border-border rounded-lg px-3 py-1.5">
          <span className="text-xs font-bold text-text font-mono max-w-[140px] truncate" title={address}>
            {shortAddr}
          </span>
          <button onClick={onDisconnect} className="text-text-muted hover:text-danger transition-colors p-1" title={t("断开", "Disconnect")}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (connected && !onTargetNetwork) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-warning border border-warning/40 bg-warning/10 rounded-md px-2 py-1">
          <AlertTriangle className="w-3 h-3" />
          {networkLabel}
        </span>
        <Button size="sm" onClick={onConnect} variant="primary" className="!border-warning/60 !text-warning">
          <Zap className="w-3.5 h-3.5 mr-1" />
          {t("切换到 Base", "Switch to Base")}
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" onClick={onConnect} variant="primary">
      <Wallet className="w-3.5 h-3.5 mr-2" />
      {t("连接钱包", "Connect Wallet")}
    </Button>
  );
};
