import React from 'react';
import { CONTENT } from '../constants';
import { Anchor, Swords, Gavel } from 'lucide-react';
import { Language } from '../types';

const icons = {
  Anchor,
  Swords,
  Gavel
};

interface ProtocolVisualizerProps {
  lang: Language;
}

export const ProtocolVisualizer: React.FC<ProtocolVisualizerProps> = ({ lang }) => {
  const steps = CONTENT[lang].steps;

  return (
    <div className="grid md:grid-cols-3 gap-6 relative">
      {steps.map((step, idx) => {
        const Icon = icons[step.icon as keyof typeof icons];
        return (
          <div key={idx} className="relative bg-transparent border border-border hover:border-accent p-6 h-full flex flex-col items-start text-left rounded-xl transition-colors">
            <div className="flex items-center justify-between w-full mb-4">
              <div className="w-12 h-12 bg-transparent flex items-center justify-center rounded-lg border border-border">
                <Icon className="w-6 h-6 text-text" />
              </div>
              <span className="text-xs font-display font-bold text-text-muted border border-border px-2 py-1 rounded bg-transparent">
                0{idx + 1}
              </span>
            </div>
            <h3 className="text-lg font-display font-bold text-text mb-3 tracking-wide">{step.title}</h3>
            <p className="text-text-muted text-sm leading-relaxed font-mono">
              {step.desc}
            </p>
          </div>
        );
      })}
    </div>
  );
};