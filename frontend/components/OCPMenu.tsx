import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  ChevronDown,
  Github,
  GitCommit,
  Home,
  Sparkles,
  Twitter,
  Waypoints,
} from "lucide-react";

import type { Language } from "../types";

const PRIMARY_LINKS = [
  { view: "simulation", zh: "开始体验", en: "Start Playing", icon: Home },
  { view: "mechanism", zh: "机制", en: "Mechanism", icon: BookOpen },
] as const;

const FUTURE_VISION_LINKS = [
  { view: "ai-demo", zh: "AI 对齐演示", en: "AI Alignment", icon: Sparkles },
  { view: "infra", zh: "同步 / 预最终性", en: "Sync / Pre-finality", icon: Activity },
  { view: "bridge", zh: "桥 + 事实验证层", en: "Bridge + Truth Layer", icon: Waypoints },
  { view: "moat", zh: "历史账本", en: "History Ledger", icon: GitCommit },
] as const;

/** 全站统一的 OCP 产品菜单，避免未来愿景入口占满主导航。 */
export function OCPMenu({ lang, suffix }: { lang: Language; suffix?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 sm:gap-3 group text-left whitespace-nowrap"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <img src="/logo.png" alt="OCP" className="w-8 h-8 rounded-md object-contain transition-transform group-hover:scale-105 shrink-0" />
        <span className="font-display font-bold text-text text-lg md:text-xl tracking-wide group-hover:text-accent transition-colors text-glow shrink-0">
          OCP
          {suffix && <span className="text-text-muted font-normal text-sm ml-1 hidden sm:inline">/ {suffix}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+12px)] z-[70] w-72 rounded-lg border border-border bg-white shadow-xl p-2"
        >
          {PRIMARY_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.view}
                href={`/?view=${link.view}`}
                role="menuitem"
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-display font-bold text-text-muted hover:text-accent hover:bg-accent/5 transition-colors"
              >
                <Icon className="w-4 h-4 shrink-0" />
                {lang === "zh" ? link.zh : link.en}
              </a>
            );
          })}
          <details className="group/future">
            <summary
              role="menuitem"
              className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2.5 text-sm font-display font-bold text-text-muted hover:text-accent hover:bg-accent/5 transition-colors"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="flex-1">{lang === "zh" ? "未来愿景" : "Future Vision"}</span>
              <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-open/future:rotate-180" />
            </summary>
            <div role="menu" className="ml-4 border-l border-border pl-2">
              {FUTURE_VISION_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.view}
                    href={`/?view=${link.view}`}
                    role="menuitem"
                    className="flex items-center gap-3 rounded-md px-3 py-2 text-xs font-display font-bold text-text-muted hover:text-accent hover:bg-accent/5 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {lang === "zh" ? link.zh : link.en}
                  </a>
                );
              })}
            </div>
          </details>
          <div className="my-2 border-t border-border" />
          <a
            href="https://x.com/ocp_protocol"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-display font-bold text-text-muted hover:text-accent hover:bg-accent/5 transition-colors"
          >
            <Twitter className="w-4 h-4" />
            X / @ocp_protocol
          </a>
          <a
            href="https://github.com/Onchain-Consensus-Protocol/ocp-core"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-display font-bold text-text-muted hover:text-accent hover:bg-accent/5 transition-colors"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
        </div>
      )}
    </div>
  );
}
