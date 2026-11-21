import { formatDate } from '../../engine/core/calendar';
import type { PlayerId } from '../../engine/core/ids';
import type { ReportView } from '../../engine/views';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { PosBadge } from './ui';

export const GRADE_TONE: Record<string, string> = {
  'spot on': 'border-grass-400/50 text-grass-300',
  close: 'border-sky-400/50 text-sky-400',
  off: 'border-flood-400/50 text-flood-300',
  'way off': 'border-alert-400/50 text-alert-400',
};

/** Your report on a player: filed when you pitch him, checked a year later against how he turned out. */
export function ReportBlock({ playerId }: { playerId: PlayerId; estimate?: [number, number] }) {
  const draft = useEngineQuery(() => engine.getReportDraft(playerId), [playerId]);
  if (!draft) return null;
  return (
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <div className="panel-title text-[11px]">Your report</div>
        <span className="text-[11px] text-mist-400">Filed when you pitch him; backs later pitches; checked a year on</span>
      </div>
      {draft.existing ? (
        <ReportCard r={draft.existing} />
      ) : (
        <div className="mt-1 text-[12px] text-mist-400">
          {draft.allowed
            ? `No report yet. Pitch him and one is filed from your read: ${draft.suggestion.rating} as a ${draft.suggestion.role}, potential ${draft.suggestion.potential}.`
            : `No report yet. ${draft.reason} Then a pitch files one from your read.`}
        </div>
      )}
    </div>
  );
}

export function ReportCard({ r }: { r: ReportView }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="num font-display text-3xl font-bold leading-none">{r.rating}</span>
      <span className="flex items-center gap-1.5">
        as <PosBadge pos={r.role} />
      </span>
      <span>
        Potential <span className="font-bold">{r.potential}</span>
      </span>
      <span className="chip border-violet-400/40 text-violet-300">“{r.verdictLabel}”</span>
      <span className="text-[12px] text-mist-400">
        {formatDate(r.date)} · {r.outcome ? 'checked' : `checked on ${formatDate(r.reviewOn)}`}
      </span>
      {r.outcome && (
        <span className={`chip ${GRADE_TONE[r.outcome.grade]}`}>
          {r.outcome.grade}: he was {r.outcome.truthThen}, now {r.outcome.truthNow}
        </span>
      )}
    </div>
  );
}

/** Career screen: how your reports have held up. */
export function TrackRecordPanel() {
  const t = useEngineQuery(() => engine.getTrackRecord(), []);
  const { navigate } = useGame();
  if (!t || !t.written) return null;
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center gap-4 border-b border-white/[0.06] px-4 py-3">
        <div className="panel-title">Report track record</div>
        <span className="text-[12px] text-mist-400">
          {t.written} written · {t.reviewed} checked · {t.pending} waiting
        </span>
        <span className="ml-auto text-right">
          <span className="num font-display text-3xl font-bold">{t.accuracy === undefined ? '–' : `${Math.round(t.accuracy * 100)}%`}</span>
          <span className="block text-[11px] text-mist-400">
            {t.accuracy === undefined
              ? `Accuracy shows after ${t.minReviewed} checked reports`
              : `Accuracy · standing with clubs ${t.trust >= 0 ? '+' : ''}${t.trust}${t.overrated ? ` · oversold ${t.overrated}` : ''}`}
          </span>
        </span>
      </div>
      <ul className="max-h-72 overflow-y-auto">
        {t.reports.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2 text-sm last:border-0">
            <PosBadge pos={r.role} />
            <button className="font-semibold hover:underline" onClick={() => navigate({ screen: 'player', id: r.playerId })}>
              {r.playerName}
            </button>
            <span className="text-mist-400">
              rated <span className="num font-semibold text-mist-100">{r.rating}</span> · potential {r.potential} · “{r.verdictLabel}”
            </span>
            <span className="ml-auto text-[12px]">
              {r.outcome ? (
                <span className={`chip ${GRADE_TONE[r.outcome.grade]}`}>
                  {r.outcome.grade} · {r.outcome.truthThen} → {r.outcome.truthNow}
                </span>
              ) : (
                <span className="text-mist-400">checked {formatDate(r.reviewOn)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
