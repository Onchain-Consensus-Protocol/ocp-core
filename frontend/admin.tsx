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
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  formatUnits,
  getAddress,
  keccak256,
  parseUnits,
  type ContractRunner,
  type JsonRpcSigner,
  type TransactionReceipt,
} from "ethers";
import "./index.css";
import { Button } from "./components/Button";
import { OCPMenu } from "./components/OCPMenu";
import { WalletButton } from "./components/WalletButton";
import { config, ERC20_ABI, FACTORY_ABI, VAULT_ABI } from "./config";
import { useWallet } from "./useWallet";

const ADMIN_CHAIN_ID = 8453;
const ADMIN_FACTORY = "0xe343be8F1d8572937da49234882e6a1eF4FFEb26";
const ADMIN_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const EXPECTED_FACTORY_CODE_HASH = "0xc8988995765b2b285e6bae6b1947fc517dd5161e9422859a04e44ec1b418da2d";
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

type Review = {
  title: string;
  description: string;
  preparedBlockTimestamp: number;
  durationSeconds: number;
  resolutionTime: number;
  minStake: string;
  gasEstimate: string;
  calldataHash: string;
};

type PendingIntent = Review & {
  version: 1;
  stage: "awaiting_signature" | "pending" | "reverted";
  from: string;
  intentBlock: number;
  nonce: number;
  submittedAt: number;
  txHash?: string;
};

type DeploymentResult = {
  txHash: string;
  vault: string;
  blockNumber: number;
  sourceVerified: boolean | null;
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

async function readSourceVerification(vault: string): Promise<boolean | null> {
  try {
    const response = await fetch(`https://base.blockscout.com/api/v2/smart-contracts/${vault}`);
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const body = (await response.json()) as { is_verified?: boolean };
    return body.is_verified === true;
  } catch {
    return null;
  }
}

function loadPendingIntent(): PendingIntent | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingIntent>;
    const validStage = value.stage === "awaiting_signature" || value.stage === "pending" || value.stage === "reverted";
    if (value.version !== 1 || !validStage || !value.from || !sameAddress(value.from, value.from)
      || typeof value.title !== "string" || !value.title || typeof value.description !== "string" || !value.description
      || !Number.isSafeInteger(value.preparedBlockTimestamp) || Number(value.preparedBlockTimestamp) <= 0
      || !Number.isSafeInteger(value.durationSeconds) || Number(value.durationSeconds) < 3_600
      || !Number.isSafeInteger(value.intentBlock) || Number(value.intentBlock) < 0
      || !Number.isSafeInteger(value.nonce) || Number(value.nonce) < 0
      || !Number.isSafeInteger(value.resolutionTime) || Number(value.resolutionTime) <= 0
      || typeof value.minStake !== "string" || !/^\d+$/.test(value.minStake)
      || typeof value.gasEstimate !== "string" || !/^\d+$/.test(value.gasEstimate)
      || !Number.isSafeInteger(value.submittedAt) || Number(value.submittedAt) <= 0
      || typeof value.calldataHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(value.calldataHash)
      || (value.txHash !== undefined && !/^0x[0-9a-f]{64}$/i.test(value.txHash))) {
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
  const factoryInterface = useMemo(() => new Interface(FACTORY_ABI), []);
  const [form, setForm] = useState<FormState>(initialForm);
  const [owner, setOwner] = useState("");
  const [preflightOk, setPreflightOk] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState("正在核对 Base Factory…");
  const [review, setReview] = useState<Review | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingIntent | null>(() => loadPendingIntent());
  const [result, setResult] = useState<DeploymentResult | null>(null);
  const [error, setError] = useState("");
  const submitLock = useRef(false);
  const recoveryLock = useRef(false);

  const savePending = useCallback((intent: PendingIntent | null) => {
    setPending(intent);
    if (intent) localStorage.setItem(PENDING_KEY, JSON.stringify(intent));
    else localStorage.removeItem(PENDING_KEY);
  }, []);

  useEffect(() => {
    const syncPendingAcrossTabs = (event: StorageEvent) => {
      if (event.key === PENDING_KEY) setPending(loadPendingIntent());
    };
    window.addEventListener("storage", syncPendingAcrossTabs);
    return () => window.removeEventListener("storage", syncPendingAcrossTabs);
  }, []);

  const runConfigPreflight = useCallback(async () => {
    setPreflightOk(false);
    try {
      if (config.chainId !== ADMIN_CHAIN_ID) throw new Error(`构建 chainId 不是 ${ADMIN_CHAIN_ID}`);
      if (!sameAddress(config.factoryAddress, ADMIN_FACTORY)) throw new Error("构建 Factory 不是正式 Base Factory");
      if (!sameAddress(config.depositTokenAddress, ADMIN_USDC)) throw new Error("构建代币不是 Base 原生 USDC");
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== ADMIN_CHAIN_ID) throw new Error("RPC 不在 Base 主网");
      const factoryCode = await provider.getCode(ADMIN_FACTORY);
      if (factoryCode === "0x" || keccak256(factoryCode) !== EXPECTED_FACTORY_CODE_HASH) {
        throw new Error("Factory 字节码不匹配正式部署");
      }
      const factory = new Contract(ADMIN_FACTORY, FACTORY_ABI, provider);
      const [chainOwner, officialToken, tokenCode] = await Promise.all([
        factory.owner() as Promise<string>,
        factory.officialStakeToken() as Promise<string>,
        provider.getCode(ADMIN_USDC),
      ]);
      if (!sameAddress(officialToken, ADMIN_USDC) || tokenCode === "0x") throw new Error("Factory 官方代币配置异常");
      const token = new Contract(ADMIN_USDC, ERC20_ABI, provider);
      const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
      if (Number(decimals) !== 6 || String(symbol) !== "USDC") throw new Error("USDC 元数据不匹配");
      setOwner(getAddress(chainOwner));
      setPreflightOk(true);
      setPreflightMessage("配置、RPC、Factory 字节码与官方 USDC 均已核对");
    } catch (e) {
      setPreflightMessage(friendlyError(e));
    }
  }, [provider]);

  useEffect(() => {
    void runConfigPreflight();
  }, [runConfigPreflight]);

  const validateSigner = useCallback(async (signer: JsonRpcSigner) => {
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
    const [chainOwner, officialToken, tokenCode, decimals, symbol] = await Promise.all([
      factory.owner() as Promise<string>,
      factory.officialStakeToken() as Promise<string>,
      signerProvider.getCode(ADMIN_USDC),
      token.decimals(),
      token.symbol(),
    ]);
    if (!sameAddress(sender, chainOwner)) throw new Error(`当前钱包不是 Factory owner（owner: ${chainOwner}）`);
    if (!sameAddress(officialToken, ADMIN_USDC) || tokenCode === "0x") throw new Error("官方 USDC 配置异常");
    if (Number(decimals) !== 6 || String(symbol) !== "USDC") throw new Error("钱包所见 USDC 元数据不匹配");
    return { factory, sender: getAddress(sender) };
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
    setReview(null);
    setConfirmPhrase("");
    if (!wallet.signer || !preflightOk) {
      setError("请先连接正式 Factory owner 钱包，并确保预检通过。");
      return;
    }
    setBusy(true);
    try {
      const params = buildParameters(form);
      const { factory } = await validateSigner(wallet.signer);
      await assertNoDuplicate(params.title, params.description);
      const latest = await wallet.signer.provider.getBlock("latest");
      if (!latest) throw new Error("无法读取最新 Base 区块");
      const resolutionTime = latest.timestamp + params.durationSeconds;
      const args = [ADMIN_USDC, resolutionTime, params.minStake, 0n, params.title, params.description] as const;
      await factory.createMarket.staticCall(...args);
      const gasEstimate = await factory.createMarket.estimateGas(...args);
      const calldata = factory.interface.encodeFunctionData("createMarket", args);
      setReview({
        title: params.title,
        description: params.description,
        preparedBlockTimestamp: latest.timestamp,
        durationSeconds: params.durationSeconds,
        resolutionTime,
        minStake: params.minStake.toString(),
        gasEstimate: gasEstimate.toString(),
        calldataHash: keccak256(calldata),
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyReceipt = useCallback(async (receipt: TransactionReceipt, intent: PendingIntent): Promise<DeploymentResult> => {
    if (receipt.status !== 1) throw new Error("创建交易已回滚");
    if (!receipt.to || !sameAddress(receipt.to, ADMIN_FACTORY)) throw new Error("交易目标不是正式 Factory");
    const transaction = await provider.getTransaction(receipt.hash);
    if (!transaction || !sameAddress(transaction.from, intent.from) || !transaction.to || !sameAddress(transaction.to, ADMIN_FACTORY)) {
      throw new Error("链上交易 sender/target 与确认参数不一致");
    }
    if (transaction.nonce !== intent.nonce || transaction.value !== 0n || keccak256(transaction.data) !== intent.calldataHash) {
      throw new Error("链上交易 nonce/value/calldata 与确认参数不一致");
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
    const market = String(event.args.market);
    const vault = getAddress(String(event.args.vault));
    const creator = String(event.args.creator);
    if (!sameAddress(market, ZeroAddress) || vault === ZeroAddress) throw new Error("Market/Vault 事件参数异常");
    if (!sameAddress(creator, intent.from)) throw new Error("事件 creator 与 owner 不一致");
    if (String(event.args.title) !== intent.title || String(event.args.description) !== intent.description) {
      throw new Error("事件题面与确认参数不一致");
    }

    const blockTag = receipt.blockNumber;
    const factory = new Contract(ADMIN_FACTORY, FACTORY_ABI, provider);
    const deployedVault = new Contract(vault, VAULT_ABI, provider);
    const [
      code, registered, creatorOnChain, meta, vaults, version, vaultFactory, stakeToken,
      resolutionTime, minStake, totalPrincipal, totalDonations, yes, no, invalid, resolved, outcome,
    ] = await Promise.all([
      provider.getCode(vault, blockTag),
      factory.isVault(vault, { blockTag }),
      factory.getVaultCreator(vault, { blockTag }),
      factory.getVaultMeta(vault, { blockTag }),
      factory.getVaults({ blockTag }),
      deployedVault.protocolVersion({ blockTag }),
      deployedVault.factory({ blockTag }),
      deployedVault.stakeToken({ blockTag }),
      deployedVault.resolutionTime({ blockTag }),
      deployedVault.minStake({ blockTag }),
      deployedVault.totalPrincipal({ blockTag }),
      deployedVault.totalDonations({ blockTag }),
      deployedVault.totalStakeYes({ blockTag }),
      deployedVault.totalStakeNo({ blockTag }),
      deployedVault.totalStakeInvalid({ blockTag }),
      deployedVault.resolved({ blockTag }),
      deployedVault.outcome({ blockTag }),
    ]);
    const zeroInitialState = [totalPrincipal, totalDonations, yes, no, invalid].every((value) => BigInt(value) === 0n);
    if (code === "0x" || !registered || !(vaults as string[]).some((item) => sameAddress(item, vault))) throw new Error("Vault 未完整注册到 Factory");
    if (!sameAddress(creatorOnChain, intent.from) || !sameAddress(vaultFactory, ADMIN_FACTORY) || !sameAddress(stakeToken, ADMIN_USDC)) throw new Error("Vault owner/factory/token 回读不一致");
    if (String(meta[0]) !== intent.title || String(meta[1]) !== intent.description) throw new Error("Factory metadata 回读不一致");
    if (BigInt(version) !== 4n || BigInt(resolutionTime) !== BigInt(intent.resolutionTime) || BigInt(minStake) !== BigInt(intent.minStake)) throw new Error("Vault version/deadline/minStake 回读不一致");
    if (!zeroInitialState || Boolean(resolved) || Number(outcome) !== 0) throw new Error("Vault 初始账本状态不是全零 PENDING");
    return {
      txHash: receipt.hash,
      vault,
      blockNumber: receipt.blockNumber,
      sourceVerified: await readSourceVerification(vault),
    };
  }, [factoryInterface, provider]);

  const recoverPending = useCallback(async (intent: PendingIntent) => {
    if (recoveryLock.current) return;
    recoveryLock.current = true;
    try {
      let txHash = intent.txHash;
      let receipt = txHash ? await provider.getTransactionReceipt(txHash) : null;
      if (!receipt) {
        const currentBlock = await provider.getBlockNumber();
        const event = factoryInterface.getEvent("MarketCreated");
        if (!event) throw new Error("Factory ABI 缺少 MarketCreated");
        const logs = await provider.getLogs({
          address: ADMIN_FACTORY,
          fromBlock: intent.intentBlock,
          toBlock: currentBlock,
          topics: [event.topicHash],
        });
        const eventCandidates = logs.flatMap((log) => {
          try {
            const parsed = factoryInterface.parseLog(log);
            return parsed?.name === "MarketCreated"
              && sameAddress(String(parsed.args.creator), intent.from)
              && String(parsed.args.title) === intent.title
              && String(parsed.args.description) === intent.description
              ? [{ log, vault: getAddress(String(parsed.args.vault)) }]
              : [];
          } catch {
            return [];
          }
        });
        const candidateChecks = await Promise.all(eventCandidates.map(async (candidate) => {
          try {
            const transaction = await provider.getTransaction(candidate.log.transactionHash);
            if (!transaction || !sameAddress(transaction.from, intent.from) || !transaction.to
              || !sameAddress(transaction.to, ADMIN_FACTORY) || transaction.nonce !== intent.nonce
              || transaction.value !== 0n || keccak256(transaction.data) !== intent.calldataHash) return false;
            const vault = new Contract(candidate.vault, VAULT_ABI, provider);
            const [stakeToken, resolutionTime, minStake] = await Promise.all([
              vault.stakeToken(), vault.resolutionTime(), vault.minStake(),
            ]);
            return sameAddress(stakeToken, ADMIN_USDC)
              && BigInt(resolutionTime) === BigInt(intent.resolutionTime)
              && BigInt(minStake) === BigInt(intent.minStake);
          } catch {
            return false;
          }
        }));
        const candidates = eventCandidates.filter((_, index) => candidateChecks[index]);
        if (candidates.length === 0) {
          setError(txHash
            ? "原交易尚无 receipt，也未发现参数完全匹配的替代交易。页面不会自动重发。"
            : "签名阶段状态未知：尚未发现参数完全匹配的链上事件。为防止重复 Vault，页面不会自动解锁或重发。");
          return;
        }
        if (candidates.length !== 1) throw new Error(`发现 ${candidates.length} 个匹配事件，禁止自动选择`);
        txHash = candidates[0].log.transactionHash;
        const updated = { ...intent, stage: "pending" as const, txHash };
        savePending(updated);
        intent = updated;
        receipt = await provider.getTransactionReceipt(txHash);
      }
      if (!receipt) {
        setError("交易仍在 pending 或状态暂不可知。页面不会自动重发。");
        return;
      }
      if (receipt.status !== 1) {
        savePending({ ...intent, stage: "reverted" });
        setError("交易已回滚；链上没有创建 Vault。可以清除失败记录后重新检查参数。");
        return;
      }
      const confirmations = (await provider.getBlockNumber()) - receipt.blockNumber + 1;
      if (confirmations < REQUIRED_CONFIRMATIONS) {
        setError(`交易已进入区块，等待 ${REQUIRED_CONFIRMATIONS} 个确认（当前 ${confirmations}）…`);
        return;
      }
      const canonicalBlock = await provider.getBlock(receipt.blockNumber);
      if (!canonicalBlock || canonicalBlock.hash !== receipt.blockHash) throw new Error("交易所在区块发生重组，禁止自动重发");
      const verified = await verifyReceipt(receipt, intent);
      setResult(verified);
      setError("");
      savePending(null);
    } catch (e) {
      setError(`恢复/核验失败：${friendlyError(e)}`);
    } finally {
      recoveryLock.current = false;
    }
  }, [factoryInterface, provider, savePending, verifyReceipt]);

  useEffect(() => {
    if (!pending || result) return;
    void recoverPending(pending);
    const timer = window.setInterval(() => void recoverPending(pending), 6_000);
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
      const { factory, sender } = await validateSigner(wallet.signer);
      await assertNoDuplicate(review.title, review.description, wallet.signer.provider);
      const latest = await wallet.signer.provider.getBlock("latest");
      if (!latest || latest.timestamp > review.preparedBlockTimestamp + 300) {
        throw new Error("确认页已超过 5 分钟，请重新预检，确保完整质押期限从接近创建时开始计算");
      }
      if (review.resolutionTime !== review.preparedBlockTimestamp + review.durationSeconds) throw new Error("deadline 与预检期限不一致");
      const args = [ADMIN_USDC, review.resolutionTime, BigInt(review.minStake), 0n, review.title, review.description] as const;
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
        const tx = await factory.createMarket(...args, { gasLimit: (gasEstimate * 120n) / 100n });
        const withHash = { ...intent, stage: "pending" as const, txHash: tx.hash, nonce: tx.nonce };
        savePending(withHash);
        await recoverPending(withHash);
      } catch (e) {
        const code = (e as { code?: string | number })?.code;
        if (code === "ACTION_REJECTED" || code === 4001) {
          savePending(null);
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
  };

  const isOwner = wallet.connected && owner && sameAddress(wallet.address, owner);
  const sourceStatus = result?.sourceVerified === true
    ? "Blockscout 源码验证成功"
    : result?.sourceVerified === false
      ? "部署成功；Blockscout 显示源码尚未验证"
      : "部署成功；Blockscout 尚未索引或状态暂不可用";

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
              <div className="flex gap-3"><Loader2 className="w-5 h-5 animate-spin text-yellow-700 shrink-0" />
                <div>
                  <h2 className="font-bold">存在未完成的创建意图，禁止再次发送</h2>
                  <p className="text-sm text-text-muted mt-2">状态：{pending.stage} · nonce {pending.nonce}</p>
                  {pending.txHash && <a className="text-sm text-accent mt-2 inline-flex items-center gap-1" href={`${config.explorer}/tx/${pending.txHash}`} target="_blank" rel="noreferrer">查看交易 <ExternalLink className="w-3 h-3" /></a>}
                  {pending.stage === "reverted" && (
                    <Button className="mt-4" variant="danger" onClick={() => { savePending(null); setError(""); }}>清除已回滚记录</Button>
                  )}
                </div>
              </div>
            </section>
          ) : result ? (
            <section className="rounded-2xl border border-success/40 bg-success/5 p-6 sm:p-8">
              <div className="flex gap-3"><CheckCircle2 className="w-6 h-6 text-success shrink-0" />
                <div className="min-w-0">
                  <h2 className="font-display font-bold text-xl">Vault 创建并回读核验成功</h2>
                  <p className="text-sm text-text-muted mt-2">两个区块确认；Factory 注册、题面、v4、USDC、deadline、minStake 与初始零账本均一致。</p>
                  <div className="mt-4 space-y-2 text-sm font-mono break-all">
                    <div>VAULT · {result.vault}</div><div>TX · {result.txHash}</div><div>BLOCK · {result.blockNumber}</div>
                  </div>
                  <div className={`mt-4 text-sm font-bold ${result.sourceVerified ? "text-success" : "text-danger"}`}>{sourceStatus}</div>
                  <button
                    className="mt-2 text-xs text-accent inline-flex items-center gap-1"
                    onClick={async () => setResult({ ...result, sourceVerified: await readSourceVerification(result.vault) })}
                  >
                    <RefreshCw className="w-3 h-3" /> 重新检查 Blockscout
                  </button>
                  {!result.sourceVerified && (
                    <p className="text-xs text-text-muted mt-2">在 contracts 目录执行：<code>make verify-vault ADDR={result.vault} RPC_URL=&lt;Base主网RPC&gt; CHAIN_ID=8453</code></p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-5">
                    <a className="text-sm text-accent inline-flex items-center gap-1" href={`/explore/vault.html?vault=${result.vault}&market=${ZeroAddress}`}>打开 Vault <ExternalLink className="w-3 h-3" /></a>
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
                  固定参数：Base 主网 · 官方 USDC · initialLiquidity = 0 · 不创建预测市场。若截止前无人质押，Vault 会永久空置且不能 finalize。
                </div>
                <div className="rounded-lg bg-accent/5 border border-accent/30 p-4 text-xs text-text-muted leading-5">
                  v4 规则：题面与三侧定义只用于展示，合约不会读取文字判案。单一公开期内，同地址首次选边后不可换边或撤回。
                  截止时 YES 严格超过总本金 50% 则 YES，NO 严格超过总本金 50% 则 NO；否则（包括恰好 50%，即使无人押 INVALID）自动 INVALID。
                  INVALID 时所有参与者按本金比例分配结算池。
                </div>
                <Button onClick={() => void prepareReview()} disabled={busy || !preflightOk} className="w-full">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} 预检并生成最终确认
                </Button>
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
                      <div>EST. GAS · {review.gasEstimate}</div>
                      <div>CALLDATA HASH · <span className="break-all">{review.calldataHash}</span></div>
                    </div>
                    <div className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-xs text-danger leading-5">
                      不可逆：每次签名都会部署一个全新 Vault。链上没有删除、编辑或去重功能。
                      跨标签页已加独占锁，但 Factory 本身没有 requestId；操作期间禁止在另一台设备或另一种浏览器同时创建。
                    </div>
                    <label className="block text-xs font-bold">输入 <code>CREATE</code> 解锁最终交易
                      <input value={confirmPhrase} onChange={(e) => setConfirmPhrase(e.target.value)} autoComplete="off" className="mt-2 w-full rounded-lg border border-border p-3 font-mono text-sm focus:border-danger outline-none" />
                    </label>
                    <Button variant="danger" className="w-full" disabled={busy || confirmPhrase !== "CREATE"} onClick={() => void submit()}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LockKeyhole className="w-4 h-4" />} 在 Base 主网创建 Vault
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

const root = document.getElementById("root");
if (root) ReactDOM.createRoot(root).render(<React.StrictMode><AdminPage /></React.StrictMode>);
