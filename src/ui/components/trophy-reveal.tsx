import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useMemo } from 'react';
import type { TrophyView } from '../../engine/views';
import { useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';

const KICKER: Record<TrophyView['kind'], string> = {
  'scout-world': 'The world votes',
  'scout-country': 'The judges have spoken',
  signing: 'Your signing, the best of the season',
  'clean-sweep': 'Every goal reached',
};

/** Award night: each trophy you win gets its own reveal (after any "Here we go" and prodigy reveals). */
export function TrophyReveal() {
  const { trophies, reveals, discoveries, dismissTrophy, navigate } = useGame();
  const reduce = useReducedMotion();
  const t = reveals.length || discoveries.length ? undefined : trophies[0];
  const confetti = useMemo(
    () => Array.from({ length: 44 }, (_, i) => ({ x: Math.random() * 100, d: 0.5 + Math.random() * 1.6, r: Math.random() * 360, c: i % 4 })),
    [t?.id],
  );
  const big = t?.kind === 'scout-world';

  return (
    <AnimatePresence>
      {t && (
        <motion.div
          key={t.id}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-night-950/90 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismissTrophy}
        >
          {!reduce &&
            confetti.map((c, i) => (
              <motion.span
                key={i}
                className="pointer-events-none absolute top-0 h-2.5 w-1.5 rounded-sm"
                style={{ left: `${c.x}%`, background: ['#ffc933', '#fff3c4', '#e0a417', '#ffffff'][c.c] }}
                initial={{ y: -40, rotate: c.r, opacity: 1 }}
                animate={{ y: '105vh', rotate: c.r + 720, opacity: [1, 1, 0] }}
                transition={{ duration: 3 + c.d, delay: 0.5 + c.d * 0.5, ease: 'easeIn' }}
              />
            ))}
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-flood-400/30 shadow-2xl"
            style={{ background: 'linear-gradient(160deg, #3a2a08 0%, #17120a 45%, #05080a 100%)' }}
            initial={reduce ? false : { scale: 0.8, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 170, damping: 16 }}
            onClick={(ev) => ev.stopPropagation()}
          >
            {/* Light rays behind the cup: they turn slowly, or hold still with reduced motion. */}
            <motion.div
              className="pointer-events-none absolute left-1/2 top-[30%] h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 opacity-40"
              style={{ background: 'repeating-conic-gradient(from 0deg, rgba(255,214,102,0.35) 0deg 6deg, transparent 6deg 20deg)', maskImage: 'radial-gradient(circle, #000 0%, transparent 60%)' }}
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            />
            <div className="relative p-8 text-center">
              <motion.div
                className="text-[11px] font-bold uppercase tracking-[0.25em] text-flood-300/80"
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                {KICKER[t.kind]} · {t.season}/{String(t.season + 1).slice(2)}
              </motion.div>
              <motion.div
                className="mx-auto mt-4 w-fit"
                initial={reduce ? false : { y: -60, scale: 0.5, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 140, damping: 11 }}
              >
                <Cup size={big ? 150 : 124} kind={t.kind} />
              </motion.div>
              <motion.div
                className="mt-4 font-display text-4xl font-bold uppercase leading-none text-flood-300 drop-shadow-[0_4px_20px_rgba(255,201,51,0.45)]"
                initial={reduce ? false : { letterSpacing: '0.3em', opacity: 0 }}
                animate={{ letterSpacing: '0em', opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.6 }}
              >
                {t.title}
              </motion.div>
              <motion.div className="mt-2 text-mist-200" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
                {t.detail}
              </motion.div>
              {t.club && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-mist-300">
                  <Crest club={t.club} size={22} />
                  {t.club.name}
                </div>
              )}
              <div className="mt-7 flex justify-center gap-2">
                <button
                  className="btn-ghost"
                  onClick={() => {
                    dismissTrophy();
                    navigate({ screen: 'goals' });
                  }}
                >
                  Trophy cabinet
                </button>
                <button className="btn-primary" onClick={dismissTrophy}>
                  {trophies.length > 1 ? `Next (${trophies.length - 1} more)` : 'Brilliant'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A gold cup, a medal for country awards, a pen-and-paper plaque for signings. */
export function Cup({ size = 120, kind }: { size?: number; kind: TrophyView['kind'] }) {
  const id = useId().replace(/:/g, '');
  const gold = (
    <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#fff1b8" />
      <stop offset="0.45" stopColor="#ffc933" />
      <stop offset="1" stopColor="#a86f0a" />
    </linearGradient>
  );
  if (kind === 'scout-country' || kind === 'clean-sweep')
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className="drop-shadow-[0_8px_24px_rgba(255,201,51,0.45)]">
        <defs>{gold}</defs>
        <path d="M34 4 L50 30 L66 4 L80 4 L58 40 L42 40 L20 4 Z" fill={kind === 'clean-sweep' ? '#2fcf73' : '#3b82f6'} opacity="0.9" />
        <circle cx="50" cy="64" r="30" fill={`url(#g${id})`} stroke="#7a5208" strokeWidth="2" />
        <circle cx="50" cy="64" r="22" fill="none" stroke="#fff3c4" strokeOpacity="0.6" strokeWidth="1.5" />
        {kind === 'clean-sweep' ? (
          <path d="M38 64 L47 73 L63 55" fill="none" stroke="#5a3c06" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M50 49 L54.5 59 L65 59.5 L57 66.5 L59.5 77 L50 71 L40.5 77 L43 66.5 L35 59.5 L45.5 59 Z" fill="#5a3c06" />
        )}
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="drop-shadow-[0_8px_24px_rgba(255,201,51,0.45)]">
      <defs>{gold}</defs>
      <path d="M24 14 Q10 14 10 28 Q10 44 30 48" fill="none" stroke={`url(#g${id})`} strokeWidth="5" />
      <path d="M76 14 Q90 14 90 28 Q90 44 70 48" fill="none" stroke={`url(#g${id})`} strokeWidth="5" />
      <path d="M24 8 H76 V30 Q76 58 50 62 Q24 58 24 30 Z" fill={`url(#g${id})`} stroke="#7a5208" strokeWidth="2" />
      <path d="M32 14 V30 Q32 46 44 52" fill="none" stroke="#fff6d6" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
      <rect x="45" y="62" width="10" height="14" fill={`url(#g${id})`} />
      <path d="M32 76 H68 L72 92 H28 Z" fill="#3a2a08" stroke={`url(#g${id})`} strokeWidth="2" />
      {kind === 'signing' ? (
        <path d="M42 36 L58 20 M44 38 L40 40 L42 36" stroke="#5a3c06" strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M50 18 L53.5 26 L62 26.5 L55.5 32 L57.5 40.5 L50 36 L42.5 40.5 L44.5 32 L38 26.5 L46.5 26 Z" fill="#5a3c06" />
      )}
    </svg>
  );
}
