import { formatUSD } from '../../engine/core/money';
import { useMemo } from 'react';
import { POSITIONS, type Position } from '../../engine/model/player';
import type { PlayerId } from '../../engine/core/ids';
import { PlayerTable } from '../components/player-table';
import { Loading, Panel, PosBadge } from '../components/ui';
import { engine } from '../store/engine-client';
import { DEFAULT_POOL_FILTERS, useEngineQuery, useGame, type PoolFilters } from '../store/game-store';

/** Your shortlist: everyone your searches turned up, plus players you added by hand. */
export function PoolScreen() {
  const pool = useEngineQuery(() => engine.getPool(), []);
  const { touch, navigate, poolFilters: f, setPoolFilters, searchFor, poolAdded, setPoolAdded } = useGame();
  const added = new Set(poolAdded?.ids ?? []);
  const { pos } = f;
  const setPos = (p: Position | 'all') => setPoolFilters({ pos: p });
  const rows = useMemo(() => {
    const q = fold(f.query.trim());
    return (pool ?? [])
      .filter(
        (p) =>
          (pos === 'all' || p.position === pos) &&
          (!q || fold(p.name).includes(q) || fold(p.club?.name ?? 'free agent').includes(q)) &&
          p.age >= f.age[0] &&
          p.age <= f.age[1] &&
          p.ovr >= f.minRating &&
          (f.maxValue === undefined || p.value <= f.maxValue) &&
          (f.maxWage === undefined || p.wage <= f.maxWage) &&
          (f.knowledge === 'any' || (f.knowledge === 'high' ? p.knowledge >= 60 : p.knowledge < 40)) &&
          (f.freshness === 'any' ||
            (f.freshness === 'old' ? p.freshness === 'ageing' || p.freshness === 'stale' : p.freshness === 'fresh')) &&
          (!f.starred || p.starred) &&
          (!f.assistant || p.report) &&
          (!f.freeAgents || !p.club) &&
          (!f.prodigies || p.prodigy),
      )
      .sort((a, b) => Number(b.starred) - Number(a.starred) || b.addedOn - a.addedOn);
  }, [pool, f, pos]);
  const active = JSON.stringify({ ...f, pos: 'all' }) !== JSON.stringify({ ...DEFAULT_POOL_FILTERS, pos: 'all' }) || pos !== 'all';
  if (!pool) return <Loading label="Opening your files" />;

  const star = async (id: PlayerId, v: boolean) => {
    await engine.setStarred(id, v);
    await touch();
  };
  const remove = async (id: PlayerId) => {
    await engine.removeFromPool(id);
    await touch();
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <div className="panel-title text-flood-400">{pool.length} players tracked</div>
          <h1 className="font-display text-5xl font-bold uppercase leading-none">Player Pool</h1>
        </div>
        <button className="btn-primary" onClick={() => navigate({ screen: 'search' })}>
          New search
        </button>
      </header>
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setPos('all')}
              className={`rounded px-2 py-0.5 text-[11px] font-semibold ${pos === 'all' ? 'bg-grass-500 text-night-950' : 'text-mist-300 hover:bg-white/[0.06]'}`}
            >
              All
            </button>
            {POSITIONS.filter((p) => pool.some((x) => x.position === p)).map((p) => (
              <button key={p} onClick={() => setPos(p)} className={`rounded ${pos === p ? 'ring-2 ring-grass-400' : 'opacity-70 hover:opacity-100'}`}>
                <PosBadge pos={p} />
              </button>
            ))}
          </span>
        }
        right={<span className="text-[11px] text-mist-400">{rows.length === pool.length ? `${pool.length} players` : `${rows.length} of ${pool.length}`}</span>}
      >
        {f.brief && (
          <div className="flex flex-wrap items-center gap-2 border-b border-flood-400/20 bg-flood-500/[0.06] px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-flood-300">Brief</span>
            <span className="text-sm font-semibold">{f.brief.label}</span>
            <span className="flex flex-wrap gap-1">
              {f.brief.summary.map((x) => (
                <span key={x} className="chip text-[11px] text-mist-200">
                  {x}
                </span>
              ))}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-mist-400">{rows.length ? `${rows.length} in your pool` : 'Nobody in your pool fits yet'}</span>
              <button className="btn-primary px-3 py-1 text-xs" onClick={() => f.brief && searchFor(f.brief.prefill)}>
                Expand the pool →
              </button>
              <button className="text-[11px] text-mist-400 hover:text-alert-400" onClick={() => (setPoolFilters({}), setPoolAdded(undefined))}>
                Clear brief
              </button>
            </span>
          </div>
        )}
        {poolAdded && poolAdded.ids.length > 0 && (
          <div className="flex items-center gap-2 border-b border-grass-400/20 bg-grass-500/[0.06] px-4 py-2 text-[12px] text-grass-200">
            <span>
              Search for {poolAdded.label} turned up <b>{poolAdded.ids.length}</b> player{poolAdded.ids.length > 1 ? 's' : ''}, marked <b>New</b> below.
            </span>
            <button className="ml-auto text-[11px] text-mist-400 hover:text-mist-100" onClick={() => setPoolAdded(undefined)}>
              Dismiss
            </button>
          </div>
        )}
        <FilterBar f={f} set={setPoolFilters} active={active} />
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist-400">
            {pool.length === 0 ? 'Your pool is empty. Run a search and the players it finds will appear here.' : 'No players match this view.'}
          </div>
        ) : (
          <PlayerTable
            rows={rows}
            showClub
            actions={(p) => (
              <span className="flex items-center justify-end gap-1">
                {added.has(p.id) && <span className="rounded bg-grass-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-night-950">New</span>}
                {p.report && (
                  <span
                    className="num rounded border border-grass-400/30 bg-grass-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-grass-300"
                    title={`${p.report.by} rates him ${p.report.rating}. Your own estimate may differ.`}
                  >
                    A {p.report.rating}
                  </span>
                )}
                <button
                  onClick={() => void star(p.id, !p.starred)}
                  className={`rounded px-1.5 text-lg leading-none ${p.starred ? 'text-flood-400' : 'text-mist-400 hover:text-flood-300'}`}
                  title={p.starred ? 'Unstar' : 'Star'}
                >
                  {p.starred ? '★' : '☆'}
                </button>
                <button onClick={() => void remove(p.id)} className="rounded px-1.5 text-xs text-mist-400 hover:text-alert-400" title="Remove from pool">
                  ✕
                </button>
              </span>
            )}
          />
        )}
      </Panel>
    </div>
  );
}

/** Lower-case and strip accents for name search. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const VALUE_CAPS: { label: string; value?: number }[] = [
  { label: 'Any value' },
  { label: '≤ $100k', value: 100_000 },
  { label: '≤ $500k', value: 500_000 },
  { label: '≤ $2M', value: 2_000_000 },
  { label: '≤ $10M', value: 10_000_000 },
  { label: '≤ $50M', value: 50_000_000 },
];
const WAGE_CAPS: { label: string; value?: number }[] = [
  { label: 'Any wage' },
  { label: '≤ $1k/wk', value: 1_000 },
  { label: '≤ $5k/wk', value: 5_000 },
  { label: '≤ $20k/wk', value: 20_000 },
  { label: '≤ $50k/wk', value: 50_000 },
  { label: '≤ $150k/wk', value: 150_000 },
];
function withCustom(caps: { label: string; value?: number }[], value: number | undefined, label: (v: number) => string) {
  return value === undefined || caps.some((c) => c.value === value)
    ? caps
    : [...caps, { label: label(value), value }].sort((a, b) => (a.value ?? -1) - (b.value ?? -1));
}

const control = 'rounded-lg border border-white/10 bg-night-950/70 px-2 py-1 text-xs text-mist-100 outline-none focus:border-grass-400/60';

function FilterBar({ f, set, active }: { f: PoolFilters; set: (f: Partial<PoolFilters>) => void; active: boolean }) {
  // A brief can set caps that aren't in the presets: show them as their own option.
  const valueCaps = withCustom(VALUE_CAPS, f.maxValue, (v) => `≤ ${formatUSD(v)}`);
  const wageCaps = withCustom(WAGE_CAPS, f.maxWage, (v) => `≤ ${formatUSD(v)}/wk`);
  const toggle = (key: 'starred' | 'assistant' | 'freeAgents' | 'prodigies', label: string) => (
    <button
      onClick={() => set({ [key]: !f[key] })}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${f[key] ? 'border-grass-400/60 bg-grass-500/15 text-grass-200' : 'border-white/10 text-mist-300 hover:border-white/25'}`}
    >
      {label}
    </button>
  );
  const num = (value: number, min: number, max: number, onChange: (v: number) => void, label: string) => (
    <input
      type="number"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
      className={`${control} num w-12 text-center`}
    />
  );
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
      <input
        value={f.query}
        onChange={(e) => set({ query: e.target.value })}
        placeholder="Name or club…"
        aria-label="Search the pool"
        className={`${control} w-44`}
      />
      <span className="flex items-center gap-1 text-[11px] text-mist-400">
        Age {num(f.age[0], 15, f.age[1], (v) => set({ age: [v, f.age[1]] }), 'Minimum age')}–
        {num(f.age[1], f.age[0], 40, (v) => set({ age: [f.age[0], v] }), 'Maximum age')}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-mist-400" title="Your estimate (middle of the range)">
        Rating ≥ {num(f.minRating, 0, 99, (v) => set({ minRating: v }), 'Minimum rating')}
      </span>
      <select
        className={control}
        aria-label="Maximum value"
        value={valueCaps.findIndex((v) => v.value === f.maxValue)}
        onChange={(e) => set({ maxValue: valueCaps[Number(e.target.value)]!.value })}
      >
        {valueCaps.map((v, i) => (
          <option key={v.label} value={i}>
            {v.label}
          </option>
        ))}
      </select>
      <select
        className={control}
        aria-label="Maximum wage"
        value={wageCaps.findIndex((v) => v.value === f.maxWage)}
        onChange={(e) => set({ maxWage: wageCaps[Number(e.target.value)]!.value })}
      >
        {wageCaps.map((v, i) => (
          <option key={v.label} value={i}>
            {v.label}
          </option>
        ))}
      </select>
      <select className={control} aria-label="Knowledge" value={f.knowledge} onChange={(e) => set({ knowledge: e.target.value as PoolFilters['knowledge'] })}>
        <option value="any">Any knowledge</option>
        <option value="high">Well known (60+)</option>
        <option value="low">Need scouting (&lt;40)</option>
      </select>
      <select className={control} aria-label="How current" value={f.freshness ?? 'any'} onChange={(e) => set({ freshness: e.target.value as PoolFilters['freshness'] })}>
        <option value="any">Any read</option>
        <option value="old">Needs a fresh look</option>
        <option value="fresh">Seen recently</option>
      </select>
      {toggle('starred', '★ Starred')}
      {toggle('assistant', 'From assistants')}
      {toggle('freeAgents', 'Free agents')}
      {toggle('prodigies', '✦ Prodigies')}
      {active && (
        <button onClick={() => set({})} className="ml-auto text-[11px] font-semibold text-mist-400 hover:text-alert-400">
          Clear filters
        </button>
      )}
    </div>
  );
}
