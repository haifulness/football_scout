import { AnimatePresence, motion } from 'motion/react';
import { formatDate } from '../../engine/core/calendar';
import { useGame } from '../store/game-store';

const PHASE_LABEL = { 'pre-season': 'Pre-season', season: 'Season', 'off-season': 'Off-season' } as const;

const hourLabel = (h: number) => (h >= 24 ? 'Midnight' : `${String(h).padStart(2, '0')}:00`);

const quiet =
  'whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold text-mist-300 transition-colors hover:bg-white/[0.08] disabled:opacity-40 disabled:hover:bg-transparent';

function Spinner() {
  return (
    <span className="flex items-center gap-2">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-night-950/30 border-t-night-950" /> Simulating
    </span>
  );
}

/** Date display with a flip animation, plus the controls that move time forward. */
export function TimeControls() {
  const { clock, advancing, advance, lastStop, passHours, finishDeadline, navigate } = useGame();
  if (!clock) return null;
  const deadline = clock.deadlineHour;
  return (
    <div className="flex items-center gap-3">
      {deadline !== undefined ? (
        <button
          className="chip animate-pulse whitespace-nowrap border-alert-400/40 bg-alert-500/10 font-semibold text-alert-400 motion-reduce:animate-none"
          onClick={() => navigate({ screen: 'deadline' })}
          title="Open the deadline-day feed"
        >
          ⏱ Deadline day · {hourLabel(deadline)}
        </button>
      ) : (
        <>
          <AnimatePresence>
            {lastStop && !advancing && (
              <motion.span
                key={lastStop + clock.date}
                className="chip hidden whitespace-nowrap border-flood-400/30 text-flood-300 xl:inline-flex"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                title="Why time stopped"
              >
                ⏸ {lastStop}
              </motion.span>
            )}
          </AnimatePresence>
          {clock.transferWindow && (
            <span className="chip hidden whitespace-nowrap border-grass-400/30 text-grass-300 2xl:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-grass-400" /> Transfer window
            </span>
          )}
        </>
      )}
      <div className="text-right" style={{ perspective: 400 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={clock.date}
            className="num text-lg font-bold leading-none"
            initial={{ rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: 90, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {formatDate(clock.date)}
          </motion.div>
        </AnimatePresence>
        <div className="text-[10px] uppercase tracking-wider text-mist-400">
          {clock.seasonLabel} · {PHASE_LABEL[clock.phase]}
          {clock.transferWindow && <span className="text-grass-300 2xl:hidden"> · Window</span>}
        </div>
      </div>
      {deadline !== undefined ? (
        <div className="flex items-center gap-1 rounded-lg border border-alert-400/20 bg-alert-500/[0.04] p-1">
          <button className={quiet} disabled={advancing || deadline >= 24} onClick={() => passHours(1)} title="Let an hour pass">
            +1h
          </button>
          <button className={quiet} disabled={advancing || deadline >= 24} onClick={() => passHours(3)} title="Let three hours pass">
            +3h
          </button>
          <button
            className="btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
            disabled={advancing}
            onClick={() => finishDeadline()}
            title="Play on to midnight and close the window"
          >
            {advancing ? <Spinner /> : deadline >= 24 ? 'Close the window ▸' : 'To midnight ▸'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
          <button className={quiet} disabled={advancing} onClick={() => advance('day')} title="Advance one day">
            +1d
          </button>
          <button className={quiet} disabled={advancing} onClick={() => advance('week')} title="Advance one week">
            +1w
          </button>
          <button
            className={quiet}
            disabled={advancing}
            onClick={() => advance('matchday')}
            title={clock.nextMatchDate ? `Next matchday: ${formatDate(clock.nextMatchDate)}` : 'Through the summer to the new season'}
          >
            {clock.phase === 'off-season' ? 'New season' : 'Matchday'}
          </button>
          <button
            className="btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
            disabled={advancing}
            onClick={() => advance('event')}
            title="Play on until something needs you: a deal decision, an offer, a message, a deadline a week away, the window opening or closing, or deadline day (8 weeks at most)"
          >
            {advancing ? <Spinner /> : 'Play on ▸▸'}
          </button>
        </div>
      )}
    </div>
  );
}
