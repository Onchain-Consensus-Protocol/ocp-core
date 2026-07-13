/**
 * 统一钱包 Hook：自动连接、网络检测、切换/添加 Base 主网。
 * 三个页面（explore、vault、App）共用，行为与其他 dApp 一致。
 */
import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { config } from "./config";

// Base Mainnet 的 EIP-3085 chain 参数，用于 wallet_addEthereumChain
const BASE_MAINNET_PARAMS = {
  chainId: "0x2105", // 8453
  chainName: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"],
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
    const eth = getEthereum();
    if (!eth?.on) return;

    const handleAccountsChanged = (...args: unknown[]) => {
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
          params: [{ chainId: BASE_MAINNET_PARAMS.chainId }],
        });
      } catch (switchError) {
        // 4902 = 钱包里没添加这条链，需要 add
        const e = switchError as { code?: number };
        if (e?.code === 4902 || e?.code === -32603) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [BASE_MAINNET_PARAMS],
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

  // 4) 断开：dApp 侧无法真正撤销授权，仅清除本地状态
  const disconnectWallet = useCallback(() => {
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
    disconnectWallet,
  };
}
