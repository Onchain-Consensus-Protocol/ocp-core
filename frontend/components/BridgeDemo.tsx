import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Database, Bot, User, Building2, AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import type { Language } from '../types';

interface BridgeDemoProps {
  lang: Language;
}

type Outcome = 'yes' | 'no' | 'invalid' | null;

export const BridgeDemo: React.FC<BridgeDemoProps> = ({ lang }) => {
  const [scenario, setScenario] = useState<'idle' | 'released' | 'dispute' | 'invalid'>('idle');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const isZH = lang === 'zh';

  const handleNormal = () => {
    setScenario('released');
    setOutcome('yes');
  };

  const handleDispute = () => {
    setScenario('dispute');
    setOutcome('no');
  };

  const handleInvalid = () => {
    setScenario('invalid');
    setOutcome('invalid');
  };

  const handleReset = () => {
    setScenario('idle');
    setOutcome(null);
  };

  return (
    <div className="space-y-8">
      {/* 架构示意：桥（合作方）+ 事实验证层（OCP） */}
      <section className="border border-border rounded-2xl p-6 bg-white/40 shadow-sm">
        <h3 className="text-sm font-display font-bold text-text-muted uppercase tracking-wider mb-4">
          {isZH ? '架构示意' : 'Architecture'}
        </h3>
        <div className="flex flex-col md:flex-row items-stretch gap-6">
          {/* L1 / 金库 */}
          <div className="flex-1 border border-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-text font-display font-bold text-sm">
              <Database className="w-4 h-4 text-accent" />
              {isZH ? 'L1 金库' : 'L1 Vault'}
            </div>
            <p className="text-xs text-text-muted font-mono">
              {isZH ? '用户 1w + 桥押金 2w（桥方提供）' : 'User 1w + Bridge bond 2w'}
            </p>
          </div>
          <div className="flex items-center justify-center text-text-muted">
            <ArrowRight className="w-5 h-5 md:rotate-0 rotate-90" />
          </div>
          {/* 桥（合作方） */}
          <div className="flex-1 border border-accent/50 rounded-xl p-4 flex flex-col gap-2 bg-accent/5">
            <div className="flex items-center gap-2 text-text font-display font-bold text-sm">
              <Building2 className="w-4 h-4 text-accent" />
              {isZH ? '桥（合作方）' : 'Bridge (Partner)'}
            </div>
            <p className="text-xs text-text-muted font-mono">
              {isZH ? '秒放款、流动性、运维' : 'Instant release, liquidity, ops'}
            </p>
          </div>
          <div className="flex items-center justify-center text-text-muted">
            <ArrowRight className="w-5 h-5 md:rotate-0 rotate-90" />
          </div>
          {/* 事实验证层 OCP */}
          <div className="flex-1 border-2 border-accent rounded-xl p-4 flex flex-col gap-2 bg-accent/10">
            <div className="flex items-center gap-2 text-text font-display font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-accent" />
              {isZH ? '事实验证层（OCP）' : 'Fact Layer (OCP)'}
            </div>
            <p className="text-xs text-text-muted font-mono">
              {isZH ? '事件创建、质押/锁定、终局；getOutcome(eventId)' : 'Create event, stake/lock, finalize; getOutcome(eventId)'}
            </p>
          </div>
        </div>
      </section>

      {/* 演示：正常 vs 争议 */}
      <section className="border border-border rounded-2xl p-6 bg-white/40 shadow-sm">
        <h3 className="text-sm font-display font-bold text-text-muted uppercase tracking-wider mb-2">
          {isZH ? '演示' : 'Demo'}
        </h3>
        <p className="text-sm text-text-muted font-mono mb-6">
          {isZH
            ? '模拟一笔跨链：桥已创建 OCP 事件并秒放款。可选「无争议」「争议（机器人押 NO）」或「证据矛盾/链重组/超时 → INVALID」。'
            : 'Simulate one cross-chain: bridge created OCP event and released. Choose "no dispute", "dispute (robot NO)", or "evidence conflict / reorg / timeout → INVALID".'}
        </p>

        {scenario === 'idle' && (
          <div className="flex flex-wrap gap-3">
            <Button size="md" variant="primary" onClick={handleNormal}>
              {isZH ? '模拟正常（无争议，YES 赢）' : 'Normal (no dispute, YES wins)'}
            </Button>
            <Button size="md" variant="outline" onClick={handleDispute}>
              {isZH ? '模拟争议（机器人押 NO，NO 赢）' : 'Dispute (robot stakes NO, NO wins)'}
            </Button>
            <Button size="md" variant="outline" onClick={handleInvalid}>
              {isZH ? '模拟 INVALID（证据矛盾/链重组/超时）' : 'INVALID (evidence conflict / reorg / timeout)'}
            </Button>
          </div>
        )}

        {(scenario === 'released' || scenario === 'dispute' || scenario === 'invalid') && (
          <div className="space-y-6">
            {/* 事实验证层输出 */}
            <div className="rounded-xl border-2 border-accent bg-accent/5 p-4 font-mono text-sm">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-accent" />
                <span className="font-display font-bold text-text">
                  {isZH ? '事实验证层输出' : 'Fact Layer Output'}
                </span>
              </div>
              <div className="grid gap-2 text-xs sm:text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-text-muted">eventId</span>
                  <span className="text-text">0x7a3f...b2c1</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-text-muted">outcome</span>
                  <span className={
                    outcome === 'yes' ? 'text-success font-bold' :
                      outcome === 'no' ? 'text-danger font-bold' :
                        'text-amber-600 font-bold'
                  }>
                    {outcome === 'yes' ? 'YES' : outcome === 'no' ? 'NO' : 'INVALID'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-text-muted">getOutcome(eventId)</span>
                  <span className="text-accent">{isZH ? '→ 供 L2 / 桥合约读取' : '→ for L2 / bridge contract'}</span>
                </div>
              </div>
            </div>

            {/* 结果说明 */}
            <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-border">
              {outcome === 'yes' && (
                <>
                  <User className="w-8 h-8 text-success shrink-0" />
                  <div>
                    <p className="font-display font-bold text-text mb-1">
                      {isZH ? 'YES 赢：桥按规矩放款' : 'YES: Bridge released correctly'}
                    </p>
                    <p className="text-sm text-text-muted font-mono">
                      {isZH
                        ? '用户已在 L2 收到款；金库中用户 1w 给桥，桥押金退回桥。'
                        : 'User received on L2; user 1w to bridge from vault, bridge bond returned.'}
                    </p>
                  </div>
                </>
              )}
              {outcome === 'no' && (
                <>
                  <Bot className="w-8 h-8 text-accent shrink-0" />
                  <div>
                    <p className="font-display font-bold text-text mb-1">
                      {isZH ? 'NO 赢：桥未按规放款' : 'NO: Bridge did not release correctly'}
                    </p>
                    <p className="text-sm text-text-muted font-mono">
                      {isZH
                        ? '巡逻机器人押 NO 且 NO 赢。桥押金由用户与机器人分（用户拿回本金+补偿，机器人拿赏金）。'
                        : 'Robot staked NO and NO won. Bridge bond split: user (principal + compensation), robot (bounty).'}
                    </p>
                  </div>
                </>
              )}
              {outcome === 'invalid' && (
                <>
                  <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-display font-bold text-text mb-1">
                      {isZH ? 'INVALID：无法判定 YES 或 NO' : 'INVALID: Cannot determine YES or NO'}
                    </p>
                    <p className="text-sm text-text-muted font-mono">
                      {isZH
                        ? '证据矛盾、链重组、超时等，无法判 YES 或 NO。按约定规则处理：例如两方退质押（用户拿回本金，桥拿回押金），或部分罚没进金库。'
                        : 'Evidence conflict, chain reorg, timeout, etc. Rule applied: e.g. both refund (user gets principal, bridge gets bond) or partial slash to treasury.'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <Button size="sm" variant="ghost" onClick={handleReset}>
              {isZH ? '重置' : 'Reset'}
            </Button>
          </div>
        )}
      </section>

      <p className="text-xs text-text-muted font-mono text-center">
        {isZH
          ? '本演示仅说明桥与事实验证层的配合关系，不涉及真实资金。详见 docs/design/OCP_BRIDGE_APPLICATION.md'
          : 'This demo illustrates how the bridge and fact layer interact; no real funds. See docs/design/OCP_BRIDGE_APPLICATION.md'}
      </p>
    </div>
  );
};
