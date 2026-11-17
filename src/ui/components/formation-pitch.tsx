import { motion } from 'motion/react';
import type { ClubView } from '../../engine/views';
import type { SlotNeed } from '../../engine/systems/squad-needs';
import { Kit } from '../visuals/kit';
import { ratingColor } from './ui';

interface Props {
  club: ClubView;
  needs?: SlotNeed[];
  onPlayer?: (id: string) => void;
}

/** Vertical pitch with the club's best XI in its formation. Weak slots glow red. */
export function FormationPitch({ club, needs = [], onPlayer }: Props) {
  const urgent = new Set(needs.filter((n) => n.severity >= 0.45).map((n) => n.position));
  return (
    <div
      className="relative mx-auto aspect-[68/100] w-full max-w-[440px] overflow-hidden rounded-xl"
      style={{ background: 'repeating-linear-gradient(180deg, #0f4d2e 0 9.09%, #125a36 9.09% 18.18%)' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.14),transparent_60%)]" />
      <svg viewBox="0 0 68 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <g fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={0.35}>
          <rect x={2} y={2} width={64} height={96} />
          <line x1={2} y1={50} x2={66} y2={50} />
          <circle cx={34} cy={50} r={9} />
          <rect x={14} y={2} width={40} height={16} />
          <rect x={24} y={2} width={20} height={6} />
          <rect x={14} y={82} width={40} height={16} />
          <rect x={24} y={92} width={20} height={6} />
          <path d="M27 18 A8 8 0 0 0 41 18" />
          <path d="M27 82 A8 8 0 0 1 41 82" />
        </g>
      </svg>
      {club.lineup.map((slot, i) => {
        const weak = urgent.has(slot.position);
        return (
          <motion.button
            key={`${slot.position}-${i}`}
            type="button"
            onClick={() => slot.playerId && onPlayer?.(slot.playerId)}
            className="group absolute flex w-[22%] -translate-x-1/2 translate-y-1/2 flex-col items-center"
            style={{ left: `${slot.x}%`, bottom: `${slot.y}%` }}
            initial={{ opacity: 0, y: 30, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.05 * i, type: 'spring', stiffness: 260, damping: 22 }}
          >
            {weak && <span className="absolute top-1 h-10 w-10 animate-ping rounded-full bg-alert-500/30" />}
            <span className="relative drop-shadow-[0_6px_8px_rgba(0,0,0,0.5)] transition-transform group-hover:-translate-y-0.5 group-hover:scale-110">
              <Kit club={club} size={40} number={i + 1} keeper={slot.position === 'GK'} />
            </span>
            <span
              className="mt-0.5 flex items-center gap-1 rounded bg-night-950/80 px-1.5 py-0.5 backdrop-blur-sm"
              style={{ boxShadow: weak ? 'inset 0 0 0 1px #ef4444aa' : undefined }}
            >
              <span className="num text-[12px] font-bold" style={{ color: ratingColor(slot.ovr) }}>
                {slot.ovrRange && slot.ovrRange[1] > slot.ovrRange[0] ? `~${slot.ovr}` : slot.ovr}
              </span>
              <span className="max-w-[78px] truncate text-[11px] font-medium text-mist-100">{slot.name}</span>
            </span>
            <span className="num text-[10px] font-semibold tracking-wider text-white/60">{slot.position}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
