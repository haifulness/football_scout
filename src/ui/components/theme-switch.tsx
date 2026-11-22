import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { THEMES, applyTheme, currentTheme, subscribeTheme, type ThemeDef } from '../theme/theme';

const useTheme = () => useSyncExternalStore(subscribeTheme, currentTheme);

/** A tiny picture of a theme: its surfaces, text, main button and the colours that carry meaning. */
function Preview({ t }: { t: ThemeDef }) {
  const p = t.preview;
  return (
    <div className="rounded-md p-1.5" style={{ background: p.bg }} aria-hidden="true">
      <div className="rounded p-1.5" style={{ background: p.panel, boxShadow: `inset 0 0 0 1px ${p.line}` }}>
        <div className="h-1 w-8 rounded-full" style={{ background: p.faint }} />
        <div className="mt-1 h-1.5 w-14 rounded-full" style={{ background: p.text }} />
        <div className="mt-1.5 flex items-center gap-1">
          <span className="h-2.5 w-7 rounded-sm" style={{ background: p.main }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.good }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.gold }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.info }} />
        </div>
      </div>
    </div>
  );
}

/** Every theme as a card; picking one applies it at once. */
export function ThemeGrid({ columns = 2 }: { columns?: 1 | 2 | 3 }) {
  const theme = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`grid gap-2 ${columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
    >
      {THEMES.map((t) => {
        const on = t.id === theme;
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={on}
            onClick={() => applyTheme(t.id)}
            className={`rounded-lg border p-1.5 text-left transition-colors ${on ? 'border-grass-400/70 bg-grass-500/10' : 'border-white/10 hover:border-white/25 hover:bg-white/[0.04]'}`}
          >
            <Preview t={t} />
            <div className="mt-1.5 flex items-center gap-1 px-0.5 text-[12px] font-semibold text-mist-100">
              {t.label}
              {on && <span className="ml-auto text-[10px] font-normal text-grass-300">✓</span>}
            </div>
            <div className="px-0.5 text-[10px] leading-snug text-mist-400">{t.blurb}</div>
          </button>
        );
      })}
    </div>
  );
}

/** Sidebar control: the current theme, opening the full picker above it. */
export function ThemeSwitch() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const t = THEMES.find((x) => x.id === theme)!;
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md border border-white/10 px-2 py-1 text-[11px] text-mist-300 hover:bg-white/[0.05]"
      >
        <span className="flex overflow-hidden rounded-sm" aria-hidden="true">
          {[t.preview.bg, t.preview.main, t.preview.gold].map((c) => (
            <span key={c} className="h-2.5 w-1.5" style={{ background: c }} />
          ))}
        </span>
        <span className="truncate">Theme: {t.label}</span>
        <span className="ml-auto text-mist-500">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="panel absolute inset-x-0 bottom-full z-50 mb-2 bg-night-850 p-2">
          <ThemeGrid />
        </div>
      )}
    </div>
  );
}
