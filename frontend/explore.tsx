/**
 * 独立入口：仅渲染「探索金库」页面，供人类查找与交互金库/预测市场。
 * 打开 explore.html 或部署后访问 /explore.html 即可单独使用本页。
 */
import React, { useState, Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { Shield, AlertTriangle } from "lucide-react";
import { PaperMarketApp } from "./components/paper/PaperMarketApp";
import {ClerkProvider,useAuth,useClerk} from "@clerk/react";
import { OCPMenu } from "./components/OCPMenu";
import { LanguageToggle } from "./components/LanguageToggle";


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

const publicKey=(import.meta as ImportMeta & {env:Record<string,string>}).env.VITE_CLERK_PUBLISHABLE_KEY;
function AuthenticatedMarket({lang}:{lang:"zh"|"en"}) {
 const {isLoaded,isSignedIn,getToken}=useAuth();const clerk=useClerk();
 return <PaperMarketApp lang={lang} authLoaded={isLoaded} signedIn={!!isSignedIn} getToken={getToken} onLogin={()=>void clerk.openSignIn({appearance:{elements:{socialButtonsBlock:{display:"none"},socialButtons:{display:"none"},dividerRow:{display:"none"}}}})} onLogout={()=>void clerk.signOut()}/>;
}
const noToken=async()=>null;
function ExploreStandalone() {
  const [lang, setLang] = useState<"zh" | "en">(new URLSearchParams(window.location.search).get("lang")==="zh"?"zh":"en");


  return (
    <div className="min-h-screen flex flex-col selection:bg-accent/30 selection:text-white">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-transparent border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <OCPMenu lang={lang} suffix="MARKET" />
            <div className="flex items-center gap-4">
              <LanguageToggle lang={lang} setLang={setLang} />
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <section aria-labelledby="market-purpose-title" className="mb-6 text-text">
            <h1 id="market-purpose-title" className="text-2xl font-bold">OCP Market</h1>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-text-muted">{lang === "zh" ? "围绕股票相关话题的多人虚拟交易模拟。体验 Genesis 启动与价格发现、毕业后的市场交易，以及 Core 质押和结果结算。仅使用虚拟资金，不进行真实股票买卖、充值或提现。" : "A multiplayer virtual trading simulation for stock-related topics. Explore Genesis price discovery, market trading after graduation, and Core staking and settlement. This simulation uses virtual funds, with no real stock trades, deposits or withdrawals."}</p>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">{lang === "zh" ? "登录用于识别你的模拟账户，保存虚拟余额、持仓和操作记录；应用说明与隐私政策无需登录即可查看。" : "Sign-in identifies your simulation account and saves your virtual balance, positions and activity. App information and the privacy policy are available without signing in."} <a href="/about.html" className="underline text-accent">{lang === "zh" ? "应用介绍" : "About OCP Market"}</a> · <a href="/privacy.html" className="underline text-accent">{lang === "zh" ? "隐私政策" : "Privacy policy"}</a></p>
          </section>
          {publicKey?<ClerkProvider publishableKey={publicKey} appearance={{elements:{socialButtonsBlock:{display:"none"},socialButtons:{display:"none"},dividerRow:{display:"none"}}}}><AuthenticatedMarket lang={lang}/></ClerkProvider>:<PaperMarketApp lang={lang} authLoaded signedIn={false} getToken={noToken} onLogin={()=>{}} onLogout={()=>{}} authAvailable={false}/>}
        </div>
      </main>
      <footer className="py-6 border-t border-border bg-[#0b0c11]/60">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-2 opacity-60">
            <Shield className="w-5 h-5 text-accent" />
            <span className="font-display font-bold text-text text-sm tracking-widest">OCP MARKET</span>
          </div>
          <a href="/privacy.html" className="text-xs underline text-text-muted">{lang === "zh" ? "隐私政策" : "Privacy policy"}</a>
          <span className="text-text-muted text-xs font-mono">{lang === "zh" ? "多人模拟 · 仅使用虚拟资金" : "Multiplayer simulation · Virtual funds only."}</span>
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
