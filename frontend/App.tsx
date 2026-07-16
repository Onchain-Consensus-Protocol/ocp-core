import React, { useState, useCallback } from 'react';
import { Simulation } from './components/Simulation';
import { ProtocolVisualizer } from './components/ProtocolVisualizer';
import { AIDemo } from './components/AIDemo';
import { InfraDemo } from './components/InfraDemo';
import { BridgeDemo } from './components/BridgeDemo';
import { Layers, GitCommit, Database, TrendingUp, Scale, Vote, Terminal, Sparkles, Landmark } from 'lucide-react';
import { Button } from './components/Button';
import { OCPMenu } from './components/OCPMenu';
import { LanguageToggle } from './components/LanguageToggle';
import { Language } from './types';
import { CONTENT } from './constants';
import ReactMarkdown from 'react-markdown';

type View = 'simulation' | 'mechanism' | 'moat' | 'ai-demo' | 'infra' | 'bridge';

const VIEWS: View[] = ['simulation', 'mechanism', 'moat', 'ai-demo', 'infra', 'bridge'];

function initialView(): View {
  if (typeof window === 'undefined') return 'simulation';
  const requested = new URLSearchParams(window.location.search).get('view') as View | null;
  return requested && VIEWS.includes(requested) ? requested : 'simulation';
}

function App() {
  const [lang, setLang] = useState<Language>('en');
  const [currentView, setCurrentView] = useState<View>(initialView);

  // Wallet state is purely for simulation demo (no real wallet connection)
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [balance, setBalance] = useState(10000);

  const t = CONTENT[lang].ui;

  // Simulation-only "wallet" connect: just toggles local demo state
  const connectWallet = useCallback(() => {
    setIsWalletConnected(true);
  }, []);

  return (
    <div className="min-h-screen flex flex-col selection:bg-accent/30 selection:text-white">

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 border-b border-border backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            <OCPMenu lang={lang} suffix="CORE" />

            <div className="flex items-center gap-4">
              <a
                href="/explore.html"
                className="inline-flex items-center gap-1.5 text-xs font-bold transition-all px-3 py-2 rounded-lg font-display text-accent border border-accent/50 hover:bg-accent/10 whitespace-nowrap"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.nav_vaults}</span>
              </a>

              <LanguageToggle lang={lang} setLang={setLang} />
            </div>
          </div>

        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative z-10 w-full overflow-x-hidden">

        {/* VIEW: SIMULATION */}
        {currentView === 'simulation' && (
          <div className="animate-fade-in">
            {/* Hero — 简洁白皮书风格 */}
            <section className="pt-20 pb-14 border-b border-border">
              <div className="max-w-3xl mx-auto px-4 text-center">
                <h1 className="text-3xl md:text-4xl font-display font-bold text-text tracking-wide mb-4 text-glow">
                  {t.hero_title_1}
                </h1>
                <div className="text-text-muted text-base leading-relaxed font-mono mb-8">
                  <ReactMarkdown
                    components={{
                      strong: ({ children, ...props }) => <strong className="text-text font-semibold" {...props}>{children}</strong>
                    }}
                  >
                    {t.hero_desc}
                  </ReactMarkdown>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="/explore.html"
                    className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-accent text-accent hover:bg-accent/10 transition-colors text-sm font-display font-bold"
                  >
                    <Landmark className="w-4 h-4 mr-2" />
                    {t.hero_btn_vaults}
                  </a>
                  <Button size="md" onClick={() => {
                    document.getElementById('sim-container')?.scrollIntoView({ behavior: 'smooth' });
                    if (!isWalletConnected) connectWallet();
                  }} variant="outline">
                    <Terminal className="w-3.5 h-3.5 mr-2" />
                    {t.hero_btn_demo}
                  </Button>
                </div>
              </div>
            </section>

            {/* Simulation Component */}
            <section id="sim-container" className="py-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <Simulation
                  lang={lang}
                  isWalletConnected={isWalletConnected}
                  balance={balance}
                  setBalance={setBalance}
                  connectWallet={connectWallet}
                />
              </div>
            </section>
          </div>
        )}

        {/* VIEW: AI DEMO */}
        {currentView === 'ai-demo' && (
          <section className="py-16 animate-fade-in min-h-[80vh]">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mb-10">
                <h2 className="text-2xl font-display font-bold text-text mb-2 tracking-wide text-glow">{t.ai_demo_title}</h2>
                <p className="text-text-muted text-sm font-mono">{t.ai_demo_subtitle}</p>
              </div>
              <AIDemo lang={lang} />
            </div>
          </section>
        )}

        {/* VIEW: BRIDGE + 事实验证层 */}
        {currentView === 'bridge' && (
          <section className="py-16 animate-fade-in min-h-[80vh]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mb-10">
                <h2 className="text-2xl font-display font-bold text-text mb-2 tracking-wide text-glow">
                  {t.bridge_demo_title}
                </h2>
                <p className="text-text-muted text-sm font-mono">
                  {t.bridge_demo_subtitle}
                </p>
              </div>
              <BridgeDemo lang={lang} />
            </div>
          </section>
        )}

        {/* VIEW: INFRA / 4.2 演示 */}
        {currentView === 'infra' && (
          <section className="py-16 animate-fade-in min-h-[80vh]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mb-10">
                <h2 className="text-2xl font-display font-bold text-text mb-2 tracking-wide text-glow">
                  {lang === 'zh'
                    ? '同步时代：事实同步性与经济预最终性'
                    : 'Sync Era: Truth Synchronicity & Economic Pre-finality'}
                </h2>
                <p className="text-text-muted text-sm font-mono">
                  {lang === 'zh'
                    ? '本页演示白皮书第 4.2 节：OCP 如何在 Based Rollup 环境下，为外部事实提供秒级的经济预最终性与 INVALID 断路器。'
                    : 'This view illustrates §4.2 of the whitepaper: how OCP provides seconds-level economic pre-finality and an INVALID circuit breaker for external facts in a Based Rollup environment.'}
                </p>
              </div>
              <InfraDemo lang={lang} />
            </div>
          </section>
        )}

        {/* VIEW: MECHANISM */}
        {currentView === 'mechanism' && (
          <section className="py-16 animate-fade-in">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col lg:flex-row gap-12 items-start mb-16">
                <div className="lg:w-1/2 sticky top-24">
                  <h2 className="text-2xl font-display font-bold text-text mb-6 tracking-wide text-glow">
                    {t.mech_title}
                  </h2>
                  <div className="prose prose-neutral prose-sm text-text-muted leading-7 font-mono max-w-none">
                    <p className="mb-4">
                      {t.mech_p1}
                    </p>
                    <p className="mb-6 pl-4 border-l-2 border-accent text-text italic">
                      {t.mech_p2}
                    </p>
                    <ul className="space-y-4 mt-8">
                      <li className="flex gap-4 items-start p-4 border border-border rounded-xl bg-transparent hover:border-accent/50 transition-colors">
                        <Layers className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                        <span>{t.mech_li1}</span>
                      </li>
                      <li className="flex gap-4 items-start p-4 border border-border rounded-xl bg-transparent hover:border-accent/50 transition-colors">
                        <Database className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                        <span>{t.mech_li2}</span>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="lg:w-1/2 w-full">
                  <ProtocolVisualizer lang={lang} />
                </div>
              </div>

              {/* Applications */}
              <div className="border-t border-border pt-10">
                <h3 className="text-sm font-display font-bold text-text-muted uppercase tracking-wider mb-6">Modules & Use Cases</h3>
                <div className="flex flex-col gap-3">

                  <div className="group flex flex-col sm:flex-row gap-4 p-5 border border-border rounded-lg hover:border-accent transition-colors cursor-pointer" onClick={() => setCurrentView('ai-demo')}>
                    <div className="flex items-center gap-3 shrink-0">
                      <Sparkles className="w-5 h-5 text-accent" />
                      <h3 className="font-display font-bold text-text text-base">{t.app_ai}</h3>
                      <span className="text-[10px] font-mono text-accent border border-accent/50 px-1.5 py-0.5 rounded">Demo</span>
                    </div>
                    <p className="text-text-muted text-sm font-mono leading-relaxed sm:pl-0 pl-8">{t.app_ai_desc}</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 p-5 border border-border rounded-lg hover:border-accent transition-colors">
                    <div className="flex items-center gap-3 shrink-0">
                      <TrendingUp className="w-5 h-5 text-accent" />
                      <h3 className="font-display font-bold text-text text-base">{t.app_pred}</h3>
                    </div>
                    <p className="text-text-muted text-sm font-mono leading-relaxed sm:pl-0 pl-8">{t.app_pred_desc}</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 p-5 border border-border rounded-lg hover:border-accent-2 transition-colors">
                    <div className="flex items-center gap-3 shrink-0">
                      <Scale className="w-5 h-5 text-accent-2" />
                      <h3 className="font-display font-bold text-text text-base">{t.app_arb}</h3>
                    </div>
                    <p className="text-text-muted text-sm font-mono leading-relaxed sm:pl-0 pl-8">{t.app_arb_desc}</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 p-5 border border-border rounded-lg hover:border-accent transition-colors">
                    <div className="flex items-center gap-3 shrink-0">
                      <Vote className="w-5 h-5 text-accent" />
                      <h3 className="font-display font-bold text-text text-base">{t.app_gov}</h3>
                    </div>
                    <p className="text-text-muted text-sm font-mono leading-relaxed sm:pl-0 pl-8">{t.app_gov_desc}</p>
                  </div>

                </div>
              </div>
            </div>
          </section>
        )}

        {/* VIEW: HISTORY LEDGER */}
        {currentView === 'moat' && (
          <section className="py-20 animate-fade-in min-h-[80vh]">
            <div className="max-w-4xl mx-auto px-4 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-transparent border border-border mb-8 shadow-lg">
                <GitCommit className="w-10 h-10 text-accent" />
              </div>
              <h2 className="text-2xl font-display font-bold text-text mb-6 tracking-wide text-glow">
                {t.moat_title}
              </h2>
              <p className="text-text-muted text-lg mb-16 leading-relaxed max-w-2xl mx-auto font-mono">
                {t.moat_desc}
              </p>

              <div className="grid gap-6 text-left">
                <div className="bg-transparent p-8 rounded-xl border border-border hover:border-accent hover:shadow-glow transition-all duration-300">
                  <h4 className="text-xl font-display font-bold text-text mb-3">{t.moat_card1_title}</h4>
                  <p className="text-text-muted text-sm leading-relaxed font-mono">{t.moat_card1_desc}</p>
                </div>
                <div className="bg-transparent p-8 rounded-xl border border-border hover:border-accent-2 hover:shadow-glow-purple transition-all duration-300">
                  <h4 className="text-xl font-display font-bold text-text mb-3">{t.moat_card2_title}</h4>
                  <p className="text-text-muted text-sm leading-relaxed font-mono">{t.moat_card2_desc}</p>
                </div>
                <div className="bg-transparent p-8 rounded-xl border border-border hover:border-accent hover:shadow-glow transition-all duration-300">
                  <h4 className="text-xl font-display font-bold text-text mb-3">{t.moat_card3_title}</h4>
                  <p className="text-text-muted text-sm leading-relaxed font-mono">{t.moat_card3_desc}</p>
                </div>
              </div>
            </div>
          </section>
        )}

      </main>

      <footer className="py-8 border-t border-border bg-transparent">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="font-display font-medium text-text text-xs tracking-wide">OCP</span>
          <span className="text-text-muted text-xs font-mono">{t.footer_rights}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
