import type { DealStage } from '../../engine/model/deal';

const STAGE: Record<DealStage, { label: string; color: string }> = {
  negotiating: { label: 'Negotiating', color: '#38bdf8' },
  agreed: { label: 'Agreed · awaiting window', color: '#a3e635' },
  completed: { label: 'Signed', color: '#2fcf73' },
  rejected: { label: 'Rejected', color: '#ef4444' },
  failed: { label: 'Fell through', color: '#f87171' },
  hijacked: { label: 'Hijacked', color: '#fb923c' },
  collapsed: { label: 'Collapsed', color: '#8aa2ad' },
};

export function DealStageBadge({ stage }: { stage: DealStage }) {
  const s = STAGE[stage];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ color: s.color, background: `${s.color}18`, boxShadow: `inset 0 0 0 1px ${s.color}44` }}
    >
      {(stage === 'negotiating' || stage === 'agreed') && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: s.color }} />}
      {s.label}
    </span>
  );
}
