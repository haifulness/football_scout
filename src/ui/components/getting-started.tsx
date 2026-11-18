import { motion } from 'motion/react';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

/** First steps for a new career, ticked off as you play. Hidden once dismissed. */
export function GettingStarted() {
  const view = useEngineQuery(() => engine.getOnboarding(), []);
  const { navigate, careerAction } = useGame();
  if (!view || view.dismissed) return null;
  const done = view.steps.filter((s) => s.done).length;
  const next = view.steps.find((s) => !s.done);
  const all = done === view.steps.length;
  // A step with clubs opens a random one of them, so each click shows somewhere new.
  const go = (step: (typeof view.steps)[number]) => {
    const ids = step.clubIds;
    if (ids?.length) navigate({ screen: 'club', id: ids[Math.floor(Math.random() * ids.length)]! });
    else navigate({ screen: step.screen });
  };
  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel relative shrink-0 overflow-hidden border-flood-400/40 bg-gradient-to-br from-flood-500/[0.10] via-night-900/60 to-grass-500/[0.06] shadow-[0_0_40px_-12px_rgba(255,201,51,0.35)]"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-flood-400/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4 px-3 pb-3 pt-4 sm:px-5">
        <div>
          <div className="panel-title text-flood-300">Getting started</div>
          <h2 className="mt-0.5 font-display text-xl font-bold uppercase leading-tight sm:text-2xl">
            {all ? 'All set' : 'Your first steps as a scout'}
            <span className="num ml-2 text-lg text-mist-400">
              {done}/{view.steps.length}
            </span>
          </h2>
        </div>
        <button className="text-xs text-mist-400 hover:text-mist-100" onClick={() => void careerAction(() => engine.dismissOnboarding())}>
          {all ? 'Done, hide this' : 'Hide'}
        </button>
      </div>
      <div className="relative mx-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-grass-400 to-flood-400" initial={{ width: 0 }} animate={{ width: `${(done / view.steps.length) * 100}%` }} />
      </div>
      <ol className="relative grid grid-cols-2 gap-2 px-3 py-3 sm:px-5 sm:py-4 md:grid-cols-5">
        {view.steps.map((s, i) => {
          const isNext = s === next;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(s)}
                className={`flex h-full w-full items-start gap-2.5 rounded-xl border p-3 text-left text-sm transition-colors ${
                  s.done
                    ? 'border-grass-400/20 bg-grass-500/[0.05] text-mist-400'
                    : isNext
                      ? 'border-flood-400/60 bg-flood-500/[0.12] text-mist-100 ring-1 ring-flood-400/30'
                      : 'border-white/[0.08] bg-white/[0.02] text-mist-300 hover:bg-white/[0.05]'
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? 'bg-grass-500 text-night-950' : isNext ? 'bg-flood-400 text-night-950' : 'bg-white/[0.08]'}`}
                >
                  {s.done ? '✓' : i + 1}
                </span>
                <span className={`pt-1 leading-snug ${s.done ? 'line-through' : 'font-semibold'}`}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {next ? (
        <div className="relative flex flex-wrap items-center gap-3 border-t border-flood-400/20 bg-flood-500/[0.08] px-5 py-3.5 text-sm">
          <span className="font-display text-base font-bold uppercase text-flood-300">Next</span>
          <span className="min-w-0 flex-1 text-mist-100">{next.hint}</span>
          <button className="btn-primary px-5 py-2 text-sm" onClick={() => go(next)}>
            Go ▸
          </button>
        </div>
      ) : (
        <div className="relative border-t border-white/[0.05] bg-grass-500/[0.06] px-5 py-3.5 text-sm text-grass-200">
          You're up and running. From here: more clients, missions from them, assistants to scan for you, and bigger clubs as your reputation grows.
        </div>
      )}
    </motion.section>
  );
}
