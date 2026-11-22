import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { alpha } from '../theme/color';
import { useEffect, useState, type ReactNode } from 'react';
import { formatUSD } from '../../engine/core/money';
import type { ClubTier } from '../../engine/model/club';
import type { Position } from '../../engine/model/player';
import { useGame } from '../store/game-store';

/** Colour for a 1–100 rating, from red (poor) through amber to green and cyan (elite). */
export function ratingColor(ovr: number): string {
  if (ovr >= 85) return '#22d3ee';
  if (ovr >= 75) return 'var(--color-good-400)';
  if (ovr >= 65) return '#a3e635';
  if (ovr >= 55) return '#facc15';
  if (ovr >= 45) return '#fb923c';
  return 'var(--color-alert-400)';
}

/** Colour for a 1–20 attribute. */
export const attrColor = (v: number) => ratingColor(v * 5);

/**
 * Rating badge. With a range it shows your uncertainty ("62–70"); once you
 * know a player fully it collapses to a single number.
 */
export function OvrBadge({ ovr, range, size = 'md' }: { ovr: number; range?: [number, number]; size?: 'sm' | 'md' | 'lg' }) {
  const fuzzy = range && range[1] > range[0];
  const c = ratingColor(ovr);
  const cls = size === 'lg' ? 'h-14 min-w-14 px-2 text-3xl' : size === 'sm' ? 'h-6 min-w-8 px-1 text-sm' : 'h-8 min-w-10 px-1.5 text-lg';
  return (
    <span
      className={`num inline-flex items-center justify-center whitespace-nowrap rounded-md font-bold ${cls}`}
      style={{
        color: c,
        background: fuzzy ? `repeating-linear-gradient(135deg, ${alpha(c, '14')} 0 4px, ${alpha(c, '24')} 4px 8px)` : `${alpha(c, '1f')}`,
        boxShadow: `inset 0 0 0 1px ${alpha(c, fuzzy ? '33' : '55')}`,
      }}
      title={fuzzy ? `Your estimate: ${range[0]}–${range[1]}. Scout him to narrow it.` : undefined}
    >
      {fuzzy ? (
        <>
          {range[0]}
          <span className="mx-px opacity-60">–</span>
          {range[1]}
        </>
      ) : (
        ovr
      )}
    </span>
  );
}

/** How well you know a player, 0–100. */
export function KnowledgeMeter({ level, compact }: { level: number; compact?: boolean }) {
  const c = level >= 80 ? '#22d3ee' : level >= 60 ? 'var(--color-good-400)' : level >= 40 ? '#facc15' : 'var(--color-mist-400)';
  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? '' : 'min-w-24'}`} title={`Knowledge ${level}/100`}>
      <span className={`h-1.5 overflow-hidden rounded-full bg-white/[0.08] ${compact ? 'w-10' : 'w-16'}`}>
        <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${level}%`, background: c, boxShadow: `0 0 6px ${c}` }} />
      </span>
      <span className="num text-[11px] text-mist-400">{level}</span>
    </span>
  );
}

const POS_COLOR: Record<string, string> = { GK: 'var(--color-flood-500)', DEF: 'var(--color-sky-400)', MID: 'var(--color-good-400)', ATT: 'var(--color-alert-400)' };
const POS_GROUP: Record<Position, keyof typeof POS_COLOR> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  LWB: 'DEF',
  RWB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  LM: 'MID',
  RM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
};
export const positionColor = (p: Position) => POS_COLOR[POS_GROUP[p]]!;

export function PosBadge({ pos }: { pos: Position }) {
  const c = positionColor(pos);
  return (
    <span
      className="num inline-flex h-5 min-w-9 items-center justify-center rounded px-1 text-[12px] font-bold tracking-wide"
      style={{ color: c, background: `${alpha(c, '1a')}`, boxShadow: `inset 0 0 0 1px ${alpha(c, '44')}` }}
    >
      {pos}
    </span>
  );
}

const TIER_LABEL: Record<ClubTier, string> = { 1: 'Elite', 2: 'Top Flight', 3: 'Established', 4: 'Professional', 5: 'Semi-Pro' };
const TIER_COLOR: Record<ClubTier, string> = { 1: '#22d3ee', 2: 'var(--color-good-400)', 3: '#facc15', 4: '#fb923c', 5: 'var(--color-mist-300)' };
export function TierBadge({ tier, compact }: { tier: ClubTier; compact?: boolean }) {
  const c = TIER_COLOR[tier];
  return (
    <span
      className="num inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ color: c, background: `${alpha(c, '18')}`, boxShadow: `inset 0 0 0 1px ${alpha(c, '40')}` }}
    >
      T{tier}
      {!compact && <span className="font-semibold opacity-80">· {TIER_LABEL[tier]}</span>}
    </span>
  );
}

export function StrengthPips({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-2.5 w-1.5 rounded-sm ${i < value ? 'bg-flood-400 shadow-[0_0_6px_var(--color-flood-500)]' : 'bg-white/10'}`} />
      ))}
    </span>
  );
}

/** Attribute bar (1–20). `range` draws a fogged span once scouting knowledge lands. */
/**
 * Attribute bar (1–20). With fog, the known part is solid and the uncertain
 * span is a blurred band, which sharpens as you learn more.
 */
export function AttrBar({ label, value }: { label: string; value: number | [number, number] }) {
  const [lo, hi] = typeof value === 'number' ? [value, value] : value;
  const mid = (lo + hi) / 2;
  const c = attrColor(mid);
  const exact = lo === hi;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-[3px]">
      <span className="truncate text-[13px] text-mist-300">{label}</span>
      <span className={`num text-right font-bold ${exact ? 'w-6 text-[15px]' : 'text-[13px]'}`} style={{ color: c }}>
        {exact ? lo : `${lo}–${hi}`}
      </span>
      <div className="relative col-span-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${alpha(c, '88')}, ${c})` }}
          initial={{ width: 0 }}
          animate={{ width: `${(lo / 20) * 100}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
        {!exact && (
          <motion.div
            className="absolute inset-y-0 rounded-full blur-[1.5px]"
            style={{ background: `repeating-linear-gradient(90deg, ${alpha(c, '66')} 0 3px, ${alpha(c, '22')} 3px 6px)` }}
            initial={{ left: 0, width: 0, opacity: 0 }}
            animate={{ left: `${(lo / 20) * 100}%`, width: `${((hi - lo) / 20) * 100}%`, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </div>
    </div>
  );
}

/** Animated count-up number (respects reduced motion). */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US') }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span>{text}</motion.span>;
}

export const Money = ({ value, animated }: { value: number; animated?: boolean }) =>
  animated ? <CountUp value={value} format={(n) => formatUSD(Math.round(n))} /> : <>{formatUSD(value)}</>;

export function StatTile({ label, children, sub, accent }: { label: string; children: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="panel relative overflow-hidden px-4 py-3">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${alpha(accent ?? 'var(--color-good-400)', '88')}, transparent)` }} />
      <div className="panel-title text-[11px]">{label}</div>
      <div className="num mt-1 text-[26px] font-bold leading-none text-mist-100">{children}</div>
      {sub && <div className="mt-1 text-[11px] text-mist-400">{sub}</div>}
    </div>
  );
}

export function Panel({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
          <h3 className="panel-title">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/** Open/closed state remembered per browser (storage may be unavailable: then it just isn't remembered). */
function useRemembered(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(`collapse:${key}`);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(`collapse:${key}`, v ? '1' : '0');
    } catch {
      /* not remembered */
    }
  };
  return [value, set];
}

/** A titled section that folds away; closed by default, and remembers your choice. */
export function Collapsible({ id, title, count, children, inPanel }: { id: string; title: ReactNode; count?: number; children: ReactNode; inPanel?: boolean }) {
  const [open, setOpen] = useRemembered(id, false);
  const header = (
    <button
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-white/[0.03] ${inPanel ? 'border-t border-white/[0.06]' : ''}`}
    >
      <motion.span animate={{ rotate: open ? 90 : 0 }} className="text-[10px] text-mist-400">
        ▶
      </motion.span>
      <span className="panel-title">{title}</span>
      {count !== undefined && <span className="num text-[11px] text-mist-400">({count})</span>}
      <span className="ml-auto text-[11px] text-mist-400">{open ? 'Hide' : 'Show'}</span>
    </button>
  );
  const body = (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <div className={open ? 'border-t border-white/[0.05]' : ''}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return inPanel ? (
    <div>
      {header}
      {body}
    </div>
  ) : (
    <section className="panel">
      {header}
      {body}
    </section>
  );
}

/** Culture lookup for portraits, from the cached world summary. */
export function useCulture(countryId?: string): string | undefined {
  return useGame((s) => s.world?.countries.find((c) => c.id === countryId)?.culture);
}

export function useCultureLookup(): (countryId: string) => string | undefined {
  const countries = useGame((s) => s.world?.countries);
  return (id) => countries?.find((c) => c.id === id)?.culture;
}

/**
 * Whether a text field may grab focus when it appears: only with a mouse and keyboard. On a phone, focusing a
 * field pops the on-screen keyboard over whatever just opened, so there we wait for a tap.
 */
export function autoFocusText(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex h-64 items-center justify-center gap-3 text-mist-400">
      <span className="h-2 w-2 animate-ping rounded-full bg-grass-400" />
      <span className="panel-title">{label}</span>
    </div>
  );
}
