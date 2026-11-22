import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { formatDate, type GameDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { FinancesView } from '../../engine/views';
import { Loading, Money, Panel, PosBadge, StatTile, useCultureLookup } from '../components/ui';
import { useSize } from '../components/use-size';
import { Crest } from '../visuals/crest';
import { ClubLink } from '../components/club-link';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

/**
 * Chart colours (validated with the dataviz palette checker against this app's
 * dark surface var(--color-night-850)): income and expenses are a polarity, so they use the
 * diverging pair's poles; the balance line is the single-series blue.
 */
const INCOME = '#3987e5';
const EXPENSE = '#e66767';

export function FinancesScreen() {
  const f = useEngineQuery(() => engine.getFinances(), []);
  if (!f) return <Loading label="Doing the books" />;
  const income = f.season.filter((r) => r.amount > 0 && r.kind !== 'starting-funds').reduce((s, r) => s + r.amount, 0);
  const expenses = -f.season.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const scouting = (f.career.find((r) => r.kind === 'signing-bonus')?.amount ?? 0) + (f.career.find((r) => r.kind === 'match-bonus')?.amount ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-flood-400">
          {f.seasonLabel} season · freelance rates (×{f.rates.matchMultiplier} match bonuses)
        </div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">Finances</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Balance" accent={f.money < 0 ? EXPENSE : INCOME} sub={f.debt ? `${f.debt.daysLeft} days to bankruptcy` : 'Cash in hand'}>
          <span className={f.money < 0 ? 'text-alert-400' : ''}>
            <Money value={f.money} animated />
          </span>
        </StatTile>
        <StatTile label="Season net" accent="var(--color-mist-300)" sub={`${formatUSD(income)} in · ${formatUSD(expenses)} out`}>
          <Money value={income - expenses} animated />
        </StatTile>
        <StatTile label="Earned scouting" accent="var(--color-flood-400)" sub="Signing + match bonuses, whole career">
          <Money value={scouting} animated />
        </StatTile>
        <StatTile label="Active placements" accent="var(--color-good-400)" sub={`${f.placements.length} signings in total`}>
          {f.placements.filter((p) => p.active).length}
        </StatTile>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_440px]">
        <Panel title="Balance over time">
          <BalanceChart history={f.history} />
        </Panel>
        <Panel
          title="Money in and out · this season"
          right={
            <span className="flex gap-3 text-[11px] text-mist-300">
              <Legend color={INCOME} label="Income" />
              <Legend color={EXPENSE} label="Expenses" />
            </span>
          }
        >
          <FlowChart rows={f.season.filter((r) => r.kind !== 'starting-funds')} />
        </Panel>
      </div>

      <PlacementsPanel placements={f.placements} />
      <LedgerPanel ledger={f.ledger} />
    </div>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
    {label}
  </span>
);

/** Single-series line (no legend: the title names it) with a crosshair tooltip. */
function BalanceChart({ history }: { history: FinancesView['history'] }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const pad = { l: 56, r: 16, t: 14, b: 26 };
  const w = size.width;
  const h = 220;
  const pts = history;
  const geo = useMemo(() => {
    if (!w || pts.length === 0) return undefined;
    const minX = pts[0]!.date,
      maxX = Math.max(pts.at(-1)!.date, minX + 7);
    const vals = pts.map((p) => p.money);
    const minY = Math.min(0, ...vals),
      maxY = Math.max(1, ...vals) * 1.08;
    const x = (d: number) => pad.l + ((d - minX) / (maxX - minX)) * (w - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY)) * (h - pad.t - pad.b);
    const ticks = niceTicks(minY, maxY, 4);
    return { x, y, ticks, minX, maxX };
  }, [w, pts]);

  return (
    <div ref={ref} className="relative px-2 py-3">
      {geo && (
        <svg
          width={w}
          height={h}
          className="block"
          onMouseLeave={() => setHover(undefined)}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const mx = e.clientX - rect.left;
            let best = 0;
            pts.forEach((p, i) => {
              if (Math.abs(geo.x(p.date) - mx) < Math.abs(geo.x(pts[best]!.date) - mx)) best = i;
            });
            setHover(best);
          }}
        >
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={geo.y(t)} y2={geo.y(t)} stroke="#ffffff" strokeOpacity={t === 0 ? 0.25 : 0.06} />
              <text x={pad.l - 8} y={geo.y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-mist-400)" className="num">
                {formatUSD(t)}
              </text>
            </g>
          ))}
          {pts.length > 1 && (
            <>
              <path
                d={`M${pts.map((p) => `${geo.x(p.date)},${geo.y(p.money)}`).join(' L')} L${geo.x(pts.at(-1)!.date)},${geo.y(0)} L${geo.x(pts[0]!.date)},${geo.y(0)} Z`}
                fill={INCOME}
                opacity={0.12}
              />
              <motion.path
                d={`M${pts.map((p) => `${geo.x(p.date)},${geo.y(p.money)}`).join(' L')}`}
                fill="none"
                stroke={INCOME}
                strokeWidth={2}
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9 }}
              />
            </>
          )}
          <text x={pad.l} y={h - 6} fontSize={11} fill="var(--color-mist-400)">
            {formatDate(pts[0]!.date as GameDate)}
          </text>
          <text x={w - pad.r} y={h - 6} fontSize={11} fill="var(--color-mist-400)" textAnchor="end">
            {formatDate(pts.at(-1)!.date as GameDate)}
          </text>
          {hover !== undefined && (
            <g pointerEvents="none">
              <line x1={geo.x(pts[hover]!.date)} x2={geo.x(pts[hover]!.date)} y1={pad.t} y2={h - pad.b} stroke="#ffffff" strokeOpacity={0.25} />
              <circle cx={geo.x(pts[hover]!.date)} cy={geo.y(pts[hover]!.money)} r={5} fill={INCOME} stroke="var(--color-night-850)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {geo && hover !== undefined && (
        <div
          className="pointer-events-none absolute top-2 rounded-md border border-white/10 bg-night-950/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(geo.x(pts[hover]!.date) + 12, w - 140) }}
        >
          <div className="text-mist-400">{formatDate(pts[hover]!.date as GameDate)}</div>
          <div className="num text-base font-bold text-mist-100">{formatUSD(pts[hover]!.money, { compact: false })}</div>
        </div>
      )}
      {pts.length < 2 && <div className="px-4 pb-2 text-xs text-mist-400">The line fills in week by week.</div>}
    </div>
  );
}

function niceTicks(min: number, max: number, n: number): number[] {
  const span = max - min || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => span / s <= n) ?? step * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / nice) * nice; v <= max; v += nice) out.push(Math.round(v));
  if (!out.includes(0) && min <= 0 && max >= 0) out.push(0);
  return out.sort((a, b) => a - b);
}

/** Diverging horizontal bars: income right, expenses left, labelled at the bar end. */
function FlowChart({ rows }: { rows: FinancesView['season'] }) {
  const [hover, setHover] = useState<string>();
  if (!rows.length) return <div className="p-8 text-center text-sm text-mist-400">No money has moved yet this season.</div>;
  const max = Math.max(...rows.map((r) => Math.abs(r.amount)));
  return (
    <ul className="space-y-1.5 px-4 py-4">
      {rows.map((r, i) => {
        const pct = (Math.abs(r.amount) / max) * 50;
        const positive = r.amount > 0;
        const inside = pct > 30;
        return (
          <li
            key={r.kind}
            className="relative grid grid-cols-[120px_1fr] items-center gap-2"
            onMouseEnter={() => setHover(r.kind)}
            onMouseLeave={() => setHover(undefined)}
          >
            <span className="truncate text-[12px] text-mist-300">{r.label}</span>
            <span className="relative h-6">
              <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
              <motion.span
                className="absolute top-1 h-4"
                style={{
                  background: positive ? INCOME : EXPENSE,
                  borderRadius: positive ? '0 4px 4px 0' : '4px 0 0 4px',
                  left: positive ? '50%' : undefined,
                  right: positive ? undefined : '50%',
                  opacity: hover && hover !== r.kind ? 0.45 : 1,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: i * 0.04 }}
              />
              <span
                className={`num absolute top-1 whitespace-nowrap text-[11px] leading-4 ${inside ? 'font-semibold text-night-950' : 'text-mist-100'}`}
                style={
                  inside
                    ? positive
                      ? { right: `calc(50% - ${pct}% + 6px)` }
                      : { left: `calc(50% - ${pct}% + 6px)` }
                    : positive
                      ? { left: `calc(50% + ${pct}% + 6px)` }
                      : { right: `calc(50% + ${pct}% + 6px)` }
                }
              >
                {positive ? '+' : '−'}
                {formatUSD(Math.abs(r.amount))}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PlacementsPanel({ placements }: { placements: FinancesView['placements'] }) {
  const cultureOf = useCultureLookup();
  const navigate = useGame((s) => s.navigate);
  return (
    <Panel title="Placements" right={<span className="text-[11px] text-mist-400">Match bonuses run for the player's first contract at the club</span>}>
      {placements.length === 0 ? (
        <div className="p-8 text-center text-sm text-mist-400">No signings yet. Every player you place keeps paying you as he plays.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-mist-400">
                <th className="py-2 pl-4 font-medium">Player</th>
                <th className="font-medium">Club</th>
                <th className="font-medium">Bonuses until</th>
                <th className="text-right font-medium">Signing bonus</th>
                <th className="pl-6 font-medium">Match bonuses</th>
                <th className="pr-4 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {placements.map((p) => {
                const parts = Object.entries(p.earnings).filter(([, v]) => v > 0) as [string, number][];
                return (
                  <tr key={p.id} className="data-row" onClick={() => p.player && navigate({ screen: 'player', id: p.player.id })}>
                    <td className="py-2 pl-4">
                      <span className="flex items-center gap-2.5">
                        {p.player && (
                          <Portrait
                            seed={p.player.portraitSeed}
                            culture={cultureOf(p.player.nationalityId)}
                            size={28}
                            age={p.player.age}
                            shirt={p.club.colors.primary}
                            trim={p.club.colors.secondary}
                            className="rounded"
                          />
                        )}
                        <span>
                          <span className="block font-medium">{p.player?.name ?? 'Retired'}</span>
                          <span className="flex items-center gap-1.5 text-[11px] text-mist-400">
                            <PosBadge pos={p.position} />
                            {p.stats ? `${p.stats.apps} apps · ${p.stats.goals} g · ${p.stats.assists} a` : ''}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <Crest club={p.club} size={16} />
                        <ClubLink club={p.club} />
                      </span>
                    </td>
                    <td className="text-[12px]">{p.active ? formatDate(p.expiresOn) : <span className="text-mist-400">Ended: {p.endReason}</span>}</td>
                    <td className="num text-right">{p.prospect ? <span className="text-mist-400">Prospect</span> : formatUSD(p.bonus)}</td>
                    <td className="pl-6">
                      <span className="flex flex-wrap gap-1">
                        {parts.length ? (
                          parts.map(([k, v]) => (
                            <span key={k} className="chip">
                              <span className="text-mist-400">{EARN_LABEL[k]}</span> <b className="num text-mist-100">{formatUSD(v)}</b>
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-mist-400">None yet</span>
                        )}
                      </span>
                    </td>
                    <td className="num pr-4 text-right text-base font-bold">{formatUSD(p.bonus + p.matchTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

const EARN_LABEL: Record<string, string> = {
  appearance: 'Apps',
  goals: 'Goals',
  assists: 'Assists',
  tackles: 'Tackles',
  cleanSheets: 'Clean sheets',
  captain: 'Captain',
};

function LedgerPanel({ ledger }: { ledger: FinancesView['ledger'] }) {
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const rows = ledger.filter((l) => filter === 'all' || (filter === 'in' ? l.amount > 0 : l.amount < 0));
  return (
    <Panel
      title="Ledger"
      right={
        <span className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
          {(['all', 'in', 'out'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 text-[11px] font-semibold ${filter === f ? 'bg-white/[0.1] text-mist-100' : 'text-mist-400'}`}
            >
              {f === 'all' ? 'All' : f === 'in' ? 'Income' : 'Expenses'}
            </button>
          ))}
        </span>
      }
    >
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((l, i) => (
              <tr key={i} className="border-b border-white/[0.04]">
                <td className="num w-28 py-1.5 pl-4 text-[12px] text-mist-400">{formatDate(l.date)}</td>
                <td className="text-mist-200">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: l.amount >= 0 ? INCOME : EXPENSE }} />
                  {l.label}
                </td>
                <td className="num pr-4 text-right font-semibold text-mist-100">
                  {l.amount >= 0 ? '+' : '−'}
                  {formatUSD(Math.abs(l.amount), { compact: false })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
