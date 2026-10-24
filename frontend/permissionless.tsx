import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  Contract,
  JsonRpcProvider,
  formatUnits,
  getAddress,
  hexlify,
  parseUnits,
  randomBytes,
  type ContractTransactionReceipt,
} from "ethers";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import "./index.css";
import { Button } from "./components/Button";
import { WalletButton } from "./components/WalletButton";
import { OCPMenu } from "./components/OCPMenu";
import { config, GENESIS_ABI, MARKET_FACTORY_ABI } from "./config";
import { useWallet } from "./useWallet";
import { LocalAccountSelector } from "./components/LocalAccountSelector";

const FACTORY = config.factoryAddress;

const FACTORY_ABI = [
  ...MARKET_FACTORY_ABI,
  "function officialStakeToken() view returns (address)",
  "function assetCount() view returns (uint256)",
  "function assetAt(uint256) view returns (address)",
  "function assetConfigs(address) view returns (bool enabled,uint32 epoch,uint256 minStake,uint256 maxStake,uint256 minLiquidityParameter,uint256 maxLiquidityParameter)",
  "function nonces(address) view returns (uint256)",
  "function verifierEpoch() view returns (uint32)",
  "function priceConfigEpoch() view returns (uint32)",
  "function priceOracle() view returns (address)",
  "function creationParamsHash((address assetToken,uint32 assetConfigEpoch,uint256 resolutionTime,uint256 minStake,uint256 liquidityParameter,uint256 vaultFeeBps,uint256 creatorFeeBps,string title,string description)) view returns (bytes32)",
  "function genesisParamsHash((address assetToken,uint32 assetConfigEpoch,uint32 priceConfigEpoch,uint256 resolutionTime,uint256 minStake,uint256 vaultFeeBps,uint256 formalCreatorFeeBps,string title,string description)) view returns (bytes32)",
  "function genesisLiquidityParameters(address assetToken) view returns (uint256)",
  "function createPermissionlessMarket((address assetToken,uint32 assetConfigEpoch,uint256 resolutionTime,uint256 minStake,uint256 liquidityParameter,uint256 vaultFeeBps,uint256 creatorFeeBps,string title,string description),(address creator,bytes32 xUserIdHash,bytes32 paramsHash,bytes32 requestId,uint256 nonce,uint64 issuedAt,uint64 expiresAt,uint32 verifierEpoch),bytes signature) returns (address vaultAddr,address marketAddr)",
  "function createGenesisTopic((address assetToken,uint32 assetConfigEpoch,uint32 priceConfigEpoch,uint256 resolutionTime,uint256 minStake,uint256 vaultFeeBps,uint256 formalCreatorFeeBps,string title,string description),(address creator,bytes32 xUserIdHash,bytes32 paramsHash,bytes32 requestId,uint256 nonce,uint64 issuedAt,uint64 expiresAt,uint32 verifierEpoch),bytes signature) returns (address vaultAddr,address genesisAddr)",
  "function genesisTopicCount() view returns (uint256)",
  "function genesisVaultAt(uint256) view returns (address)",
  "function getVaults() view returns (address[])",
  "function getVaultCreator(address) view returns (address)",
  "event GenesisTopicCreated(address indexed genesis,address indexed vault,address indexed creator,address assetToken,bytes32 xUserIdHash,bytes32 requestId,uint256 graduationThreshold,uint256 liquidityParameter,uint256 creatorCapital,uint256 ethUsdPriceX18,uint256 assetUsdPriceX18,uint80 ethRoundId,uint80 assetRoundId,uint256 ethUpdatedAt,uint256 assetUpdatedAt)",
  "event PermissionlessMarketCreated(address indexed market,address indexed vault,address indexed creator,address assetToken,bytes32 xUserIdHash,bytes32 requestId,uint256 liquidityParameter,uint256 vaultFeeBps,uint256 creatorFeeBps)",
] as const;
const PRICE_ORACLE_ABI = [
  "function captureThreshold(address assetToken,uint256 assetScale) view returns ((uint256 threshold,uint256 ethUsdPriceX18,uint256 assetUsdPriceX18,uint80 ethRoundId,uint80 assetRoundId,uint256 ethUpdatedAt,uint256 assetUpdatedAt))",
] as const;
const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function mint(address,uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
] as const;
type Authorization = {
  creator: string;
  xUserIdHash: string;
  paramsHash: string;
  requestId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  verifierEpoch: number;
};
type Verification = {
  authorization: Authorization;
  signature: string;
  profile: { username: string; localSimulation: boolean };
};
type AssetOption = {
  address: string;
  symbol: string;
  decimals: number;
  epoch: number;
  minStake: bigint;
  maxStake: bigint;
  minB: bigint;
  maxB: bigint;
  virtualQuote: bigint;
};
type GenesisTopic = {
  vault: string; genesis: string; title: string; assetSymbol: string;
  decimals: number; phase: number; formalMarket: string;
  threshold: bigint; retained: bigint; capital: bigint;
};

function toLocalDateTimeInput(date: Date) {
  const localTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localTime.toISOString().slice(0, 16);
}

function normalizeXHandle(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, "")
    .split(/[/?#]/, 1)[0]
    .replace(/^@/, "");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function App() {
  const wallet = useWallet();
  const [title, setTitle] = useState(
    "特斯拉（TSLA）在截止时间的股价是否高于 350 美元？",
  );
  const [yes, setYes] = useState("截止时间记录的 TSLA 价格严格高于 350 美元。");
  const [no, setNo] = useState("截止时间记录的 TSLA 价格不高于 350 美元。");
  const [invalid, setInvalid] = useState(
    "证据源不可用，或 YES/NO 资本均未形成严格多数。",
  );
  const [deadline, setDeadline] = useState(() =>
    toLocalDateTimeInput(new Date(Date.now() + 7 * 86_400_000)),
  );
  const [capturedThreshold, setCapturedThreshold] = useState<bigint>(0n);
  const [xHandle, setXHandle] = useState("ocp_test");
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifiedParamsHash, setVerifiedParamsHash] = useState("");
  const [tokenAddress, setTokenAddress] = useState(() => new URLSearchParams(window.location.search).get("asset") ?? "");
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [genesisTopics, setGenesisTopics] = useState<GenesisTopic[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const provider = useMemo(() => new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 }), []);
  const selectedAsset = useMemo(
    () =>
      assets.find(
        (asset) => asset.address.toLowerCase() === tokenAddress.toLowerCase(),
      ),
    [assets, tokenAddress],
  );

  const buildParams = useCallback(async () => {
    if (!selectedAsset) throw new Error("请选择可用的代币化股票");
    const latest = await provider.getBlock("latest");
    if (!latest) throw new Error("无法读取本地区块");
    const deadlineMs = new Date(deadline).getTime();
    if (!Number.isFinite(deadlineMs)) throw new Error("请选择有效的截止时间");
    const resolutionTime = Math.floor(deadlineMs / 1000);
    const durationSeconds = resolutionTime - latest.timestamp;
    if (durationSeconds < 3_600)
      throw new Error("截止时间必须至少在当前链上时间1小时之后");
    if (durationSeconds > 30 * 86_400)
      throw new Error("截止时间不能超过当前链上时间30天");
    const factory = new Contract(FACTORY, FACTORY_ABI, provider);
    const [priceConfigEpoch, oracleAddress] = await Promise.all([
      factory.priceConfigEpoch(),
      factory.priceOracle(),
    ]);
    const priceCapture = await new Contract(
      String(oracleAddress),
      PRICE_ORACLE_ABI,
      provider,
    ).captureThreshold(
      selectedAsset.address,
      10n ** BigInt(selectedAsset.decimals),
    );
    setCapturedThreshold(BigInt(priceCapture.threshold ?? priceCapture[0]));
    return {
      assetToken: selectedAsset.address,
      assetConfigEpoch: selectedAsset.epoch,
      priceConfigEpoch: Number(priceConfigEpoch),
      resolutionTime: BigInt(resolutionTime),
      minStake: 0n, // 旧签名结构的兼容字段，新合约不设置质押门槛。
      vaultFeeBps: 80n,
      formalCreatorFeeBps: 20n,
      title: title.trim(),
      description: `YES: ${yes.trim()}\nNO: ${no.trim()}\nINVALID: ${invalid.trim()}`,
    };
  }, [
    provider,
    selectedAsset,
    deadline,
    title,
    yes,
    no,
    invalid,
  ]);

  useEffect(() => {
    if (!FACTORY || !selectedAsset) {
      setCapturedThreshold(0n);
      return;
    }
    let cancelled = false;
    const loadThreshold = async () => {
      const factory = new Contract(FACTORY, FACTORY_ABI, provider);
      const oracleAddress = String(await factory.priceOracle());
      const capture = await new Contract(oracleAddress, PRICE_ORACLE_ABI, provider).captureThreshold(
        selectedAsset.address, 10n ** BigInt(selectedAsset.decimals),
      );
      if (!cancelled) {
        setCapturedThreshold(BigInt(capture.threshold ?? capture[0]));
      }
    };
    void loadThreshold().catch(() => {
      if (!cancelled) {
        setCapturedThreshold(0n);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [provider, selectedAsset]);

  const refresh = useCallback(async () => {
    if (!FACTORY) return;
    try {
      const factory = new Contract(FACTORY, FACTORY_ABI, provider);
      const count = Number(await factory.assetCount());
      const listedAssets = (
        await Promise.all(
          Array.from({ length: count }, async (_, index) => {
            const address = String(await factory.assetAt(index));
            const [asset, symbol, decimals, virtualQuote] = await Promise.all([
              factory.assetConfigs(address),
              new Contract(address, TOKEN_ABI, provider).symbol(),
              new Contract(address, TOKEN_ABI, provider).decimals(),
              factory.genesisLiquidityParameters(address),
            ]);
            if (!Boolean(asset[0])) return null;
            return {
              address,
              symbol: String(symbol),
              decimals: Number(decimals),
              epoch: Number(asset[1]),
              minStake: BigInt(asset[2]),
              maxStake: BigInt(asset[3]),
              minB: BigInt(asset[4]),
              maxB: BigInt(asset[5]),
              virtualQuote: BigInt(virtualQuote),
            } as AssetOption;
          }),
        )
      ).filter((asset): asset is AssetOption => asset !== null);
      setAssets(listedAssets);
      setTokenAddress((current) =>
        listedAssets.some(
          (asset) => asset.address.toLowerCase() === current.toLowerCase(),
        )
          ? current
          : (listedAssets[0]?.address ?? ""),
      );
      const genesisCount = Number(await factory.genesisTopicCount());
      const topics = await Promise.all(
        Array.from({ length: genesisCount }, async (_, index) => {
          const vaultAddress = String(await factory.genesisVaultAt(index));
          const genesisAddress = String(
            await factory.genesisByVault(vaultAddress),
          );
          const genesis = new Contract(genesisAddress, GENESIS_ABI, provider);
          const [meta, phase, threshold, retained, capital, assetAddress, formalMarket] = await Promise.all([
            factory.getGenesisTopicMeta(vaultAddress), genesis.phase(),
            genesis.graduationThreshold(), genesis.totalRetainedCapital(),
            genesis.lockedGraduationCapital(), genesis.asset(), genesis.formalMarket(),
          ]);
          const token = new Contract(String(assetAddress), TOKEN_ABI, provider);
          const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
          return {
            vault: vaultAddress, genesis: genesisAddress, title: String(meta[0]),
            phase: Number(phase), threshold: BigInt(threshold), retained: BigInt(retained),
            capital: BigInt(capital), assetSymbol: String(symbol), decimals: Number(decimals),
            formalMarket: String(formalMarket),
          } as GenesisTopic;
        }),
      );
      setGenesisTopics(topics.reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [wallet.address, provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    // 钱包地址就是创建授权中的 creator；切换账户后旧凭证必须从界面失效。
    setVerification(null);
    setVerifiedParamsHash("");
  }, [wallet.address]);

  const verifyX = async () => {
    if (!wallet.signer || !wallet.address) return;
    setBusy(true);
    setError("");
    setNotice("");
    setBusyStep("正在读取链上创建参数…");
    try {
      const normalizedXHandle = normalizeXHandle(xHandle);
      if (!/^[A-Za-z0-9_]{1,15}$/.test(normalizedXHandle)) {
        throw new Error(
          "X用户名只能包含英文字母、数字和下划线，长度为1–15个字符",
        );
      }
      setXHandle(normalizedXHandle);
      const params = await buildParams();
      const factory = new Contract(FACTORY, FACTORY_ABI, wallet.signer);
      const [paramsHash, nonce, verifierEpoch] = await Promise.all([
        factory.genesisParamsHash(params),
        factory.nonces(wallet.address),
        factory.verifierEpoch(),
      ]);
      const requestId = hexlify(randomBytes(32));
      const challenge = [
        "OCP Permissionless local X verification",
        `wallet:${getAddress(wallet.address)}`,
        `factory:${getAddress(FACTORY)}`,
        `paramsHash:${paramsHash}`,
        `requestId:${requestId}`,
        `nonce:${nonce}`,
      ].join("\n");
      setBusyStep("请在钱包中确认消息签名…");
      const challengeSignature = await withTimeout(
        wallet.signer.signMessage(challenge),
        60_000,
        "等待钱包签名超时。请打开钱包扩展确认待签名消息，然后重试。",
      );
      setBusyStep("正在签发本地创建凭证…");
      const apiRoot = config.apiBase.replace(/\/$/, "");
      const response = await withTimeout(
        fetch(`${apiRoot}/api/permissionless/x-attestation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: wallet.address,
            factory: FACTORY,
            xHandle: normalizedXHandle,
            paramsHash,
            requestId,
            nonce: nonce.toString(),
            verifierEpoch: Number(verifierEpoch),
            challenge,
            challengeSignature,
          }),
        }),
        30_000,
        "本地创建凭证服务响应超时，请确认前端开发服务仍在运行。",
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "X验证失败");
      setVerification(data as Verification);
      setVerifiedParamsHash(paramsHash);
      setNotice(
        `X 身份 @${data.profile.username} 已签发；凭证10分钟内有效。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyStep("");
    }
  };

  const create = async () => {
    if (!wallet.signer || !wallet.address || !verification) return;
    setBusy(true);
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const latestBlock = await provider.getBlock("latest");
      const chainNow = BigInt(
        latestBlock?.timestamp ?? Math.floor(Date.now() / 1000),
      );
      if (chainNow + 30n > BigInt(verification.authorization.expiresAt)) {
        setVerification(null);
        setVerifiedParamsHash("");
        throw new Error("X 创建凭证已过期，请重新验证 X 后立即创建");
      }
      const params = await buildParams();
      const factory = new Contract(FACTORY, FACTORY_ABI, wallet.signer);
      const currentHash = await factory.genesisParamsHash(params);
      if (currentHash !== verifiedParamsHash)
        throw new Error("创建参数或区块时间已变化，请重新验证 X 后立即创建");
      setBusyStep("正在创建 Genesis Topic…");
      // DEV ONLY：Anvil 重启后钱包可能缓存旧链的高 nonce。本地创建交易
      // 显式采用当前 RPC 的 pending nonce，避免交易永久停留在 queued。
      const localOverrides =
        config.isLocalDev
          ? {
              nonce: await provider.getTransactionCount(
                wallet.address,
                "pending",
              ),
            }
          : {};
      const tx = await factory.createGenesisTopic(
        params,
        verification.authorization,
        verification.signature,
        localOverrides,
      );
      const receipt = await withTimeout<ContractTransactionReceipt | null>(
        tx.wait(),
        60_000,
        "创建交易等待超时。若刚重启过 Anvil，请在钱包设置中清除活动和 nonce 数据后重试。",
      );
      setNotice(`Genesis Topic 创建成功；创建者本金为 0：${receipt?.hash}`);
      setVerification(null);
      setVerifiedParamsHash("");
      let vaultAddress = "";
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = factory.interface.parseLog(log);
          if (parsed?.name === "GenesisTopicCreated") {
            vaultAddress = String(parsed.args.vault);
            break;
          }
        } catch {
          // 该 receipt 同时包含子合约事件，只解析 Factory 自己的创建事件。
        }
      }
      if (!vaultAddress) throw new Error("创建成功，但未找到话题地址");
      window.location.assign(
        `/explore/vault.html?vault=${encodeURIComponent(vaultAddress)}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.toLowerCase().includes("authorization expired")) {
        setVerification(null);
        setVerifiedParamsHash("");
        setError("X 创建凭证已过期，请重新验证 X 后立即创建");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
      setCreating(false);
    }
  };

  const mint = async () => {
    if (!wallet.signer || !wallet.address || !tokenAddress) return;
    setBusy(true);
    setError("");
    try {
      const gasResponse = await fetch("/api/permissionless/fund-gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      const gasData = await gasResponse.json();
      if (!gasResponse.ok) throw new Error(gasData.error || "本地Gas领取失败");
      await (
        await new Contract(tokenAddress, TOKEN_ABI, wallet.signer).mint(
          wallet.address,
          parseUnits("10000", selectedAsset?.decimals ?? 6),
        )
      ).wait();
      setNotice(
        `已领取100个本地Gas币和10,000 ${selectedAsset?.symbol ?? "股票代币"}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const advanceTime = async (seconds: number) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/permissionless/advance-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotice(`Anvil 已推进 ${seconds} 秒`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-text">
      <nav className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <OCPMenu lang="zh" suffix="MARKET" />
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
      <main className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
        <section className="rounded-2xl bg-white border p-6">
          <h1 className="text-3xl font-display font-bold">
            创建话题市场
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            选择股票，写清话题与判定条件。创建无需投入做市本金。
          </p>
          <a href="/how.html?lang=zh#genesis-guide" className="inline-block mt-3 text-sm text-accent underline">了解 Genesis、手续费与风险 →</a>
          <details className="mt-3 text-xs text-text-muted"><summary className="cursor-pointer">合约与网络信息</summary><div className="mt-2 font-mono break-all">
            FACTORY · {FACTORY}
            <br />
            COLLATERAL · {selectedAsset?.symbol ?? "读取中"} ·{" "}
            {tokenAddress || "—"}
            <br />
            CHAIN · {config.chainId}
          </div></details>
        </section>
        {config.isLocalDev && (
          <details className="rounded-xl border border-yellow-400 bg-yellow-50 p-4">
            <summary className="cursor-pointer text-sm font-bold text-yellow-800">本地测试工具 · DEV ONLY</summary>
            <div className="mt-3 flex flex-wrap items-center gap-3">
            <LocalAccountSelector address={wallet.address} onSelect={wallet.connectLocalAccount} />
            {wallet.connected && <>
              <Button variant="outline" disabled={busy} onClick={() => void wallet.connectLocalAccount(3)}>连接零本金创建者</Button>
              <Button variant="outline" disabled={busy} onClick={() => void wallet.connectLocalAccount(2)}>连接本地账户 2</Button>
            </>}
            <Button
              variant="outline"
              onClick={() => void advanceTime(86_401)}
              disabled={busy}
            >
              推进24小时
            </Button>
            <Button
              variant="outline"
              onClick={() => void advanceTime(2 * 86_400)}
              disabled={busy}
            >
              推进48小时
            </Button>
            </div>
          </details>
        )}
        {!wallet.connected ? (
          <section className="rounded-2xl bg-white border p-10 text-center space-y-3">
            <Button onClick={wallet.connectWallet}>连接浏览器钱包</Button>
            {config.isLocalDev && (
              <div>
                <Button variant="outline" onClick={wallet.connectLocalWallet}>
                  使用 Anvil 测试账户（无需钱包插件）
                </Button>
                <Button variant="outline" onClick={() => void wallet.connectLocalAccount(3)}>
                  连接零本金创建者
                </Button>
                <Button variant="outline" onClick={() => void wallet.connectLocalAccount(2)}>
                  连接本地账户 2
                </Button>
                <p className="mt-2 text-xs text-text-muted">
                  仅限本地开发链；直接使用 Anvil 已解锁账户，不读取浏览器钱包。
                </p>
              </div>
            )}
          </section>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6 items-start">
            <section className="rounded-2xl bg-white border p-6 space-y-4">
              <h2 className="text-xl font-bold">1. 话题设置</h2>
              <label className="block text-sm font-bold">
                绑定的代币化股票
                <select
                  className="mt-1 w-full border rounded-lg p-3"
                  value={tokenAddress}
                  onChange={(e) => {
                    setTokenAddress(e.target.value);
                    setVerification(null);
                  }}
                >
                  {assets.map((asset) => (
                    <option key={asset.address} value={asset.address}>
                      {asset.symbol} · {asset.address.slice(0, 10)}…
                    </option>
                  ))}
                </select>
                <span className="block mt-1 text-xs font-normal text-text-muted">
                  股票、题面和截止时间创建后不可修改。
                </span>
              </label>
              <label className="block text-sm font-bold">
                题目
                <textarea
                  className="mt-1 w-full border rounded-lg p-3"
                  rows={2}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setVerification(null);
                  }}
                />
              </label>
              {[
                ["YES定义", yes, setYes],
                ["NO定义", no, setNo],
                ["INVALID定义", invalid, setInvalid],
              ].map(([label, value, setter]) => (
                <label
                  key={label as string}
                  className="block text-sm font-bold"
                >
                  {label as string}
                  <textarea
                    className="mt-1 w-full border rounded-lg p-3"
                    rows={2}
                    value={value as string}
                    onChange={(e) => {
                      (setter as React.Dispatch<React.SetStateAction<string>>)(
                        e.target.value,
                      );
                      setVerification(null);
                    }}
                  />
                </label>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm font-bold">
                  截止日期和时间
                  <input
                    type="datetime-local"
                    className="mt-1 w-full border rounded-lg p-2"
                    value={deadline}
                    min={toLocalDateTimeInput(new Date(Date.now() + 3_600_000))}
                    max={toLocalDateTimeInput(
                      new Date(Date.now() + 30 * 86_400_000),
                    )}
                    onInput={(e) => {
                      setDeadline(e.currentTarget.value);
                      setVerification(null);
                    }}
                    onChange={(e) => {
                      setDeadline(e.target.value);
                      setVerification(null);
                    }}
                  />
                  <span className="block mt-1 text-xs font-normal text-text-muted">
                    Genesis 与毕业后的市场共同使用这一段话题生命周期。
                  </span>
                </label>
              </div>
            </section>
            <section className="rounded-2xl bg-white border p-6 space-y-4 lg:sticky lg:top-5">
              <h2 className="text-xl font-bold">2. 验证并创建</h2>
              <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3"><span>毕业门槛预览</span><strong>{selectedAsset && capturedThreshold > 0n ? `${formatUnits(capturedThreshold, selectedAsset.decimals)} ${selectedAsset.symbol}` : "报价暂不可用"}</strong></div>
                <p className="text-xs text-text-muted">等值 4.2 ETH，创建时按链上报价冻结。</p>
                <div className="flex justify-between gap-3"><span>正式交易手续费</span><strong>1.1%</strong></div>
              </div>
              <p className="text-xs text-text-muted leading-5">参与资金可能损失。Genesis 有交易后不能取消；毕业后创建者可提前终止。<a href="/how.html?lang=zh#genesis-guide" className="text-accent underline ml-1">机制与风险说明</a></p>
              <label className="block text-sm font-bold">
                X用户名
                <input
                  className="mt-1 w-full border rounded-lg p-3"
                  value={xHandle}
                  onChange={(e) => {
                    setXHandle(e.target.value);
                    setVerification(null);
                  }}
                  placeholder="例如 ocp_test、@ocp_test 或 x.com/ocp_test"
                />
                <span className="block mt-1 text-xs font-normal text-text-muted">
                  支持用户名、@用户名或X主页链接；用户名只能包含字母、数字、下划线，最多15个字符。
                </span>
              </label>
              <Button
                className="w-full"
                variant="outline"
                disabled={busy || !selectedAsset}
                onClick={() => void verifyX()}
              >
                {busy && !creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {busy && !creating && busyStep
                  ? busyStep
                  : "本地验证X并绑定Genesis参数"}
              </Button>
              {verification && (
                <div className="rounded-lg bg-success/5 border border-success/30 p-3 text-sm flex gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success" />@
                  {verification.profile.username} 已验证 ·{" "}
                  {selectedAsset?.symbol}
                </div>
              )}
              <Button
                className="w-full"
                disabled={busy || !verification}
                onClick={() => void create()}
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                {creating
                  ? busyStep || "创建交易已提交，正在等待链上确认…"
                  : "零本金创建 Genesis Topic"}
              </Button>
              {config.isLocalDev && (
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={busy || !tokenAddress}
                  onClick={() => void mint()}
                >
                  领取本地Gas + 10,000 {selectedAsset?.symbol ?? "股票代币"}
                </Button>
              )}
              <p className="text-xs text-text-muted">
                {config.isLocalDev
                  ? `本地水龙头会先补充测试 Gas，再铸造 ${selectedAsset?.symbol ?? "股票代币"}；两者都没有真实价值。`
                  : ""}
                更改资产、题面、期限或费率后必须重新验证。
              </p>
            </section>
          </div>
        )}
        {(notice || error) && (
          <section
            className={`rounded-xl border p-4 text-sm ${error ? "border-danger/40 bg-danger/5 text-danger" : "border-success/40 bg-success/5 text-success"}`}
          >
            {error || notice}
          </section>
        )}
        <section className="rounded-2xl bg-white border p-6 space-y-4">
          <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Genesis 话题</h2><Button variant="outline" disabled={busy} onClick={() => void refresh()}>刷新</Button></div>
          <p className="text-sm text-text-muted">进入话题页完成 Genesis 买卖、毕业、现金领取或迁移、正式交易与结算领取。共享流动性暂缓。</p>
          {genesisTopics.length === 0 && <p>尚无 Genesis Topic。</p>}
          {genesisTopics.map(topic => <article key={topic.genesis} className="rounded-xl border p-4 space-y-2">
            <h3 className="font-bold">{topic.title}</h3>
            <p>{["Genesis 交易中", "已毕业 · 正式市场", "未毕业 · 可退款"][topic.phase] ?? "未知阶段"}</p>
            {topic.phase === 0 && <p>留存资本 {formatUnits(topic.retained, topic.decimals)} / {formatUnits(topic.threshold, topic.decimals)} {topic.assetSymbol} · 锁定资本 {formatUnits(topic.capital, topic.decimals)}</p>}
            <a className="text-accent underline" href={`/explore/vault.html?vault=${encodeURIComponent(topic.vault)}`}>打开话题与交易</a>
          </article>)}
        </section>
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root")!;
const permissionlessWindow = window as typeof window & {
  __ocpPermissionlessRoot?: ReturnType<typeof ReactDOM.createRoot>;
};
permissionlessWindow.__ocpPermissionlessRoot ??=
  ReactDOM.createRoot(rootElement);
permissionlessWindow.__ocpPermissionlessRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
