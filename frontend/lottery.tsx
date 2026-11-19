import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Contract, JsonRpcProvider, ZeroAddress, formatUnits, isAddress } from "ethers";
import { OCPMenu } from "./components/OCPMenu";
import { config } from "./config";
import { lotteryApiUrl, lotteryContractAddress } from "./shared/lotteryConfig";
import { useWallet } from "./useWallet";
import "./index.css";
import "./lottery.css";

const lotteryAbi = [
  "function activePrize() view returns (address winner, uint64 cutoff, uint64 claimDeadline)",
  "function pendingRound() view returns (uint64 cutoff, uint64 drandRound, bytes32 root, uint256 totalWeight)",
  "function prize(address token) view returns (uint256)",
  "function assetCount() view returns (uint256)",
  "function assets(uint256 index) view returns (address)",
  "function claim(address[] tokens)",
];
const tokenAbi = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
const txHashPattern = /^0x[0-9a-fA-F]{64}$/;
const isUint = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9]{1,78}$/.test(value);
const isEpoch = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000;

const params = new URLSearchParams(window.location.search);
const lang = params.get("lang") === "zh" || (!params.has("lang") && navigator.language.startsWith("zh")) ? "zh" : "en";
const t = (zh: string, en: string) => lang === "zh" ? zh : en;
const date = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
  year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  timeZone: "America/Los_Angeles", timeZoneName: "short", hour12: lang === "en",
});
const formatDate = (timestamp: number) => date.format(timestamp * 1000);
const snapshotUrl = lotteryApiUrl("snapshot");
const reportUrl = lotteryApiUrl("report");
const rpc = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });

type Snapshot = {
  round: number;
  reviewEndsAt: number;
  snapshotStatus: "review" | "final";
  totalWeight: string;
  root: string;
  wallets: { address: string; weight: string }[];
};
type PrizeAsset = { token: string; amount: bigint; decimals: number | null; symbol: string | null };
type ChainRound = {
  winner: string;
  claimDeadline: number;
  cutoff: number;
  pendingCutoff: number;
  pendingRoot: string;
  pendingWeight: bigint;
  drandRound: bigint;
  assets: PrizeAsset[];
  chainTime: number;
};

function validateSnapshot(data: unknown): Snapshot {
  const value = data as Snapshot | null;
  if (!value || !isEpoch(value.round) || !isEpoch(value.reviewEndsAt) ||
      (value.snapshotStatus !== "review" && value.snapshotStatus !== "final") ||
      !isUint(value.totalWeight) || typeof value.root !== "string" || !txHashPattern.test(value.root) ||
      !Array.isArray(value.wallets) ||
      value.wallets.some(wallet => !wallet || !isAddress(wallet.address) || !isUint(wallet.weight))) {
    throw new Error("The Keeper returned an invalid lottery snapshot");
  }
  return value;
}

async function getChainRound(address: string): Promise<ChainRound> {
  const contract = new Contract(address, lotteryAbi, rpc);
  const block = await rpc.getBlock("latest");
  if (!block) throw new Error("Robinhood Chain returned no latest block");
  const at = { blockTag: block.number };
  const [active, pending] = await Promise.all([contract.activePrize(at), contract.pendingRound(at)]);
  const assets: PrizeAsset[] = [];
  if (active.winner !== ZeroAddress) {
    const count = Number(await contract.assetCount(at));
    const addresses = await Promise.all(Array.from({ length: count }, (_, index) => contract.assets(index, at)));
    const amounts = await Promise.all(addresses.map(token => contract.prize(token, at)));
    await Promise.all(addresses.map(async (token, index) => {
      if (amounts[index] === 0n) return;
      const erc20 = new Contract(token, tokenAbi, rpc);
      const [symbol, decimals] = await Promise.allSettled([erc20.symbol(at), erc20.decimals(at)]);
      assets[index] = {
        token, amount: amounts[index],
        decimals: decimals.status === "fulfilled" ? Number(decimals.value) : null,
        symbol: symbol.status === "fulfilled" ? symbol.value : null,
      };
    }));
  }
  return {
    winner: active.winner,
    cutoff: Number(active.cutoff),
    claimDeadline: Number(active.claimDeadline),
    pendingCutoff: Number(pending.cutoff),
    pendingRoot: pending.root,
    pendingWeight: pending.totalWeight,
    drandRound: pending.drandRound,
    assets: assets.filter(Boolean),
    chainTime: block.timestamp,
  };
}

function LotteryPage() {
  const { signer, address, connectWallet } = useWallet();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [chain, setChain] = useState<ChainRound | null>(null);
  const [snapshotError, setSnapshotError] = useState(false);
  const [chainError, setChainError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [refresh, setRefresh] = useState(0);
  const [hash, setHash] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const pollInterval = Math.floor(now / 30_000);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const request = new AbortController();
    if (snapshotUrl) {
      void (async () => {
        try {
          const response = await fetch(snapshotUrl, { signal: request.signal, cache: "no-store" });
          if (!response.ok) throw new Error("Snapshot request failed");
          const data = validateSnapshot(await response.json());
          if (!request.signal.aborted) {
            setSnapshot(data);
            setSnapshotError(false);
          }
        } catch {
          if (!request.signal.aborted) setSnapshotError(true);
        }
      })();
    }
    if (lotteryContractAddress) {
      void getChainRound(lotteryContractAddress).then(result => {
        if (!request.signal.aborted) {
          setChain(result);
          setChainError(false);
        }
      }, () => {
        if (!request.signal.aborted) setChainError(true);
      });
    }
    return () => request.abort();
  }, [refresh, pollInterval]);

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const transactionHash = hash.trim();
    if (!reportUrl || !snapshot || reporting || snapshot.snapshotStatus !== "review" ||
        Date.now() >= snapshot.reviewEndsAt * 1000) return;
    if (!txHashPattern.test(transactionHash)) {
      setReportMessage(t("请输入完整的交易哈希。", "Enter the full transaction hash."));
      return;
    }
    setReporting(true);
    setReportMessage("");
    try {
      const response = await fetch(reportUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionHash, round: snapshot.round }),
      });
      const data = await response.json();
      if (!response.ok || data.accepted !== true) {
        const detail = typeof data.error === "string" ? data.error.slice(0, 240) : "";
        throw new Error(detail || t("Keeper 无法核对这笔交易。", "The Keeper could not verify this transaction."));
      }
      setReportMessage(data.queued === true
        ? t("已核对交易，等待刷新公开名单。", "Transaction verified. The public ledger will refresh shortly.")
        : t("这笔交易已记录。", "This transaction is already recorded."));
      setHash("");
      setRefresh(value => value + 1);
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : t("提交失败，请重试。", "Submission failed. Try again."));
    } finally {
      setReporting(false);
    }
  }

  async function claim(tokens: string[]) {
    if (!lotteryContractAddress || !signer || !chain || !tokens.length || claiming) return;
    setClaiming(true);
    setClaimMessage("");
    try {
      if (Number((await signer.provider.getNetwork()).chainId) !== 4663) {
        throw new Error(t("请切换到 Robinhood Chain。", "Switch to Robinhood Chain."));
      }
      const contract = new Contract(lotteryContractAddress, lotteryAbi, signer);
      const [latest, account] = await Promise.all([signer.provider.getBlock("latest"), signer.getAddress()]);
      if (!latest) throw new Error(t("无法读取最新区块。", "The latest block is unavailable."));
      const at = { blockTag: latest.number };
      const fresh = await contract.activePrize(at);
      if (fresh.winner.toLowerCase() !== account.toLowerCase() ||
          Number(fresh.cutoff) !== chain.cutoff ||
          Number(fresh.claimDeadline) <= latest.timestamp) {
        setRefresh(value => value + 1);
        throw new Error(t("可领取奖金已变化，请刷新后重试。", "The active prize changed. Refresh and try again."));
      }
      const available = await Promise.all(tokens.map(token => contract.prize(token, at)));
      tokens = tokens.filter((_, index) => available[index] > 0n);
      if (!tokens.length) throw new Error(t("没有可领取的代币。", "There are no tokens left to claim."));
      await (await contract.claim(tokens)).wait();
      setClaimMessage(t("领取成功。", "Prize claimed."));
      setRefresh(value => value + 1);
    } catch (error) {
      const detail = error as { code?: string; shortMessage?: string; message?: string };
      setClaimMessage(detail.code === "ACTION_REJECTED"
        ? t("已取消钱包确认。", "Wallet confirmation cancelled.")
        : detail.shortMessage || detail.message || t("领取失败。", "Claim failed."));
    } finally {
      setClaiming(false);
    }
  }

  const isWinner = Boolean(chain && address && chain.winner.toLowerCase() === address.toLowerCase());
  const canClaim = Boolean(isWinner && !chainError && chain && chain.claimDeadline > Math.max(chain.chainTime, now / 1000));
  const reviewOpen = Boolean(snapshot && !snapshotError && snapshot.snapshotStatus === "review" && now < snapshot.reviewEndsAt * 1000);
  const ownWeight = snapshot?.wallets.find(wallet => wallet.address.toLowerCase() === address.toLowerCase())?.weight ?? "0";
  const totalWeight = BigInt(snapshot?.totalWeight ?? "0");
  const chance = totalWeight > 0n ? BigInt(ownWeight) * 10_000n / totalWeight : 0n;
  const chanceLabel = chance === 0n && BigInt(ownWeight) > 0n ? "<0.01%" : `${formatUnits(chance, 2)}%`;
  const prizeSection = chain && chain.winner !== ZeroAddress;
  const publicLedger = snapshot && lotteryApiUrl(`${snapshot.snapshotStatus === "final" ? "audit" : "snapshot"}?round=${snapshot.round}`);
  const chainMatchesLedger = chain && snapshot && chain.pendingCutoff === snapshot.round
    ? chain.pendingRoot.toLowerCase() === snapshot.root.toLowerCase() && chain.pendingWeight === totalWeight
    : null;

  return <div className="lottery-page">
    <header className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 pt-5 sm:px-8">
      <OCPMenu lang={lang} />
      <a className="text-sm font-semibold" href={`/market.html?lang=${lang}`}>{t("返回市场", "Back to markets")}</a>
    </header>
    <main className="mx-auto max-w-4xl px-5 pb-16 pt-10 sm:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("每周协议费抽奖", "Weekly fee lottery")}</h1>
          <p className="lottery-subtle mt-2 text-sm">{t(
            "美国太平洋时间：周日 04:00 截止，16:00 补漏结束（PST）。夏令时为周日 05:00 和 17:00（PDT）。",
            "US Pacific Time: eligibility closes Sunday at 4 AM and corrections close at 4 PM (PST). During daylight time, the cutoffs are Sunday at 5 AM and 5 PM (PDT).",
          )}</p>
        </div>
        {(lotteryContractAddress || snapshotUrl) && !address && <button type="button" className="lottery-action" onClick={connectWallet}>
          {t("连接钱包", "Connect wallet")}
        </button>}
      </div>
      {!lotteryContractAddress && <section className="lottery-card mb-5 p-5 sm:p-6" aria-labelledby="lottery-preview">
        <h2 id="lottery-preview" className="text-xl font-semibold">{t("抽奖尚未开放", "The lottery has not opened yet")}</h2>
        <p className="lottery-subtle mt-2 text-sm">
          {t("本页先公开规则。首期时间、参与明细和领奖入口将在开放后公布。",
            "The rules are available below. The first draw date, eligibility ledger and prize claims will appear when the lottery opens.")}
        </p>
      </section>}
      {lotteryContractAddress && <section className="lottery-card mb-5 p-5 sm:p-6" aria-labelledby="lottery-prize">
        <h2 id="lottery-prize" className="text-xl font-semibold">{t("链上奖池", "On-chain prize")}</h2>
        {chainError && <p role="alert" className="mt-3 text-sm">{t("暂时无法读取链上奖池。", "The on-chain prize is temporarily unavailable.")}</p>}
        {!chainError && !chain && <p role="status" className="lottery-subtle mt-3 text-sm">{t("正在读取链上奖池…", "Loading on-chain prize…")}</p>}
        {chain && chain.pendingCutoff !== 0 && <p className="lottery-subtle mt-3 text-sm">
          {t("等待开奖", "Draw pending")} · {formatDate(chain.pendingCutoff)} · drand #{chain.drandRound.toString()}
        </p>}
        {chain && !prizeSection && <p className="lottery-subtle mt-3 text-sm">{t("目前没有已确定的中奖地址。", "There is no current winner.")}</p>}
        {chain && prizeSection && <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm">{t("中奖地址", "Winner")}</p>
            <code className="block break-all text-sm">{chain.winner}</code>
            <p className="lottery-subtle mt-1 text-sm">{t("领取截止", "Claim deadline")} · <time dateTime={new Date(chain.claimDeadline * 1000).toISOString()}>{formatDate(chain.claimDeadline)}</time></p>
          </div>
          {!!chain.assets.length && <ul className="lottery-amount space-y-2">
            {chain.assets.map(asset => <li className="flex flex-wrap items-center gap-2 break-all" key={asset.token}>
              <span>
                {asset.decimals === null ? `${asset.amount} ${t("最小单位", "base units")}` : formatUnits(asset.amount, asset.decimals)}{" "}
                <a href={`${config.explorer}/address/${asset.token}`} target="_blank" rel="noreferrer">{asset.symbol || asset.token}</a>
              </span>
              {canClaim && chain.assets.length > 1 && <button type="button" disabled={claiming}
                className="lottery-rule rounded border px-2 py-1 text-xs disabled:opacity-50"
                aria-label={`${t("领取", "Claim")} ${asset.symbol || asset.token}`}
                onClick={() => void claim([asset.token])}
              >{t("单独领取", "Claim this token")}</button>}
            </li>)}
          </ul>}
          {!chain.assets.length && <p className="lottery-subtle text-sm">{t("没有待领取代币。", "There are no remaining prize tokens.")}</p>}
          {chain.assets.length > 0 && chain.claimDeadline <= Math.max(chain.chainTime, now / 1000) &&
            <p className="lottery-subtle text-sm">{t("领取时间已结束。", "The claim window has closed.")}</p>}
          {canClaim && chain.assets.length > 0 && <button
            type="button" disabled={claiming} className="lottery-action"
            onClick={() => void claim(chain.assets.map(asset => asset.token))}
          >{claiming ? t("正在领取…", "Claiming…") : t("领取全部奖金", "Claim prize")}</button>}
          <p role="status" className="text-sm">{claimMessage}</p>
        </div>}
      </section>}
      {snapshotUrl && <section className="lottery-card p-5 sm:p-6" aria-labelledby="lottery-weights">
        <h2 id="lottery-weights" className="text-xl font-semibold">{t("资格与权重", "Eligibility and weights")}</h2>
        {snapshotError && <p role="alert" className="mt-3 text-sm">{t("暂时无法读取抽奖明细。", "The lottery ledger is temporarily unavailable.")}</p>}
        {!snapshotError && !snapshot && <p role="status" className="lottery-subtle mt-3 text-sm">{t("正在读取明细…", "Loading lottery ledger…")}</p>}
        {snapshot && <div className="mt-3 space-y-4 text-sm">
          <p className="lottery-subtle">{t("本期截止", "Round cutoff")} · {formatDate(snapshot.round)}</p>
          {chainMatchesLedger === false && <p role="alert">{t("抽奖明细和已锁定的链上记录不一致。", "The published ledger differs from the locked on-chain record.")}</p>}
          {chainMatchesLedger === true && <p className="lottery-subtle">{t("明细承诺与链上已锁定记录一致。", "The ledger commitment matches the locked on-chain record.")}</p>}
          {address && !snapshotError && chainMatchesLedger !== false && <p>
            {t("按已公布明细计算的中奖概率", "Your chance in the published ledger")} · <strong className="lottery-amount">{chanceLabel}</strong>
          </p>}
          {publicLedger && <a href={publicLedger} target="_blank" rel="noreferrer">{t("查看逐笔明细与权重（JSON）", "View trade ledger and weights (JSON)")}</a>}
          {reviewOpen && reportUrl && <form className="lottery-rule space-y-2 border-t pt-4" onSubmit={submitReport}>
            <label className="block font-semibold" htmlFor="missing-trade">{t("申报遗漏成交", "Report a missing trade")}</label>
            <p id="missing-trade-help" className="lottery-subtle">{t("提交链上交易哈希，Keeper 会自动核对资格。", "Submit the transaction hash for the Keeper to verify.")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="text" name="transactionHash" id="missing-trade" className="lottery-field font-mono"
                aria-describedby="missing-trade-help" value={hash} onChange={event => setHash(event.target.value)}
                placeholder="0x…" required maxLength={66} autoComplete="off" autoCapitalize="off" spellCheck={false} />
              <button type="submit" className="lottery-action shrink-0" disabled={reporting}>
                {reporting ? t("核对中…", "Checking…") : t("提交交易", "Submit trade")}
              </button>
            </div>
            <p role="status">{reportMessage}</p>
          </form>}
          {!reviewOpen && <p className="lottery-subtle">{t("本轮补漏窗口已关闭。", "The correction window for this round is closed.")}</p>}
        </div>}
      </section>}
      <section className={`lottery-card p-5 sm:p-6 ${snapshotUrl ? "mt-5" : ""}`} aria-labelledby="lottery-rules">
        <h2 id="lottery-rules" className="text-xl font-semibold">{t("抽奖规则", "Lottery rules")}</h2>
        <dl className="mt-4 space-y-4 text-sm leading-relaxed">
          <div>
            <dt className="font-semibold">{t("哪些交易参加", "Which trades qualify")}</dt>
            <dd className="lottery-subtle mt-1">{t(
              "统计本周已完成结果结算、或未毕业并开放退款的市场。该市场从开盘到结束的合格买卖统一计入一轮。Core 质押不计入。",
              "A market qualifies in the week it settles or opens refunds after failing to graduate. Eligible buys and sells from the market’s full lifetime count in that round. Core staking does not count.",
            )}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t("怎么抽", "How the winner is drawn")}</dt>
            <dd className="lottery-subtle mt-1">{t(
              "符合条件的实收协议交易费组成全站奖池，每周抽一位。各代币的协议费按当期美元报价折算，中奖概率等于你的手续费占比。周日下午补漏结束后锁定权重，再用可验证的随机数开奖。",
              "Eligible protocol trading fees form one sitewide pool with one winner per week. Fees are valued in USD for the draw. Your chance is your share of eligible fees. After corrections close on Sunday afternoon Pacific Time, weights are locked and the winner is drawn with verifiable randomness.",
            )}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t("怎么领取", "How to claim")}</dt>
            <dd className="lottery-subtle mt-1">{t(
              "中奖钱包可领取奖池里的原币，领取期在下一周日补漏截止时结束（美国太平洋时间）。逾期未领的奖金归下一位中奖者，旧交易权重不滚入下一轮。",
              "The winning wallet can claim the tokens in the pool until corrections close the following Sunday, Pacific Time. Unclaimed tokens go to the next winner. Prior-round weights do not carry over.",
            )}</dd>
          </div>
        </dl>
      </section>
    </main>
  </div>;
}

document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
createRoot(document.getElementById("root")!).render(<LotteryPage />);
