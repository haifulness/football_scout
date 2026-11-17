import { motion, useReducedMotion } from 'motion/react';
import { useGame } from '../store/game-store';

/** A scenario career's goal, progress and time left, above every screen. */
export function ScenarioBanner() {
  const scout = useGame((s) => s.scout);
  const reduce = useReducedMotion();
  const sc = scout?.scenario;
  if (!sc || sc.status !== 'active') return null;
  const urgent = sc.daysLeft <= 30;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-violet-400/20 bg-violet-500/[0.07] px-6 py-1.5 text-[12px]">
      <span className="font-bold uppercase tracking-wider text-violet-300">{sc.name}</span>
      <span className="text-mist-300">{sc.goal}</span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-mist-300">{sc.label}</span>
        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.08]">
          <motion.span
            className="block h-full rounded-full bg-violet-400"
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${Math.round(sc.fraction * 100)}%` }}
            transition={{ duration: 0.5 }}
          />
        </span>
        <span className={`num font-semibold ${urgent ? 'text-alert-400' : 'text-mist-200'}`}>{sc.daysLeft} days left</span>
      </span>
    </div>
  );
}
