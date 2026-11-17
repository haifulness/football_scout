import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { formatUSD } from '../../engine/core/money';
import { Crest, darken } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';
import { useGame } from '../store/game-store';
import { useCultureLookup } from './ui';

/** The press-conference moment: a completed signing gets its own reveal. */
export function HereWeGo() {
  const { reveals, dismissReveal, navigate } = useGame();
  const cultureOf = useCultureLookup();
  const reduce = useReducedMotion();
  const e = reveals[0];
  const confetti = useMemo(
    () => Array.from({ length: 36 }, (_, i) => ({ x: Math.random() * 100, d: 0.6 + Math.random() * 1.4, r: Math.random() * 360, c: i % 3 })),
    [e?.dealId],
  );

  return (
    <AnimatePresence>
      {e && (
        <motion.div
          key={e.dealId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/85 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismissReveal}
        >
          {!reduce &&
            confetti.map((c, i) => (
              <motion.span
                key={i}
                className="pointer-events-none absolute top-0 h-3 w-1.5 rounded-sm"
                style={{ left: `${c.x}%`, background: [e.club.colors.primary, e.club.colors.secondary, '#ffc933'][c.c] }}
                initial={{ y: -40, rotate: c.r, opacity: 1 }}
                animate={{ y: '105vh', rotate: c.r + 540, opacity: [1, 1, 0] }}
                transition={{ duration: 2.6 + c.d, delay: c.d * 0.4, ease: 'easeIn' }}
              />
            ))}
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 shadow-2xl"
            style={{
              background: `linear-gradient(135deg, ${darken(e.club.colors.primary, 0.25)} 0%, ${darken(e.club.colors.primary, 0.7)} 55%, #05080a 100%)`,
            }}
            initial={{ scale: 0.8, y: 30, rotate: -2 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 16 }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="absolute inset-0 bg-[radial-gradient(500px_220px_at_70%_-10%,rgba(255,236,170,0.35),transparent_70%)]" />
            <div className="absolute inset-0 opacity-[0.06]" style={{ background: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 6px)' }} />
            <div className="relative p-8 text-center">
              <motion.div
                className="font-display text-6xl font-bold uppercase italic tracking-tight text-flood-300 drop-shadow-[0_4px_20px_rgba(255,201,51,0.5)]"
                initial={{ letterSpacing: '0.4em', opacity: 0 }}
                animate={{ letterSpacing: '0em', opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                Here we go!
              </motion.div>
              <div className="mt-6 flex items-center justify-center gap-6">
                <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4, type: 'spring' }}>
                  <Portrait
                    seed={e.player.portraitSeed}
                    culture={cultureOf(e.player.nationalityId)}
                    size={120}
                    age={e.player.age}
                    shirt={e.club.colors.primary}
                    trim={e.club.colors.secondary}
                    className="rounded-2xl shadow-2xl ring-2 ring-white/20"
                  />
                </motion.div>
                <motion.div initial={{ x: 40, opacity: 0, scale: 0.6 }} animate={{ x: 0, opacity: 1, scale: 1 }} transition={{ delay: 0.55, type: 'spring' }}>
                  <Crest club={e.club} size={96} />
                </motion.div>
              </div>
              <div className="mt-6 font-display text-4xl font-bold uppercase leading-none">{e.player.name}</div>
              <div className="mt-2 text-mist-200">{e.text}</div>
              <div className="mt-1 text-sm text-mist-400">{e.fee ? `Fee ${formatUSD(e.fee)}` : 'Free transfer'} · your recommendation</div>
              <div className="mt-7 flex justify-center gap-2">
                <button
                  className="btn-ghost"
                  onClick={() => {
                    dismissReveal();
                    navigate({ screen: 'deals' });
                  }}
                >
                  View deals
                </button>
                <button className="btn-primary" onClick={dismissReveal}>
                  {reveals.length > 1 ? `Next (${reveals.length - 1} more)` : 'Brilliant'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
