import { motion } from 'motion/react';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { ClubId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import type { MissionView } from '../../engine/views';
import { Collapsible, Loading, Panel, PosBadge, useCultureLookup } from '../components/ui';
import { DealStageBadge } from '../components/deal-stage';
import { Portrait } from '../visuals/portrait';
import { MarketSection } from '../components/market-section';
import { Crest } from '../visuals/crest';
import { ClubLink } from '../components/club-link';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

const STATUS: Record<MissionView['status'], { label: string; color: string }> = {
  offered: { label: 'Offered', color: '#ffc933' },
  active: { label: 'Active', color: '#38bdf8' },
  succeeded: { label: 'Accomplished', color: '#2fcf73' },
  failed: { label: 'Failed', color: '#ef4444' },
  declined: { label: 'Declined', color: '#8aa2ad' },
  expired: { label: 'Lapsed', color: '#8aa2ad' },
};

export function MissionsScreen() {
  const missions = useEngineQuery(() => engine.getMissions(), []);
  const market = useEngineQuery(() => engine.getMarket(), []);
  const scout = useGame((s) => s.scout);
  if (!missions) return <Loading label="Reading the briefs" />;
  const offered = missions.filter((m) => m.status === 'offered');
  const active = missions.filter((m) => m.status === 'active');
  const past = missions.filter((m) => m.status !== 'offered' && m.status !== 'active');
  const done = past.filter((m) => m.status === 'succeeded').length;
  // Ended missions whose deals are still going: they need your attention, so they get their own section.
  const openDeal = (m: MissionView) => m.recommendations.some((r) => r.stage === 'negotiating' || r.stage === 'agreed');
  const stillOpen = past.filter(openDeal);
  const history = past.filter((m) => !openDeal(m));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-flood-400">
          {done} accomplished · {past.filter((m) => m.status === 'failed').length} failed
        </div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">Missions</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-400">
          {scout?.employmentLabel.startsWith('Freelance')
            ? 'Your clients post briefs. Declining costs nothing; failing an accepted mission costs standing.'
            : 'Your employer posts briefs. Declining costs nothing; failing an accepted mission costs standing.'}{' '}
          A mission is accomplished when a player who fits the brief signs (or agrees terms) for the club before the deadline. You can recommend as many players
          as you like for one brief: the first who fits and agrees terms completes it. If talks with one of them are still going at the deadline, the club waits
          for the outcome.
        </p>
      </header>

      {offered.length > 0 && (
        <Panel title={`New briefs (${offered.length})`}>
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
            {offered.map((m, i) => (
              <MissionCard key={m.id} m={m} i={i} />
            ))}
          </div>
        </Panel>
      )}
      <Panel title={`Active (${active.length}/3)`}>
        {active.length ? (
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
            {active.map((m, i) => (
              <MissionCard key={m.id} m={m} i={i} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-mist-400">
            No active missions. {offered.length ? 'Accept a brief above.' : 'Clubs you work for post them a couple of times a month.'}
          </div>
        )}
      </Panel>
      {stillOpen.length > 0 && (
        <Panel
          title={`Finished, deals still open (${stillOpen.length})`}
          right={<span className="text-[11px] text-mist-400">The brief has ended, but these negotiations carry on</span>}
        >
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
            {stillOpen.map((m) => (
              <div key={m.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <Crest club={m.club} size={28} />
                  <ClubLink club={m.club} className="font-semibold" />
                  <PosBadge pos={m.position} />
                  <span className="ml-auto">
                    <StatusBadge status={m.status} />
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-mist-400">
                  {m.requirements.join(', ')}
                  {m.resolvedOn !== undefined && <> · ended {formatDate(m.resolvedOn)}</>}
                </div>
                <Recommendations m={m} />
              </div>
            ))}
          </div>
        </Panel>
      )}
      {market && <MarketSection market={market} />}
      {history.length > 0 && (
        <Collapsible id="missions-history" title="Mission history" count={history.length}>
          <ul>
            {history.map((m) => (
              <li key={m.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 text-sm">
                <Crest club={m.club} size={20} />
                <span className="min-w-0 flex-1 truncate">
                  <ClubLink club={m.club} />: {m.requirements.join(', ')}
                </span>
                {m.completedBy ? (
                  <span className="text-grass-300">{m.completedBy}</span>
                ) : (
                  m.recommendations.length > 0 && <span className="text-[12px] text-mist-400">{m.recommendations.length} recommended</span>
                )}
                <span className="num text-[12px] text-mist-400">{m.resolvedOn ? formatDate(m.resolvedOn) : ''}</span>
                <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

const StatusBadge = ({ status }: { status: MissionView['status'] }) => (
  <span
    className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
    style={{ color: STATUS[status].color, background: `${STATUS[status].color}18`, boxShadow: `inset 0 0 0 1px ${STATUS[status].color}44` }}
  >
    {STATUS[status].label}
  </span>
);

function MissionCard({ m, i }: { m: MissionView; i: number }) {
  const { careerAction, openRecommend, setPoolFilters, navigate } = useGame();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<unknown>) => careerAction(fn).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  const { maxAge, minAge, maxFee } = m.raw;
  const elapsed = m.deadline !== undefined && m.daysLeft !== undefined ? 1 - m.daysLeft / (m.weeks * 7) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
      className={`rounded-xl border p-4 ${m.status === 'offered' ? 'border-flood-400/30 bg-flood-500/5' : 'border-sky-400/25 bg-sky-400/[0.04]'}`}
    >
      <div className="flex items-start gap-3">
        <Crest club={m.club} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ClubLink club={m.club} className="font-semibold" />
            <PosBadge pos={m.position} />
          </div>
          <div className="mt-0.5 text-[12px] italic text-mist-300">“{m.brief}”</div>
        </div>
        <div className="text-right">
          <div className="num text-lg font-bold text-flood-300">{formatUSD(m.reward)}</div>
          <div className="text-[10px] uppercase tracking-wider text-mist-400">reward</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {m.requirements.map((r) => (
          <span key={r} className="chip text-mist-100">
            {r}
          </span>
        ))}
      </div>
      <Preferences
        m={m}
        onDiscuss={() => void act(() => engine.discussMission(m.id))}
        onNegotiate={(key) => {
          let message = '';
          return careerAction(async () => {
            message = (await engine.negotiateMission(m.id, key)).message;
          })
            .then(() => message)
            .catch((e) => {
              setError(e instanceof Error ? e.message : 'That did not work.');
              return '';
            });
        }}
      />
      {m.status === 'active' && m.deadline !== undefined && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-mist-400">
            <span>Deadline {formatDate(m.deadline)}</span>
            {m.overtime ? (
              <span className="font-bold text-flood-300">Overtime: waiting on talks</span>
            ) : (
              <span className={m.daysLeft! <= 7 ? 'font-bold text-alert-400' : ''}>{m.daysLeft} days left</span>
            )}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${elapsed * 100}%`, background: m.daysLeft! <= 7 ? '#ef4444' : '#38bdf8' }} />
          </div>
        </div>
      )}
      {m.status === 'active' && <Recommendations m={m} />}
      {m.status === 'active' && (m.delegatedTo || m.delegates.length > 0) && (
        <Delegate m={m} onDelegate={(id) => void act(() => engine.delegateMission(id, m.id))} onRecall={(id) => void act(() => engine.recallJob(id))} />
      )}
      {m.status === 'offered' ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-[11px] text-mist-400">
            {m.weeks} weeks once accepted · answer by {formatDate(m.acceptBy)}
          </span>
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => void act(() => engine.acceptMission(m.id))}>
            Accept
          </button>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => void act(() => engine.declineMission(m.id))}>
            Decline
          </button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            className="btn-ghost flex-1 text-xs"
            onClick={() => {
              const age = m.preferences?.idealAge ?? (maxAge ? ([16, maxAge] as [number, number]) : minAge ? ([minAge, 38] as [number, number]) : undefined);
              const prefill = {
                positions: [m.position],
                age,
                maxValue: maxFee,
                minRating: m.raw.minOvr,
                maxWage: m.preferences?.maxWage,
                attributes: m.preferences?.keyAttributes.map(({ attribute, min }) => ({ attribute, min })),
                countryId: m.club.countryId,
                clubId: m.club.id as ClubId,
                clubName: m.club.name,
                label: `${m.club.name} brief`,
                returnTo: 'pool' as const,
              };
              // Your pool first; "Expand the pool" runs the search with the same brief.
              setPoolFilters({});
              setPoolFilters({
                pos: m.position,
                minRating: m.raw.minOvr,
                age: age ?? [15, 40],
                maxValue: maxFee,
                maxWage: m.preferences?.maxWage,
                brief: {
                  label: `${m.club.name}: ${m.position} brief`,
                  summary: [...m.requirements, ...(m.preferences ? [`wage ≤ ${formatUSD(m.preferences.maxWage)}/wk`] : [])],
                  prefill,
                },
              });
              navigate({ screen: 'pool' });
            }}
          >
            Search for this
          </button>
          <button
            className="btn-primary flex-1 text-xs"
            onClick={() =>
              openRecommend({
                clubId: m.club.id as ClubId,
                brief: { label: `${m.club.name}: ${m.position} brief`, position: m.position, minOvr: m.raw.minOvr, minAge, maxAge, maxFee, summary: m.requirements },
              })
            }
          >
            {m.recommendations.length ? 'Recommend another' : 'Recommend a player'}
          </button>
        </div>
      )}
      {error && <div className="mt-2 text-[12px] text-alert-400">{error}</div>}
    </motion.div>
  );
}

const FIT = {
  yes: { label: 'Fits', className: 'text-grass-300' },
  maybe: { label: 'Might fit', className: 'text-flood-300' },
  no: { label: "Doesn't fit", className: 'text-alert-400' },
} as const;

/** The players you've put forward for this brief, with where each deal stands. */
function Recommendations({ m }: { m: MissionView }) {
  const navigate = useGame((s) => s.navigate);
  const cultureOf = useCultureLookup();
  const recs = m.recommendations;
  const open = recs.filter((r) => r.stage === 'negotiating' || r.stage === 'agreed').length;
  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20">
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-mist-400">
        <span>Your recommendations ({recs.length})</span>
        {open > 0 && <span className="text-sky-300">{open} in progress</span>}
      </div>
      {recs.length ? (
        <ul>
          {recs.map((r) => (
            <li key={r.dealId} className="flex items-center gap-2 border-t border-white/[0.04] px-3 py-1.5 text-sm">
              <Portrait seed={r.player.portraitSeed} culture={cultureOf(r.player.nationalityId)} size={22} age={r.player.age} className="rounded" />
              <button className="min-w-0 flex-1 truncate text-left hover:text-flood-300" onClick={() => navigate({ screen: 'player', id: r.player.id })}>
                {r.player.name} <span className="text-[11px] text-mist-400">{r.player.age}</span>
              </button>
              <span className={`text-[11px] font-semibold ${FIT[r.fit].className}`}>{FIT[r.fit].label}</span>
              <DealStageBadge stage={r.stage} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-t border-white/[0.04] px-3 py-2 text-[12px] text-mist-400">None yet. Recommend one or more players for this brief.</div>
      )}
    </div>
  );
}

/** Discuss the brief with the club: what they'd like beyond the bare requirements. */
function Preferences({
  m,
  onDiscuss,
  onNegotiate,
}: {
  m: MissionView;
  onDiscuss: () => void;
  onNegotiate: (key: MissionView['negotiation'][number]['key']) => Promise<string>;
}) {
  const [reply, setReply] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (m.status !== 'offered' && m.status !== 'active') return null;
  const p = m.preferences;
  if (!p)
    return (
      <button
        onClick={onDiscuss}
        className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-left text-[12px] text-mist-300 hover:border-flood-400/50 hover:text-flood-200"
      >
        <span>💬</span>
        <span className="flex-1">Discuss the brief: ask about wage, key qualities and age</span>
        <span className="text-[10px] uppercase tracking-wider text-mist-400">Free</span>
      </button>
    );
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-lg border border-flood-400/20 bg-flood-500/[0.05] px-3 py-2"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-flood-300">
        <span>💬 What they'd like</span>
        <span className="text-mist-400">discussed {formatDate(p.discussedOn)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="chip text-mist-100">wage up to {formatUSD(p.maxWage)}/wk</span>
        <span className="chip text-mist-100">
          ideally aged {p.idealAge[0]}–{p.idealAge[1]}
        </span>
        {p.keyAttributes.map((k) => (
          <span key={k.attribute} className="chip text-mist-100">
            {k.label} {k.min}+
          </span>
        ))}
      </div>
      <div className="mt-1.5 text-[11px] text-mist-400">Preferences, not requirements: a player who meets them all is easier to get signed off.</div>
      {m.negotiation.length > 0 && (
        <div className="mt-2.5 border-t border-white/[0.06] pt-2">
          <div className="text-[10px] uppercase tracking-wider text-flood-300">Negotiate</div>
          <ul className="mt-1 flex flex-col gap-1">
            {m.negotiation.map((n) => (
              <li key={n.key} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate">
                  {n.label}
                  {n.rewardCut && !n.outcome && <span className="text-alert-400/80"> · reward −{Math.round(n.rewardCut * 100)}%</span>}
                </span>
                {n.outcome ? (
                  <span className={`w-20 text-right text-[11px] font-semibold ${n.outcome === 'agreed' ? 'text-grass-300' : 'text-alert-400'}`}>
                    {n.outcome === 'agreed' ? '✓ Agreed' : '✕ Refused'}
                  </span>
                ) : (
                  <button
                    disabled={busy}
                    className="btn-ghost w-20 px-2 py-0.5 text-[11px]"
                    title={`Your read: ${Math.round(n.chance * 100)}% they agree. A refusal costs a little goodwill.`}
                    onClick={() => {
                      setBusy(true);
                      void onNegotiate(n.key).then((msg) => {
                        setReply(msg || undefined);
                        setBusy(false);
                      });
                    }}
                  >
                    Ask · {Math.round(n.chance * 100)}%
                  </button>
                )}
              </li>
            ))}
          </ul>
          {reply && <div className="mt-1.5 text-[11px] italic text-mist-200">“{reply}”</div>}
          <div className="mt-1 text-[10px] text-mist-400">
            Each term can be asked once. Loosening a requirement costs part of the reward; a refusal costs a little goodwill.
          </div>
        </div>
      )}
    </motion.div>
  );
}

/** Hand the brief to a senior assistant, or take it back. */
function Delegate({ m, onDelegate, onRecall }: { m: MissionView; onDelegate: (assistantId: number) => void; onRecall: (assistantId: number) => void }) {
  if (m.delegatedTo)
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-violet-400/25 bg-violet-500/[0.06] px-3 py-2 text-[12px]">
        <span className="text-mist-200">
          <b>{m.delegatedTo.name}</b> is handling this brief: he shortlists and pitches under your name, and keeps {m.delegateCutPct}% of what it earns.
        </span>
        <button className="btn-ghost shrink-0 px-2 py-1 text-[11px]" onClick={() => onRecall(m.delegatedTo!.id)}>
          Take it back
        </button>
      </div>
    );
  const ready = m.delegates.filter((d) => d.ok);
  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] px-3 py-2 text-[12px]">
      <div className="mb-1.5 text-mist-400">
        Hand it to an assistant: he finds and pitches players himself, for {m.delegateCutPct}% of the reward and signing bonus. A weak pick costs <i>your</i> standing.
      </div>
      <div className="flex flex-wrap gap-1.5">
        {m.delegates.map((d) => (
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
      {!ready.length && <div className="mt-1 text-[11px] text-mist-500">{m.delegates[0]?.reason}</div>}
    </div>
  );
}
