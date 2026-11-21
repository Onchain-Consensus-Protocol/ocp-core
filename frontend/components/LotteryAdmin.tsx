import { useEffect, useState, type FormEvent } from "react";
import { Contract, formatUnits, getAddress, isAddress, parseUnits, ZeroAddress, type JsonRpcSigner } from "ethers";
import type { Language } from "../types";

const lotteryAbi = [
  "function keeper() view returns (address)",
  "function stockFactory() view returns (address)",
  "function assetCount() view returns (uint256)",
  "function assets(uint256 index) view returns (address)",
  "function unallocated(address token) view returns (uint256)",
  "function pendingRound() view returns (uint64 cutoff, uint64 drandRound, bytes32 root, uint256 totalWeight)",
  "function addAsset(address token)",
  "function depositBatch(address[] tokens, uint256[] amounts)",
  "function syncDeposits(address token) returns (uint256)",
  "function lockRound(uint64 cutoff, bytes32 root, uint256 totalWeight, address[] tokens, uint256[] fees, bytes32 auditDigest)",
  "function draw(bytes signature, address winner, uint256 weight, bytes32[] siblingHashes, uint256[] siblingWeights, bool[] siblingOnLeft)",
];
const tokenAbi = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const keeperOrigin = "http://127.0.0.1:8787";
const uint256Max = (1n << 256n) - 1n;

type Props = {
  lotteryAddress: string;
  signer: JsonRpcSigner | null;
  walletAddress: string;
  lang: Language;
  onChange?: () => void;
};
type Asset = { token: string; symbol: string; decimals: number | null; unallocated: bigint };
type Access = { context: string; owner: boolean; keeper: boolean; assets: Asset[] };
type RoundFunding = {
  cutoff: bigint;
  root: string;
  weight: bigint;
  digest: string;
  fees: { token: string; raw: bigint; funded: bigint; unsynced: bigint }[];
};
type DrawProof = {
  cutoff: bigint;
  signature: string;
  address: string;
  weight: bigint;
  siblingHashes: string[];
  siblingWeights: bigint[];
  siblingOnLeft: boolean[];
};

function uint(value: unknown) {
  if ((typeof value === "string" && /^[0-9]{1,78}$/.test(value)) ||
      (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) {
    const parsed = BigInt(value);
    if (parsed <= uint256Max) return parsed;
  }
  throw new Error("Invalid unsigned integer in Keeper response");
}

function hex(value: unknown, bytes: number) {
  if (typeof value !== "string" || value.length !== 2 + bytes * 2 || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error("Invalid proof or digest in Keeper response");
  }
  return value;
}

function addresses(value: unknown, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.length > 32 ||
      value.some(token => typeof token !== "string" || !isAddress(token) || token.toLowerCase() === ZeroAddress)) {
    throw new Error("Invalid token list in Keeper response");
  }
  const result = value.map((token: string) => getAddress(token));
  if (new Set(result).size !== result.length) throw new Error("Duplicate token in Keeper response");
  return result;
}

async function readKeeper(path: "lock-request" | "draw-proof") {
  let response: Response;
  try {
    response = await fetch(`${keeperOrigin}/${path}`, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("Cannot reach the local Keeper at 127.0.0.1:8787");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error.slice(0, 240) : "Keeper request failed");
  return data;
}

async function readAssets(lottery: Contract, signer: JsonRpcSigner) {
  const count = Number(await lottery.assetCount());
  const tokens = await Promise.all(Array.from({ length: count }, (_, index) => lottery.assets(index)));
  return Promise.all(tokens.map(async (token: string): Promise<Asset> => {
    const erc20 = new Contract(token, tokenAbi, signer.provider);
    const [symbol, decimals, unallocated] = await Promise.all([
      erc20.symbol().catch(() => token),
      erc20.decimals().then(Number).catch(() => null),
      lottery.unallocated(token),
    ]);
    return { token, symbol, decimals, unallocated };
  }));
}

export function LotteryAdmin({ lotteryAddress, signer, walletAddress, lang, onChange }: Props) {
  const t = (zh: string, en: string) => lang === "zh" ? zh : en;
  const [access, setAccess] = useState<Access | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [newAsset, setNewAsset] = useState("");
  const [funding, setFunding] = useState<RoundFunding | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const context = `${lotteryAddress.toLowerCase()}:${walletAddress.toLowerCase()}`;

  useEffect(() => {
    let cancelled = false;
    if (!signer || !walletAddress) return;
    void (async () => {
      if ((await signer.provider.getNetwork()).chainId !== 4663n) return;
      const lottery = new Contract(lotteryAddress, lotteryAbi, signer);
      const [keeperAddress, factoryAddress] = await Promise.all([lottery.keeper(), lottery.stockFactory()]);
      const factory = new Contract(factoryAddress, ["function owner() view returns (address)"], signer.provider);
      const owner = (await factory.owner()).toLowerCase() === walletAddress.toLowerCase();
      const keeper = keeperAddress.toLowerCase() === walletAddress.toLowerCase();
      if (!owner && !keeper) return;
      const assets = await readAssets(lottery, signer);
      if (!cancelled) setAccess({ context, owner, keeper, assets });
    })().catch(() => {
      if (!cancelled) setAccess(null);
    });
    return () => { cancelled = true; };
  }, [context, lotteryAddress, signer, walletAddress, revision]);

  if (!signer || !access || access.context !== context) return null;
  const { owner, keeper, assets } = access;
  const displayAmount = (raw: bigint, token: string) => {
    const asset = assets.find(item => item.token.toLowerCase() === token.toLowerCase());
    return asset?.decimals == null ? `${raw} ${t("最小单位", "base units")}` : formatUnits(raw, asset.decimals);
  };
  const displayToken = (token: string) => assets.find(item => item.token.toLowerCase() === token.toLowerCase())?.symbol ?? token;

  async function run(action: (lottery: Contract, wallet: JsonRpcSigner) => Promise<void>) {
    if (busy || !signer) return;
    setBusy(true);
    setMessage("");
    try {
      const [network, account] = await Promise.all([signer.provider.getNetwork(), signer.getAddress()]);
      if (network.chainId !== 4663n || account.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error(t("请连接正确的钱包并切换到 Robinhood Chain。", "Reconnect your wallet on Robinhood Chain."));
      }
      await action(new Contract(lotteryAddress, lotteryAbi, signer), signer);
    } catch (error) {
      const detail = error as { code?: string; shortMessage?: string; reason?: string; message?: string };
      setMessage(detail.code === "ACTION_REJECTED"
        ? t("已取消钱包确认。", "Wallet confirmation cancelled.")
        : detail.reason || detail.shortMessage || detail.message || t("操作失败。", "The action failed."));
    } finally {
      setBusy(false);
    }
  }

  function changed() {
    setFunding(null);
    setRevision(value => value + 1);
    onChange?.();
  }

  function addAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async lottery => {
      const token = newAsset.trim();
      if (!isAddress(token) || token.toLowerCase() === ZeroAddress) {
        throw new Error(t("请输入有效的代币合约地址。", "Enter a valid token contract address."));
      }
      await lottery.addAsset.staticCall(token);
      await (await lottery.addAsset(token)).wait();
      setNewAsset("");
      setMessage(t("资产已添加。", "Token added."));
      changed();
    });
  }

  function deposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async (lottery, wallet) => {
      const selected = assets.filter(asset => amounts[asset.token]?.trim());
      if (!selected.length) throw new Error(t("请至少填写一种代币金额。", "Enter at least one deposit amount."));
      const account = await wallet.getAddress();
      const deposits = await Promise.all(selected.map(async asset => {
        const raw = amounts[asset.token].trim();
        if (asset.decimals == null || !/^(?:\d+\.?\d*|\.\d+)$/.test(raw) || raw.length > 80) {
          throw new Error(`${asset.symbol} · ${t("金额无效。", "Invalid amount.")}`);
        }
        const amount = parseUnits(raw, asset.decimals);
        if (amount <= 0n || amount > uint256Max) {
          throw new Error(`${asset.symbol} · ${t("金额必须大于零且在代币范围内。", "Enter a positive token amount within range.")}`);
        }
        const token = new Contract(asset.token, tokenAbi, wallet);
        const [balance, allowance] = await Promise.all([token.balanceOf(account), token.allowance(account, lotteryAddress)]);
        if (balance < amount) throw new Error(`${asset.symbol} · ${t("钱包余额不足。", "Insufficient wallet balance.")}`);
        return { token, address: asset.token, amount, allowance };
      }));
      for (const entry of deposits) {
        if (entry.allowance >= entry.amount) continue;
        if (entry.allowance > 0n) await (await entry.token.approve(lotteryAddress, 0n)).wait();
        await (await entry.token.approve(lotteryAddress, entry.amount)).wait();
      }
      const tokens = deposits.map(entry => entry.address);
      const values = deposits.map(entry => entry.amount);
      await lottery.depositBatch.staticCall(tokens, values);
      await (await lottery.depositBatch(tokens, values)).wait();
      setAmounts({});
      setMessage(t("本批协议费已到账。", "Batch deposit confirmed."));
      changed();
    });
  }

  async function loadFunding(lottery: Contract): Promise<RoundFunding> {
    const data = await readKeeper("lock-request");
    if (uint(data.chainId) !== 4663n || typeof data.lottery !== "string" ||
        data.lottery.toLowerCase() !== lotteryAddress.toLowerCase() || typeof data.keeper !== "string" ||
        data.keeper.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error(t("Keeper 返回的链、合约或授权钱包不匹配。", "The Keeper returned the wrong chain, contract, or authorized wallet."));
    }
    const tokens = addresses(data.tokens);
    const syncTokens = new Set(addresses(data.syncTokens, true));
    if ([...syncTokens].some(token => !tokens.includes(token))) throw new Error("Invalid synchronization token list");
    if (!Array.isArray(data.fees) || data.fees.length !== tokens.length) throw new Error("Invalid funding amounts");
    const values = data.fees.map(uint);
    const cutoff = uint(data.cutoff);
    if (cutoff === 0n || cutoff > 8_640_000_000_000n) throw new Error("Invalid round cutoff");
    const fees = await Promise.all(tokens.map(async (token, index) => {
      const funded: bigint = await lottery.unallocated(token);
      const raw: bigint = values[index];
      const unsynced: bigint = funded < raw && syncTokens.has(token)
        ? await lottery.syncDeposits.staticCall(token)
        : 0n;
      return { token, raw, funded, unsynced };
    }));
    return {
      cutoff, root: hex(data.root, 32), weight: uint(data.totalWeight), digest: hex(data.auditDigest, 32), fees,
    };
  }

  function lock() {
    if (!funding) return;
    void run(async lottery => {
      const fresh = await loadFunding(lottery);
      if (fresh.cutoff !== funding.cutoff || fresh.digest !== funding.digest || fresh.root !== funding.root ||
          fresh.weight !== funding.weight || fresh.fees.length !== funding.fees.length ||
          fresh.fees.some((fee, index) => fee.token !== funding.fees[index].token || fee.raw !== funding.fees[index].raw)) {
        setFunding(fresh);
        throw new Error(t("封账数据已更新，请先核对再提交。", "The lock request changed. Review it before submitting again."));
      }
      setFunding(fresh);
      if (fresh.fees.some(fee => fee.raw > fee.funded + fee.unsynced)) {
        throw new Error(t("待分配余额不足，请先补足入金。", "Add the missing funding before locking the round."));
      }
      for (const fee of fresh.fees) {
        if (fee.raw > await lottery.unallocated(fee.token)) {
          await (await lottery.syncDeposits(fee.token)).wait();
        }
      }
      const args = [fresh.cutoff, fresh.root, fresh.weight, fresh.fees.map(fee => fee.token),
        fresh.fees.map(fee => fee.raw), fresh.digest] as const;
      await lottery.lockRound.staticCall(...args);
      await (await lottery.lockRound(...args)).wait();
      setMessage(t("本轮已封账。", "Round locked."));
      changed();
    });
  }

  function draw() {
    void run(async lottery => {
      const [data, pending] = await Promise.all([readKeeper("draw-proof"), lottery.pendingRound()]);
      if (!Array.isArray(data.siblingHashes) || data.siblingHashes.length > 64 ||
          !Array.isArray(data.siblingWeights) || data.siblingWeights.length !== data.siblingHashes.length ||
          !Array.isArray(data.siblingOnLeft) || data.siblingOnLeft.length !== data.siblingHashes.length ||
          data.siblingOnLeft.some((value: unknown) => typeof value !== "boolean")) {
        throw new Error(t("开奖凭证格式不正确。", "The draw proof has an invalid format."));
      }
      const proof: DrawProof = {
        cutoff: uint(data.cutoff), signature: hex(data.signature, 64),
        address: getAddress(data.address), weight: uint(data.weight),
        siblingHashes: data.siblingHashes.map((hash: unknown) => hex(hash, 32)),
        siblingWeights: data.siblingWeights.map(uint), siblingOnLeft: data.siblingOnLeft,
      };
      if (proof.cutoff === 0n || proof.cutoff !== pending.cutoff) {
        throw new Error(t("开奖凭证与链上待开奖轮次不符。", "The draw proof does not match the pending round."));
      }
      const args = [proof.signature, proof.address, proof.weight, proof.siblingHashes,
        proof.siblingWeights, proof.siblingOnLeft] as const;
      await lottery.draw.staticCall(...args);
      await (await lottery.draw(...args)).wait();
      setMessage(t("开奖已确认。", "Draw confirmed."));
      changed();
    });
  }

  return <details className="lottery-card mb-5 p-5 sm:p-6">
    <summary className="cursor-pointer text-xl font-semibold">{t("奖池管理", "Lottery administration")}</summary>
    <div className="mt-4 space-y-5 text-sm">
      <form onSubmit={deposit} className="space-y-2">
        <h3 className="font-semibold">{t("批量打入协议费", "Deposit protocol fees")}</h3>
        {assets.map(asset => <label key={asset.token} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span className="break-all">{asset.symbol} <span className="lottery-subtle">· {t("待分配", "Unallocated")} {displayAmount(asset.unallocated, asset.token)}</span></span>
          <input inputMode="decimal" placeholder="0" value={amounts[asset.token] ?? ""}
            className="lottery-field sm:max-w-44" disabled={busy || asset.decimals == null}
            onChange={event => setAmounts(values => ({ ...values, [asset.token]: event.target.value }))} />
        </label>)}
        <button type="submit" disabled={busy} className="lottery-action">{t("授权并存入", "Approve and deposit")}</button>
      </form>
      {owner && <form onSubmit={addAsset} className="lottery-rule space-y-2 border-t pt-4">
        <label htmlFor="lottery-admin-token" className="block font-semibold">{t("添加已注册股票代币", "Add a registered stock token")}</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input required id="lottery-admin-token" className="lottery-field font-mono" value={newAsset}
            onChange={event => setNewAsset(event.target.value)} placeholder="0x…" maxLength={42} autoComplete="off" spellCheck={false} />
          <button type="submit" disabled={busy} className="lottery-action shrink-0">{t("添加资产", "Add token")}</button>
        </div>
      </form>}
      <section className="lottery-rule space-y-2 border-t pt-4">
        <h3 className="font-semibold">{t("本地 Keeper", "Local Keeper")} · <code>127.0.0.1:8787</code></h3>
        <div className="flex flex-wrap gap-2">
          {keeper && <button type="button" disabled={busy} className="lottery-action"
            onClick={() => void run(async lottery => setFunding(await loadFunding(lottery)))}>
            {t("读取待封账轮次", "Load lock request")}
          </button>}
          <button type="button" disabled={busy} className="lottery-action" onClick={draw}>{t("验签并开奖", "Verify and draw")}</button>
        </div>
        {keeper && funding && <div className="space-y-2">
          <p>{t("本轮截止时间", "Round cutoff")} · {new Date(Number(funding.cutoff) * 1000).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { timeZone: "America/Los_Angeles", timeZoneName: "short" })}</p>
          <ul className="space-y-1">
            {funding.fees.map(fee => <li className="break-all" key={fee.token}>
              {displayToken(fee.token)} · {t("本轮应入账", "Round fees")} {displayAmount(fee.raw, fee.token)} · {t("待分配", "Unallocated")} {displayAmount(fee.funded, fee.token)}
              {fee.unsynced > 0n && <> · {t("可同步入金", "Can sync")} {displayAmount(fee.unsynced, fee.token)}</>}
            </li>)}
          </ul>
          <p className="lottery-subtle break-all">{t("审计摘要", "Audit digest")} · <code>{funding.digest}</code></p>
          <button type="button" disabled={busy || funding.fees.some(fee => fee.raw > fee.funded + fee.unsynced)} className="lottery-action"
            onClick={lock}>{t("提交封账", "Lock round")}</button>
        </div>}
      </section>
      <p role="status" className="break-words">{busy ? t("正在处理，请留意钱包。", "In progress. Check your wallet.") : message}</p>
    </div>
  </details>;
}
