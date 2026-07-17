/**
 * 金库单页：URL 为 explore/vault.html?vault=0x...&market=0x...
 * 照搬模拟页交易界面（左控制 + 右展示），数据与操作接链上合约。
 */
import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import { OCPMenu } from "../components/OCPMenu";
import { Contract, JsonRpcProvider, formatUnits, parseUnits, type JsonRpcSigner } from "ethers";
import {
  ShieldAlert, Zap, ArrowLeftRight, LayoutDashboard, AlertTriangle,
  ArrowRight, Share2,
  X,
} from "lucide-react";
import { Button } from "../components/Button";
import { WalletButton } from "../components/WalletButton";
import { LanguageToggle } from "../components/LanguageToggle";
import { config, VAULT_ABI, MARKET_ABI, ERC20_ABI } from "../config";
import { CONTENT } from "../constants";
import ReactMarkdown from "react-markdown";
import { useWallet } from "../useWallet";

type TabMode = "PROTOCOL" | "MARKET";
type TradeMode = "BUY" | "SELL";

interface DetailState {
  snapshotBlock: number;
  stakeTokenAddress: string;
  totalPrincipal: string;
  totalPrincipalRaw: string;
  totalFees: string;
  totalDonationsRaw: string;
  settlementPoolRaw: string;
  remainingEligibleClaimsRaw: string;
  vaultBalanceRaw: string;
  totalStakeYes: string;
  totalStakeNo: string;
  totalStakeInvalid: string;
  totalStakeYesRaw: string;
  totalStakeNoRaw: string;
  totalStakeInvalidRaw: string;
  minStake: string;
  protocolVersion: 4;
  resolutionTime: number;
  canResolve: boolean;
  nowTs: number;
  yesReserve: string;
  noReserve: string;
  yesPrice: number;
  noPrice: number;
  resolved: boolean;
  outcome: number | null;
  userStakeYes: string;
  userStakeNo: string;
  userStakeInvalid: string;
  userStakeYesRaw: string;
  userStakeNoRaw: string;
  userStakeInvalidRaw: string;
  /** null 表示未连接钱包或 RPC 无法可靠判断；true 表示 withdraw 已经执行过 */
  userVaultClaimed: boolean | null;
  userYesShares: string;
  userNoShares: string;
  userYesSharesRaw: string;
  userNoSharesRaw: string;
  totalYesSharesRaw: string;
  totalNoSharesRaw: string;
  marketCollateralRaw: string;
  tokenSymbol: string;
  tokenDecimals: number;
  userBalance: string;
  /** 用户待领的预测市场手续费（金库 donate 累计中属于该用户的部分） */
  userPendingFees: string;
  userPendingFeesRaw: string;
  /** 预测市场交易手续费（bps） */
  marketFeeBps: number;
}

function getParams(): { vault: string; market: string } | null {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const vault = params.get("vault")?.trim();
  const market = params.get("market")?.trim();
  if (!vault || !market || !/^0x[a-fA-F0-9]{40}$/.test(vault) || !/^0x[a-fA-F0-9]{40}$/.test(market))
    return null;
  return { vault, market };
}

function friendlyActionError(error: unknown, _lang: "zh" | "en"): string {
  const value = error as {
    code?: string | number;
    message?: string;
    shortMessage?: string;
    reason?: string;
    info?: { error?: { message?: string } };
    data?: { message?: string };
  };
  const raw = [value?.shortMessage, value?.reason, value?.info?.error?.message, value?.data?.message, value?.message]
    .filter(Boolean)
    .join(" | ");
  const text = raw.toLowerCase();
  if (value?.code === 4001 || value?.code === "ACTION_REJECTED" || text.includes("user rejected") || text.includes("user denied")) {
    return "You cancelled the request in your wallet. No transaction was sent and no funds were deducted.";
  }
  if (text.includes("insufficient funds") || text.includes("intrinsic transaction cost")) {
    return config.chainId === 8453
      ? "Insufficient ETH on Base to pay gas."
      : "Insufficient ETH to pay gas.";
  }
  if (text.includes("erc20insufficientbalance") || text.includes("transfer amount exceeds balance") || text.includes("exceeds balance")) {
    return config.chainId === 8453
      ? "Insufficient USDC balance. Reduce the amount and try again."
      : "Insufficient balance. Reduce the amount and try again.";
  }
  if (text.includes("amount below min stake") || text.includes("position below min stake") || text.includes("additional amount below min stake")) {
    return "The amount is below this Vault's minimum stake.";
  }
  if (text.includes("position is locked to one side")) return "This wallet already chose another side and cannot switch.";
  if (text.includes("staking ended")) return "Staking has ended.";
  if (text.includes("same side only")) return "One wallet may use only one public staking side.";
  if (text.includes("already finalized")) return "This Vault is already finalized.";
  if (text.includes("already claimed")) return "This wallet has already claimed its payout.";
  if (text.includes("wrong network") || text.includes("chain") && text.includes("mismatch") || value?.code === "NETWORK_ERROR") {
    return `Your wallet is on the wrong network. Switch to Base and try again.`;
  }
  if (text.includes("failed to fetch") || text.includes("network request") || text.includes("timeout")) {
    return "The network request failed. Check your connection and try again.";
  }
  if (text.includes("execution reverted") || text.includes("call_exception") || text.includes("missing revert data")) {
    return "The contract rejected the transaction. Check the current phase, selected side, minimum amount, and wallet balance.";
  }
  if (raw && raw.length <= 180 && !text.includes("0x")) return raw;
  return "The operation did not complete. Check your wallet network, current phase, and balance, then try again.";
}

function VaultPage({
  vaultAddr,
  marketAddr,
  signer,
  walletAddress,
  lang,
  onConnectWallet,
}: {
  vaultAddr: string;
  marketAddr: string;
  signer: JsonRpcSigner | null;
  walletAddress: string;
  lang: "zh" | "en";
  onConnectWallet: () => void;
}) {
  const t = CONTENT[lang].ui;
  const marketEnabled = config.marketEnabled;
  const [detailState, setDetailState] = useState<DetailState | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [liveNow, setLiveNow] = useState(() => Math.floor(Date.now() / 1000));
  const [tabMode, setTabMode] = useState<TabMode>("PROTOCOL");
  const [tradeMode, setTradeMode] = useState<TradeMode>("BUY");
  const [amount, setAmount] = useState("");
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  useEffect(() => {
    const t = setInterval(() => setLiveNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!marketEnabled && tabMode === "MARKET") setTabMode("PROTOCOL");
  }, [marketEnabled, tabMode]);

  const fetchDetailState = useCallback(async () => {
    setDetailError(null);
    setDetailLoading(true);
    try {
      // 始终用 RPC 读链上数据，这样不连钱包或钱包链不对也能看到金库内容
      const provider = config.rpcUrl
        ? new JsonRpcProvider(config.rpcUrl)
        : null;
      if (!provider) {
        setDetailError("The Vault RPC is not configured. Set VITE_RPC_URL and reload the page.");
        return;
      }
      const vault = new Contract(vaultAddr, VAULT_ABI, provider);
      const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
      const hasMarket = marketEnabled && marketAddr?.toLowerCase() !== ZERO_ADDR.toLowerCase();
      const market = hasMarket ? new Contract(marketAddr, MARKET_ABI, provider) : null;
      let userAddr: string | null = walletAddress?.trim() || null;
      if (!userAddr && signer) {
        try {
          userAddr = await signer.getAddress();
        } catch {
          // 钱包未授权等，仅不显示「我的」数据
        }
      }

      const block = await provider.getBlock("latest");
      const nowTs = block?.timestamp ?? Math.floor(Date.now() / 1000);

      const [
        stakeTokenAddr,
        resolutionTime,
        totalPrincipal,
        settlementPool,
        remainingEligibleClaims,
        totalStakeYes,
        totalStakeNo,
        totalStakeInvalid,
        minStake,
        resolved,
        outcome,
        canResolve,
        protocolVersion,
        yesReserve,
        noReserve,
      ] = await Promise.all([
        vault.stakeToken(),
        vault.resolutionTime(),
        vault.totalPrincipal(),
        vault.settlementPool(),
        vault.remainingEligibleClaims(),
        vault.totalStakeYes(),
        vault.totalStakeNo(),
        vault.totalStakeInvalid(),
        vault.minStake(),
        vault.resolved(),
        vault.outcome(),
        vault.canResolve(),
        vault.protocolVersion(),
        hasMarket && market ? market.yesReserve() : Promise.resolve(0n),
        hasMarket && market ? market.noReserve() : Promise.resolve(0n),
      ]);

      let totalFees = 0n;
      try {
        totalFees = await vault.totalDonations();
      } catch {
        // Old vaults without totalFees; fallback to 0
      }

      const token = new Contract(stakeTokenAddr, ERC20_ABI, provider);
      const [decimals, symbol, vaultBalance] = await Promise.all([
        token.decimals(),
        token.symbol(),
        token.balanceOf(vaultAddr),
      ]);
      const defaultPriceTuple: [bigint, bigint] = [500000000000000000n, 500000000000000000n];
      const [priceTuple, totalYesShares, totalNoShares, marketBalance] = hasMarket && market
        ? await Promise.all([
          market.getYesNoPrice() as Promise<[bigint, bigint]>,
          market.totalYesShares() as Promise<bigint>,
          market.totalNoShares() as Promise<bigint>,
          token.balanceOf(marketAddr) as Promise<bigint>,
        ])
        : [defaultPriceTuple, 0n, 0n, 0n];
      const yesPrice = { yes: Number(priceTuple[0]) / 1e18, no: Number(priceTuple[1]) / 1e18 };

      let feeBps = 0;
      if (hasMarket && market) {
        try {
          feeBps = Number(await market.feeBps());
        } catch {
          feeBps = 0;
        }
      }

      let userStakeYes = "0", userStakeNo = "0", userStakeInvalid = "0";
      let userYesShares = "0", userNoShares = "0", userBalance = "0";
      let userPendingFeesWei = "0";
      let userVaultClaimed: boolean | null = null;
      if (userAddr) {
        const [stakeTuple, yesR, noR, balanceR] = await Promise.all([
          vault.stakeOf(userAddr) as Promise<[bigint, bigint, bigint]>,
          hasMarket && market ? (market.yesShares(userAddr) as Promise<bigint>) : Promise.resolve(0n),
          hasMarket && market ? (market.noShares(userAddr) as Promise<bigint>) : Promise.resolve(0n),
          token.balanceOf(userAddr) as Promise<bigint>,
        ]);
        userStakeYes = stakeTuple[0].toString();
        userStakeNo = stakeTuple[1].toString();
        userStakeInvalid = stakeTuple[2].toString();
        userYesShares = yesR.toString();
        userNoShares = noR.toString();
        userBalance = balanceR.toString();
        userPendingFeesWei = "0";

        const userPrincipal = stakeTuple[0] + stakeTuple[1] + stakeTuple[2];
        if (resolved && userPrincipal > 0n) {
          try {
            // V4 Vault 的 _claimed mapping 没有 public getter。这里用 eth_call 只读预执行
            // withdraw：不会发送交易或改链上状态，但能复用合约自己的 Already claimed
            // 检查，避免把历史应得金额继续显示成当前可领取金额。
            await vault.withdraw.staticCall({ from: userAddr });
            userVaultClaimed = false;
          } catch (claimError) {
            const value = claimError as {
              message?: string;
              shortMessage?: string;
              reason?: string;
              info?: { error?: { message?: string } };
            };
            const claimErrorText = [
              value.shortMessage,
              value.reason,
              value.info?.error?.message,
              value.message,
            ].filter(Boolean).join(" | ").toLowerCase();
            if (claimErrorText.includes("already claimed")) userVaultClaimed = true;
          }
        }
      }

      const dec = Number(decimals);
      const format = (raw: string) => {
        const [whole, fraction = ""] = formatUnits(BigInt(raw), dec).split(".");
        const digits = dec <= 6 ? 4 : 2;
        return `${whole}.${fraction.padEnd(digits, "0").slice(0, digits)}`;
      };

      setDetailState({
        snapshotBlock: block?.number ?? 0,
        stakeTokenAddress: stakeTokenAddr,
        totalPrincipal: format(totalPrincipal.toString()),
        totalPrincipalRaw: totalPrincipal.toString(),
        totalFees: format(totalFees.toString()),
        totalDonationsRaw: totalFees.toString(),
        settlementPoolRaw: settlementPool.toString(),
        remainingEligibleClaimsRaw: remainingEligibleClaims.toString(),
        vaultBalanceRaw: vaultBalance.toString(),
        totalStakeYes: format(totalStakeYes.toString()),
        totalStakeNo: format(totalStakeNo.toString()),
        totalStakeInvalid: format(totalStakeInvalid.toString()),
        totalStakeYesRaw: totalStakeYes.toString(),
        totalStakeNoRaw: totalStakeNo.toString(),
        totalStakeInvalidRaw: totalStakeInvalid.toString(),
        minStake: format(minStake.toString()),
        protocolVersion: Number(protocolVersion) as 4,
        resolutionTime: Number(resolutionTime),
        canResolve,
        nowTs,
        yesReserve: format(yesReserve.toString()),
        noReserve: format(noReserve.toString()),
        yesPrice: yesPrice.yes,
        noPrice: yesPrice.no,
        resolved,
        outcome: resolved ? Number(outcome) : null,
        userStakeYes: format(userStakeYes),
        userStakeNo: format(userStakeNo),
        userStakeInvalid: format(userStakeInvalid),
        userStakeYesRaw: userStakeYes,
        userStakeNoRaw: userStakeNo,
        userStakeInvalidRaw: userStakeInvalid,
        userVaultClaimed,
        userYesShares: format(userYesShares),
        userNoShares: format(userNoShares),
        userYesSharesRaw: userYesShares,
        userNoSharesRaw: userNoShares,
        totalYesSharesRaw: totalYesShares.toString(),
        totalNoSharesRaw: totalNoShares.toString(),
        marketCollateralRaw: marketBalance.toString(),
        tokenSymbol: symbol,
        tokenDecimals: dec,
        userBalance: format(userBalance),
        userPendingFees: format(userPendingFeesWei),
        userPendingFeesRaw: userPendingFeesWei,
        marketFeeBps: feeBps,
      });

      try {
        // Vault 自己记录创建它的 Factory。切换到 V2 Factory 后，旧 Vault 页面仍应从
        // 原 Factory 读取题面，不能错误地只查询当前全局配置中的新 Factory。
        const vaultFactoryAddress = await vault.factory();
        const factory = new Contract(vaultFactoryAddress, ["function getVaultMeta(address) view returns (string, string)" as const], provider);
        const [t0, d0] = await factory.getVaultMeta(vaultAddr);
        if (t0) setTitle(String(t0));
        setDescription(d0 ? String(d0) : "");
      } catch {
        setTitle("");
        setDescription("");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = e && typeof e === "object" && "code" in e ? (e as { code: string }).code : "";
      let friendly = msg;
      if (msg.includes("could not decode") || msg.includes("BAD_DATA")) {
        friendly = "This address is not a valid OCP Vault on the configured network. Reopen it from Explore or switch networks.";
      } else if (code === "CALL_EXCEPTION" || msg.includes("missing revert data")) {
        friendly = "The OnChain read failed. The public RPC may be rate-limited; use a Base RPC from Alchemy or Infura and refresh.";
      }
      setDetailError(friendly);
    } finally {
      setDetailLoading(false);
    }
  }, [vaultAddr, marketAddr, signer, walletAddress, lang]);

  useEffect(() => {
    let cancelled = false;
    fetchDetailState().catch((e) => {
      if (!cancelled) {
        setDetailError(e instanceof Error ? e.message : String(e));
        setDetailLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [fetchDetailState]);


  type VaultPhase = "staking" | "ready" | "finalized";
  const nowTs = detailState ? liveNow : 0;
  const vaultPhase: VaultPhase | null = detailState
    ? detailState.resolved
      ? "finalized"
      : nowTs < detailState.resolutionTime
        ? "staking"
        : "ready"
    : null;
  const timeLeft = detailState && vaultPhase
    ? vaultPhase === "staking"
      ? Math.max(0, detailState.resolutionTime - nowTs)
      : 0
    : 0;
  const phaseLabel =
    vaultPhase === "staking" ? t.phase_staking
      : vaultPhase === "ready" ? (lang === "zh" ? "可结算" : "Ready to resolve")
            : vaultPhase === "finalized" ? t.phase_final
              : "";
  const phaseBadgeClass = vaultPhase === "staking"
    ? "border-accent/50 text-accent bg-accent/10"
    : "border-success/50 text-success bg-success/10";
  const primaryActionTitle = vaultPhase === "staking"
    ? (lang === "zh" ? "选择方向并质押" : "Choose a side and stake")
    : vaultPhase === "ready"
          ? (lang === "zh" ? "任何人都可以链上结算" : "Anyone can finalize on-chain")
          : vaultPhase === "finalized"
            ? (lang === "zh" ? "领取结算资金" : "Claim settlement")
            : (lang === "zh" ? "金库操作" : "Vault actions");
  const primaryActionDescription = vaultPhase === "staking"
    ? (lang === "zh" ? "选择 YES、NO 或 INVALID。选定后只能同侧追加，不能换边。" : "Choose YES, NO, or INVALID. Once selected, you may add only to that side and cannot switch.")
    : vaultPhase === "ready"
          ? (lang === "zh" ? "质押截止后即可结算。" : "The Vault can be finalized after staking closes.")
          : vaultPhase === "finalized"
            ? (lang === "zh" ? "连接钱包查看并领取可提取金额。" : "Connect a wallet to view and claim the withdrawable amount.")
            : (lang === "zh" ? "链上数据加载后显示可用操作。" : "Available actions appear after OnChain data loads.");
  // 市场价：合约返回 yesPrice=yesReserve/total，买 YES 后 yesReserve 降→合约 YES 价降。为符合「买哪边哪边涨」，展示为：YES 显示 noReserve/total（买 YES 后涨），NO 显示 yesReserve/total
  const prices = detailState
    ? { yes: detailState.noPrice, no: detailState.yesPrice }
    : { yes: 0.5, no: 0.5 };
  const marketYesPct = (prices.yes * 100);
  const marketNoPct = (prices.no * 100);
  const formatMoney = (amountStr: string) =>
    `${(parseFloat(amountStr) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${detailState?.tokenSymbol ?? ""}`;
  const feeRate = (detailState?.marketFeeBps ?? 30) / 10000;
  const feePct = ((detailState?.marketFeeBps ?? 30) / 100).toFixed(2);
  const feeLabel = detailState
    ? `${lang === "zh" ? "手续费" : "Fee"} ${feePct}%`
    : t.amm_fee;
  const estimatedFee = amount.trim() ? parseFloat(amount) * feeRate : 0;
  const estimatedNet = amount.trim() ? parseFloat(amount) - estimatedFee : 0;

  const formatToken = (raw: bigint | string) => {
    if (!detailState) return "0";
    const rawBig = typeof raw === "bigint" ? raw : BigInt(raw || "0");
    return formatMoney(formatUnits(rawBig, detailState.tokenDecimals ?? 18));
  };

  const withdrawableVaultPayoutWei = (() => {
    if (!detailState || !detailState.resolved || detailState.outcome === null) return null;
    const userYes = BigInt(detailState.userStakeYesRaw || "0");
    const userNo = BigInt(detailState.userStakeNoRaw || "0");
    const userInvalid = BigInt(detailState.userStakeInvalidRaw || "0");
    const userPrincipal = userYes + userNo + userInvalid;
    if (userPrincipal === 0n) return 0n;
    if (detailState.userVaultClaimed === true) return 0n;
    // 状态无法可靠确认时 fail closed：不再把历史理论赔付冒充为当前可领取额。
    if (detailState.userVaultClaimed !== false) return null;
    const totalPrincipal = BigInt(detailState.totalPrincipalRaw || "0");
    const pool = BigInt(detailState.settlementPoolRaw || "0");
    const eligiblePrincipal = detailState.outcome === 3
      ? userPrincipal
      : detailState.outcome === 1
        ? userYes
        : userNo;
    if (eligiblePrincipal === 0n) return 0n;
    // 合约让最后一名合格领取者提走实时余额，以吸收前序 mulDiv 的舍入尘埃。
    if (BigInt(detailState.remainingEligibleClaimsRaw || "0") === 1n) {
      return BigInt(detailState.vaultBalanceRaw || "0");
    }
    if (detailState.outcome === 3) return totalPrincipal > 0n ? (pool * userPrincipal) / totalPrincipal : 0n;
    if (detailState.outcome === 1) return BigInt(detailState.totalStakeYesRaw) > 0n ? (pool * userYes) / BigInt(detailState.totalStakeYesRaw) : 0n;
    if (detailState.outcome === 2) return BigInt(detailState.totalStakeNoRaw) > 0n ? (pool * userNo) / BigInt(detailState.totalStakeNoRaw) : 0n;
    return 0n;
  })();
  const canWithdrawVaultPayout = withdrawableVaultPayoutWei !== null
    && withdrawableVaultPayoutWei > 0n
    && detailState?.userVaultClaimed !== true;

  const estimatedMarketPayoutWei = (() => {
    if (!marketEnabled) return null;
    if (!detailState || !detailState.resolved || detailState.outcome === null) return null;
    const userYes = BigInt(detailState.userYesSharesRaw || "0");
    const userNo = BigInt(detailState.userNoSharesRaw || "0");
    const totalYes = BigInt(detailState.totalYesSharesRaw || "0");
    const totalNo = BigInt(detailState.totalNoSharesRaw || "0");
    const totalShares = totalYes + totalNo;

    if (detailState.outcome === 1) return userYes;
    if (detailState.outcome === 2) return userNo;
    if (detailState.outcome === 3) {
      if (totalShares === 0n) return 0n;
      const marketBal = BigInt(detailState.marketCollateralRaw || "0");
      return (marketBal * (userYes + userNo)) / totalShares;
    }
    return 0n;
  })();

  const hasWallet = Boolean(walletAddress);
  const connectHint = lang === "zh" ? "连接钱包查看" : "Connect wallet to view";

  const yesStake = detailState ? parseFloat(detailState.totalStakeYes) : 0;
  const noStake = detailState ? parseFloat(detailState.totalStakeNo) : 0;
  const invalidStake = detailState ? parseFloat(detailState.totalStakeInvalid) : 0;
  const totalStake = yesStake + noStake + invalidStake;
  const yesPct = totalStake > 0 ? (yesStake / totalStake) * 100 : 0;
  const noPct = totalStake > 0 ? (noStake / totalStake) * 100 : 0;
  const invalidPct = totalStake > 0 ? (invalidStake / totalStake) * 100 : 0;
  const protocolPoolLabel = vaultPhase === "staking"
    ? (lang === "zh" ? "当前公开质押" : "Current public stake")
    : (lang === "zh" ? "最终公开资金分布" : "Final public capital distribution");

  const leaderSide = yesStake === noStake ? null : (yesStake > noStake ? "YES" : "NO");

  const handleShareOnX = () => {
    if (!detailState?.snapshotBlock || typeof window === "undefined") return;

    const shareUrl = new URL("/api/vault-share", window.location.origin);
    shareUrl.searchParams.set("vault", vaultAddr);
    shareUrl.searchParams.set("market", marketAddr);
    shareUrl.searchParams.set("block", String(detailState.snapshotBlock));
    if (detailState.resolved) shareUrl.searchParams.set("finalized", "1");

    const intentUrl = new URL("https://x.com/intent/post");
    intentUrl.searchParams.set("text", title.trim() || (lang === "zh" ? "OCP 金库命题" : "OCP Vault proposition"));
    intentUrl.searchParams.set("url", shareUrl.toString());
    window.open(intentUrl.toString(), "_blank", "noopener,noreferrer");
  };

  const handleStake = async (side: "YES" | "NO" | "INVALID") => {
    if (!signer || !amount.trim() || !detailState) return;
    setTxLoading(true);
    setError(null);
    try {
      const amountWei = parseUnits(amount.trim(), detailState.tokenDecimals ?? 18);
      if (amountWei <= 0n) throw new Error("Amount must be greater than zero");
      const vault = new Contract(vaultAddr, VAULT_ABI, signer);
      const tokenAddr = await vault.stakeToken();
      const token = new Contract(tokenAddr, ERC20_ABI, signer);
      const sideId = (side === "YES" ? 0 : side === "NO" ? 1 : 2) as 0 | 1 | 2;
      await (await token.approve(vaultAddr, amountWei)).wait();
      await (await vault.stake(sideId, amountWei)).wait();
      setAmount("");
      await fetchDetailState();
    } catch (e) {
      setError(friendlyActionError(e, lang));
    } finally {
      setTxLoading(false);
    }
  };

  const handleMarketTrade = async (side: "YES" | "NO") => {
    if (!marketEnabled) {
      setError("Prediction market features are currently disabled.");
      return;
    }
    if (!signer || !amount.trim() || !detailState) return;
    setTxLoading(true);
    setError(null);
    try {
      const amountWei = parseUnits(amount.trim(), detailState.tokenDecimals ?? 18);
      if (amountWei <= 0n) throw new Error("Amount must be greater than zero");
      const market = new Contract(marketAddr, MARKET_ABI, signer);
      if (tradeMode === "BUY") {
        const tokenAddr = await market.collateral();
        const token = new Contract(tokenAddr, ERC20_ABI, signer);
        await (await token.approve(marketAddr, amountWei)).wait();
        if (side === "YES") await (await market.buyYes(amountWei, 0n)).wait();
        else await (await market.buyNo(amountWei, 0n)).wait();
      } else {
        if (side === "YES") await (await market.sellYes(amountWei, 0n)).wait();
        else await (await market.sellNo(amountWei, 0n)).wait();
      }
      setAmount("");
      await fetchDetailState();
    } catch (e) {
      setError(friendlyActionError(e, lang));
    } finally {
      setTxLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!signer) return;
    setTxLoading(true);
    setError(null);
    try {
      const vault = new Contract(vaultAddr, VAULT_ABI, signer);
      await (await vault.withdraw()).wait();
      await fetchDetailState();
    } catch (e) {
      setError(friendlyActionError(e, lang));
    } finally {
      setTxLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!signer) return;
    setTxLoading(true);
    setError(null);
    try {
      const vault = new Contract(vaultAddr, VAULT_ABI, signer);
      await (await vault.finalize()).wait();
      await fetchDetailState();
    } catch (e) {
      setError(friendlyActionError(e, lang));
    } finally {
      setTxLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!marketEnabled) {
      setError("Prediction market features are currently disabled.");
      return;
    }
    if (!signer) return;
    setTxLoading(true);
    setError(null);
    try {
      const market = new Contract(marketAddr, MARKET_ABI, signer);
      const resolved = await market.resolved();
      if (!resolved) {
        await (await market.resolve()).wait();
      }
      const userAddr = await signer.getAddress();
      const [yesR, noR] = await Promise.all([
        market.yesShares(userAddr) as Promise<bigint>,
        market.noShares(userAddr) as Promise<bigint>,
      ]);
      if (yesR === 0n && noR === 0n) return;
      await (await market.redeem(yesR, noR)).wait();
      await fetchDetailState();
    } catch (e) {
      setError(friendlyActionError(e, lang));
    } finally {
      setTxLoading(false);
    }
  };

  const descriptionMatch = description.match(
    /^\s*YES:\s*([\s\S]*?)\s+NO:\s*([\s\S]*?)\s+INVALID:\s*([\s\S]*)$/i,
  );
  const mobileDescriptionItems = descriptionMatch
    ? [
      { label: "YES", text: descriptionMatch[1], className: "border-success/40 text-success" },
      { label: "NO", text: descriptionMatch[2], className: "border-danger/40 text-danger" },
      { label: "INVALID", text: descriptionMatch[3], className: "border-yellow-500/50 text-yellow-600" },
    ]
    : null;

  return (
    <div className="vault-shell bg-white/80 border-y sm:border border-border sm:rounded-2xl shadow-sm sm:shadow-2xl flex flex-col md:flex-row max-w-6xl mx-auto md:min-h-[600px] overflow-hidden backdrop-blur-xl relative">
      <div className="absolute top-10 right-10 w-72 sm:w-96 h-72 sm:h-96 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

      {/* 手机端先展示状态，再展示当前可执行操作；桌面端由右侧状态面板承担。 */}
      <div className="md:hidden w-full px-4 pt-5 pb-4 border-b border-border relative z-10 bg-gradient-to-b from-orange-50/70 to-transparent">
        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl leading-7 font-bold text-text tracking-tight font-display break-words">
                {title || (lang === "zh" ? "金库" : "Vault")}
              </h2>
            {phaseLabel && (
              <span className={`inline-flex shrink-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border font-mono ${phaseBadgeClass}`}>
                {phaseLabel}
              </span>
            )}
            </div>
            {description && (
              mobileDescriptionItems ? (
                <div className="mt-3 space-y-2.5">
                  {mobileDescriptionItems.map((item) => (
                    <div key={item.label} className={`border-l-2 pl-3 ${item.className}`}>
                      <div className="text-[10px] font-bold tracking-wider">{item.label}</div>
                      <p className="mt-0.5 text-xs leading-5 text-text-muted font-mono break-words">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-text-muted font-mono whitespace-pre-line break-words">
                  {description}
                </p>
              )
            )}
          </div>
          <div className="flex items-end justify-between rounded-xl border border-border bg-white/70 px-3.5 py-3">
            <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
              {lang === "zh" ? "阶段剩余时间" : "Phase time left"}
            </div>
            <div className="text-lg leading-none font-bold text-text tabular-nums font-display tracking-tight">
              {timeLeft > 0 ? `${Math.floor(timeLeft / 3600)}h ${(Math.floor(timeLeft / 60) % 60)}m ${timeLeft % 60}s` : "—"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl border border-border bg-white/60 px-3 py-2.5">
            <div className="text-[10px] text-text-muted font-display uppercase tracking-wider">
              {lang === "zh" ? "总质押本金" : "Total principal"}
            </div>
            <div className="text-sm text-text font-bold font-mono mt-1">
              {detailState ? formatMoney(detailState.totalPrincipal) : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white/60 px-3 py-2.5">
            <div className="text-[10px] text-text-muted font-display uppercase tracking-wider">
              {lang === "zh" ? "公开领先" : "Public leader"}
            </div>
            <div className="text-sm text-text font-bold font-mono mt-1">
              {leaderSide ?? (lang === "zh" ? "平局" : "Tied")}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-xl bg-success/10 px-2.5 py-2 text-center"><div className="text-[10px] font-bold text-success">YES</div><div className="mt-0.5 text-sm font-bold text-text tabular-nums">{yesPct.toFixed(1)}%</div></div>
          <div className="rounded-xl bg-danger/10 px-2.5 py-2 text-center"><div className="text-[10px] font-bold text-danger">NO</div><div className="mt-0.5 text-sm font-bold text-text tabular-nums">{noPct.toFixed(1)}%</div></div>
          <div className="rounded-xl bg-yellow-500/10 px-2.5 py-2 text-center"><div className="text-[10px] font-bold text-yellow-600">INVALID</div><div className="mt-0.5 text-sm font-bold text-text tabular-nums">{invalidPct.toFixed(1)}%</div></div>
        </div>
        <button onClick={handleShareOnX} disabled={!detailState?.snapshotBlock} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold text-text-muted transition-colors hover:bg-black/5 hover:text-accent disabled:opacity-40">
          <Share2 className="w-3.5 h-3.5" /> {lang === "zh" ? "分享这个金库" : "Share this Vault"}
        </button>
      </div>

      {/* Left: phase-driven action panel */}
      <div className="px-4 py-5 sm:p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-border bg-transparent flex flex-col gap-4 sm:gap-6 relative z-10">
        {error && (
          <div role="alert" className="bg-red-50 text-red-950 rounded-lg px-4 py-3 text-sm z-20 flex items-start gap-3 animate-fade-in border-2 border-red-500 shadow-lg">
            <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-bold mb-1">Action not completed</div>
              <div className="font-mono text-xs leading-relaxed break-words">{error}</div>
            </div>
            <button onClick={() => setError(null)} className="p-1 text-red-700 hover:text-red-950 shrink-0" aria-label="Dismiss error">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {!signer && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-xs font-mono text-accent flex items-center justify-between gap-3">
            <span>{lang === "zh" ? "链上数据可直接查看；连接钱包后执行操作。" : "OnChain data is public; connect a wallet to act."}</span>
            <Button onClick={onConnectWallet} variant="outline" size="sm" className="shrink-0 border-accent/40 text-accent">
              {lang === "zh" ? "连接" : "Connect"}
            </Button>
          </div>
        )}
        <div>
          <h3 className="text-lg font-display font-bold text-text mb-1 flex items-center gap-2 tracking-wide text-glow">
            <LayoutDashboard className="text-accent w-5 h-5" /> {primaryActionTitle}
          </h3>
          <p className="text-text-muted text-xs font-mono">{primaryActionDescription}</p>
        </div>

        {marketEnabled && (
        <div className="flex p-1 bg-transparent border border-border rounded-lg mb-2">
          <button
            onClick={() => setTabMode("PROTOCOL")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all font-display tracking-wider ${tabMode === "PROTOCOL" ? "bg-transparent text-text shadow-glow border border-accent" : "text-text-muted hover:text-text"}`}
          >
            <ShieldAlert className="w-3.5 h-3.5" /> {t.tab_protocol}
          </button>
          {marketEnabled && (
            <button
              onClick={() => setTabMode("MARKET")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all font-display tracking-wider ${tabMode === "MARKET" ? "bg-transparent text-text shadow-glow border border-accent-2" : "text-text-muted hover:text-text"}`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" /> {t.tab_market}
            </button>
          )}
        </div>
        )}

        {tabMode === "MARKET" && marketEnabled ? (
          <div className="space-y-4 animate-fade-in">
            {detailLoading && (
              <div className="p-4 border border-border rounded-xl text-center text-text-muted font-mono text-sm">
                {lang === "zh" ? "加载金库数据中…" : "Loading vault…"}
              </div>
            )}
            {detailError && !detailLoading && (
              <div role="alert" className="p-4 border-2 border-red-500 rounded-lg bg-red-50 text-red-950 text-sm shadow-md">
                <div className="font-bold mb-1">Vault data failed to load</div>
                <p className="mb-3 text-xs font-mono leading-relaxed">{detailError}</p>
                <Button onClick={() => fetchDetailState()} variant="outline" size="sm" className="border-red-600 text-red-800">
                  {lang === "zh" ? "重试" : "Retry"}
                </Button>
              </div>
            )}
            <div className="bg-transparent border border-border rounded-xl p-4">
              <div className="mb-4 flex items-start gap-3">
                <div className="p-2 bg-accent-2/10 rounded-lg border border-accent-2/30"><Zap className="w-4 h-4 text-accent-2" /></div>
                <div>
                  <h5 className="font-bold text-text text-sm font-display tracking-wide">{t.tab_market}</h5>
                  <p className="text-xs text-text-muted mt-1 font-mono">{t.amm_calc_note}</p>
                </div>
              </div>
              <div className="flex bg-transparent border border-border rounded-lg p-1 mb-3">
                <button onClick={() => setTradeMode("BUY")} className={`flex-1 py-1.5 text-xs font-bold rounded-md font-display tracking-wider ${tradeMode === "BUY" ? "bg-success/20 text-success border border-success/50" : "text-text-muted hover:text-text"}`}>{t.amm_mode_buy}</button>
                <button onClick={() => setTradeMode("SELL")} className={`flex-1 py-1.5 text-xs font-bold rounded-md font-display tracking-wider ${tradeMode === "SELL" ? "bg-danger/20 text-danger border border-danger/50" : "text-text-muted hover:text-text"}`}>{t.amm_mode_sell}</button>
              </div>
              <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex justify-between font-display">
                <span>{tradeMode === "BUY" ? t.sim_label_stake_amount : t.amm_shares}</span>
                <span className="text-[10px] text-accent font-mono">{feeLabel}</span>
              </label>
              <div className="relative mb-2">
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent border border-border rounded-lg px-3 py-3 text-text text-lg font-mono" />
                <div className="absolute right-3 top-4 text-text-muted text-xs font-mono">{tradeMode === "BUY" ? (detailState?.tokenSymbol ?? "") : t.amm_shares_suffix}</div>
              </div>
              {tradeMode === "BUY" && amount.trim() && parseFloat(amount) > 0 && (
                <div className="flex justify-between text-[10px] text-text-muted mb-2 px-1 font-mono border-t border-border/50 pt-2 border-dashed">
                  <span>{t.amm_gross}: {amount}</span>
                  <span className="text-danger">- {t.amm_fee_deduction}: {estimatedFee.toFixed(2)}</span>
                  <span className="text-success font-bold">= {t.amm_net}: {estimatedNet.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-end text-[10px] text-text-muted mb-3 font-mono">
                {tradeMode === "BUY" ? (
                  <span>{t.amm_avail_balance}: <span className="text-text font-bold">{detailState ? formatMoney(detailState.userBalance) : "—"}</span></span>
                ) : (
                  <div className="flex gap-2">
                    <span>YES: <span className="text-text cursor-pointer hover:text-accent hover:underline" onClick={() => setAmount(detailState?.userYesShares ?? "0")}>{detailState?.userYesShares ?? "0"}</span></span>
                    <span>NO: <span className="text-text cursor-pointer hover:text-accent hover:underline" onClick={() => setAmount(detailState?.userNoShares ?? "0")}>{detailState?.userNoShares ?? "0"}</span></span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleMarketTrade("YES")}
                  disabled={detailState?.resolved || txLoading || (tradeMode === "SELL" && (parseFloat(detailState?.userYesShares ?? "0") <= 0))}
                  className={`flex flex-col items-center border rounded-lg p-3 transition-all active:scale-95 disabled:opacity-50 ${tradeMode === "BUY" ? "bg-success/10 border-success/30 hover:bg-success/20 hover:border-success" : "bg-transparent border-border hover:border-text-muted"}`}
                >
                  <span className="text-success font-bold text-sm font-display tracking-wider">YES</span>
                  <span className="text-text-muted text-xs font-mono mt-1">{prices.yes.toFixed(2)}</span>
                </button>
                <button
                  onClick={() => handleMarketTrade("NO")}
                  disabled={detailState?.resolved || txLoading || (tradeMode === "SELL" && (parseFloat(detailState?.userNoShares ?? "0") <= 0))}
                  className={`flex flex-col items-center border rounded-lg p-3 transition-all active:scale-95 disabled:opacity-50 ${tradeMode === "BUY" ? "bg-danger/10 border-danger/30 hover:bg-danger/20 hover:border-danger" : "bg-transparent border-border hover:border-text-muted"}`}
                >
                  <span className="text-danger font-bold text-sm font-display tracking-wider">NO</span>
                  <span className="text-text-muted text-xs font-mono mt-1">{prices.no.toFixed(2)}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            {detailLoading && (
              <div className="p-4 border border-border rounded-xl text-center text-text-muted font-mono text-sm">
                {lang === "zh" ? "加载金库数据中…" : "Loading vault…"}
              </div>
            )}
            {detailError && !detailLoading && (
              <div role="alert" className="p-4 border-2 border-red-500 rounded-lg bg-red-50 text-red-950 text-sm shadow-md">
                <div className="font-bold mb-1">Vault data failed to load</div>
                <p className="mb-3 text-xs font-mono leading-relaxed">{detailError}</p>
                <Button onClick={() => fetchDetailState()} variant="outline" size="sm" className="border-red-600 text-red-800">
                  {lang === "zh" ? "重试" : "Retry"}
                </Button>
              </div>
            )}
            <div className="bg-transparent border border-border rounded-xl p-4 mb-2 text-xs text-text-muted">
              <h5 className="font-bold text-text flex items-center gap-1.5 mb-2 font-display">
                <ShieldAlert className="w-3.5 h-3.5 text-accent" /> {t.tab_protocol}
              </h5>
              <div className="leading-relaxed font-mono">
                <ReactMarkdown components={{ strong: ({ children, ...p }) => <strong {...p}>{children}</strong> }}>{t.proto_pool_desc}</ReactMarkdown>
              </div>
            </div>
            {detailState && (
              <>
                <div className="text-xs font-mono text-text-muted">
                  {t.amm_avail_balance}: <span className="text-text font-bold">{hasWallet ? `${detailState.userBalance} ${detailState.tokenSymbol}` : "—"}</span>
                </div>
                <div className="bg-transparent border border-border rounded-xl p-3 text-xs font-mono text-text-muted">
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-text-muted font-display">
                    {lang === "zh" ? "我的质押" : "My Stake"}
                  </div>
                  {hasWallet ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-success">YES</span>
                      <span className="text-text font-bold">{formatMoney(detailState.userStakeYes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-danger">NO</span>
                      <span className="text-text font-bold">{formatMoney(detailState.userStakeNo)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-yellow-500">INVALID</span>
                      <span className="text-text font-bold">{formatMoney(detailState.userStakeInvalid)}</span>
                    </div>
                  </div>
                  ) : (
                    <div className="text-text-muted">{connectHint}</div>
                  )}
                  {marketEnabled && (
                  <div className="border-t border-border/60 mt-2 pt-2 flex justify-between">
                    <span className="text-text-muted">{t.user_pending_fees}</span>
                    <span className="text-accent font-bold">{hasWallet ? formatMoney(detailState.userPendingFees) : connectHint}</span>
                  </div>
                  )}
                </div>
              </>
            )}
            {vaultPhase === "staking" && detailState && !detailState.resolved && (
              <>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-2 font-display">
                    {t.sim_label_stake_amount}
                    {detailState?.minStake ? (
                      <span className="font-mono normal-case">
                        {` (${lang === "zh" ? "最小参与金额" : "Min"} ${detailState.minStake} ${detailState.tokenSymbol ?? ""})`}
                      </span>
                    ) : ""}
                  </label>
                  <div className="relative">
                    <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-transparent border border-border rounded-lg px-3 py-3 text-text font-mono text-sm" />
                    <div className="absolute right-3 top-3.5 text-text-muted text-xs font-mono">{detailState?.tokenSymbol}</div>
                  </div>
                </div>
                {(() => {
                  const hasYes = parseFloat(detailState.userStakeYes) > 0;
                  const hasNo = parseFloat(detailState.userStakeNo) > 0;
                  const hasInv = parseFloat(detailState.userStakeInvalid) > 0;
                  const disableYes = hasNo || hasInv;
                  const disableNo = hasYes || hasInv;
                  const disableInvalid = hasYes || hasNo;
                  return (
                    <>
                      <p className="text-[10px] leading-5 text-text-muted font-mono">
                        {lang === "zh"
                          ? "YES、NO、INVALID 全程开放。选定方向后只能同侧追加，不能撤回或换边。"
                          : "YES, NO, and INVALID stay open until the deadline. Once selected, you may add only to that side and cannot withdraw or switch."}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Button onClick={() => handleStake("YES")} disabled={txLoading || !signer || !amount.trim() || disableYes} variant="success" className="w-full opacity-100 disabled:opacity-50">{txLoading ? "…" : null} {t.sim_btn_yes}</Button>
                        <Button onClick={() => handleStake("NO")} disabled={txLoading || !signer || !amount.trim() || disableNo} variant="danger" className="w-full opacity-100 disabled:opacity-50">{txLoading ? "…" : null} {t.sim_btn_no}</Button>
                      </div>
                      <Button onClick={() => handleStake("INVALID")} disabled={txLoading || !signer || !amount.trim() || disableInvalid} variant="secondary" className="w-full opacity-100 disabled:opacity-50">{txLoading ? "…" : null} {t.sim_btn_invalid}</Button>
                    </>
                  );
                })()}
              </>
            )}
            {(vaultPhase === "ready" || vaultPhase === "finalized" || (!detailState && !detailLoading)) && (
            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 font-display">{primaryActionTitle}</h4>
              {!detailState && !detailLoading && (
                <>
                  <p className="text-text-muted text-xs font-mono mb-2">{lang === "zh" ? "未加载到金库数据，无法显示操作。" : "Vault data not loaded."}</p>
                  <Button onClick={() => fetchDetailState()} variant="outline" size="sm">
                    {lang === "zh" ? "重新加载" : "Reload"}
                  </Button>
                </>
              )}
              {vaultPhase === "ready" && (
                <div className="space-y-3">
                  <p className="p-3 bg-transparent rounded border border-border text-xs text-text-muted text-center font-mono uppercase tracking-widest">
                    {lang === "zh" ? "质押期已结束，可以结算" : "Staking has ended; finalization is available"}
                  </p>
                  <Button onClick={handleFinalize} disabled={txLoading || !signer} variant="primary" className="w-full justify-center">
                    {txLoading ? "…" : (lang === "zh" ? "结算金库" : "Finalize Vault")}
                  </Button>
                </div>
              )}
              {vaultPhase === "finalized" && detailState && (
                <div className="space-y-3">
                  <div className="bg-transparent border border-border rounded-lg p-3 text-xs font-mono text-text-muted">
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-text-muted font-display">
                      {lang === "zh" ? "可提取金额" : "Withdrawable"}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">
                        {detailState.userVaultClaimed === true
                          ? t.btn_claimed
                          : detailState.userVaultClaimed === null
                            ? (lang === "zh" ? "领取状态不可用" : "Claim status unavailable")
                            : t.btn_claim_proto}
                      </span>
                      <span className="text-text font-bold">{withdrawableVaultPayoutWei === null ? "—" : formatToken(withdrawableVaultPayoutWei)}</span>
                    </div>
                    {marketEnabled && (
                      <div className="flex justify-between mt-1">
                        <span className="text-text-muted">{t.btn_claim_market}</span>
                        <span className="text-text font-bold">{estimatedMarketPayoutWei === null ? "—" : formatToken(estimatedMarketPayoutWei)}</span>
                      </div>
                    )}
                  </div>
                  <Button onClick={handleWithdraw} disabled={txLoading || !signer || !canWithdrawVaultPayout} variant="primary" className="w-full justify-center">
                    {detailState.userVaultClaimed ? t.btn_claimed : t.btn_claim_proto}
                  </Button>
                  {marketEnabled && (
                    <Button onClick={handleRedeem} disabled={txLoading || !signer} variant="secondary" className="w-full justify-center">{t.btn_claim_market}</Button>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Visualizer - 与模拟页一致 */}
      <div className="px-4 py-5 sm:p-6 md:w-2/3 bg-slate-50/40 md:bg-transparent relative flex flex-col font-mono md:rounded-r-2xl">
        <div className="hidden md:flex justify-between items-start mb-6 animate-fade-in border-b border-border pb-4">
          <div className="min-w-0 pr-8">
            <h2 className="text-2xl font-bold text-text mb-3 tracking-wide font-display text-glow break-words leading-tight">
              {title || (lang === "zh" ? "金库" : "Vault")}
            </h2>
            {description && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20">
                <p className="text-sm leading-6 text-text font-mono whitespace-pre-line break-words">
                  {description}
                </p>
              </div>
            )}
            {phaseLabel && (
              <span className={`px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded border font-mono ${phaseBadgeClass}`}>
                {phaseLabel}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-4xl font-bold text-text tabular-nums font-display tracking-widest text-glow">
              {timeLeft > 0 ? `${Math.floor(timeLeft / 3600)}h ${(Math.floor(timeLeft / 60) % 60)}m ${timeLeft % 60}s` : "—"}
            </div>
            <Button
              onClick={handleShareOnX}
              disabled={!detailState?.snapshotBlock}
              variant="secondary"
              className="mt-3 ml-auto"
            >
              <Share2 className="w-4 h-4 mr-2" />
              {lang === "zh" ? "分享到 X" : "Share on X"}
            </Button>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-4 mb-6 text-xs text-text-muted font-mono uppercase">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-success rounded-full" /> {t.sys_online}
          </div>
        </div>
        <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-8 animate-fade-in">
          <div className="text-center text-xs font-bold uppercase tracking-widest mb-2 text-text-muted font-display">
            {tabMode === "MARKET" ? t.showing_market : protocolPoolLabel}
          </div>
          {tabMode === "MARKET" && marketEnabled ? (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-text-muted font-display">
                  {lang === "zh" ? "预测市场行情" : "Market odds"}
                </div>
                <div className="h-6 bg-transparent border border-border rounded overflow-hidden flex">
                  <div className="h-full bg-success transition-all" style={{ width: `${marketYesPct}%` }} />
                  <div className="h-full bg-danger transition-all" style={{ width: `${marketNoPct}%` }} />
                </div>
                <div className="flex justify-between text-xs font-bold font-mono mt-1">
                  <span className="text-success">YES {(prices.yes * 100).toFixed(0)}%</span>
                  <span className="text-danger">NO {(prices.no * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-text-muted font-display">
                  {lang === "zh" ? "流动性池" : "Liquidity pool"}
                </div>
                <div className="text-xs font-mono text-text-muted space-y-1">
                  <div>YES: <span className="text-text font-bold">{detailState ? `${detailState.yesReserve} ${detailState.tokenSymbol}` : "—"}</span></div>
                  <div>NO: <span className="text-text font-bold">{detailState ? `${detailState.noReserve} ${detailState.tokenSymbol}` : "—"}</span></div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex justify-between text-xs mb-1.5 font-bold font-mono">
                  <span className="text-success">YES {yesPct.toFixed(1)}%</span>
                  <span className="text-text-muted">{detailState ? formatMoney(detailState.totalStakeYes) : "—"}</span>
                </div>
                <div className="h-6 bg-transparent border border-border rounded overflow-hidden">
                  <div className="h-full bg-success transition-all" style={{ width: `${yesPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5 font-bold font-mono">
                  <span className="text-danger">NO {noPct.toFixed(1)}%</span>
                  <span className="text-text-muted">{detailState ? formatMoney(detailState.totalStakeNo) : "—"}</span>
                </div>
                <div className="h-6 bg-transparent border border-border rounded overflow-hidden">
                  <div className="h-full bg-danger transition-all" style={{ width: `${noPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5 font-bold font-mono">
                  <span className="text-yellow-500">INVALID {invalidPct.toFixed(1)}%</span>
                  <span className="text-text-muted">{detailState ? formatMoney(detailState.totalStakeInvalid) : "—"}</span>
                </div>
                <div className="h-6 bg-transparent border border-border rounded overflow-hidden">
                  <div className="h-full bg-yellow-500/90 transition-all" style={{ width: `${invalidPct}%` }} />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="hidden md:grid grid-cols-2 gap-4 mb-6">
          <div className="border border-border rounded-xl p-4">
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {lang === "zh" ? "总质押本金" : "Total principal"}
            </div>
            <div className="text-sm text-text font-bold font-mono">
              {detailState ? formatMoney(detailState.totalPrincipal) : "—"}
            </div>
          </div>
          <div className={`border rounded-xl p-4 ${detailState?.resolved
            ? detailState.outcome === 1
              ? "border-success/30 bg-success/5"
              : detailState.outcome === 2
                ? "border-danger/30 bg-danger/5"
                : "border-yellow-500/30 bg-yellow-500/5"
            : "border-border"}`}>
            <div className="text-[10px] text-text-muted uppercase mb-2 font-bold font-display tracking-wider">
              {detailState?.resolved
                ? (lang === "zh" ? "最终结果" : "Final result")
                : (lang === "zh" ? "当前公开领先" : "Current public leader")}
            </div>
            <div className="text-sm text-text font-bold font-mono">
              {detailState?.resolved
                ? detailState.outcome === 1 ? "YES" : detailState.outcome === 2 ? "NO" : "INVALID"
                : leaderSide ?? (lang === "zh" ? "平局" : "Tied")}
            </div>
          </div>
        </div>

        <details className="border border-border rounded-xl p-3.5 sm:p-4 mt-auto text-xs font-mono text-text-muted group bg-white/60 md:bg-transparent">
          <summary className="cursor-pointer select-none font-bold text-text font-display tracking-wide">
            {lang === "zh" ? "链上资金明细" : "OnChain fund details"}
          </summary>
          <div className="mt-4 pt-4 border-t border-border space-y-4">
            <div className="text-text-muted font-bold font-display tracking-wide">
              {detailState?.resolved
                ? (lang === "zh" ? "最终资金分布" : "Final fund distribution")
                : (lang === "zh" ? "当前公开链上金额" : "Current public OnChain amounts")}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border border-success/20 rounded-lg p-3">
                <div className="text-success font-bold">YES</div>
                <div className="text-text mt-1">{detailState ? formatMoney(detailState.totalStakeYes) : "—"}</div>
              </div>
              <div className="border border-danger/20 rounded-lg p-3">
                <div className="text-danger font-bold">NO</div>
                <div className="text-text mt-1">{detailState ? formatMoney(detailState.totalStakeNo) : "—"}</div>
              </div>
              <div className="border border-yellow-500/30 rounded-lg p-3">
                <div className="text-yellow-500 font-bold">INVALID</div>
                <div className="text-text mt-1">{detailState ? formatMoney(detailState.totalStakeInvalid) : "—"}</div>
              </div>
              <div className="border border-accent/20 rounded-lg p-3">
                <div className="text-accent font-bold">{t.total_fees}</div>
                <div className="text-text mt-1">{detailState ? formatMoney(detailState.totalFees) : "—"}</div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function VaultStandalone() {
  const params = getParams();
  const [lang, setLang] = useState<"zh" | "en">("en");
  const wallet = useWallet();

  if (!params) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <p className="text-text-muted font-mono mb-4">{lang === "zh" ? "缺少参数：请从探索页点击金库卡片进入。" : "Missing params: open from explore vault list."}</p>
        <a href="/explore.html" className="text-accent hover:underline font-display font-bold">{lang === "zh" ? "返回探索" : "Back to Explore"}</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-accent/30 selection:text-white">
      <nav className="sm:sticky sm:top-0 z-50 backdrop-blur-md bg-white/90 sm:bg-transparent border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <OCPMenu lang={lang} suffix="VAULT" />
              <a href="/explore.html" className="hidden sm:flex text-text-muted hover:text-accent transition-colors items-center gap-2">
                <ArrowRight className="w-4 h-4 rotate-180" />
                <span className="font-display font-bold text-sm">{lang === "zh" ? "返回 Stake War" : "Back to Stake War"}</span>
              </a>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <WalletButton
                lang={lang}
                connected={wallet.connected}
                address={wallet.address}
                chainId={wallet.chainId}
                onTargetNetwork={wallet.onTargetNetwork}
                targetChainId={wallet.targetChainId}
                onConnect={wallet.connectWallet}
                onDisconnect={wallet.disconnectWallet}
              />
              <LanguageToggle lang={lang} setLang={setLang} />
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 py-3 sm:py-8 px-0 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <VaultPage vaultAddr={params.vault} marketAddr={params.market} signer={wallet.signer} walletAddress={wallet.address} lang={lang} onConnectWallet={wallet.connectWallet} />
        </div>
      </main>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <VaultStandalone />
    </React.StrictMode>
  );
}
