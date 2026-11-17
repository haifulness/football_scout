import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { PlayerId } from '../../engine/core/ids';
import type { Position } from '../../engine/model/player';
import type { PotentialGrade, Verdict } from '../../engine/model/report';
import type { ReportDraft, ReportView } from '../../engine/views';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { PosBadge } from './ui';

const GRADES: { key: PotentialGrade; label: string }[] = [
  { key: 'A', label: 'A · elite (85+)' },
  { key: 'B', label: 'B · very good (75–84)' },
  { key: 'C', label: 'C · solid (65–74)' },
  { key: 'D', label: 'D · limited' },
];

export const GRADE_TONE: Record<string, string> = {
  'spot on': 'border-grass-400/50 text-grass-300',
  close: 'border-sky-400/50 text-sky-400',
  off: 'border-flood-400/50 text-flood-300',
  'way off': 'border-alert-400/50 text-alert-400',
};

/** Your written report on a player: the card if you have one, and the form to write or rewrite it. */
export function ReportBlock({ playerId, estimate }: { playerId: PlayerId; estimate?: [number, number] }) {
  const draft = useEngineQuery(() => engine.getReportDraft(playerId), [playerId]);
  const [open, setOpen] = useState(false);
  if (!draft) return null;
  return (
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <div className="panel-title text-[11px]">Your report</div>
        <span className="text-[11px] text-mist-400">Backs your pitches; checked against how he turns out a year later</span>
        <span className="ml-auto" />
        <button className="btn-ghost px-3 py-1 text-xs" disabled={!draft.allowed} title={draft.reason} onClick={() => setOpen((o) => !o)}>
          {open ? 'Cancel' : draft.existing ? 'Rewrite' : 'Write a report'}
        </button>
      </div>
      {!draft.allowed && <div className="mt-1 text-[12px] text-mist-400">{draft.reason}</div>}
      {draft.existing && !open && <ReportCard r={draft.existing} />}
      <AnimatePresence>{open && <ReportForm playerId={playerId} draft={draft} estimate={estimate} onDone={() => setOpen(false)} />}</AnimatePresence>
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

function ReportForm({ playerId, draft, estimate, onDone }: { playerId: PlayerId; draft: ReportDraft; estimate?: [number, number]; onDone: () => void }) {
  const { careerAction } = useGame();
  const [role, setRole] = useState<Position>(draft.suggestion.role);
  const [rating, setRating] = useState(draft.suggestion.rating);
  const [potential, setPotential] = useState<PotentialGrade>(draft.suggestion.potential);
  const [verdict, setVerdict] = useState<Verdict>(draft.suggestion.verdict);
  const [error, setError] = useState<string>();
  const save = () =>
    careerAction(() => engine.writeReport({ playerId, role, rating, potential, verdict }))
      .then(onDone)
      .catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] text-mist-400">Role</div>
          <div className="flex flex-wrap gap-1">
            {draft.roles.map((r) => (
              <button
                key={r}
                className={`rounded-md border px-1.5 py-0.5 ${r === role ? 'border-grass-400/60 bg-grass-500/10' : 'border-white/10'}`}
                onClick={() => setRole(r)}
              >
                <PosBadge pos={r} />
              </button>
            ))}
          </div>
          <div className="mb-1 mt-3 flex items-baseline gap-2 text-[11px] text-mist-400">
            Your rating <span className="num font-display text-2xl font-bold text-mist-100">{rating}</span>
            {estimate && (
              <span>
                (you see him at {estimate[0]}–{estimate[1]} as a {draft.roles[0]})
              </span>
            )}
          </div>
          <input
            type="range"
            min={1}
            max={99}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full accent-[var(--color-grass-400)]"
            aria-label="Your rating"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] text-mist-400">Potential</div>
          <div className="flex flex-wrap gap-1">
            {GRADES.map((g) => (
              <button
                key={g.key}
                className={`chip ${g.key === potential ? 'border-grass-400/60 text-grass-300' : 'text-mist-300'}`}
                onClick={() => setPotential(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="mb-1 mt-3 text-[11px] text-mist-400">Verdict</div>
          <div className="flex flex-wrap gap-1">
            {draft.verdicts.map((v) => (
              <button
                key={v.key}
                className={`chip ${v.key === verdict ? 'border-violet-400/60 text-violet-300' : 'text-mist-300'}`}
                onClick={() => setVerdict(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-[12px] text-mist-400">Overselling him costs you when the report is checked. An honest number is worth more over time.</span>
        <span className="ml-auto" />
        {error && <span className="text-[12px] text-alert-400">{error}</span>}
        <button className="btn-primary px-4 py-1.5 text-xs" onClick={() => void save()}>
          Sign the report
        </button>
      </div>
    </motion.div>
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
              : `Accuracy · club trust ${t.trust >= 0 ? '+' : ''}${t.trust}${t.overrated ? ` · oversold ${t.overrated}` : ''}`}
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
