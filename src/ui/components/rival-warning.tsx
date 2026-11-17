import { motion } from 'motion/react';
import type { RivalInterestView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { ClubLink } from './club-link';
import { useGame } from '../store/game-store';

/** "Rival interest" strip: rumoured chases by rival scouts for this player. */
export function RivalWarning({ rivals, compact }: { rivals: RivalInterestView[]; compact?: boolean }) {
  const navigate = useGame((s) => s.navigate);
  if (!rivals.length) return null;
  const hot = rivals.some((r) => r.advanced);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-wrap items-center gap-3 rounded-xl border ${hot ? 'border-alert-500/40 bg-alert-500/[0.08]' : 'border-violet-400/30 bg-violet-400/[0.07]'} ${compact ? 'px-3 py-2' : 'px-5 py-3'}`}
    >
      <motion.span
        className={`grid h-7 w-7 place-items-center rounded-full text-sm ${hot ? 'bg-alert-500/20 text-alert-400' : 'bg-violet-400/20 text-violet-300'}`}
        animate={hot ? { scale: [1, 1.12, 1] } : undefined}
        transition={{ duration: 1.4, repeat: Infinity }}
      >
        👁
      </motion.span>
      <div className="min-w-0 flex-1 text-sm">
        <div className={`panel-title text-[10px] ${hot ? 'text-alert-400' : 'text-violet-300'}`}>Rival interest</div>
        {rivals.map((r) => (
          <div key={r.rivalId} className="flex flex-wrap items-center gap-1.5 text-mist-200">
            <button className="font-semibold hover:underline" onClick={() => navigate({ screen: 'rivals' })}>
              {r.rivalName}
            </button>
            <span className="text-mist-400">is working on him for</span>
            <Crest club={r.club} size={16} />
            <ClubLink club={r.club} />
            <span className={`text-[12px] ${r.advanced ? 'font-semibold text-alert-400' : 'text-mist-400'}`}>
              · {r.advanced ? 'talks advanced: could close when a window opens' : 'early stages'}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
