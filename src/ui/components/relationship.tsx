import { motion } from 'motion/react';
import { alpha } from '../theme/color';

/** 0–100 relationship / rapport bar with its label ("Acquaintance", "Trusted"…). */
export function RelationshipBar({ level, label }: { level: number; label: string }) {
  const c = level >= 60 ? 'var(--color-good-400)' : level >= 35 ? '#a3e635' : level >= 15 ? '#facc15' : 'var(--color-mist-400)';
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span style={{ color: c }} className="font-semibold">
          {label}
        </span>
        <span className="num text-mist-400">{level}/100</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: c, boxShadow: `0 0 8px ${alpha(c, '88')}` }}
          initial={{ width: 0 }}
          animate={{ width: `${level}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
