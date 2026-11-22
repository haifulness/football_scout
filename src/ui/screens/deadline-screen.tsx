import { AnimatePresence, motion } from 'motion/react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { DeadlineFeedItem } from '../../engine/model/review';
import { ClubLink } from '../components/club-link';
import { Loading, Panel, useCultureLookup } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';

const OPENS = 9;
const SHUTS = 24;
const hourLabel = (h: number) => (h >= SHUTS ? '00:00' : `${String(h).padStart(2, '0')}:00`);

const TONE: Record<DeadlineFeedItem['tone'], string> = {
  info: 'border-flood-400/40 text-flood-300',
  world: 'border-white/10 text-mist-300',
  good: 'border-good-400/50 text-good-300',
  bad: 'border-alert-400/50 text-alert-400',
};

/** The last day of a transfer window, hour by hour: a live feed, your open deals, and the clock. */
export function DeadlineScreen() {
  const view = useEngineQuery(() => engine.getDeadline(), []);
  const { passHours, finishDeadline, advancing, navigate } = useGame();
  const cultureOf = useCultureLookup();
  if (view === undefined) return <Loading label="Refreshing the ticker" />;
  if (!view)
    return (
      <div className="p-10 text-center text-mist-400">
        The window has shut.{' '}
        <button className="text-flood-300 underline" onClick={() => navigate({ screen: 'deals' })}>
          See your deals
        </button>
      </div>
    );
  const left = SHUTS - view.hour;
  const progress = (view.hour - OPENS) / (SHUTS - OPENS);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end gap-6">
        <div className="min-w-0 flex-1">
          <div className="panel-title text-alert-400">{formatDate(view.date)}</div>
          <h1 className="font-display text-5xl font-bold uppercase leading-none">Deadline day</h1>
          <p className="mt-2 max-w-2xl text-sm text-mist-400">
            The window shuts at midnight. Every negotiation still open is settled before then, one way or the other. Clubs are desperate: players you pitch
            today cost {Math.round((view.feePremium - 1) * 100)}% more but coaches are keener to sign off. Pitches, meetings and trips take hours, not days;
            searches and video have to wait.
          </p>
        </div>
        <div className="rounded-2xl border border-alert-400/30 bg-night-900 px-6 py-4 text-center">
          <div className="panel-title text-[10px]">Window shuts in</div>
          <motion.div
            key={view.hour}
            initial={{ scale: 1.25, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="num font-display text-6xl font-bold leading-none text-alert-400"
          >
            {left > 0 ? `${left}h` : 'Shut'}
          </motion.div>
          <div className="mt-1 text-[12px] text-mist-400">now {hourLabel(view.hour)}</div>
        </div>
      </header>

      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-flood-400 to-alert-500" initial={false} animate={{ width: `${progress * 100}%` }} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel
          title={`Your open negotiations (${view.open.length})`}
          right={
            <button className="text-[11px] font-semibold text-flood-300 hover:underline" onClick={() => navigate({ screen: 'pool' })}>
              Pitch someone from your pool ›
            </button>
          }
        >
          {view.open.length ? (
            <ul>
              {view.open.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0">
                  {d.player && (
                    <Portrait seed={d.player.portraitSeed} culture={cultureOf(d.player.nationalityId)} size={40} age={d.player.age} className="rounded-lg" />
                  )}
                  <div className="min-w-0 flex-1">
                    <button className="truncate font-semibold hover:underline" onClick={() => d.player && navigate({ screen: 'player', id: d.player.id })}>
                      {d.player?.name ?? 'Retired player'}
                    </button>
                    <div className="flex items-center gap-1.5 text-[12px] text-mist-400">
                      <Crest club={d.club} size={16} /> <ClubLink club={d.club} /> · {d.position} · {formatUSD(d.fee)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-lg font-bold">{d.chance !== undefined ? `${Math.round(d.chance * 100)}%` : '–'}</div>
                    <div className="text-[10px] uppercase tracking-wider text-mist-400">he agrees</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-6 text-center text-sm text-mist-400">Nothing open. There is still time to get a deal done before midnight.</div>
          )}
        </Panel>

        <Panel title="Live">
          <ol className="max-h-[480px] overflow-y-auto px-4 py-2">
            <AnimatePresence initial={false}>
              {view.feed.map((f, i) => (
                <motion.li
                  key={`${view.feed.length - i}`}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`my-1.5 flex gap-3 border-l-2 pl-3 text-sm ${TONE[f.tone]}`}
                >
                  <span className="num w-11 shrink-0 text-[12px] text-mist-400">{hourLabel(f.hour)}</span>
                  <span className={f.tone === 'world' ? 'text-mist-300' : 'font-semibold'}>{f.text}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </Panel>
      </div>

      <div className="flex justify-end gap-2">
        <button className="btn-ghost" disabled={advancing || left <= 0} onClick={() => passHours(1)}>
          Wait an hour
        </button>
        <button className="btn-ghost" disabled={advancing || left <= 0} onClick={() => passHours(3)}>
          Wait 3 hours
        </button>
        <button className="btn-primary" disabled={advancing} onClick={() => finishDeadline()}>
          {left > 0 ? 'Play on to midnight ▸' : 'Close the window ▸'}
        </button>
      </div>
    </div>
  );
}
