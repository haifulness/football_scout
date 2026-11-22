import { AnimatePresence, motion } from 'motion/react';
import type { SeasonReviewView } from '../../engine/views';
import { formatUSD } from '../../engine/core/money';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';
import { CountUp, Panel, useCultureLookup } from './ui';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

/** Opens by itself at each new season, and from the Career screen for past seasons. */
export function SeasonReviewModal() {
  const { reviewOpen, closeReview } = useGame();
  const reviews = useEngineQuery(() => engine.getSeasonReviews(), [reviewOpen]);
  const r = reviewOpen !== undefined ? reviews?.find((x) => x.season === reviewOpen) : undefined;
  return (
    <AnimatePresence>
      {r && (
        <motion.div
          key={r.season}
          className="fixed inset-0 z-40 flex items-center justify-center bg-night-950/80 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => void closeReview()}
          onKeyDown={(e) => e.key === 'Escape' && void closeReview()}
        >
          <motion.div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-night-900 shadow-2xl"
            initial={{ y: 30, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <ReviewBody r={r} />
            <div className="flex justify-end border-t border-white/[0.06] p-4">
              <button className="btn-primary" autoFocus onClick={() => void closeReview()}>
                On to the new season ▸
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ReviewBody({ r }: { r: SeasonReviewView }) {
  const { navigate, closeReview } = useGame();
  const cultureOf = useCultureLookup();
  const net = r.income + r.expenses;
  const repDelta = r.reputation.start !== undefined ? r.reputation.end - r.reputation.start : undefined;
  const best = r.players.find((p) => p.playerId === r.best);
  const worst = r.players.find((p) => p.playerId === r.worst);
  const go = (fn: () => void) => {
    void closeReview();
    fn();
  };
  const biggest = Math.max(1, ...r.rows.map((x) => Math.abs(x.amount)));

  return (
    <div className="p-6">
      <div className="panel-title text-flood-400">Season in review</div>
      <h2 className="font-display text-5xl font-bold uppercase leading-none">{r.label}</h2>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Net" accent={net >= 0 ? 'text-good-300' : 'text-alert-400'}>
          <CountUp value={net} format={(n) => formatUSD(Math.round(n))} />
        </Tile>
        <Tile label="Placements">{r.placements}</Tile>
        <Tile label="Reputation" accent="text-flood-300">
          {r.reputation.end}
          {repDelta !== undefined && (
            <span className={`ml-1 text-sm ${repDelta >= 0 ? 'text-good-300' : 'text-alert-400'}`}>
              {repDelta >= 0 ? '+' : ''}
              {repDelta}
            </span>
          )}
        </Tile>
        <Tile label="Among scouts">{r.rank ? `${ordinal(r.rank.position)} / ${r.rank.of}` : '–'}</Tile>
      </div>
      {r.rank?.leader && r.rank.position > 1 && (
        <p className="mt-2 text-[12px] text-mist-400">
          Most signings: {r.rank.leader.name} with {r.rank.leader.signings}. You made {r.rank.signings}.
        </p>
      )}

      {(r.objectives?.length || r.awards?.length) && (
        <div className="mt-4 rounded-xl border border-flood-400/20 bg-flood-500/[0.04] p-3">
          {!!r.objectives?.length && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="panel-title mr-1 text-[11px]">Season goals</span>
              {r.objectives.map((o, i) => (
                <span key={i} className={`chip ${o.status === 'done' ? 'border-good-400/50 text-good-300' : 'text-mist-400'}`}>
                  {o.status === 'done' ? '✓' : '✗'} {o.title}
                </span>
              ))}
            </div>
          )}
          {r.awards
            ?.filter((a) => a.kind !== 'signing' || a.you)
            .map((a) => (
              <div key={a.title} className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-mist-400">{a.title}:</span>
                {a.you ? (
                  <span className="font-semibold text-flood-300">🏆 You{a.kind === 'signing' ? `, with ${a.winner}` : ''}</span>
                ) : (
                  <span>
                    {a.winner}
                    <span className="text-[12px] text-mist-400"> · you were {a.yourPlace ? ordinal(a.yourPlace) : 'not in the running'}</span>
                  </span>
                )}
              </div>
            ))}
          <button className="btn-ghost mt-2 px-3 py-1 text-xs" onClick={() => go(() => navigate({ screen: 'goals' }))}>
            Goals & trophy cabinet →
          </button>
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <div className="panel-title mb-2 text-[11px]">Money by source</div>
          {r.rows.length ? (
            <ul className="space-y-1.5">
              {r.rows.map((x) => (
                <li key={x.kind} className="grid grid-cols-[110px_1fr_76px] items-center gap-2 text-[12px]">
                  <span className="truncate text-mist-300">{x.label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <span
                      className={`block h-full rounded-full ${x.amount >= 0 ? 'bg-good-400' : 'bg-alert-500'}`}
                      style={{ width: `${(Math.abs(x.amount) / biggest) * 100}%` }}
                    />
                  </span>
                  <span className="num text-right">{formatUSD(x.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-mist-400">No money moved this season.</div>
          )}
          <div className="mt-2 flex justify-between border-t border-white/[0.06] pt-2 text-[12px]">
            <span className="text-mist-400">
              In {formatUSD(r.income)} · out {formatUSD(r.expenses)}
            </span>
          </div>
        </div>
        <div className="space-y-3">
          {best && (
            <Highlight
              title="Signing of your season"
              tone="text-grass-300"
              p={best}
              onOpen={() => go(() => navigate({ screen: 'player', id: best.playerId }))}
              cultureOf={cultureOf}
            />
          )}
          {worst && (
            <Highlight
              title="Struggled"
              tone="text-alert-400"
              p={worst}
              onOpen={() => go(() => navigate({ screen: 'player', id: worst.playerId }))}
              cultureOf={cultureOf}
            />
          )}
          {!best && (
            <div className="rounded-xl border border-white/[0.06] p-4 text-sm text-mist-400">None of your players played five league games this season.</div>
          )}
        </div>
      </div>

      {r.players.length > 0 && (
        <div className="mt-5">
          <div className="panel-title mb-2 text-[11px]">Your players this season</div>
          <table className="w-full text-[12px]">
            <thead className="text-left text-[10px] uppercase tracking-wider text-mist-400">
              <tr>
                <th className="py-1">Player</th>
                <th>Club</th>
                <th className="text-right">Apps</th>
                <th className="text-right">G</th>
                <th className="text-right">A</th>
                <th className="text-right">Rating</th>
                <th className="text-right">Earned you</th>
              </tr>
            </thead>
            <tbody>
              {r.players.map((p) => (
                <tr key={p.playerId} className="border-t border-white/[0.04]">
                  <td className="py-1.5">
                    <button className="font-semibold hover:underline" onClick={() => go(() => navigate({ screen: 'player', id: p.playerId }))}>
                      {p.name}
                    </button>
                  </td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <Crest club={p.club} size={14} /> {p.club.name}
                    </span>
                  </td>
                  <td className="num text-right">{p.apps}</td>
                  <td className="num text-right">{p.goals}</td>
                  <td className="num text-right">{p.assists}</td>
                  <td className="num text-right">{p.apps ? p.rating.toFixed(1) : '–'}</td>
                  <td className="num text-right">{formatUSD(p.earned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, children, accent = '' }: { label: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="panel-title text-[10px]">{label}</div>
      <div className={`num font-display text-3xl font-bold leading-tight ${accent}`}>{children}</div>
    </div>
  );
}

function Highlight({
  title,
  tone,
  p,
  onOpen,
  cultureOf,
}: {
  title: string;
  tone: string;
  p: SeasonReviewView['players'][number];
  onOpen: () => void;
  cultureOf: (id: string) => string | undefined;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left hover:bg-white/[0.05]"
      onClick={onOpen}
    >
      <Portrait
        seed={p.portraitSeed}
        culture={cultureOf(p.nationalityId)}
        size={48}
        shirt={p.club.colors.primary}
        trim={p.club.colors.secondary}
        className="rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <div className={`panel-title text-[10px] ${tone}`}>{title}</div>
        <div className="truncate font-semibold">{p.name}</div>
        <div className="text-[12px] text-mist-400">
          {p.club.name} · {p.apps} apps · rating {p.rating.toFixed(1)}
        </div>
      </div>
    </button>
  );
}

/** Past seasons on the Career screen. */
export function SeasonReviewsPanel() {
  const reviews = useEngineQuery(() => engine.getSeasonReviews(), []);
  const openReview = useGame((s) => s.openReview);
  if (!reviews?.length) return null;
  return (
    <Panel title="Season reviews">
      <ul>
        {reviews.map((r) => (
          <li key={r.season}>
            <button
              className="flex w-full items-center gap-4 border-b border-white/[0.04] px-4 py-2.5 text-left text-sm last:border-0 hover:bg-white/[0.03]"
              onClick={() => openReview(r.season)}
            >
              <span className="num w-16 font-bold">{r.label}</span>
              <span className={`num w-24 ${r.income + r.expenses >= 0 ? 'text-good-300' : 'text-alert-400'}`}>{formatUSD(r.income + r.expenses)}</span>
              <span className="flex-1 text-mist-400">
                {r.placements} placement{r.placements === 1 ? '' : 's'} · reputation {r.reputation.end}
                {r.rank ? ` · ${ordinal(r.rank.position)} of ${r.rank.of} scouts` : ''}
              </span>
              <span className="text-[11px] text-flood-300">Open ›</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
