import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { PlayerId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import type { AttendedMatchView, MatchDayPlayer, MatchDayView } from '../../engine/views';
import { KnowledgeMeter, Loading, OvrBadge, Panel, PosBadge, useCultureLookup } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';

const SPEEDS = [
  { label: 'Slow', ms: 1400 },
  { label: 'Normal', ms: 700 },
  { label: 'Fast', ms: 250 },
] as const;

/** Attend a match in person: pick who to watch closely, then follow the key moments as they happen. */
export function MatchDayScreen({ id }: { id: PlayerId }) {
  const view = useEngineQuery(() => engine.getMatchDay(id), [id]);
  const [match, setMatch] = useState<AttendedMatchView>();
  if (match) return <Watch match={match} />;
  if (view === undefined) return <Loading label="Checking the fixture list" />;
  if (view === null) return <div className="p-10 text-center text-mist-400">He has no league match in the next three weeks.</div>;
  return <Pick view={view} onPlayed={setMatch} />;
}

function Pick({ view, onPlayed }: { view: MatchDayView; onPlayed: (m: AttendedMatchView) => void }) {
  const { attendMatch, advancing, openTravel, scout } = useGame();
  const [focus, setFocus] = useState<PlayerId[]>([view.targetId]);
  const [error, setError] = useState<string>();
  const toggle = (pid: PlayerId) => setFocus((f) => (f.includes(pid) ? f.filter((x) => x !== pid) : f.length >= view.maxFocus ? f : [...f, pid]));
  const go = () => {
    setError(undefined);
    attendMatch(view.targetId, focus)
      .then(onPlayed)
      .catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  };
  const f = view.fixture;
  const broke = (scout?.money ?? 0) < view.ticket;
  const waitHint = view.inPlace && view.hotel > 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end gap-6">
        <div className="min-w-0 flex-1">
          <div className="panel-title text-grass-300">
            Match day · {f.leagueName} · {formatDate(f.date)}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <Crest club={f.home} size={44} />
            <h1 className="font-display text-4xl font-bold uppercase leading-none">
              {f.home.name} <span className="text-mist-400">v</span> {f.away.name}
            </h1>
            <Crest club={f.away} size={44} />
          </div>
          <p className="mt-2 max-w-2xl text-sm text-mist-400">
            Pick up to {view.maxFocus} players to watch closely. What they do on the pitch tells you about specific attributes, far more than a normal live
            watch. Everyone else gets a passing glance. The result is whatever happens: being there never changes it.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-night-900 px-5 py-3 text-right text-sm">
          <div>
            {view.venue.name} · in {view.daysAway} day{view.daysAway === 1 ? '' : 's'}
          </div>
          <div className="text-mist-400">Ticket {formatUSD(view.ticket)}</div>
          {view.hotel > 0 && (
            <div className="text-[12px] text-flood-300" title="Waiting in the venue city means hotel nights. Travel closer to match day to save.">
              + about {formatUSD(view.hotel)} in hotel nights while you wait
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {view.squads.map((sq) => (
          <Panel
            key={sq.club.id}
            title={
              <span className="flex items-center gap-2">
                <Crest club={sq.club} size={18} /> {sq.club.name}
              </span>
            }
          >
            <ul className="max-h-[440px] overflow-y-auto">
              {sq.players.map((p) => (
                <SquadRow
                  key={p.id}
                  p={p}
                  picked={focus.includes(p.id)}
                  full={focus.length >= view.maxFocus}
                  target={p.id === view.targetId}
                  onToggle={() => toggle(p.id)}
                />
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-night-900/95 p-3 backdrop-blur">
        <span className="text-sm text-mist-300">
          Watching closely:{' '}
          <span className="font-semibold">
            {focus.length}/{view.maxFocus}
          </span>
        </span>
        {waitHint && <span className="text-[12px] text-mist-400">Tip: go home and come back nearer the day to skip the hotel bill.</span>}
        {error && <span className="text-sm text-alert-400">{error}</span>}
        <span className="ml-auto" />
        {view.inPlace ? (
          <button className="btn-primary" disabled={advancing || !focus.length || broke} onClick={go}>
            {advancing ? 'Heading to the ground…' : `Kick off ▸ (${view.daysAway}d, ${formatUSD(view.ticket + view.hotel)})`}
          </button>
        ) : (
          <button
            className="btn-primary"
            disabled={advancing}
            onClick={() => openTravel(view.venue.id, { label: 'Attend the match', route: { screen: 'matchday', id: view.targetId } })}
          >
            Travel to {view.venue.name} ▸
          </button>
        )}
      </div>
    </div>
  );
}

function SquadRow({ p, picked, full, target, onToggle }: { p: MatchDayPlayer; picked: boolean; full: boolean; target: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        className={`flex w-full items-center gap-3 border-b border-white/[0.04] px-4 py-2 text-left text-sm last:border-0 ${picked ? 'bg-grass-500/10' : 'hover:bg-white/[0.03]'} disabled:opacity-40`}
        onClick={onToggle}
        disabled={!picked && full}
        aria-pressed={picked}
      >
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${picked ? 'border-grass-400 bg-grass-500 text-night-950' : 'border-white/20'}`}
        >
          {picked ? '✓' : ''}
        </span>
        <PosBadge pos={p.position} />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{p.name}</span>
          <span className="ml-2 text-[12px] text-mist-400">{p.age}</span>
          {target && <span className="ml-2 text-[10px] uppercase tracking-wider text-flood-300">your target</span>}
          {p.inPool && !target && <span className="ml-2 text-[11px] text-flood-300">★</span>}
        </span>
        <KnowledgeMeter level={p.known} compact />
        <OvrBadge ovr={Math.round((p.ovr[0] + p.ovr[1]) / 2)} range={p.ovr} size="sm" />
      </button>
    </li>
  );
}

function Watch({ match }: { match: AttendedMatchView }) {
  const { navigate } = useGame();
  const [shown, setShown] = useState(1);
  const [speed, setSpeed] = useState(1);
  const done = shown >= match.events.length;
  const feed = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setShown((n) => n + 1), SPEEDS[speed]!.ms);
    return () => clearTimeout(t);
  }, [shown, speed, done]);
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' });
  }, [shown]);

  const visible = match.events.slice(0, shown);
  const minute = visible.at(-1)?.minute ?? 0;
  const last = [...visible].reverse().find((e) => e.score);
  const score = { h: last?.score?.[0] ?? 0, a: last?.score?.[1] ?? 0 };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-white/[0.08] bg-[radial-gradient(500px_160px_at_50%_0%,rgba(47,207,115,0.15),transparent_70%)] bg-night-900 p-5">
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl font-bold uppercase">{match.home.name}</span>
          <Crest club={match.home} size={48} />
        </div>
        <div className="text-center">
          <motion.div
            key={`${score.h}-${score.a}`}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            className="num font-display text-6xl font-bold leading-none"
          >
            {score.h}–{score.a}
          </motion.div>
          <div className="num mt-1 text-sm text-mist-400">{done ? 'Full-time' : `${minute}'`}</div>
        </div>
        <div className="flex items-center gap-3">
          <Crest club={match.away} size={48} />
          <span className="font-display text-2xl font-bold uppercase">{match.away.name}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel
          title="Live from the stands"
          right={
            !done && (
              <span className="flex gap-1">
                {SPEEDS.map((s, i) => (
                  <button key={s.label} className={`chip ${i === speed ? 'border-grass-400/50 text-grass-300' : 'text-mist-400'}`} onClick={() => setSpeed(i)}>
                    {s.label}
                  </button>
                ))}
                <button className="chip text-mist-300" onClick={() => setShown(match.events.length)}>
                  Skip to the end ▸
                </button>
              </span>
            )
          }
        >
          <ol ref={feed} className="max-h-[520px] overflow-y-auto px-4 py-2">
            <AnimatePresence initial={false}>
              {visible.map((e, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`my-1.5 flex gap-3 border-l-2 pl-3 text-sm ${
                    e.kind === 'goal'
                      ? 'border-flood-400 font-semibold text-flood-300'
                      : e.focus
                        ? e.kind === 'good'
                          ? 'border-grass-400 text-mist-100'
                          : 'border-alert-400 text-mist-100'
                        : e.kind === 'info'
                          ? 'border-white/20 text-mist-300'
                          : 'border-white/[0.06] text-mist-400'
                  }`}
                >
                  <span className="num w-8 shrink-0 text-[12px] text-mist-400">{e.minute ? `${e.minute}'` : ''}</span>
                  <span className="flex-1">{e.text}</span>
                  {e.attributeLabel && (
                    <span className={`chip shrink-0 ${e.kind === 'good' ? 'border-good-400/40 text-good-300' : 'border-alert-400/40 text-alert-400'}`}>
                      {e.attributeLabel} {e.kind === 'good' ? '▲' : '▼'}
                    </span>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </Panel>

        <div className="flex flex-col gap-3">
          {match.focus.map((o) => (
            <FocusCard key={o.playerId} o={o} done={done} onOpen={() => navigate({ screen: 'player', id: o.playerId })} />
          ))}
          {done && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] text-mist-400">
              You also got a passing look at {match.others} other players.
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function FocusCard({ o, done, onOpen }: { o: AttendedMatchView['focus'][number]; done: boolean; onOpen: () => void }) {
  const cultureOf = useCultureLookup();
  const p = o.player;
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-night-900 p-4">
      <div className="flex items-center gap-3">
        <Portrait
          seed={p.portraitSeed}
          culture={cultureOf(p.nationalityId)}
          size={44}
          age={p.age}
          shirt={p.club.colors.primary}
          trim={p.club.colors.secondary}
          className="rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <button className="truncate font-semibold hover:underline" onClick={onOpen}>
            {p.name}
          </button>
          <div className="flex items-center gap-1.5 text-[12px] text-mist-400">
            <PosBadge pos={p.position} /> {p.club.shortName}
            {done && (o.played ? ` · ${o.minutes} min · rating ${o.rating?.toFixed(1)}` : ' · did not play')}
          </div>
        </div>
      </div>
      {done ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mt-3 flex items-center gap-2 text-[12px]">
            <span className="text-mist-400">Knowledge</span>
            <span className="num">{o.before}</span>
            <span className="text-mist-400">→</span>
            <span className="num font-bold text-grass-300">{o.after}</span>
          </div>
          {o.seen.length > 0 ? (
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
              {o.seen.map((x) => (
                <li key={x.attribute} className="flex justify-between gap-2">
                  <span className="text-mist-300">{x.label}</span>
                  <span className="num font-semibold">{x.range[0] === x.range[1] ? x.range[0] : `${x.range[0]}–${x.range[1]}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-[12px] text-mist-400">{o.played ? 'Not much came his way today.' : 'He was not in the squad. A wasted look.'}</div>
          )}
        </motion.div>
      ) : (
        <div className="mt-2 text-[12px] text-mist-400">Watching closely…</div>
      )}
    </div>
  );
}
