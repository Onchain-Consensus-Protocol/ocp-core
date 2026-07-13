import React, { useState } from 'react';
import { Clock, Zap, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from './Button';
import type { Language } from '../types';

interface InfraDemoProps {
  lang: Language;
}

export const InfraDemo: React.FC<InfraDemoProps> = ({ lang }) => {
  const [stake, setStake] = useState(2000);
  const [scenario, setScenario] = useState<'normal' | 'oracle-fail' | 'dispute'>('normal');

  const revertCost = Math.round(stake * Math.log2(stake / 1000 + 1));
  const level =
    revertCost < 3000 ? (lang === 'zh' ? 'LOW · 低' : 'LOW') :
      revertCost < 7000 ? (lang === 'zh' ? 'MEDIUM · 中' : 'MEDIUM') :
        (lang === 'zh' ? 'HIGH · 高' : 'HIGH');

  const isZH = lang === 'zh';

  return (
    <div className="space-y-10">
      {/* 4.2.1 事实同步性 */}
      <section className="border border-border rounded-2xl p-6 bg-white/40 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-display font-bold tracking-wide text-text text-glow">
            {isZH ? '4.2.1 事实同步性（Truth Synchronicity）' : '4.2.1 Truth Synchronicity'}
          </h2>
        </div>
        <p className="text-sm text-text-muted font-mono mb-6">
          {isZH
            ? '对比 L2 执行、L1 最终性 与 外部事实确认的时间尺度，展示 OCP 如何在秒级提供可承诺的事实状态。'
            : 'Compare L2 execution, L1 finality, and external truth confirmation to show how OCP provides a seconds-level, economically committed truth state.'}
        </p>

        <div className="space-y-4">
          {/* L2 Execution */}
          <TimelineRow
            label={isZH ? 'L2 执行（ZK 证明）' : 'L2 Execution (ZK Proof)'}
            time={isZH ? '≈ 1–5 秒' : '≈ 1–5 sec'}
            color="bg-accent"
          />
          {/* L1 Finality */}
          <TimelineRow
            label={isZH ? 'L1 最终性' : 'L1 Finality'}
            time={isZH ? '≈ 5–15 分钟' : '≈ 5–15 min'}
            color="bg-accent/40"
          />
          {/* External Truth */}
          <TimelineRow
            label={isZH ? '外部事实确认（预言机 / 跨链）' : 'External Truth (Oracles / Cross-chain)'}
            time={isZH ? '≈ 10–60 分钟' : '≈ 10–60 min'}
            color="bg-border"
          />
          {/* OCP Layer */}
          <div className="mt-4 p-3 rounded-xl border border-accent/40 bg-accent/5 flex items-start gap-3">
            <Zap className="w-4 h-4 text-accent mt-0.5" />
            <p className="text-xs sm:text-sm text-text font-mono leading-relaxed">
              {isZH
                ? 'OCP 在固定截止前持续展示公开资本分布，为应用提供可观察但尚未终局的经济信号。'
                : 'Before the fixed deadline, OCP exposes a public capital distribution that applications may observe, but it is not final.'}
            </p>
          </div>
        </div>
      </section>

      {/* 4.2.2 经济预最终性 */}
      <section className="border border-border rounded-2xl p-6 bg-white/40 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-display font-bold tracking-wide text-text text-glow">
            {isZH ? '4.2.2 经济预最终性（Economic Pre-finality）' : '4.2.2 Economic Pre-finality'}
          </h2>
        </div>
        <p className="text-sm text-text-muted font-mono mb-4">
          {isZH
            ? '调整公开质押分布，观察改变严格多数需要多少新增资本；截止前数据仍可能变化。'
            : 'Adjust the public stake distribution and observe how much new capital changes the strict majority; all pre-deadline data remains non-final.'}
        </p>

        <div className="space-y-4">
          <label className="text-xs sm:text-sm font-mono text-text-muted flex justify-between">
            <span>{isZH ? '累积赢方质押 (cumulativeWinningStake)' : 'Cumulative Winning Stake'}</span>
            <span className="text-text font-semibold">{stake.toLocaleString()} USDC</span>
          </label>
          <input
            type="range"
            min={500}
            max={20000}
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm font-mono">
            <div>
              {isZH ? '逆转成本 ≈ ' : 'Revert Cost ≈ '}
              <span className="font-bold text-accent">{revertCost.toLocaleString()}</span> USDC
            </div>
            <div className="flex items-center gap-2">
              <span>{isZH ? '预确认最终性等级：' : 'Pre-confirmation Finality:'}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border border-accent text-accent bg-accent/5">
                {level}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4.2.3 INVALID 断路器 */}
      <section className="border border-border rounded-2xl p-6 bg-white/40 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-display font-bold tracking-wide text-text text-glow">
            {isZH
              ? '4.2.3 INVALID 作为同步断路器'
              : '4.2.3 INVALID as Synchronous Circuit Breaker'}
          </h2>
        </div>
        <p className="text-sm text-text-muted font-mono mb-4">
          {isZH
            ? '当命题没有二元严格多数时，Vault 落在 INVALID，并在 Vault 内按本金比例结算；下游回滚需由应用另行实现。'
            : 'Without a strict binary majority, the Vault settles INVALID and distributes its own pool pro rata; downstream rollback requires separate application logic.'}
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          <Button
            size="sm"
            variant={scenario === 'normal' ? 'primary' : 'ghost'}
            onClick={() => setScenario('normal')}
          >
            {isZH ? '正常数据流' : 'Normal Dataflow'}
          </Button>
          <Button
            size="sm"
            variant={scenario === 'oracle-fail' ? 'primary' : 'ghost'}
            onClick={() => setScenario('oracle-fail')}
          >
            {isZH ? '预言机故障' : 'Oracle Failure'}
          </Button>
          <Button
            size="sm"
            variant={scenario === 'dispute' ? 'primary' : 'ghost'}
            onClick={() => setScenario('dispute')}
          >
            {isZH ? '争议事件 / 多源冲突' : 'Disputed / Conflicting Feeds'}
          </Button>
        </div>

        <ScenarioDiagram scenario={scenario} lang={lang} />
      </section>
    </div>
  );
};

const TimelineRow: React.FC<{ label: string; time: string; color: string }> = ({ label, time, color }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
    <div className="w-full sm:w-52 text-xs sm:text-sm font-mono text-text-muted">{label}</div>
    <div className="flex-1 flex items-center gap-2">
      <div className={`h-2 rounded-full w-32 sm:w-56 ${color}`} />
      <span className="text-[11px] sm:text-xs font-mono text-text-muted whitespace-nowrap">{time}</span>
    </div>
  </div>
);

const ScenarioDiagram: React.FC<{ scenario: 'normal' | 'oracle-fail' | 'dispute'; lang: Language }> = ({
  scenario,
  lang,
}) => {
  const isZH = lang === 'zh';

  const commonClasses =
    'px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-mono flex items-center justify-center';

  const node = (label: string, variant: 'ok' | 'warn' | 'invalid') => {
    const variantClasses =
      variant === 'ok'
        ? 'border-accent text-accent'
        : variant === 'warn'
          ? 'border-amber-500 text-amber-600'
          : 'border-danger text-danger';
    return <div className={`${commonClasses} ${variantClasses}`}>{label}</div>;
  };

  if (scenario === 'normal') {
    return (
      <div className="space-y-3 text-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          {node(isZH ? 'ZK 执行成功' : 'ZK Execution OK', 'ok')}
          <span className="text-xs text-text-muted">→</span>
          {node(isZH ? 'OCP：YES / NO' : 'OCP: YES / NO', 'ok')}
          <span className="text-xs text-text-muted">→</span>
          {node(isZH ? '资金按结果结算' : 'Funds settle on result', 'ok')}
        </div>
        <p className="text-[11px] sm:text-xs text-text-muted font-mono">
          {isZH
            ? '正常情况下，OCP 直接放大 ZK 执行结果，提供经济意义上的最终性。'
            : 'In the normal case, OCP amplifies ZK execution results into economically final consensus.'}
        </p>
      </div>
    );
  }

  if (scenario === 'oracle-fail') {
    return (
      <div className="space-y-3 text-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          {node(isZH ? '输入被污染 / 预言机故障' : 'Input Polluted / Oracle Fails', 'warn')}
          <span className="text-xs text-text-muted">→</span>
          {node(isZH ? 'OCP：INVALID' : 'OCP: INVALID', 'invalid')}
          <span className="text-xs text-text-muted">→</span>
          {node(isZH ? 'Vault 内比例结算' : 'Pro-rata Vault Settlement', 'ok')}
        </div>
        <p className="text-[11px] sm:text-xs text-text-muted font-mono">
          {isZH
            ? 'OCP 只输出 Vault 的终局结果，不会自动退款或回滚外部系统。'
            : 'OCP outputs the Vault result only; it does not automatically refund or roll back external systems.'}
        </p>
      </div>
    );
  }

  // dispute
  return (
    <div className="space-y-3 text-center">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        {node(isZH ? '多源数据冲突 / 争议事件' : 'Conflicting Feeds / Dispute', 'warn')}
        <span className="text-xs text-text-muted">→</span>
        {node(isZH ? '公开质押 · 固定截止' : 'Public stake · Fixed deadline', 'warn')}
        <span className="text-xs text-text-muted">→</span>
        {node(isZH ? 'OCP：YES / NO / INVALID' : 'OCP: YES / NO / INVALID', 'ok')}
      </div>
      <p className="text-[11px] sm:text-xs text-text-muted font-mono">
        {isZH
          ? '当命题存在歧义时，参与者可在截止前直接选择 INVALID。'
          : 'When a proposition is ambiguous, participants may stake INVALID directly before the fixed deadline.'}
      </p>
    </div>
  );
};
