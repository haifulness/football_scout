import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PosBadge, useCultureLookup } from './ui';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';
import { useGame } from '../store/game-store';

/** The moment your scouting reveals a prodigy: a reveal of its own (after any "Here we go"). */
export function ProdigyReveal() {
  const { discoveries, reveals, dismissDiscovery, navigate } = useGame();
  const cultureOf = useCultureLookup();
  const reduce = useReducedMotion();
  const d = reveals.length ? undefined : discoveries[0];

  return (
    <AnimatePresence>
      {d && (
        <motion.div
          key={d.id}
          className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/85 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismissDiscovery}
        >
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-flood-400/30 bg-night-900 shadow-2xl"
            initial={{ scale: 0.85, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 170, damping: 17 }}
            onClick={(e) => e.stopPropagation()}
          >
            {!reduce && (
              <motion.div
                className="pointer-events-none absolute left-1/2 top-[38%] h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2"
                style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,201,51,0.16) 0deg 8deg, transparent 8deg 24deg)' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
              />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(360px_260px_at_50%_35%,transparent,rgba(5,8,10,0.92)_75%)]" />
            <div className="relative p-8 text-center">
              <motion.div className="panel-title text-flood-400" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                Your scouting reveals
              </motion.div>
              <motion.div
                className="mt-1 font-display text-5xl font-bold uppercase italic tracking-tight text-flood-300 drop-shadow-[0_4px_20px_rgba(255,201,51,0.45)]"
                initial={{ letterSpacing: '0.35em', opacity: 0 }}
                animate={{ letterSpacing: '0em', opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.25 }}
              >
                ★ A prodigy ★
              </motion.div>
              <motion.div
                className="mt-6 flex justify-center"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.45, type: 'spring' }}
              >
                <Portrait
                  seed={d.portraitSeed}
                  culture={cultureOf(d.nationalityId)}
                  size={128}
                  age={d.age}
                  shirt={d.club?.colors.primary ?? '#24363f'}
                  trim={d.club?.colors.secondary ?? '#8aa2ad'}
                  className="rounded-2xl shadow-2xl ring-2 ring-flood-400/50"
                />
              </motion.div>
              <div className="mt-5 font-display text-4xl font-bold uppercase leading-none">{d.name}</div>
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-mist-300">
                <PosBadge pos={d.position} />
                <span>{d.age} yrs</span>
                {d.club ? (
                  <span className="flex items-center gap-1.5">
                    · <Crest club={d.club} size={18} /> {d.club.name}
                  </span>
                ) : (
                  <span>· Free agent</span>
                )}
              </div>
              {d.potential && (
                <div className="mt-4 inline-flex items-baseline gap-2 rounded-xl border border-flood-400/30 bg-flood-500/10 px-4 py-2">
                  <span className="text-[11px] uppercase tracking-wider text-mist-400">Ceiling</span>
                  <span className="num text-2xl font-bold text-flood-300">
                    {d.potential[0] === d.potential[1] ? d.potential[0] : `${d.potential[0]}–${d.potential[1]}`}
                  </span>
                </div>
              )}
              <p className="mx-auto mt-4 max-w-sm text-sm text-mist-300">
                Every club will want him now, even elite clubs that never take on projects. Pitch him before a rival finds him.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  className="btn-primary px-5 py-2"
                  onClick={() => {
                    dismissDiscovery();
                    navigate({ screen: 'player', id: d.id });
                  }}
                >
                  Open his file
                </button>
                <button className="btn-ghost px-5 py-2" onClick={dismissDiscovery}>
                  Later
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
