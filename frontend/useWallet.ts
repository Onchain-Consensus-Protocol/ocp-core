/**
 * 统一钱包 Hook：自动连接、网络检测、切换/添加 Base 主网。
 * 三个页面（explore、vault、App）共用，行为与其他 dApp 一致。
 */
import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, JsonRpcProvider, JsonRpcSigner } from "ethers";
import { config } from "./config";

// 目标网络的 EIP-3085 参数。本地 Permissionless 联调时由 VITE_* 指向 Anvil。
const TARGET_NETWORK_PARAMS = {
  chainId: `0x${config.chainId.toString(16)}`,
  chainName: config.chainName,
  nativeCurrency: {
    name: config.nativeCurrencyName,
    symbol: config.nativeCurrencySymbol,
    decimals: 18,
  },
  rpcUrls: [config.rpcUrl],
  ...(config.explorer ? { blockExplorerUrls: [config.explorer] } : {}),
};

interface Eip1193Provider {
  request: (a: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
}

function getEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { ethereum?: Eip1193Provider };
  return w.ethereum ?? null;
}

export interface WalletState {
  signer: JsonRpcSigner | null;
  address: string;
  connected: boolean;
  /** 当前钱包所处的链 ID（十进制），未知时为 null */
  chainId: number | null;
  /** 是否在目标网络（Base 主网） */
  onTargetNetwork: boolean;
}

export function useWallet() {
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [address, setAddress] = useState("");
  const [connected, setConnected] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);

  const targetChainId = config.chainId;

  // 用一个函数统一从 provider 拉取 signer + 地址 + chainId
  const syncFromProvider = useCallback(async (eth: Eip1193Provider) => {
    try {
      const provider = new BrowserProvider(eth as unknown as ConstructorParameters<typeof BrowserProvider>[0]);
      const network = await provider.getNetwork();
      const cid = Number(network.chainId);
      setChainId(cid);
      // 只有在目标网络时才取 signer，避免 ethers 在错误网络上抛错
      if (cid === targetChainId) {
        try {
          const s = await provider.getSigner();
          const a = await s.getAddress();
          setSigner(s);
          setAddress(a);
          setConnected(true);
        } catch {
          // 用户未授权账户，保持未连接
          setSigner(null);
          setAddress("");
          setConnected(false);
        }
      } else {
        // 在别的链上：保留 chainId 以便提示，但不建立 signer
        setSigner(null);
        setAddress("");
        setConnected(false);
      }
    } catch {
      setSigner(null);
      setAddress("");
      setConnected(false);
      setChainId(null);
    }
  }, [targetChainId]);

  // 1) 自动连接：页面加载时若已授权过账户，则静默恢复
  useEffect(() => {
    if (config.isLocalDev && window.sessionStorage.getItem("ocp-local-account") !== null) return;
    if (!targetChainId) return;
    const eth = getEthereum();
    if (!eth) return;
    (async () => {
      try {
        const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
        if (accounts && accounts.length > 0) {
          await syncFromProvider(eth);
        } else {
          // 没有授权账户，但仍读取 chainId 用于显示
          try {
            const cidHex = (await eth.request({ method: "eth_chainId" })) as string;
            setChainId(Number(cidHex));
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    })();
  }, [syncFromProvider]);

  // 2) 监听账户与网络变化
  useEffect(() => {
    if (!targetChainId) return;
    const eth = getEthereum();
    if (!eth?.on) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      if (config.isLocalDev && window.sessionStorage.getItem("ocp-local-account") !== null) return;
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setSigner(null);
        setAddress("");
        setConnected(false);
        return;
      }
      syncFromProvider(eth);
    };

    const handleChainChanged = () => {
      if (config.isLocalDev && window.sessionStorage.getItem("ocp-local-account") !== null) return;
      // 链变更后重新同步（钱包通常会自动刷新页面，这里兜底）
      syncFromProvider(eth);
    };

    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);
    return () => {
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
      eth.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [syncFromProvider]);

  // 3) 主动连接：请求账户 + 必要时切换/添加 Base 主网
  const connectWallet = useCallback(async () => {
    window.sessionStorage.removeItem("ocp-local-account");
    if (!targetChainId) return;
    const eth = getEthereum();
    if (!eth) {
      // 没装钱包：打开 MetaMask 下载页
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    try {
      await eth.request({ method: "eth_requestAccounts" });
      // 先尝试切到目标链
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: TARGET_NETWORK_PARAMS.chainId }],
        });
      } catch (switchError) {
        // 4902 = 钱包里没添加这条链，需要 add
        const e = switchError as { code?: number };
        if (e?.code === 4902 || e?.code === -32603) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [TARGET_NETWORK_PARAMS],
          });
        }
        // 其它错误（如用户拒绝切换）忽略：仍尝试在当前链建立连接
      }
      await syncFromProvider(eth);
    } catch {
      // 用户拒绝授权等
      setSigner(null);
      setAddress("");
      setConnected(false);
    }
  }, [syncFromProvider]);

  // DEV ONLY：直接使用 Anvil 暴露的第二个已解锁测试账户。
  // 这是独立入口，不读取或修改 MetaMask/Rabby 的账户、nonce 或授权状态。
  const connectLocalAccount = useCallback(async (accountIndex = 1) => {
    if (!config.isLocalDev) return;
    try {
      const provider = new JsonRpcProvider(config.rpcUrl);
      const network = await provider.getNetwork();
      const cid = Number(network.chainId);
      if (cid !== targetChainId) throw new Error("Local RPC chain mismatch");
      if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex > 9) throw new Error("Invalid local account");
      const localSigner = await provider.getSigner(accountIndex);
      // 仅保存公开的 Anvil 账户索引；页面跳转后重连，不保存钱包密钥。
      window.sessionStorage.setItem("ocp-local-account", String(accountIndex));
      setSigner(localSigner);
      setAddress(await localSigner.getAddress());
      setConnected(true);
      setChainId(cid);
    } catch {
      setSigner(null);
      setAddress("");
      setConnected(false);
      setChainId(null);
    }
  }, [targetChainId]);

  const connectLocalWallet = useCallback(() => connectLocalAccount(1), [connectLocalAccount]);
  useEffect(() => {
    if (!config.isLocalDev) return;
    const stored = window.sessionStorage.getItem("ocp-local-account");
    if (stored !== null) void connectLocalAccount(Number(stored));
  }, [connectLocalAccount]);

  // 4) 断开：dApp 侧无法真正撤销授权，仅清除本地状态
  const disconnectWallet = useCallback(() => {
    window.sessionStorage.removeItem("ocp-local-account");
    setSigner(null);
    setAddress("");
    setConnected(false);
  }, []);

  const onTargetNetwork = chainId === targetChainId;

  return {
    signer,
    address,
    connected,
    chainId,
    onTargetNetwork,
    targetChainId,
    connectWallet,
    connectLocalWallet,
    connectLocalAccount,
    disconnectWallet,
  };
}
