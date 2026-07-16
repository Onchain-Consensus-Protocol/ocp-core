import React from "react";

import type { Language } from "../types";

/** 与 Peer Review 一致的显式双选语言控件，当前语言始终可见。 */
export function LanguageToggle({ lang, setLang }: { lang: Language; setLang: (value: Language) => void }) {
  return (
    <div className="flex rounded-lg border border-border bg-white p-1 text-xs font-mono">
      <button type="button" className={`rounded-md px-3 py-1 transition-colors ${lang === "en" ? "bg-slate-900 text-white" : "text-text-muted hover:text-accent"}`} onClick={() => setLang("en")}>
        EN
      </button>
      <button type="button" className={`rounded-md px-3 py-1 transition-colors ${lang === "zh" ? "bg-slate-900 text-white" : "text-text-muted hover:text-accent"}`} onClick={() => setLang("zh")}>
        中文
      </button>
    </div>
  );
}
