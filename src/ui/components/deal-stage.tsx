import type { DealStage } from '../../engine/model/deal';
import { alpha } from '../theme/color';

const STAGE: Record<DealStage, { label: string; color: string }> = {
  negotiating: { label: 'Negotiating', color: 'var(--color-sky-400)' },
  agreed: { label: 'Agreed · awaiting window', color: 'var(--color-scale-3)' },
  completed: { label: 'Signed', color: 'var(--color-good-400)' },
  rejected: { label: 'Rejected', color: 'var(--color-alert-500)' },
  failed: { label: 'Fell through', color: 'var(--color-alert-400)' },
  hijacked: { label: 'Hijacked', color: 'var(--color-scale-5)' },
  collapsed: { label: 'Collapsed', color: 'var(--color-mist-400)' },
};

export function DealStageBadge({ stage }: { stage: DealStage }) {
  const s = STAGE[stage];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ color: s.color, background: `${alpha(s.color, '18')}`, boxShadow: `inset 0 0 0 1px ${alpha(s.color, '44')}` }}
    >
      {(stage === 'negotiating' || stage === 'agreed') && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: s.color }} />}
      {s.label}
    </span>
  );
}
