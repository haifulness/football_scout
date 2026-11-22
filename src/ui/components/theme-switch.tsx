import { useSyncExternalStore } from 'react';
import { THEMES, applyTheme, currentTheme, subscribeTheme } from '../theme/theme';

/** Pick the colour theme (kept in this browser). */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);
  return (
    <div className={`flex items-center gap-1 ${className}`} role="radiogroup" aria-label="Colour theme">
      {THEMES.map((t) => {
        const on = t.id === theme;
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={on}
            title={t.label}
            onClick={() => applyTheme(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              on ? 'border-grass-400/60 bg-grass-500/10 text-mist-100' : 'border-white/10 text-mist-400 hover:bg-white/[0.05]'
            }`}
          >
            <span className="flex overflow-hidden rounded-sm">
              {t.swatch.map((c) => (
                <span key={c} className="h-2.5 w-1.5" style={{ background: c }} />
              ))}
            </span>
            {t.short}
          </button>
        );
      })}
    </div>
  );
}
