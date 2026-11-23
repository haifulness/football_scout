import { TournamentPanel } from '../components/tournament-panel';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { ScoutingEventView } from '../../engine/views';
import { Loading, OvrBadge, PosBadge } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

const KIND_ICON: Record<ScoutingEventView['kind'], string> = {
  'youth-tournament': '🏆',
  'u20-championship': '🌍',
  'trial-day': '⚽',
  showcase: '📋',
  international: '🏟',
};

/** The scouting calendar: where many players can be seen in one trip. */
export function EventsScreen() {
  const events = useEngineQuery(() => engine.getEvents(), []);
  if (!events) return <Loading label="Opening the calendar" />;
  const on = events.filter((e) => e.status === 'on');
  const upcoming = events.filter((e) => e.status === 'upcoming');
  const past = events.filter((e) => e.status === 'over');
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="panel-title text-flood-300">Scouting calendar</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">Events</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-300">
          Tournaments, trial days and a summer showcase: many players in one place. Be in the city while it's on and buy a ticket: you get to know everyone there at once,
          and can add them to your pool.
        </p>
      </div>
      <TournamentPanel />
      {on.length > 0 && <Group title="On now" events={on} />}
      <Group title="Coming up" events={upcoming} empty="Nothing else this season. Next season's calendar appears in July." />
      {past.length > 0 && <Group title="Earlier this season" events={past} />}
    </div>
  );
}

function Group({ title, events, empty }: { title: string; events: ScoutingEventView[]; empty?: string }) {
  return (
    <section className="panel overflow-hidden">
      <header className="border-b border-white/[0.05] px-4 py-2.5">
        <h3 className="panel-title">{title}</h3>
      </header>
      {events.length === 0 ? (
        <div className="px-4 py-4 text-sm text-mist-400">{empty}</div>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {events.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EventRow({ e }: { e: ScoutingEventView }) {
  const { openTravel, attendEvent, advancing, careerAction, navigate } = useGame();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  const attend = async () => {
    setError(undefined);
    try {
      await attendEvent(e.id);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'You could not attend.');
    }
  };
  const notInPool = (e.seen ?? []).filter((p) => !p.inPool);
  const when = e.status === 'upcoming' ? `in ${e.daysAway} days` : e.status === 'on' ? 'on now' : 'over';
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl" aria-hidden>
          {KIND_ICON[e.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-mist-100">{e.name}</div>
          <div className="text-[11px] text-mist-400">
            {e.label} · {e.city.name}, {e.countryName} · {formatDate(e.start)}
            {e.days > 1 ? `–${formatDate(e.end)}` : ''} · about {e.size} players · ticket {formatUSD(e.ticket)}
          </div>
        </div>
        <span className={`num shrink-0 text-[12px] ${e.status === 'on' ? 'text-grass-300' : 'text-mist-400'}`}>{when}</span>
        {e.seen ? (
          <button className="btn-ghost shrink-0 px-3 py-1 text-xs" onClick={() => setOpen(!open)}>
            {open ? 'Hide' : `You saw ${e.seen.length}`}
          </button>
        ) : e.status === 'over' ? null : e.canAttend.ok ? (
          <button className="btn-primary shrink-0 px-3 py-1 text-xs" disabled={advancing} onClick={() => void attend()}>
            Attend · {formatUSD(e.ticket)} · {e.attendDays === 1 ? '1 day' : `${e.attendDays} days`}
          </button>
        ) : !e.here ? (
          <button
            className="btn-ghost shrink-0 border-grass-400/40 px-3 py-1 text-xs text-grass-200"
            onClick={() => openTravel(e.city.id, { label: e.name, route: { screen: 'events' } })}
          >
            Travel to {e.city.name}
          </button>
        ) : (
          <span className="shrink-0 text-[11px] text-mist-400">{e.canAttend.reason}</span>
        )}
      </div>
      {error && <div className="mt-1 text-[12px] text-alert-400">{error}</div>}
      {open && e.seen && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2 text-[12px] text-mist-300">
            Who you saw at {e.name}
            {notInPool.length > 0 && (
              <button
                className="btn-primary ml-auto px-2.5 py-1 text-[11px]"
                onClick={() => void careerAction(() => engine.addAllToPool(notInPool.map((p) => p.id)))}
              >
                Add all {notInPool.length} to pool
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-white/[0.04] overflow-y-auto">
            {e.seen.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                <OvrBadge ovr={p.ovr} range={p.ovrRange} size="sm" />
                <PosBadge pos={p.position} />
                <button className="min-w-0 flex-1 truncate text-left text-sm hover:text-grass-300" onClick={() => navigate({ screen: 'player', id: p.id })}>
                  {p.name}
                  <span className="ml-2 text-[11px] text-mist-400">
                    {p.age} · {p.club?.name ?? 'Free agent'}
                  </span>
                </button>
                {p.inPool ? (
                  <span className="text-[11px] text-grass-300">In pool</span>
                ) : (
                  <button className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => void careerAction(() => engine.addToPool(p.id))}>
                    + Pool
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
