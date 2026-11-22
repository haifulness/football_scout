import { useMemo, useState } from 'react';
import { formatDate, makeDate, toParts, type GameDate } from '../../engine/core/calendar';
import type { CalendarEntry, CalendarKind, HomeLink } from '../../engine/views';
import { Loading } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame, type Route } from '../store/game-store';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** What each kind looks like, and the filter it belongs to. */
const KIND: Record<CalendarKind, { label: string; color: string; group: Group }> = {
  window: { label: 'Transfer window', color: 'var(--color-flood-400)', group: 'windows' },
  'deadline-day': { label: 'Deadline day', color: 'var(--color-flood-400)', group: 'windows' },
  season: { label: 'League season', color: 'var(--color-mist-400)', group: 'season' },
  event: { label: 'Scouting event', color: 'var(--color-sky-400)', group: 'events' },
  brief: { label: 'Brief or sale due', color: 'var(--color-grass-400)', group: 'yours' },
  answer: { label: 'Waiting for your answer', color: 'var(--color-alert-400)', group: 'yours' },
  work: { label: 'Work in progress', color: 'var(--color-good-400)', group: 'yours' },
};
type Group = 'windows' | 'season' | 'events' | 'yours';
const GROUPS: { id: Group; label: string; color: string }[] = [
  { id: 'yours', label: 'Your deadlines', color: 'var(--color-grass-400)' },
  { id: 'events', label: 'Scouting events', color: 'var(--color-sky-400)' },
  { id: 'windows', label: 'Transfer windows', color: 'var(--color-flood-400)' },
  { id: 'season', label: 'League season', color: 'var(--color-mist-400)' },
];

const toRoute = (l: HomeLink) => (l.id ? { screen: l.screen, id: l.id } : { screen: l.screen }) as Route;
/** Monday = 0. */
const weekday = (d: GameDate) => (new Date(d * 86_400_000).getUTCDay() + 6) % 7;
const covers = (e: CalendarEntry, d: GameDate) => d >= e.start && d <= (e.end ?? e.start);
const isSpan = (e: CalendarEntry) => e.end !== undefined && e.end > e.start;

/** One month at a time: windows and events as bands across the days, deadlines on their day, and an agenda below. */
export function CalendarScreen() {
  const cal = useEngineQuery(() => engine.getCalendar(), []);
  const navigate = useGame((s) => s.navigate);
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<GameDate>();
  const [hidden, setHidden] = useState<Set<Group>>(new Set());

  const today = cal?.today;
  const month = useMemo(() => {
    if (today === undefined) return undefined;
    const t = toParts(today);
    const m0 = t.month - 1 + offset;
    const year = t.year + Math.floor(m0 / 12);
    const month = ((m0 % 12) + 12) % 12;
    const first = makeDate(year, month + 1, 1);
    const days = makeDate(year + (month === 11 ? 1 : 0), ((month + 1) % 12) + 1, 1) - first;
    return { year, month, first, days };
  }, [today, offset]);

  if (!cal || !month || today === undefined) return <Loading label="Opening the calendar" />;

  const shown = cal.entries.filter((e) => !hidden.has(KIND[e.kind].group));
  const last = (month.first + month.days - 1) as GameDate;
  const inMonth = shown.filter((e) => e.start <= last && (e.end ?? e.start) >= month.first);
  const lead = weekday(month.first);
  const cells: (GameDate | undefined)[] = [...Array(lead).fill(undefined), ...Array.from({ length: month.days }, (_, i) => (month.first + i) as GameDate)];
  while (cells.length % 7) cells.push(undefined);

  const agenda = picked !== undefined ? shown.filter((e) => covers(e, picked)) : inMonth;
  const open = (e: CalendarEntry) => e.link && navigate(toRoute(e.link));
  const toggle = (g: Group) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="panel-title text-flood-300">Your season at a glance</div>
          <h1 className="font-display text-5xl font-bold uppercase leading-none">Calendar</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-ghost px-3 py-1.5" onClick={() => (setOffset((o) => o - 1), setPicked(undefined))} aria-label="Previous month">
            ‹
          </button>
          <div className="min-w-[150px] text-center font-display text-xl font-semibold uppercase">
            {MONTHS[month.month]} {month.year}
          </div>
          <button className="btn-ghost px-3 py-1.5" onClick={() => (setOffset((o) => o + 1), setPicked(undefined))} aria-label="Next month">
            ›
          </button>
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={offset === 0} onClick={() => (setOffset(0), setPicked(undefined))}>
            Today
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show on the calendar">
        {GROUPS.map((g) => {
          const on = !hidden.has(g.id);
          return (
            <button
              key={g.id}
              aria-pressed={on}
              onClick={() => toggle(g.id)}
              className={`chip flex items-center gap-1.5 ${on ? 'text-mist-100' : 'opacity-50'}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: on ? g.color : 'var(--color-night-500)' }} />
              {g.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <section className="panel overflow-hidden">
          <div className="grid grid-cols-7 border-b border-white/[0.05]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-mist-400">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (d === undefined) return <div key={`x${i}`} className="min-h-[56px] border-b border-r border-white/[0.03] bg-black/10 sm:min-h-[92px]" />;
              const here = shown.filter((e) => covers(e, d));
              const bands = here.filter(isSpan);
              const marks = here.filter((e) => !isSpan(e));
              const isToday = d === today;
              const isPicked = d === picked;
              const past = d < today;
              return (
                <button
                  key={d}
                  onClick={() => setPicked(isPicked ? undefined : d)}
                  aria-label={`${formatDate(d)}${here.length ? `: ${here.map((e) => e.label).join('; ')}` : ''}`}
                  aria-pressed={isPicked}
                  className={`relative flex min-h-[56px] flex-col items-stretch gap-0.5 border-b border-r border-white/[0.04] p-1 text-left transition-colors hover:bg-white/[0.04] sm:min-h-[92px] ${isPicked ? 'bg-white/[0.06]' : ''} ${past ? 'opacity-60' : ''}`}
                >
                  <span
                    className={`num self-start rounded px-1 text-[12px] font-semibold ${isToday ? 'bg-grass-500 text-night-950' : 'text-mist-300'}`}
                  >
                    {toParts(d).day}
                  </span>
                  {bands.map((e) => {
                    const first = d === e.start;
                    const lastDay = d === e.end;
                    // Named where it starts and at the start of each week, so a band is never a mystery.
                    const named = first || weekday(d) === 0 || d === month.first;
                    return (
                      <span
                        key={e.key}
                        className={`-mx-1 flex h-1.5 items-center overflow-hidden px-1.5 sm:h-4 ${first ? 'ml-0 rounded-l-full' : ''} ${lastDay ? 'mr-0 rounded-r-full' : ''}`}
                        style={{ background: `color-mix(in srgb, ${KIND[e.kind].color} ${e.kind === 'window' ? 28 : 40}%, transparent)` }}
                        title={e.label}
                      >
                        {named && <span className="hidden truncate text-[10px] font-semibold leading-none text-mist-50 sm:inline">{e.label}</span>}
                      </span>
                    );
                  })}
                  {/* Labels on wider screens, dots on a phone. */}
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {marks.slice(0, 2).map((e) => (
                      <span key={e.key} className="flex items-center gap-1 truncate text-[10px] leading-tight text-mist-200">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND[e.kind].color }} />
                        <span className="truncate">{e.label}</span>
                      </span>
                    ))}
                    {marks.length > 2 && <span className="text-[10px] text-mist-400">+{marks.length - 2} more</span>}
                  </span>
                  <span className="flex flex-wrap gap-0.5 sm:hidden">
                    {marks.slice(0, 4).map((e) => (
                      <span key={e.key} className="h-1.5 w-1.5 rounded-full" style={{ background: KIND[e.kind].color }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel self-start overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
            <h3 className="panel-title">{picked !== undefined ? formatDate(picked) : `${MONTHS[month.month]} at a glance`}</h3>
            {picked !== undefined && (
              <button className="text-[11px] text-mist-400 hover:text-mist-100" onClick={() => setPicked(undefined)}>
                Whole month
              </button>
            )}
          </header>
          {agenda.length === 0 ? (
            <div className="p-6 text-center text-sm text-mist-400">{picked !== undefined ? 'Nothing on this day.' : 'Nothing this month.'}</div>
          ) : (
            <ul className="max-h-[560px] divide-y divide-white/[0.04] overflow-y-auto">
              {agenda.map((e) => {
                const days = e.start - today;
                return (
                  <li key={e.key}>
                    <button
                      disabled={!e.link}
                      onClick={() => open(e)}
                      className="flex w-full items-start gap-3 px-4 py-2 text-left enabled:hover:bg-white/[0.03] disabled:cursor-default"
                    >
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: KIND[e.kind].color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-mist-100">{e.label}</span>
                        <span className="block text-[11px] text-mist-400">
                          {formatDate(e.start)}
                          {isSpan(e) && ` – ${formatDate(e.end!)}`} · {KIND[e.kind].label}
                          {e.detail && ` · ${e.detail}`}
                        </span>
                      </span>
                      <span className="num shrink-0 text-[11px] text-mist-400">
                        {days === 0 ? 'today' : days > 0 ? `in ${days}d` : isSpan(e) && e.end! >= today ? 'on now' : `${-days}d ago`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
