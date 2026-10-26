import React, { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { Language } from '../types';

const subscribe = (notify: () => void) => {
  window.addEventListener('ocp-theme-change', notify);
  return () => window.removeEventListener('ocp-theme-change', notify);
};
const snapshot = () => document.documentElement.dataset.ocpTheme === 'light' ? 'light' : 'dark';
export const useSiteTheme = () => useSyncExternalStore(subscribe, snapshot, () => 'dark' as const);

export function ThemeToggle({ lang }: { lang: Language }) {
  const theme = useSiteTheme();
  const label = lang === 'zh' ? '切换日夜模式' : 'Toggle light / dark mode';
  return <button type="button" data-theme-toggle className="site-theme-toggle shrink-0" aria-label={label} title={label} aria-pressed={theme === 'dark'}>
    {theme === 'dark' ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
  </button>;
}
