import React, { useState } from "react";
import { ChevronDown, CircleHelp } from "lucide-react";

import type { Language } from "../types";

const COPY = {
  zh: {
    title: "玩法说明",
    subtitle: "三步参与 Stake War",
    collapse: "收起玩法说明",
    expand: "展开玩法说明",
    steps: [
      ["选择命题", "进入一个 Vault，先确认命题内容、截止时间和最低质押额。"],
      ["选择方向", "截止前可选择 YES、NO 或 INVALID。同一地址只能选择一个方向，可以继续同侧追加，但不能撤回或换边。"],
      ["结算领取", "最终 YES、NO、INVALID 总资金中，YES 或 NO 必须严格超过 50% 才能获胜；均未超过 50%（包括刚好 50%）则终局为 INVALID。"],
    ],
    reward: "YES 或 NO 获胜时，胜方按本金比例分配资金池；INVALID 时，所有参与者按本金比例取回资金。截止时间固定，不会延长。",
  },
  en: {
    title: "How to Play",
    subtitle: "Join a Stake War in three steps",
    collapse: "Collapse instructions",
    expand: "Expand instructions",
    steps: [
      ["Choose", "Open a Vault and check the proposition, deadline, and minimum stake."],
      ["Take a side", "Choose YES, NO, or INVALID before the deadline. One address stays on one side; it may add there but cannot withdraw or switch."],
      ["Claim", "YES or NO must hold strictly more than 50% of final YES + NO + INVALID capital to win. Otherwise, including exactly 50%, the outcome is INVALID."],
    ],
    reward: "If YES or NO wins, winning capital shares the pool pro rata. If the result is INVALID, all participants recover funds pro rata. The deadline never extends.",
  },
} as const;

export function HowToPlay({ lang }: { lang: Language }) {
  const [open, setOpen] = useState(true);
  const copy = COPY[lang];

  return (
    <section className="mb-7 border-y border-border py-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between gap-4 text-left"
        aria-expanded={open}
        aria-label={open ? copy.collapse : copy.expand}
      >
        <span className="flex items-center gap-3">
          <CircleHelp className="w-5 h-5 text-accent" />
          <span>
            <span className="block text-sm font-display font-bold text-text">{copy.title}</span>
            <span className="block text-xs font-mono text-text-muted mt-0.5">{copy.subtitle}</span>
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="pt-5">
          <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {copy.steps.map(([title, description], index) => (
              <li key={title} className="flex gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full border border-accent text-accent text-xs font-mono font-bold shrink-0">
                  {index + 1}
                </span>
                <span>
                  <span className="block text-sm font-display font-bold text-text">{title}</span>
                  <span className="block mt-1 text-xs leading-5 font-mono text-text-muted">{description}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-5 pt-4 border-t border-border text-xs leading-5 font-mono text-text-muted">
            {copy.reward}
          </p>
        </div>
      )}
    </section>
  );
}
