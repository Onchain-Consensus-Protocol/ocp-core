import React, { useState, useEffect, useCallback } from "react";
import { Contract, JsonRpcProvider, parseUnits } from "ethers";
import {
  ExternalLink,
  Loader2,
  AlertTriangle,
  Wallet,
  Copy,
  Coins,
} from "lucide-react";
import { Button } from "./Button";
import { HowToPlay } from "./HowToPlay";
import { config, VAULT_ABI, ERC20_ABI, ERC20_MINT_ABI, FACTORY_ABI } from "../config";

import type { JsonRpcSigner } from "ethers";

interface MarketMeta {
  title: string;
  description: string;
  createdBy: string;
  createdAt: number;
}

interface OnChainState {
  resolutionTime: number;
  minStake?: string;
  totalPrincipal: string;
  totalStakeYes: string;
  totalStakeNo: string;
  totalStakeInvalid: string;
  canResolve: boolean;
  resolved: boolean;
  outcome: number | null;
  stakeToken?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  yesReserve?: string;
  noReserve?: string;
  yesPrice?: number;
  noPrice?: number;
}

interface MarketItem {
  vault: string;
  market: string;
  meta: MarketMeta | null;
  onChain: OnChainState | null;
}

// 同一 Gate 命题被 owner 重复广播了两次。保留更早创建的
// 0xc90Ab8EeF942a9aecA29A9280526AB3476eC4949 作为前端唯一正式入口；
// 链上 Factory 没有删除 Vault 的接口，因此这里只能停止展示较晚的副本。
const HIDDEN_DUPLICATE_VAULTS = new Set([
  "0x818064be8a2656b7ffd19b6abf6084b75552f12d",
]);

const MOCK_EXPLORE_ITEMS: MarketItem[] = [];

interface ExploreViewProps {
  lang: "zh" | "en";
  isWalletConnected: boolean;
  walletAddress: string;
  signer: JsonRpcSigner | null;
  onConnectWallet: () => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  lang,
  isWalletConnected,
  walletAddress,
  signer,
  onConnectWallet,
}) => {
  const t = lang === "zh"
    ? {
      title: "探索 Stake War",
      subtitle: "查找并参与链上共识金库与预测市场",
      connect: "连接钱包",
      loading: "加载中…",
      noApi: "请配置 VITE_API_BASE",
      refresh: "刷新",
      createdBy: "创建者",
      resolution: "结算时间",
      status: "状态",
      totalStake: "总质押",
      hiddenDirection: "方向与资金公开可见",
      finalizedResult: "最终结果",
      yes: "YES",
      no: "NO",
      invalid: "INVALID",
      open: "开放",
      ready: "可结算",
      ended: "已结束",
      protocol: "协议 (OCP)",
      marketTab: "市场 (AMM)",
      protoDesc: "",
      stakeAmount: "数量",
      stakeYes: "质押 YES",
      stakeNo: "质押 NO",
      stakeInvalid: "质押 INVALID",
      needWallet: "请先连接钱包",
      marketDesc: "交易 YES/NO 份额，不影响金库结果，按结果兑付。",
      marketDisabled: "预测市场功能已暂时关闭，仅保留金库协议。",
      openVault: "点击进入金库",
      buy: "买入",
      sell: "卖出",
      fee: "手续费 0.3%",
      balance: "余额",
      myStake: "我的质押",
      myShares: "我的份额",
      final: "已共识",
      claimVault: "领取金库",
      claimMarket: "赎回份额",
      explorer: "浏览器",
      configFactoryAddress: "工厂合约地址",
      configDepositTokenAddress: "测试代币地址",
      configMockTotalSupply: "Mock 代币总供应量",
      configConnectedWallet: "当前连接钱包",
      configTitle: "网络配置",
      claimTestToken: "领取测试代币",
      copy: "复制",
      copied: "已复制",
      phaseStaking: "质押期",
      phaseFinal: "已终局",
      phaseReady: "可结算",
      simFinalized: "已终局",
      simActions: "协议操作",
      bondReq: "保证金 b",
      btnFinalize: "结算",
      btnClaimProto: "领取协议奖励",
      btnClaimMarket: "赎回市场份额",
      btnClaimed: "已领取",
    }
    : {
      title: "Explore Stake War",
      subtitle: "Find and interact with OnChain consensus vaults & prediction markets",
      connect: "Connect Wallet",
      loading: "Loading…",
      noApi: "Set VITE_API_BASE in .env",
      refresh: "Refresh",
      createdBy: "Created by",
      resolution: "Resolution",
      status: "Status",
      totalStake: "Total stake",
      hiddenDirection: "Directions and capital are public",
      finalizedResult: "Final result",
      yes: "YES",
      no: "NO",
      invalid: "INVALID",
      open: "Open",
      ready: "Ready",
      ended: "Ended",
      protocol: "Protocol (OCP)",
      marketTab: "Market (AMM)",
      protoDesc: "",
      stakeAmount: "Amount",
      stakeYes: "Stake YES",
      stakeNo: "Stake NO",
      stakeInvalid: "Stake INVALID",
      needWallet: "Connect wallet first",
      marketDesc: "Trade YES/NO shares. Fees go to vault stakers.",
      marketDisabled: "Prediction market features are temporarily disabled; vault protocol only.",
      openVault: "Open vault",
      buy: "Buy",
      sell: "Sell",
      fee: "Fee 0.3%",
      balance: "Balance",
      myStake: "My stake",
      myShares: "My shares",
      final: "Finalized",
      claimVault: "Claim vault",
      claimMarket: "Redeem shares",
      explorer: "Explorer",
      configFactoryAddress: "Factory contract address",
      configDepositTokenAddress: "Test token address",
      configMockTotalSupply: "Mock token total supply",
      configConnectedWallet: "Connected wallet",
      configTitle: "Network config",
      claimTestToken: "Claim test token",
      copy: "Copy",
      copied: "Copied",
      phaseStaking: "Stake period",
      phaseFinal: "Finalized",
      phaseReady: "Ready to resolve",
      simFinalized: "Finalized",
      simActions: "Protocol actions",
      bondReq: "Bond b",
      btnFinalize: "Finalize",
      btnClaimProto: "Claim protocol rewards",
      btnClaimMarket: "Redeem market shares",
      btnClaimed: "Claimed",
    };

  const marketEnabled = config.marketEnabled;
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };
  const fetchMarketsFromChain = useCallback(async (): Promise<MarketItem[]> => {
    if (!config.factoryAddress || !config.rpcUrl) return [];
    try {
      const provider = new JsonRpcProvider(config.rpcUrl);
      const factory = new Contract(config.factoryAddress, FACTORY_ABI, provider);
      const factoryVaults = (await factory.getVaults()) as string[];
      const vaults = factoryVaults.filter(
        (vaultAddr) => !HIDDEN_DUPLICATE_VAULTS.has(String(vaultAddr).toLowerCase()),
      );
      if (!Array.isArray(vaults) || vaults.length === 0) {
        return [];
      }
      const defaultOnChain: MarketItem["onChain"] = {
        resolutionTime: 0,
        minStake: "0",
        totalPrincipal: "0",
        totalStakeYes: "0",
        totalStakeNo: "0",
        totalStakeInvalid: "0",
        canResolve: false,
        resolved: false,
        outcome: null,
        stakeToken: "0x0000000000000000000000000000000000000000",
        yesReserve: "0",
        noReserve: "0",
        yesPrice: 0.5,
        noPrice: 0.5,
        tokenSymbol: undefined,
      };

      const items = await Promise.all(
        vaults.map(async (vaultAddr): Promise<MarketItem> => {
          const addr = typeof vaultAddr === "string" ? vaultAddr : (vaultAddr as { toString: () => string }).toString?.() ?? String(vaultAddr);

          let meta: MarketItem["meta"] = null;
          try {
            const metaTuple = await factory.getVaultMeta(addr);
            if (metaTuple && (metaTuple[0] || metaTuple[1])) {
              meta = {
                title: String(metaTuple[0]),
                description: String(metaTuple[1]),
                createdBy: "",
                createdAt: 0,
              };
            }
          } catch (_) {
            // getVaultMeta 可能因 RPC/合约返回 missing revert data，忽略后仍展示该金库
          }

          let onChain = defaultOnChain;
          try {
            const vault = new Contract(addr, VAULT_ABI, provider);
            const [
              resolutionTime,
              minStake,
              totalPrincipal,
              totalStakeYes,
              totalStakeNo,
              totalStakeInvalid,
              canResolve,
              resolved,
              outcome,
              stakeToken,
            ] = await Promise.all([
              vault.resolutionTime(),
              vault.minStake(),
              vault.totalPrincipal(),
              vault.totalStakeYes(),
              vault.totalStakeNo(),
              vault.totalStakeInvalid(),
              vault.canResolve(),
              vault.resolved(),
              vault.outcome(),
              vault.stakeToken(),
            ]);
  const tokenSymbol = await new Contract(String(stakeToken), ERC20_ABI, provider).symbol().catch(() => "");
            const tokenDecimals = await new Contract(String(stakeToken), ERC20_ABI, provider).decimals().catch(() => 18);
            onChain = {
              resolutionTime: Number(resolutionTime),
              minStake: minStake.toString(),
              totalPrincipal: totalPrincipal.toString(),
              totalStakeYes: totalStakeYes.toString(),
              totalStakeNo: totalStakeNo.toString(),
              totalStakeInvalid: totalStakeInvalid.toString(),
              canResolve,
              resolved,
              outcome: resolved ? Number(outcome) : null,
              stakeToken: String(stakeToken),
              yesReserve: "0",
              noReserve: "0",
              yesPrice: 0.5,
              noPrice: 0.5,
              tokenSymbol: tokenSymbol || undefined,
              tokenDecimals: Number(tokenDecimals),
            };
          } catch (e) {
            if (import.meta.env.DEV) console.warn("[ExploreView] Vault OnChain read failed, showing fallback", addr, e);
          }

          return {
            vault: addr,
            market: "0x0000000000000000000000000000000000000000",
            meta,
            onChain,
          } as MarketItem;
        })
      );
      return items;
    } catch (e) {
      console.error("[ExploreView] fetchMarketsFromChain failed", e);
      return [];
    }
  }, []);

  const fetchMarkets = useCallback(async () => {
    setError(null);
    try {
      const onChain = await fetchMarketsFromChain();
      setMarkets(onChain);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, [fetchMarketsFromChain]);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  return (
    <div className="min-h-[80vh] flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-text text-glow">{t.title}</h1>
          <p className="text-text-muted font-mono text-sm mt-1">{t.subtitle}</p>

        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchMarkets} className="text-xs font-mono text-accent hover:underline">
            {t.refresh}
          </button>
        </div>
      </div>

      {/* Vault 列表 */}

      {error && (
        <div className="mb-4 bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-sm font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}


      {!marketEnabled && (
        <div className="mb-6 border border-border rounded-xl bg-transparent px-4 py-3 text-xs font-mono text-text-muted">
          {t.marketDisabled}
        </div>
      )}

      {/* 金库卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12 text-text-muted">
            <Loader2 className="w-8 h-8 animate-spin" /> {t.loading}
          </div>
        ) : markets.length === 0 ? (
          <div className="col-span-full text-center py-12 text-text-muted text-sm">
            {error ? null : (
              <p>
                {lang === "zh"
                  ? "当前工厂下暂无金库，或拉取失败。请确认前端使用正确的工厂地址与网络（Base），然后刷新页面。"
                  : "No vaults on this factory or fetch failed. Confirm the configured factory address and network (Base), then refresh."}
              </p>
            )}
          </div>
        ) : (
          markets.map((m) => {
            const oc = m.onChain;
            const total = oc
              ? Number(oc.totalStakeYes) + Number(oc.totalStakeNo) + Number(oc.totalStakeInvalid)
              : 0;
            const yesPct = total > 0 ? (Number(oc?.totalStakeYes || 0) / total) * 100 : 0;
            const noPct = total > 0 ? (Number(oc?.totalStakeNo || 0) / total) * 100 : 0;
            const invalidPct = total > 0 ? (Number(oc?.totalStakeInvalid || 0) / total) * 100 : 0;
            const yesPrice = oc?.yesPrice ?? 0.5;
            const noPrice = oc?.noPrice ?? (1 - yesPrice);
            const displayYesPrice = noPrice;
            const displayNoPrice = yesPrice;
            const vaultUrl = `/explore/vault.html?vault=${encodeURIComponent(m.vault)}&market=${encodeURIComponent(m.market)}`;
            type VaultPhase = "staking" | "ready" | "finalized";
            const vaultPhase: VaultPhase | null = oc
              ? oc.resolved
                ? "finalized"
                : nowTs < oc.resolutionTime
                  ? "staking"
                  : "ready"
              : null;
            const timeLeft = oc && vaultPhase
              ? vaultPhase === "staking"
                ? Math.max(0, oc.resolutionTime - nowTs)
                : 0
              : 0;
            const phaseLabel =
              vaultPhase === "staking" ? t.phaseStaking
                : vaultPhase === "ready" ? t.phaseReady
                      : vaultPhase === "finalized" ? t.phaseFinal
                        : "";
            const totalStakeFormatted = oc?.totalPrincipal
              ? (Number(oc.totalPrincipal) / 10 ** (oc.tokenDecimals ?? 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })
              : "—";
            const symbol = oc?.tokenSymbol ?? "";
            const countdownStr = timeLeft > 0
              ? `${Math.floor(timeLeft / 86400)}d ${Math.floor((timeLeft % 86400) / 3600)}h ${Math.floor((timeLeft % 3600) / 60)}m ${timeLeft % 60}s`
              : (lang === "zh" ? "已结束" : "Ended");
            return (
              <a
                key={m.vault}
                href={vaultUrl}
                className="block text-left p-4 rounded-2xl border border-border hover:border-accent/50 transition-all bg-transparent h-full"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-text truncate">{m.meta?.title ?? "—"}</div>
                    <div className="text-xs text-text-muted font-mono mt-0.5 line-clamp-2">
                      {m.meta?.description || "—"}
                    </div>
                  </div>
                  {phaseLabel && (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded border font-mono shrink-0 border-accent/50 text-accent bg-accent/10">
                      {phaseLabel}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[10px] font-mono text-text-muted">
                  <span className="text-text-muted">{t.countdown}:</span>{" "}
                  <span className="text-text font-bold tabular-nums">{countdownStr}</span>
                </div>
                <div className="mt-1 text-[10px] font-mono text-text-muted">
                  <span className="text-text-muted">{t.totalStake}:</span>{" "}
                  <span className="text-text font-bold">{totalStakeFormatted} {symbol}</span>
                </div>
                {vaultPhase === "finalized" && oc?.outcome !== null ? (
                  <div className="mt-2 min-h-11 border border-border rounded-md px-3 py-2 flex items-center justify-center gap-2 text-xs font-mono text-text-muted">
                    <span>{t.finalizedResult}:</span>
                    <strong className={oc.outcome === 1 ? "text-success" : oc.outcome === 2 ? "text-danger" : "text-yellow-500"}>
                      {oc.outcome === 1 ? "YES" : oc.outcome === 2 ? "NO" : "INVALID"}
                    </strong>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="h-1.5 bg-transparent border border-border rounded overflow-hidden flex">
                      <div className="h-full bg-success" style={{ width: `${yesPct}%` }} />
                      <div className="h-full bg-danger" style={{ width: `${noPct}%` }} />
                      <div className="h-full bg-yellow-400" style={{ width: `${invalidPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-text-muted mt-0.5">
                      <span className="text-success">YES {yesPct.toFixed(0)}%</span>
                      <span className="text-danger">NO {noPct.toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                {marketEnabled && (
                  <div className="mt-2">
                    <div className="text-[10px] font-mono text-text-muted">{t.marketPrices}</div>
                    <div className="h-2 bg-transparent border border-border rounded overflow-hidden mt-0.5 flex">
                      <div className="h-full bg-success transition-all" style={{ width: `${displayYesPrice * 100}%` }} />
                      <div className="h-full bg-danger transition-all" style={{ width: `${displayNoPrice * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-text-muted mt-0.5">
                      <span className="text-success">YES {displayYesPrice.toFixed(2)}</span>
                      <span className="text-danger">NO {displayNoPrice.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-accent font-mono mt-2">{marketEnabled ? (lang === "zh" ? "点击进入交易" : "Click to open trading") : t.openVault}</p>
              </a>
            );
          })
        )}
      </div>

      <div className="mt-8">
        <HowToPlay lang={lang} />
      </div>
    </div>
  );
};
