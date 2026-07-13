/**
 * 独立入口：仅渲染「探索金库」页面，供人类查找与交互金库/预测市场。
 * 打开 explore.html 或部署后访问 /explore.html 即可单独使用本页。
 */
import React, { useState, Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { Shield, AlertTriangle } from "lucide-react";
import { ExploreView } from "./components/ExploreView";
import { OCPMenu } from "./components/OCPMenu";
import { WalletButton } from "./components/WalletButton";
import { useWallet } from "./useWallet";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: unknown }> {
  state = { hasError: false, error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-danger mb-4" />
          <h2 className="text-lg font-display font-bold text-text mb-2">页面渲染出错</h2>
          <pre className="text-left text-xs font-mono text-danger bg-danger/10 p-4 rounded-lg max-w-xl overflow-auto">
            {err instanceof Error ? err.message : String(err)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function ExploreStandalone() {
  const [lang, setLang] = useState<"zh" | "en">("en");
  const wallet = useWallet();

  return (
    <div className="min-h-screen flex flex-col selection:bg-accent/30 selection:text-white">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-transparent border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <OCPMenu lang={lang} suffix="STAKE WAR" />
            <div className="flex items-center gap-4">
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
              <button
                onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
                className="flex items-center justify-center w-9 h-9 text-xs font-bold text-text-muted hover:text-accent hover:bg-white/10 border border-border hover:border-accent rounded-lg font-mono"
              >
                {lang === "zh" ? "EN" : "中"}
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <ExploreView
            lang={lang}
            isWalletConnected={wallet.connected}
            walletAddress={wallet.address}
            signer={wallet.signer}
            onConnectWallet={wallet.connectWallet}
          />
        </div>
      </main>
      <footer className="py-6 border-t border-border bg-[#0b0c11]/60">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-2 opacity-60">
            <Shield className="w-5 h-5 text-accent" />
            <span className="font-display font-bold text-text text-sm tracking-widest">OCP EXPLORER</span>
          </div>
          <span className="text-text-muted text-xs font-mono">{lang === "zh" ? "风险提示：请勿投入超过承受范围的资金" : "Do not invest more than you can afford to lose."}</span>
        </div>
      </footer>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ExploreStandalone />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
