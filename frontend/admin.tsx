import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  AbiCoder,
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  formatUnits,
  getAddress,
  keccak256,
  parseUnits,
  zeroPadValue,
  type ContractRunner,
  type ContractTransactionResponse,
  type JsonRpcSigner,
  type TransactionReceipt,
} from "ethers";
import "./index.css";
import { Button } from "./components/Button";
import { OCPMenu } from "./components/OCPMenu";
import { WalletButton } from "./components/WalletButton";
import { config, ERC20_ABI, FACTORY_ABI, MARKET_ABI, VAULT_ABI } from "./config";
import { useWallet } from "./useWallet";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const ADMIN_CHAIN_ID = 8453;
export const ADMIN_FACTORY = env?.VITE_ADMIN_FACTORY_ADDRESS?.trim() || config.factoryAddress;
const ADMIN_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ADMIN_LMSR_B = 1_000_000_000n; // 1,000 USDC
const ADMIN_REQUIRED_SUBSIDY = 693_147_183n; // ceil(1,000 USDC × ln(2)) + 2 个最小单位缓冲
const EXPECTED_FACTORY_CODE_HASH = (
  env?.VITE_ADMIN_FACTORY_CODE_HASH
  ?? "0xd35a9a60cfa96671b443e0f89b4f065d926b3a191d7a6d4ab0678feaeeece319"
).trim().toLowerCase();
const ADMIN_DEPLOYMENT_ENABLED = env?.VITE_ADMIN_DEPLOYMENT_ENABLED !== "false";
const RECOVERY_RPC_URL = env?.VITE_RECOVERY_RPC_URL?.trim() || "https://base.drpc.org";
const BLOCKSCOUT_API = "https://base.blockscout.com/api/v2";
const EXPECTED_PROTOCOL_VERSION = 5n;
const EXPECTED_FEE_BPS = 120n;
const EXPECTED_VAULT_FEE_BPS = 100n;
const EXPECTED_PROTOCOL_LP_FEE_BPS = 20n;
const REQUIRED_CONFIRMATIONS = 2;
const PENDING_KEY = `ocp:vault-create:${ADMIN_CHAIN_ID}:${ADMIN_FACTORY.toLowerCase()}`;
const utf8 = new TextEncoder();
const forbiddenText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const reservedSideLabel = /(?:^|\s)(?:YES|NO|INVALID)\s*:/i;

type FormState = {
  title: string;
  yes: string;
  no: string;
  invalid: string;
  durationDays: string;
  minStake: string;
};

export type Review = {
  title: string;
  description: string;
  preparedBlockTimestamp: number;
  durationSeconds: number;
  resolutionTime: number;
  minStake: string;
  gasEstimate: string;
  calldataHash: string;
  requiredSubsidy?: string;
  ownerBalance?: string;
  factoryAllowance?: string;
};

export type PendingIntent = Review & {
  version: 1;
  stage: "awaiting_signature" | "pending" | "reverted";
  from: string;
  intentBlock: number;
  nonce: number;
  submittedAt: number;
  txHash?: string;
  lastError?: string;
};

type DeploymentResult = {
  txHash: string;
  vault: string;
  market: string;
  blockNumber: number;
  protocolVersion: number;
  liquidityPool?: string;
  subsidy?: string;
  vaultSourceVerified: boolean | null;
  marketSourceVerified: boolean | null;
  recoveryNote?: string;
};

export type BlockscoutTransaction = {
  hash: string;
  nonce: number;
  raw_input: string;
  value?: string;
  status?: string;
  result?: string;
  block_number?: number | null;
  from?: { hash?: string } | null;
  to?: { hash?: string } | null;
};

type BlockscoutTransactionsPage = {
  items?: BlockscoutTransaction[];
  next_page_params?: Record<string, string | number> | null;
};

const initialForm: FormState = {
  title: "",
  yes: "",
  no: "",
  invalid: "关键事实无法核验、前提失效或题面仍有实质歧义，无法在 YES 与 NO 之间形成有效二元判断。",
  durationDays: "5",
  minStake: "1",
};

function sameAddress(a: string, b: string) {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

function normalizeMetadata(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function byteLength(value: string) {
  return utf8.encode(value).length;
}

function validateText(label: string, value: string, maxBytes: number) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label}不能为空`);
  if (forbiddenText.test(trimmed)) throw new Error(`${label}包含不可见控制字符或双向文本控制符`);
  if (byteLength(trimmed) > maxBytes) throw new Error(`${label}超过 ${maxBytes} UTF-8 bytes`);
  return trimmed;
}

function validateSideText(label: string, value: string) {
  const trimmed = validateText(label, value, 1_000);
  if (reservedSideLabel.test(trimmed)) {
    throw new Error(`${label}不能包含 YES:、NO: 或 INVALID: 保留标签`);
  }
  return trimmed;
}

function buildParameters(form: FormState) {
  const title = validateText("命题", form.title, 180);
  const yes = validateSideText("YES 定义", form.yes);
  const no = validateSideText("NO 定义", form.no);
  const invalid = validateSideText("INVALID 定义", form.invalid);
  const description = `YES: ${yes}\nNO: ${no}\nINVALID: ${invalid}`;
  if (byteLength(description) > 4_096) throw new Error("完整题面超过 4096 UTF-8 bytes");

  if (!/^\d+(?:\.\d{1,3})?$/.test(form.durationDays.trim())) {
    throw new Error("期限必须是天数，最多 3 位小数");
  }
  const durationSeconds = Math.round(Number(form.durationDays) * 86_400);
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 3_600 || durationSeconds > 30 * 86_400) {
    throw new Error("期限必须在 1 小时到 30 天之间");
  }

  if (!/^\d+(?:\.\d{1,6})?$/.test(form.minStake.trim())) {
    throw new Error("最低质押必须是普通十进制 USDC，最多 6 位小数");
  }
  const minStake = parseUnits(form.minStake.trim(), 6);
  if (minStake <= 0n) throw new Error("最低质押必须大于 0");
  if (minStake > parseUnits("1000", 6)) throw new Error("最低质押不能超过 1,000 USDC");
  return { title, description, durationSeconds, minStake };
}

function friendlyError(error: unknown) {
  const e = error as { code?: string | number; shortMessage?: string; reason?: string; message?: string };
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return "钱包已拒绝签名，没有发送交易。";
  if (e?.code === "INSUFFICIENT_FUNDS") return "Owner 钱包的 Base ETH 不足以支付 Gas。";
  const raw = e?.shortMessage || e?.reason || e?.message || String(error);
  return raw.length > 320 ? `${raw.slice(0, 320)}…` : raw;
}

export function walletErrorDiagnostic(error: unknown) {
  const e = error as {
    code?: string | number;
    shortMessage?: string;
    reason?: string;
    message?: string;
    info?: { error?: { code?: string | number; message?: string } };
    error?: { code?: string | number; message?: string };
  };
  const parts = [
    e?.code !== undefined ? `code=${String(e.code)}` : "",
    e?.shortMessage ? `shortMessage=${e.shortMessage}` : "",
    e?.reason ? `reason=${e.reason}` : "",
    e?.message ? `message=${e.message}` : "",
    e?.info?.error?.code !== undefined ? `rpc.code=${String(e.info.error.code)}` : "",
    e?.info?.error?.message ? `rpc.message=${e.info.error.message}` : "",
    e?.error?.code !== undefined ? `wallet.code=${String(e.error.code)}` : "",
    e?.error?.message ? `wallet.message=${e.error.message}` : "",
  ].filter(Boolean);
  const diagnostic = parts.join("\n") || "钱包请求失败（钱包未提供可安全显示的错误字段）";
  return diagnostic.length > 2_000 ? `${diagnostic.slice(0, 2_000)}…` : diagnostic;
}

export async function withWalletTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`钱包在 ${Math.max(1, Math.round(timeoutMs / 1_000))} 秒内没有返回交易哈希或错误`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readSourceVerification(address: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${BLOCKSCOUT_API}/smart-contracts/${address}`);
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const body = (await response.json()) as { is_verified?: boolean };
    return body.is_verified === true;
  } catch {
    return null;
  }
}

export async function findTransactionBySenderNonce(from: string, nonce: number): Promise<BlockscoutTransaction | null> {
  let pageParams: Record<string, string | number> = { filter: "from" };
  // Blockscout 默认每页 50 笔。限制为 20 页，避免损坏的本地记录触发无界请求。
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${BLOCKSCOUT_API}/addresses/${getAddress(from)}/transactions`);
    Object.entries(pageParams).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Blockscout 交易索引请求失败（HTTP ${response.status}）`);
    const body = (await response.json()) as BlockscoutTransactionsPage;
    const transactions = Array.isArray(body.items) ? body.items : [];
    const match = transactions.find((transaction) =>
      Number(transaction.nonce) === nonce && sameAddress(transaction.from?.hash ?? "", from)
    );
    if (match) return match;
    if (!body.next_page_params) return null;
    pageParams = body.next_page_params;
  }
  throw new Error("Blockscout 分页超过安全上限，无法证明该 nonce 的链上状态");
}

async function findFactoryCreateBySenderNonce(
  rpcProvider: JsonRpcProvider,
  factoryInterface: Interface,
  from: string,
  nonce: number,
  fromBlock: number,
): Promise<BlockscoutTransaction | null> {
  const marketCreated = factoryInterface.getEvent("MarketCreated");
  if (!marketCreated) throw new Error("Factory ABI 缺少 MarketCreated 事件");
  const logs = await rpcProvider.getLogs({
    address: ADMIN_FACTORY,
    fromBlock,
    toBlock: "latest",
    topics: [marketCreated.topicHash, null, null, zeroPadValue(getAddress(from), 32)],
  });
  if (logs.length > 50) throw new Error("Factory 创建事件数量超过恢复安全上限");
  for (const log of logs) {
    const transaction = await rpcProvider.getTransaction(log.transactionHash);
    if (
      transaction
      && sameAddress(transaction.from, from)
      && transaction.nonce === nonce
      && transaction.to
      && sameAddress(transaction.to, ADMIN_FACTORY)
    ) {
      return {
        hash: transaction.hash,
        nonce: transaction.nonce,
        raw_input: transaction.data,
        value: transaction.value.toString(),
        block_number: transaction.blockNumber,
        from: { hash: transaction.from },
        to: { hash: transaction.to },
      };
    }
  }
  return null;
}

export function blockscoutTransactionMatchesIntent(transaction: BlockscoutTransaction, intent: PendingIntent) {
  return sameAddress(transaction.from?.hash ?? "", intent.from)
    && sameAddress(transaction.to?.hash ?? "", ADMIN_FACTORY)
    && Number(transaction.nonce) === intent.nonce
    && BigInt(transaction.value ?? "0") === 0n
    && /^0x[0-9a-f]*$/i.test(transaction.raw_input)
    && keccak256(transaction.raw_input) === intent.calldataHash;
}

export function canRetryPendingWithSameNonce(
  intent: PendingIntent,
  latestNonce: number,
  pendingNonce: number,
  recoveryLatestNonce: number,
  recoveryPendingNonce: number,
) {
  return intent.stage === "awaiting_signature"
    && !intent.txHash
    && latestNonce === intent.nonce
    && pendingNonce === intent.nonce
    && recoveryLatestNonce === intent.nonce
    && recoveryPendingNonce === intent.nonce;
}

function loadPendingIntent(): PendingIntent | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingIntent>;
    const validStage = value.stage === "awaiting_signature" || value.stage === "pending" || value.stage === "reverted";
    if (value.version !== 1 || !validStage || !value.from || !sameAddress(value.from, value.from)
      || typeof value.title !== "string" || !value.title || byteLength(value.title) > 180
      || typeof value.description !== "string" || !value.description || byteLength(value.description) > 4_096
      || !Number.isSafeInteger(value.preparedBlockTimestamp) || Number(value.preparedBlockTimestamp) <= 0
      || !Number.isSafeInteger(value.durationSeconds) || Number(value.durationSeconds) < 3_600
      || !Number.isSafeInteger(value.intentBlock) || Number(value.intentBlock) < 0
      || !Number.isSafeInteger(value.nonce) || Number(value.nonce) < 0
      || !Number.isSafeInteger(value.resolutionTime) || Number(value.resolutionTime) <= 0
      || typeof value.minStake !== "string" || !/^\d+$/.test(value.minStake)
      || typeof value.gasEstimate !== "string" || !/^\d+$/.test(value.gasEstimate)
      || !Number.isSafeInteger(value.submittedAt) || Number(value.submittedAt) <= 0
      || Number(value.submittedAt) > Date.now() + 300_000
      || typeof value.calldataHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(value.calldataHash)
      || (value.txHash !== undefined && !/^0x[0-9a-f]{64}$/i.test(value.txHash))
      || (value.lastError !== undefined && (typeof value.lastError !== "string" || value.lastError.length > 2_000))) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return value as PendingIntent;
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return null;
  }
}

function AdminPage() {
  const wallet = useWallet();
  const provider = useMemo(() => new JsonRpcProvider(config.rpcUrl), []);
  const recoveryProvider = useMemo(() => new JsonRpcProvider(RECOVERY_RPC_URL), []);
  const factoryInterface = useMemo(() => new Interface(FACTORY_ABI), []);
  const marketInterface = useMemo(() => new Interface(MARKET_ABI), []);
  const [form, setForm] = useState<FormState>(initialForm);
  const [owner, setOwner] = useState("");
  const [liquidityPool, setLiquidityPool] = useState("");
  const [preflightOk, setPreflightOk] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState("正在核对 Base Factory…");
  const [review, setReview] = useState<Review | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingIntent | null>(() => loadPendingIntent());
  const [result, setResult] = useState<DeploymentResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [pendingCanClear, setPendingCanClear] = useState(false);
  const [pendingCanRetry, setPendingCanRetry] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const submitLock = useRef(false);
  const recoveryLock = useRef(false);

  const savePending = useCallback((intent: PendingIntent | null) => {
    setPending(intent);
    if (intent) localStorage.setItem(PENDING_KEY, JSON.stringify(intent));
    else localStorage.removeItem(PENDING_KEY);
  }, []);

  const trackLateWalletHash = useCallback((
    request: Promise<ContractTransactionResponse>,
    intent: PendingIntent,
  ) => {
    void request.then((tx) => {
      const current = loadPendingIntent();
      if (
        !current
        || current.txHash
        || !sameAddress(current.from, intent.from)
        || current.nonce !== intent.nonce
        || current.calldataHash.toLowerCase() !== intent.calldataHash.toLowerCase()
      ) return;
      savePending({
        ...current,
        stage: "pending",
        txHash: tx.hash,
        nonce: tx.nonce,
        lastError: undefined,
      });
    }, () => {
      // Active request paths persist a sanitized error. A late rejection must never unlock the intent.
    });
  }, [savePending]);

  useEffect(() => {
    const syncPendingAcrossTabs = (event: StorageEvent) => {
      if (event.key === PENDING_KEY) setPending(loadPendingIntent());
    };
    window.addEventListener("storage", syncPendingAcrossTabs);
    return () => window.removeEventListener("storage", syncPendingAcrossTabs);
  }, []);

  useEffect(() => {
    if (pending?.lastError) setError(pending.lastError);
  }, [pending?.lastError]);

  const runConfigPreflight = useCallback(async () => {
    setPreflightOk(false);
    setLiquidityPool("");
    try {
      if (config.chainId !== ADMIN_CHAIN_ID) throw new Error(`构建 chainId 不是 ${ADMIN_CHAIN_ID}`);
      if (!sameAddress(config.depositTokenAddress, ADMIN_USDC)) throw new Error("构建代币不是 Base 原生 USDC");
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== ADMIN_CHAIN_ID) throw new Error("RPC 不在 Base 主网");
      const factoryCode = await provider.getCode(ADMIN_FACTORY);
      if (factoryCode === "0x") throw new Error("配置的 Factory 地址没有链上字节码");
      const factory = new Contract(ADMIN_FACTORY, FACTORY_ABI, provider);
      const [chainOwner, officialToken, tokenCode] = await Promise.all([
        factory.owner() as Promise<string>,
        factory.officialStakeToken() as Promise<string>,
        provider.getCode(ADMIN_USDC),
      ]);
      setOwner(getAddress(chainOwner));
      if (!sameAddress(officialToken, ADMIN_USDC) || tokenCode === "0x") throw new Error("Factory 官方代币配置异常");
      const token = new Contract(ADMIN_USDC, ERC20_ABI, provider);
      const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
      if (Number(decimals) !== 6 || String(symbol) !== "USDC") throw new Error("USDC 元数据不匹配");

      if (!ADMIN_DEPLOYMENT_ENABLED) {
        throw new Error("V5 Factory 尚未完成生产启用，管理员创建功能已安全关闭");
      }
      if (!/^0x[0-9a-f]{64}$/i.test(EXPECTED_FACTORY_CODE_HASH)) {
        throw new Error("构建未配置 V5 Factory runtime code hash，创建功能已安全关闭");
      }
      if (keccak256(factoryCode) !== EXPECTED_FACTORY_CODE_HASH) {
        throw new Error("Factory 字节码不匹配已审核的 V5 部署");
      }

      let officialLiquidityPool: string;
      let vaultDeployer: string;
      let marketDeployer: string;
      try {
        [officialLiquidityPool, vaultDeployer, marketDeployer] = await Promise.all([
          factory.officialLiquidityPool() as Promise<string>,
          factory.vaultDeployer() as Promise<string>,
          factory.marketDeployer() as Promise<string>,
        ]);
      } catch {
        throw new Error("配置地址不支持 V5 Factory 的流动性池与部署器接口");
      }
      const [vaultDeployerCode, marketDeployerCode] = await Promise.all([
        provider.getCode(vaultDeployer),
        provider.getCode(marketDeployer),
      ]);
      if (sameAddress(officialLiquidityPool, ZeroAddress)) throw new Error("Factory 官方流动性池为零地址");
      if (vaultDeployerCode === "0x" || marketDeployerCode === "0x") throw new Error("Factory 的 Vault/Market 部署器缺少字节码");
      setLiquidityPool(getAddress(officialLiquidityPool));
      setPreflightOk(true);
      setPreflightMessage("V5 Factory、部署器、官方 USDC、流动性池与 runtime code hash 均已核对");
    } catch (e) {
      setPreflightMessage(friendlyError(e));
    }
  }, [provider]);

  useEffect(() => {
    void runConfigPreflight();
  }, [runConfigPreflight]);

  const validateSigner = useCallback(async (signer: JsonRpcSigner) => {
    if (!ADMIN_DEPLOYMENT_ENABLED) {
      throw new Error("V5 Factory 尚未部署并启用，不能发送创建交易");
    }
    if (!/^0x[0-9a-f]{64}$/i.test(EXPECTED_FACTORY_CODE_HASH)) {
      throw new Error("V5 Factory runtime code hash 未配置");
    }
    const signerProvider = signer.provider;
    const [network, sender, factoryCode] = await Promise.all([
      signerProvider.getNetwork(),
      signer.getAddress(),
      signerProvider.getCode(ADMIN_FACTORY),
    ]);
    if (Number(network.chainId) !== ADMIN_CHAIN_ID) throw new Error("钱包不在 Base 主网");
    if (factoryCode === "0x" || keccak256(factoryCode) !== EXPECTED_FACTORY_CODE_HASH) throw new Error("钱包所见 Factory 字节码不匹配");
    const factory = new Contract(ADMIN_FACTORY, FACTORY_ABI, signer);
    const token = new Contract(ADMIN_USDC, ERC20_ABI, signerProvider);
    const [
      chainOwner, officialToken, officialLiquidityPool, vaultDeployer, marketDeployer,
      tokenCode, decimals, symbol,
    ] = await Promise.all([
      factory.owner() as Promise<string>,
      factory.officialStakeToken() as Promise<string>,
      factory.officialLiquidityPool() as Promise<string>,
      factory.vaultDeployer() as Promise<string>,
      factory.marketDeployer() as Promise<string>,
      signerProvider.getCode(ADMIN_USDC),
      token.decimals(),
      token.symbol(),
    ]);
    if (!sameAddress(sender, chainOwner)) throw new Error(`当前钱包不是 Factory owner（owner: ${chainOwner}）`);
    if (!sameAddress(officialToken, ADMIN_USDC) || tokenCode === "0x") throw new Error("官方 USDC 配置异常");
    if (sameAddress(officialLiquidityPool, ZeroAddress)) throw new Error("官方流动性池为零地址");
    const [vaultDeployerCode, marketDeployerCode] = await Promise.all([
      signerProvider.getCode(vaultDeployer),
      signerProvider.getCode(marketDeployer),
    ]);
    if (vaultDeployerCode === "0x" || marketDeployerCode === "0x") throw new Error("V5 部署器字节码缺失");
    if (Number(decimals) !== 6 || String(symbol) !== "USDC") throw new Error("钱包所见 USDC 元数据不匹配");
    return {
      factory,
      token: new Contract(ADMIN_USDC, ERC20_ABI, signer),
      sender: getAddress(sender),
      officialLiquidityPool: getAddress(officialLiquidityPool),
    };
  }, []);

  const assertNoDuplicate = useCallback(async (title: string, description: string, runner: ContractRunner = provider) => {
    const factory = new Contract(ADMIN_FACTORY, FACTORY_ABI, runner);
    const vaults = (await factory.getVaults()) as string[];
    const targetTitle = normalizeMetadata(title);
    const targetDescription = normalizeMetadata(description);
    const metas = await Promise.all(vaults.map((vault) => factory.getVaultMeta(vault)));
    const duplicateIndex = metas.findIndex(
      (meta) => normalizeMetadata(String(meta[0])) === targetTitle && normalizeMetadata(String(meta[1])) === targetDescription,
    );
    if (duplicateIndex >= 0) throw new Error(`相同题面已存在：${vaults[duplicateIndex]}。管理页禁止重复创建。`);
  }, [provider]);

  const prepareReview = async () => {
    setError("");
    setNotice("");
    setReview(null);
    setConfirmPhrase("");
    if (!wallet.signer || !preflightOk) {
      setError("请先连接正式 Factory owner 钱包，并确保预检通过。");
      return;
    }
    setBusy(true);
    try {
      const params = buildParameters(form);
      const { factory, token, sender } = await validateSigner(wallet.signer);
      await assertNoDuplicate(params.title, params.description);
      const latest = await wallet.signer.provider.getBlock("latest");
      if (!latest) throw new Error("无法读取最新 Base 区块");
      const resolutionTime = latest.timestamp + params.durationSeconds;
      const args = [ADMIN_USDC, resolutionTime, params.minStake, ADMIN_LMSR_B, params.title, params.description] as const;
      const calldata = factory.interface.encodeFunctionData("createMarket", args);
      const [ownerBalance, factoryAllowance] = await Promise.all([
        token.balanceOf(sender) as Promise<bigint>,
        token.allowance(sender, ADMIN_FACTORY) as Promise<bigint>,
      ]);
      let gasEstimate = 0n;
      if (ownerBalance >= ADMIN_REQUIRED_SUBSIDY && factoryAllowance >= ADMIN_REQUIRED_SUBSIDY) {
        await factory.createMarket.staticCall(...args);
        gasEstimate = await factory.createMarket.estimateGas(...args);
      }
      setReview({
        title: params.title,
        description: params.description,
        preparedBlockTimestamp: latest.timestamp,
        durationSeconds: params.durationSeconds,
        resolutionTime,
        minStake: params.minStake.toString(),
        gasEstimate: gasEstimate.toString(),
        calldataHash: keccak256(calldata),
        requiredSubsidy: ADMIN_REQUIRED_SUBSIDY.toString(),
        ownerBalance: ownerBalance.toString(),
        factoryAllowance: factoryAllowance.toString(),
      });
      if (ownerBalance < ADMIN_REQUIRED_SUBSIDY) {
        setError(`Owner USDC 余额不足：创建需要 ${formatUnits(ADMIN_REQUIRED_SUBSIDY, 6)} USDC 做市补贴。`);
      } else if (factoryAllowance < ADMIN_REQUIRED_SUBSIDY) {
        setError(`Factory allowance 不足：请先精确授权 ${formatUnits(ADMIN_REQUIRED_SUBSIDY, 6)} USDC，再重新预检。`);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const approveSubsidy = async () => {
    if (!wallet.signer || !preflightOk) {
      setError("请先连接 V5 Factory owner 钱包并通过生产预检。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { token, sender } = await validateSigner(wallet.signer);
      const balance = await token.balanceOf(sender) as bigint;
      if (balance < ADMIN_REQUIRED_SUBSIDY) {
        throw new Error(`Owner 至少需要 ${formatUnits(ADMIN_REQUIRED_SUBSIDY, 6)} USDC 才能创建市场`);
      }
      const tx = await token.approve(ADMIN_FACTORY, ADMIN_REQUIRED_SUBSIDY);
      await tx.wait(1);
      setReview(null);
      setConfirmPhrase("");
      setNotice("USDC 授权已确认。请重新执行创建预检，以锁定最新 deadline、allowance 与 Gas。");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyReceipt = useCallback(async (receipt: TransactionReceipt, intent: PendingIntent): Promise<DeploymentResult> => {
    if (receipt.status !== 1) throw new Error("创建交易已回滚");
    if (!receipt.to || !sameAddress(receipt.to, ADMIN_FACTORY)) throw new Error("交易目标不是正式 Factory");
    const transaction =
      await provider.getTransaction(receipt.hash)
      ?? await recoveryProvider.getTransaction(receipt.hash);
    if (!transaction || !transaction.to
      || !sameAddress(transaction.from, intent.from)
      || !sameAddress(transaction.to, ADMIN_FACTORY)
      || transaction.nonce !== intent.nonce
      || transaction.value !== 0n
      || keccak256(transaction.data) !== intent.calldataHash) {
      throw new Error("链上交易 sender/target/nonce/value/calldata 与确认参数不一致");
    }

    const matchingEvents = receipt.logs.flatMap((log) => {
      if (!sameAddress(log.address, ADMIN_FACTORY)) return [];
      try {
        const parsed = factoryInterface.parseLog(log);
        return parsed?.name === "MarketCreated" ? [parsed] : [];
      } catch {
        return [];
      }
    });
    if (matchingEvents.length !== 1) throw new Error(`MarketCreated 事件数量异常：${matchingEvents.length}`);
    const event = matchingEvents[0];
    const market = getAddress(String(event.args.market));
    const vault = getAddress(String(event.args.vault));
    if (
      market === ZeroAddress || vault === ZeroAddress
      || !sameAddress(String(event.args.creator), intent.from)
    ) {
      throw new Error("MarketCreated 的 market/vault/creator 参数异常");
    }
    if (String(event.args.title) !== intent.title || String(event.args.description) !== intent.description) {
      throw new Error("MarketCreated 题面与确认参数不一致");
    }

    const factory = new Contract(ADMIN_FACTORY, FACTORY_ABI, provider);
    const deployedVault = new Contract(vault, VAULT_ABI, provider);
    const deployedMarket = new Contract(market, MARKET_ABI, provider);
    const [
      factoryCode, vaultCode, marketCode, registeredVault, registeredMarket,
      pairedMarket, pairedVault, officialLiquidityPool, vaults, markets, creator, meta,
    ] = await Promise.all([
      provider.getCode(ADMIN_FACTORY),
      provider.getCode(vault),
      provider.getCode(market),
      factory.isVault(vault),
      factory.isMarket(market),
      factory.marketByVault(vault),
      factory.vaultByMarket(market),
      factory.officialLiquidityPool(),
      factory.getVaults(),
      factory.getMarkets(),
      factory.getVaultCreator(vault),
      factory.getVaultMeta(vault),
    ]);
    if (
      factoryCode === "0x" || keccak256(factoryCode) !== EXPECTED_FACTORY_CODE_HASH
      || vaultCode === "0x" || marketCode === "0x" || !registeredVault || !registeredMarket
      || !sameAddress(pairedMarket, market) || !sameAddress(pairedVault, vault)
      || !(vaults as string[]).some((item) => sameAddress(item, vault))
      || !(markets as string[]).some((item) => sameAddress(item, market))
    ) throw new Error("V5 Factory runtime 或 Vault/Market 注册关系不一致");
    if (
      !sameAddress(creator, intent.from)
      || String(meta[0]) !== intent.title || String(meta[1]) !== intent.description
    ) throw new Error("Factory creator/metadata 回读不一致");

    const [
      version, vaultFactory, stakeToken, vaultResolutionTime, minStake,
      boundMarket, emptySettlementRecipient,
    ] = await Promise.all([
      deployedVault.protocolVersion(),
      deployedVault.factory(),
      deployedVault.stakeToken(),
      deployedVault.resolutionTime(),
      deployedVault.minStake(),
      deployedVault.market(),
      deployedVault.emptySettlementRecipient(),
    ]);
    if (
      BigInt(version) !== EXPECTED_PROTOCOL_VERSION
      || !sameAddress(vaultFactory, ADMIN_FACTORY) || !sameAddress(stakeToken, ADMIN_USDC)
      || !sameAddress(boundMarket, market)
      || !sameAddress(emptySettlementRecipient, officialLiquidityPool)
      || BigInt(vaultResolutionTime) !== BigInt(intent.resolutionTime)
      || BigInt(minStake) !== BigInt(intent.minStake)
    ) throw new Error("V5 Vault 的不可变绑定与创建意图不一致");

    const [
      marketVault, collateral, marketFactory, marketLiquidityPool, subsidyProvider,
      subsidy, requiredSubsidy, liquidityParameter, marketResolutionTime, conditionType,
      conditionParams, feeBps, vaultFeeBps, protocolLpFeeBps, activated,
    ] = await Promise.all([
      deployedMarket.vault(),
      deployedMarket.collateral(),
      deployedMarket.factory(),
      deployedMarket.officialLiquidityPool(),
      deployedMarket.subsidyProvider(),
      deployedMarket.subsidy(),
      deployedMarket.requiredSubsidy(),
      deployedMarket.liquidityParameter(),
      deployedMarket.resolutionTime(),
      deployedMarket.conditionType(),
      deployedMarket.conditionParams(),
      deployedMarket.feeBps(),
      deployedMarket.vaultFeeBps(),
      deployedMarket.protocolLpFeeBps(),
      deployedMarket.activated(),
    ]);
    const expectedConditionParams = AbiCoder.defaultAbiCoder().encode(
      ["string", "string"],
      [intent.title, intent.description],
    );
    if (
      !sameAddress(marketVault, vault) || !sameAddress(collateral, ADMIN_USDC)
      || !sameAddress(marketFactory, ADMIN_FACTORY)
      || !sameAddress(marketLiquidityPool, officialLiquidityPool)
      || !sameAddress(subsidyProvider, intent.from)
      || BigInt(requiredSubsidy) !== ADMIN_REQUIRED_SUBSIDY
      || BigInt(liquidityParameter) !== ADMIN_LMSR_B
      || BigInt(subsidy) < ADMIN_REQUIRED_SUBSIDY
      || BigInt(marketResolutionTime) !== BigInt(intent.resolutionTime)
      || Number(conditionType) !== 1
      || String(conditionParams).toLowerCase() !== expectedConditionParams.toLowerCase()
      || BigInt(feeBps) !== EXPECTED_FEE_BPS
      || BigInt(vaultFeeBps) !== EXPECTED_VAULT_FEE_BPS
      || BigInt(protocolLpFeeBps) !== EXPECTED_PROTOCOL_LP_FEE_BPS
      || !Boolean(activated)
    ) throw new Error("V5 LMSR Market 的不可变参数、补贴、条件或费率不一致");

    const activationEvents = receipt.logs.flatMap((log) => {
      if (!sameAddress(log.address, market)) return [];
      try {
        const parsed = marketInterface.parseLog(log);
        return parsed?.name === "MarketActivated" ? [parsed] : [];
      } catch {
        return [];
      }
    });
    if (
      activationEvents.length !== 1
      || !sameAddress(String(activationEvents[0].args.subsidyProvider), intent.from)
      || BigInt(activationEvents[0].args.subsidy) !== BigInt(subsidy)
      || BigInt(activationEvents[0].args.liquidityParameter) !== ADMIN_LMSR_B
    ) throw new Error("MarketActivated 事件与当前不可变补贴参数不一致");

    const [vaultSourceVerified, marketSourceVerified] = await Promise.all([
      readSourceVerification(vault),
      readSourceVerification(market),
    ]);
    return {
      txHash: receipt.hash,
      vault,
      market,
      blockNumber: receipt.blockNumber,
      protocolVersion: 5,
      liquidityPool: getAddress(String(officialLiquidityPool)),
      subsidy: BigInt(subsidy).toString(),
      vaultSourceVerified,
      marketSourceVerified,
    };
  }, [factoryInterface, marketInterface, provider, recoveryProvider]);

  const recoverPending = useCallback(async (intent: PendingIntent) => {
    if (recoveryLock.current) return;
    recoveryLock.current = true;
    setRecovering(true);
    setPendingCanClear(false);
    setPendingCanRetry(false);
    setRecoveryMessage("正在按 sender + nonce 核对链上交易与事件…");
    try {
      let txHash = intent.txHash;
      if (!txHash) {
        if (intent.stage === "awaiting_signature") {
          const [latestNonce, pendingNonce, recoveryLatestNonce, recoveryPendingNonce] = await Promise.all([
            provider.getTransactionCount(intent.from, "latest"),
            provider.getTransactionCount(intent.from, "pending"),
            recoveryProvider.getTransactionCount(intent.from, "latest"),
            recoveryProvider.getTransactionCount(intent.from, "pending"),
          ]);
          if (canRetryPendingWithSameNonce(
            intent,
            latestNonce,
            pendingNonce,
            recoveryLatestNonce,
            recoveryPendingNonce,
          )) {
            setPendingCanRetry(true);
            setRecoveryMessage(
              `双 RPC 均确认 nonce ${intent.nonce} 仍未占用（latest/pending：`
              + `${latestNonce}/${pendingNonce}、${recoveryLatestNonce}/${recoveryPendingNonce}）。`
              + "可以使用相同 nonce 与相同 calldata 安全重试；即使旧签名稍后广播，两笔中也最多只有一笔能上链。",
            );
            return;
          }
        }
        let indexedTransaction =
          await findFactoryCreateBySenderNonce(
            provider,
            factoryInterface,
            intent.from,
            intent.nonce,
            intent.intentBlock,
          ).catch(() => null);
        if (!indexedTransaction) {
          indexedTransaction = await findFactoryCreateBySenderNonce(
            recoveryProvider,
            factoryInterface,
            intent.from,
            intent.nonce,
            intent.intentBlock,
          ).catch(() => null);
        }
        if (!indexedTransaction) {
          indexedTransaction = await findTransactionBySenderNonce(intent.from, intent.nonce);
        }
        if (indexedTransaction) {
          if (!blockscoutTransactionMatchesIntent(indexedTransaction, intent)) {
            const replacementReceipt =
              await provider.getTransactionReceipt(indexedTransaction.hash)
              ?? await recoveryProvider.getTransactionReceipt(indexedTransaction.hash);
            const replacementTransaction =
              await provider.getTransaction(indexedTransaction.hash)
              ?? await recoveryProvider.getTransaction(indexedTransaction.hash);
            if (!replacementReceipt || !replacementTransaction
              || !sameAddress(replacementTransaction.from, intent.from)
              || replacementTransaction.nonce !== intent.nonce) {
              setRecoveryMessage(`nonce ${intent.nonce} 存在另一笔索引记录，但规范链尚未证明它已占用该 nonce；继续锁定。`);
              return;
            }
            const [currentBlock, recoveryCurrentBlock, primaryLatestNonce, recoveryLatestNonce] = await Promise.all([
              provider.getBlockNumber(),
              recoveryProvider.getBlockNumber(),
              provider.getTransactionCount(intent.from, "latest"),
              recoveryProvider.getTransactionCount(intent.from, "latest"),
            ]);
            const confirmations =
              Math.min(currentBlock, recoveryCurrentBlock) - replacementReceipt.blockNumber + 1;
            if (
              confirmations < REQUIRED_CONFIRMATIONS
              || primaryLatestNonce <= intent.nonce || recoveryLatestNonce <= intent.nonce
            ) {
              setRecoveryMessage(`nonce ${intent.nonce} 的替代交易尚未达到双 RPC nonce 与 ${REQUIRED_CONFIRMATIONS} 区块确认条件；继续锁定。`);
              return;
            }
            const [primaryFinalized, recoveryFinalized] = await Promise.all([
              provider.getBlock("finalized"),
              recoveryProvider.getBlock("finalized"),
            ]);
            if (!primaryFinalized || !recoveryFinalized) {
              throw new Error("双 RPC 无法读取 Base finalized 区块");
            }
            if (
              primaryFinalized.number < replacementReceipt.blockNumber
              || recoveryFinalized.number < replacementReceipt.blockNumber
            ) {
              setRecoveryMessage(
                `nonce ${intent.nonce} 已由区块 ${replacementReceipt.blockNumber} 的交易占用，`
                + `正在等待 Base finalized（双 RPC：${primaryFinalized.number}/${recoveryFinalized.number}）。`,
              );
              return;
            }
            const [primaryBlock, recoveryBlock] = await Promise.all([
              provider.getBlock(replacementReceipt.blockNumber),
              recoveryProvider.getBlock(replacementReceipt.blockNumber),
            ]);
            if (
              !primaryBlock || !recoveryBlock
              || primaryBlock.hash !== replacementReceipt.blockHash
              || recoveryBlock.hash !== replacementReceipt.blockHash
            ) {
              throw new Error("替代交易所在区块不是当前规范链区块");
            }
            const createMarketFunction = factoryInterface.getFunction("createMarket");
            const isSuccessfulFactoryCreate =
              replacementReceipt.status === 1
              && replacementTransaction.to !== null
              && sameAddress(replacementTransaction.to, ADMIN_FACTORY)
              && createMarketFunction !== null
              && replacementTransaction.data.slice(0, 10).toLowerCase() === createMarketFunction.selector.toLowerCase();
            if (isSuccessfulFactoryCreate) {
              const decoded = factoryInterface.decodeFunctionData("createMarket", replacementTransaction.data);
              const recoveredResolutionTime = BigInt(decoded[1]);
              const recoveredMinStake = BigInt(decoded[2]);
              const recoveredLiquidity = BigInt(decoded[3]);
              if (
                !sameAddress(String(decoded[0]), ADMIN_USDC)
                || recoveredResolutionTime > BigInt(Number.MAX_SAFE_INTEGER)
                || recoveredMinStake <= 0n
                || recoveredLiquidity !== ADMIN_LMSR_B
                || typeof decoded[4] !== "string"
                || typeof decoded[5] !== "string"
              ) {
                throw new Error("同 nonce 的 Factory 创建交易参数不符合 V5 生产约束");
              }
              const recoveredIntent: PendingIntent = {
                ...intent,
                title: String(decoded[4]),
                description: String(decoded[5]),
                resolutionTime: Number(recoveredResolutionTime),
                minStake: recoveredMinStake.toString(),
                calldataHash: keccak256(replacementTransaction.data),
                stage: "pending",
                txHash: replacementTransaction.hash,
              };
              const verified = await verifyReceipt(replacementReceipt, recoveredIntent);
              setResult({
                ...verified,
                recoveryNote:
                  "原本地创建意图未上链；页面已从 finalized 规范链恢复同一 nonce 实际成功创建的 Vault 与 Market，以下均为实际链上参数。",
              });
              setError("");
              setRecoveryMessage("");
              setPendingCanClear(false);
              setPendingCanRetry(false);
              savePending(null);
              return;
            }
            setPendingCanClear(true);
            setRecoveryMessage(
              `规范链已确认另一笔交易占用 nonce ${intent.nonce}；原创建意图不可能再上链，可以安全清除本地记录。`,
            );
            return;
          }
          txHash = indexedTransaction.hash;
          const updated = { ...intent, stage: "pending" as const, txHash };
          savePending(updated);
          intent = updated;
        } else {
          const [latestNonce, pendingNonce, recoveryLatestNonce, recoveryPendingNonce] = await Promise.all([
            provider.getTransactionCount(intent.from, "latest"),
            provider.getTransactionCount(intent.from, "pending"),
            recoveryProvider.getTransactionCount(intent.from, "latest"),
            recoveryProvider.getTransactionCount(intent.from, "pending"),
          ]);
          const nonceStillAvailable = canRetryPendingWithSameNonce(
            intent,
            latestNonce,
            pendingNonce,
            recoveryLatestNonce,
            recoveryPendingNonce,
          );
          setPendingCanRetry(nonceStillAvailable);
          setRecoveryMessage(
            `未定位到 nonce ${intent.nonce} 的交易（双 RPC latest/pending nonce：`
            + `${latestNonce}/${pendingNonce}、${recoveryLatestNonce}/${recoveryPendingNonce}）。`
            + (nonceStillAvailable
              ? "该 nonce 仍未占用，可以用同一 nonce 与同一 calldata 安全重试；两笔中最多只有一笔能上链。"
              : "“没有发现”不能证明旧签名永远不会广播，因此页面保持锁定；请先在钱包中用同 nonce 的取消交易占用该 nonce，再重新核验。"),
          );
          return;
        }
      }
      let receipt =
        await provider.getTransactionReceipt(txHash)
        ?? await recoveryProvider.getTransactionReceipt(txHash);
      if (!receipt) {
        setRecoveryMessage("交易仍在 pending 或 receipt 暂不可用。页面保持锁定并且不会自动重发。");
        return;
      }
      const [currentBlock, recoveryCurrentBlock] = await Promise.all([
        provider.getBlockNumber(),
        recoveryProvider.getBlockNumber(),
      ]);
      const confirmations = Math.min(currentBlock, recoveryCurrentBlock) - receipt.blockNumber + 1;
      if (confirmations < REQUIRED_CONFIRMATIONS) {
        setRecoveryMessage(`交易已进入区块，等待 ${REQUIRED_CONFIRMATIONS} 个确认（当前 ${confirmations}）…`);
        return;
      }
      const [primaryFinalized, recoveryFinalized] = await Promise.all([
        provider.getBlock("finalized"),
        recoveryProvider.getBlock("finalized"),
      ]);
      if (!primaryFinalized || !recoveryFinalized) {
        throw new Error("双 RPC 无法读取 Base finalized 区块");
      }
      if (
        primaryFinalized.number < receipt.blockNumber
        || recoveryFinalized.number < receipt.blockNumber
      ) {
        setRecoveryMessage(
          `交易已成功进入区块 ${receipt.blockNumber}，正在等待 Base finalized`
          + `（双 RPC finalized：${primaryFinalized.number}/${recoveryFinalized.number}）。页面保持锁定但不会重发。`,
        );
        return;
      }
      const [primaryBlock, recoveryBlock] = await Promise.all([
        provider.getBlock(receipt.blockNumber),
        recoveryProvider.getBlock(receipt.blockNumber),
      ]);
      if (
        !primaryBlock || !recoveryBlock
        || primaryBlock.hash !== receipt.blockHash
        || recoveryBlock.hash !== receipt.blockHash
      ) {
        throw new Error("交易所在区块发生重组，禁止自动重发");
      }
      if (receipt.status !== 1) {
        savePending({ ...intent, stage: "reverted" });
        setPendingCanClear(true);
        setRecoveryMessage(`交易已回滚并获得 ${confirmations} 个确认；链上没有创建 Vault，可以安全清除失败记录。`);
        return;
      }
      const verified = await verifyReceipt(receipt, intent);
      setResult(verified);
      setError("");
      setRecoveryMessage("");
      setPendingCanClear(false);
      setPendingCanRetry(false);
      savePending(null);
    } catch (e) {
      setRecoveryMessage(`恢复/核验失败：${friendlyError(e)} 页面保持锁定且不会自动重发。`);
    } finally {
      recoveryLock.current = false;
      setRecovering(false);
    }
  }, [factoryInterface, provider, recoveryProvider, savePending, verifyReceipt]);

  const retryPendingWithSameNonce = async () => {
    if (busy || !pending || !pendingCanRetry || pending.txHash || pending.stage !== "awaiting_signature") return;
    setBusy(true);
    setError("");
    try {
      if (!preflightOk) throw new Error("生产配置预检未通过");
      if (!wallet.signer) throw new Error("Owner 钱包未连接");
      const { factory, token, sender } = await validateSigner(wallet.signer);
      if (!sameAddress(sender, pending.from)) throw new Error("当前钱包不是原创建意图的 sender");
      await assertNoDuplicate(pending.title, pending.description, wallet.signer.provider);
      const [
        ownerBalance,
        factoryAllowance,
        latest,
        latestNonce,
        pendingNonce,
        recoveryLatestNonce,
        recoveryPendingNonce,
      ] = await Promise.all([
        token.balanceOf(sender) as Promise<bigint>,
        token.allowance(sender, ADMIN_FACTORY) as Promise<bigint>,
        wallet.signer.provider.getBlock("latest"),
        provider.getTransactionCount(sender, "latest"),
        provider.getTransactionCount(sender, "pending"),
        recoveryProvider.getTransactionCount(sender, "latest"),
        recoveryProvider.getTransactionCount(sender, "pending"),
      ]);
      if (ownerBalance < ADMIN_REQUIRED_SUBSIDY) throw new Error("Owner USDC 余额不足以支付 LMSR 做市补贴");
      if (factoryAllowance < ADMIN_REQUIRED_SUBSIDY) throw new Error("Factory USDC allowance 不足");
      if (!latest || latest.timestamp >= pending.resolutionTime) {
        throw new Error("原创建意图的截止时间已经到达，无法再用相同 calldata 重试");
      }
      if (
        latestNonce !== pending.nonce || pendingNonce !== pending.nonce
        || recoveryLatestNonce !== pending.nonce || recoveryPendingNonce !== pending.nonce
      ) {
        throw new Error("双 RPC 已不再确认原 nonce 可用，请重新核验");
      }
      const args = [
        ADMIN_USDC,
        pending.resolutionTime,
        BigInt(pending.minStake),
        ADMIN_LMSR_B,
        pending.title,
        pending.description,
      ] as const;
      const calldata = factory.interface.encodeFunctionData("createMarket", args);
      if (keccak256(calldata) !== pending.calldataHash) throw new Error("恢复 calldata 与原创建意图不一致");
      await factory.createMarket.staticCall(...args);
      const gasEstimate = await factory.createMarket.estimateGas(...args);
      const feeData = await provider.getFeeData();
      const baseMaxFee = feeData.maxFeePerGas ?? feeData.gasPrice;
      const basePriorityFee = feeData.maxPriorityFeePerGas ?? 1_000_000n;
      if (!baseMaxFee) throw new Error("无法读取 Base EIP-1559 Gas 报价");
      savePending({ ...pending, lastError: undefined });
      const walletRequest = factory.createMarket(...args, {
        nonce: pending.nonce,
        gasLimit: (gasEstimate * 120n) / 100n,
        maxFeePerGas: baseMaxFee * 2n,
        maxPriorityFeePerGas: basePriorityFee * 2n,
      });
      trackLateWalletHash(walletRequest, pending);
      const tx = await withWalletTimeout(walletRequest, 60_000);
      const withHash = { ...pending, stage: "pending" as const, txHash: tx.hash, nonce: tx.nonce };
      savePending(withHash);
      setPendingCanRetry(false);
      await recoverPending(withHash);
    } catch (e) {
      const diagnostic = walletErrorDiagnostic(e);
      const current = loadPendingIntent();
      if (
        current
        && pending
        && sameAddress(current.from, pending.from)
        && current.nonce === pending.nonce
        && current.calldataHash.toLowerCase() === pending.calldataHash.toLowerCase()
      ) {
        savePending({ ...current, lastError: diagnostic });
      }
      setError(diagnostic);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!pending || result) return;
    void recoverPending(pending);
    const timer = window.setInterval(() => void recoverPending(pending), 15_000);
    return () => window.clearInterval(timer);
  }, [pending, recoverPending, result]);

  const submitUnderLock = async () => {
    if (submitLock.current || busy || pending || !review || confirmPhrase !== "CREATE") return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!preflightOk) throw new Error("生产配置预检未通过");
      const crossTabPending = loadPendingIntent();
      if (crossTabPending) {
        setPending(crossTabPending);
        throw new Error("另一个标签页已经开始创建，禁止重复发送");
      }
      if (!wallet.signer) throw new Error("Owner 钱包未连接");
      const { factory, token, sender } = await validateSigner(wallet.signer);
      await assertNoDuplicate(review.title, review.description, wallet.signer.provider);
      const [ownerBalance, factoryAllowance] = await Promise.all([
        token.balanceOf(sender) as Promise<bigint>,
        token.allowance(sender, ADMIN_FACTORY) as Promise<bigint>,
      ]);
      if (ownerBalance < ADMIN_REQUIRED_SUBSIDY) throw new Error("Owner USDC 余额不足以支付 LMSR 做市补贴");
      if (factoryAllowance < ADMIN_REQUIRED_SUBSIDY) throw new Error("Factory USDC allowance 不足，请重新授权并预检");
      const latest = await wallet.signer.provider.getBlock("latest");
      if (!latest || latest.timestamp > review.preparedBlockTimestamp + 300) {
        throw new Error("确认页已超过 5 分钟，请重新预检，确保完整质押期限从接近创建时开始计算");
      }
      if (review.resolutionTime !== review.preparedBlockTimestamp + review.durationSeconds) throw new Error("deadline 与预检期限不一致");
      const args = [ADMIN_USDC, review.resolutionTime, BigInt(review.minStake), ADMIN_LMSR_B, review.title, review.description] as const;
      const calldata = factory.interface.encodeFunctionData("createMarket", args);
      if (keccak256(calldata) !== review.calldataHash) throw new Error("calldata 与预检结果不一致");
      await factory.createMarket.staticCall(...args);
      const gasEstimate = await factory.createMarket.estimateGas(...args);
      const intent: PendingIntent = {
        ...review,
        version: 1,
        stage: "awaiting_signature",
        from: sender,
        intentBlock: latest.number,
        nonce: await wallet.signer.getNonce("pending"),
        submittedAt: Date.now(),
      };
      savePending(intent);
      try {
        const walletRequest = factory.createMarket(...args, {
          nonce: intent.nonce,
          gasLimit: (gasEstimate * 120n) / 100n,
        });
        trackLateWalletHash(walletRequest, intent);
        const tx = await withWalletTimeout(walletRequest, 60_000);
        const withHash = { ...intent, stage: "pending" as const, txHash: tx.hash, nonce: tx.nonce };
        savePending(withHash);
        await recoverPending(withHash);
      } catch (e) {
        const code = (e as { code?: string | number })?.code;
        const current = loadPendingIntent();
        const isCurrentIntent =
          current
          && sameAddress(current.from, intent.from)
          && current.nonce === intent.nonce
          && current.calldataHash.toLowerCase() === intent.calldataHash.toLowerCase();
        if ((code === "ACTION_REJECTED" || code === 4001) && isCurrentIntent && !current.txHash) {
          savePending(null);
        } else if (isCurrentIntent) {
          savePending({ ...current, lastError: walletErrorDiagnostic(e) });
        }
        throw e;
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  const submit = async () => {
    const run = async () => {
      const crossTabPending = loadPendingIntent();
      if (crossTabPending) {
        setPending(crossTabPending);
        setError("另一个标签页已经开始创建，禁止重复发送。");
        return;
      }
      await submitUnderLock();
    };
    if (navigator.locks) {
      await navigator.locks.request(PENDING_KEY, { mode: "exclusive" }, run);
    } else {
      setError("当前浏览器不支持跨标签独占锁，已禁止创建。请使用最新版 Chrome。 ");
    }
  };

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setReview(null);
    setConfirmPhrase("");
    setResult(null);
    setNotice("");
  };

  const isOwner = wallet.connected && owner && sameAddress(wallet.address, owner);
  const reviewFundingReady = Boolean(
    review
    && BigInt(review.ownerBalance ?? "0") >= ADMIN_REQUIRED_SUBSIDY
    && BigInt(review.factoryAllowance ?? "0") >= ADMIN_REQUIRED_SUBSIDY
    && BigInt(review.gasEstimate) > 0n,
  );
  const sourceStatus = result?.vaultSourceVerified === true && result?.marketSourceVerified === true
    ? "Vault 与 Market 的 Blockscout 源码均已验证"
    : "部署成功；Vault 或 Market 的源码验证尚未完成/尚未索引";

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <OCPMenu lang="zh" suffix="VAULT ADMIN" />
          <WalletButton
            lang="zh"
            connected={wallet.connected}
            address={wallet.address}
            chainId={wallet.chainId}
            onTargetNetwork={wallet.onTargetNetwork}
            targetChainId={wallet.targetChainId}
            onConnect={wallet.connectWallet}
            onDisconnect={wallet.disconnectWallet}
          />
        </div>
      </nav>

      <main className="flex-1 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <section className="rounded-2xl border border-border bg-white shadow-sm p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-accent/10 p-3"><LockKeyhole className="w-6 h-6 text-accent" /></div>
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-text">新建 Stake War Vault</h1>
                <p className="mt-2 text-sm text-text-muted max-w-3xl leading-6">
                  这是管理操作界面，不是权限边界。任何人都能打开页面，但只有链上 Factory owner 能通过 <code>onlyOwner</code> 创建。
                  创建后题面、截止时间和最低质押均不可修改，Vault 也不能从链上删除。
                </p>
              </div>
            </div>
          </section>

          <section className={`rounded-xl border p-4 ${preflightOk ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5"}`}>
            <div className="flex items-center gap-3">
              {preflightOk ? <ShieldCheck className="w-5 h-5 text-success" /> : <AlertTriangle className="w-5 h-5 text-danger" />}
              <div className="text-sm">
                <div className="font-bold">生产配置预检</div>
                <div className="text-text-muted mt-1">{preflightMessage}</div>
              </div>
              <button className="ml-auto text-text-muted hover:text-accent" onClick={() => void runConfigPreflight()} title="重新检查">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 mt-4 text-xs font-mono text-text-muted">
              <div>CHAIN · Base {ADMIN_CHAIN_ID}</div><div>OWNER · {owner || "读取中"}</div>
              <div className="truncate">FACTORY · {ADMIN_FACTORY}</div><div className="truncate">TOKEN · {ADMIN_USDC}</div>
              <div className="truncate sm:col-span-2">OFFICIAL LP · {liquidityPool || "V5 预检未通过"}</div>
            </div>
          </section>

          {!wallet.connected ? (
            <section className="rounded-2xl border border-border bg-white p-8 text-center">
              <p className="text-text-muted mb-5">连接 Factory owner 钱包后才能填写和预检交易。</p>
              <Button onClick={wallet.connectWallet}>连接 Owner 钱包</Button>
            </section>
          ) : !isOwner ? (
            <section className="rounded-2xl border border-danger/40 bg-danger/5 p-6">
              <div className="flex gap-3"><AlertTriangle className="w-5 h-5 text-danger shrink-0" />
                <p className="text-sm">当前地址不是 Factory owner，管理操作已锁定。链上 owner：<code>{owner}</code></p>
              </div>
            </section>
          ) : pending ? (
            <section className="rounded-2xl border border-yellow-500/40 bg-yellow-50 p-6">
              <div className="flex gap-3">
                {recovering
                  ? <Loader2 className="w-5 h-5 animate-spin text-yellow-700 shrink-0" />
                  : <RefreshCw className="w-5 h-5 text-yellow-700 shrink-0" />}
                <div>
                  <h2 className="font-bold">存在未完成的创建意图，禁止再次发送</h2>
                  <p className="text-sm text-text-muted mt-2">状态：{pending.stage} · nonce {pending.nonce}</p>
                  <div className="mt-3 rounded-lg border border-yellow-500/30 bg-white/60 p-3 text-xs font-mono leading-5">
                    <div>命题 · {pending.title}</div>
                    <div>截止时间 · {new Date(pending.resolutionTime * 1000).toLocaleString()}</div>
                    <div>最低质押 · {formatUnits(BigInt(pending.minStake), 6)} USDC</div>
                    <div className="break-all">CALLDATA HASH · {pending.calldataHash}</div>
                  </div>
                  {pending.txHash && <a className="text-sm text-accent mt-2 inline-flex items-center gap-1" href={`${config.explorer}/tx/${pending.txHash}`} target="_blank" rel="noreferrer">查看交易 <ExternalLink className="w-3 h-3" /></a>}
                  {recoveryMessage && <p className="text-sm text-yellow-900 mt-3 whitespace-pre-wrap">{recoveryMessage}</p>}
                  {error && <p className="text-sm text-danger mt-3 whitespace-pre-wrap">{error}</p>}
                  <div className="flex flex-wrap gap-3 mt-4">
                    <Button variant="outline" onClick={() => void recoverPending(pending)}>
                      <RefreshCw className="w-4 h-4" /> 重新核验
                    </Button>
                    {pendingCanRetry && (
                      <Button disabled={busy} onClick={() => void retryPendingWithSameNonce()}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        使用同一 nonce 重试
                      </Button>
                    )}
                    {pendingCanClear && (
                      <Button variant="danger" onClick={() => {
                        savePending(null);
                        setError("");
                        setRecoveryMessage("");
                        setPendingCanClear(false);
                        setPendingCanRetry(false);
                      }}>
                        清除已证明失效的本地记录
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : result ? (
            <section className="rounded-2xl border border-success/40 bg-success/5 p-6 sm:p-8">
              <div className="flex gap-3"><CheckCircle2 className="w-6 h-6 text-success shrink-0" />
                <div className="min-w-0">
                  <h2 className="font-display font-bold text-xl">
                    V5 Vault 与 LMSR Market 创建并回读核验成功
                  </h2>
                  {result.recoveryNote && (
                    <p className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm font-bold text-text">
                      {result.recoveryNote}
                    </p>
                  )}
                  <p className="text-sm text-text-muted mt-2">
                    交易已进入 finalized 规范链；MarketCreated/MarketActivated、Factory 双向注册、V5 Vault、LMSR 参数、补贴、费率与条件编码均一致。
                  </p>
                  <div className="mt-4 space-y-2 text-sm font-mono break-all">
                    <div>VAULT · {result.vault}</div>
                    <div>MARKET · {result.market}</div>
                    <div>PROTOCOL · V{result.protocolVersion}</div>
                    {result.subsidy && <div>SUBSIDY · {formatUnits(BigInt(result.subsidy), 6)} USDC</div>}
                    {result.liquidityPool && <div>OFFICIAL LP · {result.liquidityPool}</div>}
                    <div>TX · {result.txHash}</div><div>BLOCK · {result.blockNumber}</div>
                  </div>
                  <div className={`mt-4 text-sm font-bold ${result.vaultSourceVerified && result.marketSourceVerified ? "text-success" : "text-danger"}`}>{sourceStatus}</div>
                  <button
                    className="mt-2 text-xs text-accent inline-flex items-center gap-1"
                    onClick={async () => setResult({
                      ...result,
                      vaultSourceVerified: await readSourceVerification(result.vault),
                      marketSourceVerified: await readSourceVerification(result.market),
                    })}
                  >
                    <RefreshCw className="w-3 h-3" /> 重新检查 Blockscout
                  </button>
                  {(!result.vaultSourceVerified || !result.marketSourceVerified) && (
                    <p className="text-xs text-text-muted mt-2">部署成功不等于源码验证成功；需要分别核对 Vault 与 Market。</p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-5">
                    <a className="text-sm text-accent inline-flex items-center gap-1" href={`/explore/vault.html?vault=${result.vault}&market=${result.market}`}>打开 Vault 与市场 <ExternalLink className="w-3 h-3" /></a>
                    <a className="text-sm text-accent inline-flex items-center gap-1" href={`${config.explorer}/address/${result.vault}#code`} target="_blank" rel="noreferrer">区块浏览器 <ExternalLink className="w-3 h-3" /></a>
                  </div>
                  <Button className="mt-6" variant="outline" onClick={() => { setResult(null); setForm(initialForm); setReview(null); setConfirmPhrase(""); }}>创建另一个 Vault</Button>
                </div>
              </div>
            </section>
          ) : (
            <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
              <section className="rounded-2xl border border-border bg-white shadow-sm p-6 space-y-5">
                <h2 className="font-display font-bold text-lg">1. 填写不可变参数</h2>
                <label className="block text-sm font-bold">命题
                  <textarea value={form.title} onChange={(e) => updateForm("title", e.target.value)} rows={2} maxLength={180} placeholder="用一个可判定的问题描述争议" className="mt-2 w-full rounded-lg border border-border p-3 font-mono text-sm focus:border-accent outline-none" />
                </label>
                {(["yes", "no", "invalid"] as const).map((side) => (
                  <label key={side} className="block text-sm font-bold uppercase">{side} 定义
                    <textarea value={form[side]} onChange={(e) => updateForm(side, e.target.value)} rows={3} placeholder={`${side.toUpperCase()} 的明确判定含义`} className="mt-2 w-full rounded-lg border border-border p-3 font-mono text-sm focus:border-accent outline-none" />
                  </label>
                ))}
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="block text-sm font-bold">质押期限（天）
                    <input value={form.durationDays} onChange={(e) => updateForm("durationDays", e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-lg border border-border p-3 font-mono text-sm focus:border-accent outline-none" />
                    <span className="block mt-1 text-xs text-text-muted">1 小时–30 天；默认 5 天</span>
                  </label>
                  <label className="block text-sm font-bold">最低质押（USDC）
                    <input value={form.minStake} onChange={(e) => updateForm("minStake", e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-lg border border-border p-3 font-mono text-sm focus:border-accent outline-none" />
                    <span className="block mt-1 text-xs text-text-muted">6 位精度；默认 1 USDC</span>
                  </label>
                </div>
                <div className="rounded-lg bg-slate-50 border border-border p-4 text-xs text-text-muted leading-5">
                  固定参数：Base 主网 · 官方 USDC · LMSR b = 1,000 USDC。Vault 与预测市场在同一笔交易中原子创建；
                  Factory allowance 必须至少为 693.147183 USDC，页面可发起该精确额度的授权。补贴承担 LMSR 最坏做市亏损，终局后只能取回扣除份额兑付责任与手续费托管后的余额。
                  质押期限 1 小时–30 天、最低质押不超过 1,000 USDC 是管理页运营限制；合约本身只要求未来截止时间和正数 minStake。
                </div>
                <div className="rounded-lg bg-accent/5 border border-accent/30 p-4 text-xs text-text-muted leading-5">
                  V5 Vault：题面与三侧定义只用于展示，合约不会读取文字判案。没有秘密期、挑战期或 Keeper；单一公开期内，同地址首次选边后不可换边或撤回。
                  截止时 YES 严格超过总本金 50% 则 YES，NO 严格超过总本金 50% 则 NO；否则（包括恰好 50%，即使无人押 INVALID）自动 INVALID。
                  Vault 为 INVALID 时所有质押者按本金比例分配 Vault 结算池；LMSR 份额是另一套账本，INVALID 时 YES/NO 每份仅兑付 0.5 USDC。
                  市场总手续费按税前现金流的 1.2% 向上取整，Vault 份额按 1.0% 向下取整，剩余部分归官方流动性池。
                  其中 Vault 份额按每笔交易发生时的质押权重写入三套条件账：YES/NO 终局只兑现最终胜侧账本；INVALID 终局由 YES 与 NO 质押者共享 INVALID 条件账；
                  直接质押 INVALID 不获得预测市场手续费奖励。
                </div>
                <Button onClick={() => void prepareReview()} disabled={busy || !preflightOk} className="w-full">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} 预检并生成最终确认
                </Button>
                {notice && <div className="rounded-lg border border-success/40 bg-success/5 p-4 text-sm text-success whitespace-pre-wrap">{notice}</div>}
                {error && <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger whitespace-pre-wrap">{error}</div>}
              </section>

              <section className="rounded-2xl border border-border bg-white shadow-sm p-6 sticky top-24">
                <h2 className="font-display font-bold text-lg">2. 最终确认</h2>
                {!review ? <p className="mt-4 text-sm text-text-muted">完成预检后，这里会锁定并显示实际 calldata 对应参数。</p> : (
                  <div className="mt-4 space-y-4 text-sm">
                    <div><div className="text-xs text-text-muted">命题</div><div className="font-bold mt-1">{review.title}</div></div>
                    <div className="whitespace-pre-wrap rounded-lg bg-slate-50 border border-border p-3 text-xs leading-5">{review.description}</div>
                    <div className="grid gap-2 text-xs font-mono">
                      <div>DEADLINE (LOCAL) · {new Date(review.resolutionTime * 1000).toLocaleString()}</div>
                      <div>DEADLINE (UTC) · {new Date(review.resolutionTime * 1000).toISOString()}</div>
                      <div>EPOCH · {review.resolutionTime}</div>
                      <div>DURATION · {review.durationSeconds} seconds</div>
                      <div>MIN STAKE · {formatUnits(BigInt(review.minStake), 6)} USDC</div>
                      <div>LMSR b · {formatUnits(ADMIN_LMSR_B, 6)} USDC</div>
                      <div>REQUIRED SUBSIDY · {formatUnits(BigInt(review.requiredSubsidy ?? "0"), 6)} USDC</div>
                      <div>OWNER BALANCE · {formatUnits(BigInt(review.ownerBalance ?? "0"), 6)} USDC</div>
                      <div>FACTORY ALLOWANCE · {formatUnits(BigInt(review.factoryAllowance ?? "0"), 6)} USDC</div>
                      <div>EST. GAS · {reviewFundingReady ? review.gasEstimate : "等待资金/授权后重新预检"}</div>
                      <div>CALLDATA HASH · <span className="break-all">{review.calldataHash}</span></div>
                    </div>
                    {!reviewFundingReady && BigInt(review.ownerBalance ?? "0") >= ADMIN_REQUIRED_SUBSIDY && (
                      <Button variant="outline" className="w-full" disabled={busy} onClick={() => void approveSubsidy()}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        精确授权 {formatUnits(ADMIN_REQUIRED_SUBSIDY, 6)} USDC 给 Factory
                      </Button>
                    )}
                    <div className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-xs text-danger leading-5">
                      不可逆：每次创建签名都会部署一个全新 V5 Vault 与 LMSR Market，并从 owner 转入做市补贴。链上没有删除、编辑或题面去重功能。
                      跨标签页已加独占锁，但 Factory 本身没有 requestId；操作期间禁止在另一台设备或另一种浏览器同时创建。
                    </div>
                    <label className="block text-xs font-bold">输入 <code>CREATE</code> 解锁最终交易
                      <input value={confirmPhrase} onChange={(e) => setConfirmPhrase(e.target.value)} autoComplete="off" className="mt-2 w-full rounded-lg border border-border p-3 font-mono text-sm focus:border-danger outline-none" />
                    </label>
                    <Button variant="danger" className="w-full" disabled={busy || confirmPhrase !== "CREATE" || !reviewFundingReady} onClick={() => void submit()}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockKeyhole className="w-4 h-4" />} 在 Base 主网原子创建 Vault + LMSR Market
                    </Button>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const root = typeof document === "undefined" ? null : document.getElementById("root");
if (root) ReactDOM.createRoot(root).render(<React.StrictMode><AdminPage /></React.StrictMode>);
