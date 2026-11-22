/** Hand a buying brief or a selling request to a senior assistant, or take it back. */
export function DelegateRow({
  kind,
  delegatedTo,
  delegates,
  cutPct,
  onDelegate,
  onRecall,
}: {
  kind: 'brief' | 'sale';
  delegatedTo?: { id: number; name: string };
  delegates: { id: number; name: string; skill: number; ok: boolean; reason?: string }[];
  cutPct: number;
  onDelegate: (assistantId: number) => void;
  onRecall: (assistantId: number) => void;
}) {
  if (delegatedTo)
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-violet-400/25 bg-violet-500/[0.06] px-3 py-2 text-[12px]">
        <span className="text-mist-200">
          <b>{delegatedTo.name}</b>{' '}
          {kind === 'brief'
            ? `is handling this brief: he shortlists and pitches under your name, and keeps ${cutPct}% of what it earns.`
            : `is handling this sale: he finds buyers and offers the player under your name, and keeps ${cutPct}% of the commission.`}
        </span>
        <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" onClick={() => onRecall(delegatedTo.id)}>
          Take it back
        </button>
      </div>
    );
  if (!delegates.length) return null;
  const ready = delegates.filter((d) => d.ok);
  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] px-3 py-2 text-[12px]">
      <div className="mb-1.5 text-mist-400">
        {kind === 'brief'
          ? `Hand it to an assistant: he finds and pitches players himself, for ${cutPct}% of the reward and signing bonus.`
          : `Hand it to an assistant: he finds clubs that could use the player and offers him himself, for ${cutPct}% of the commission.`}{' '}
        A weak pitch costs <i>your</i> standing.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {delegates.map((d) => (
          <button
            key={d.id}
            disabled={!d.ok}
            title={d.reason}
            onClick={() => onDelegate(d.id)}
            className="rounded-md border border-white/10 px-2 py-1 text-left hover:border-violet-300/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {d.name} <span className="num text-mist-400">· skill {d.skill}</span>
          </button>
        ))}
      </div>
      {!ready.length && <div className="mt-1 text-[11px] text-mist-500">{delegates[0]?.reason}</div>}
    </div>
  );
}
