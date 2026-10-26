/**
 * 独立入口：仅渲染「探索金库」页面，供人类查找与交互金库/预测市场。
 * 打开 explore.html 或部署后访问 /explore.html 即可单独使用本页。
 */
import React, { useState, Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { Shield, AlertTriangle } from "lucide-react";
import { useSiteTheme } from "./components/ThemeToggle";
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
  const theme = useSiteTheme();


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
          {publicKey?<ClerkProvider publishableKey={publicKey} appearance={{variables:{colorBackground:theme === 'dark' ? '#15181d' : '#ffffff',colorForeground:theme === 'dark' ? '#edeef0' : '#0f172a',colorMutedForeground:theme === 'dark' ? '#9ba3b1' : '#64748b',colorInput:theme === 'dark' ? '#1b1f26' : '#ffffff',colorInputForeground:theme === 'dark' ? '#edeef0' : '#0f172a',colorPrimary:theme === 'dark' ? '#ff9454' : '#ea580c'},elements:{socialButtonsBlock:{display:"none"},socialButtons:{display:"none"},dividerRow:{display:"none"}}}}><AuthenticatedMarket lang={lang}/></ClerkProvider>:<PaperMarketApp lang={lang} authLoaded signedIn={false} getToken={noToken} onLogin={()=>{}} onLogout={()=>{}} authAvailable={false}/>}
        </div>
      </main>
      <footer className="py-6 border-t border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-2 opacity-60">
            <Shield className="w-5 h-5 text-accent" />
            <span className="font-display font-bold text-text text-sm tracking-widest">OCP MARKET</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <a href="/about.html" className="underline hover:text-accent">{lang === "zh" ? "应用介绍" : "About OCP Market"}</a>
            <a href="/privacy.html" className="underline hover:text-accent">{lang === "zh" ? "隐私政策" : "Privacy policy"}</a>
          </div>
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
