import { AnimatePresence, motion } from 'motion/react';
import { ReportBlock } from './report-panel';
import { useState, type ReactNode } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { MeetingView, PlayerView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { engine } from '../store/engine-client';
import { useGame } from '../store/game-store';
import { RelationshipBar } from './relationship';

const MILESTONES = [
  { level: 40, label: 'Potential range' },
  { level: 60, label: 'Personality & fitness traits' },
  { level: 70, label: 'Prodigy check' },
  { level: 80, label: 'Ambition' },
  { level: 100, label: 'Exact ratings' },
];

/** What you know about a player, what knowing more unlocks, and the fieldwork that gets you there. */
export function ScoutingPanel({ player: p }: { player: PlayerView }) {
  const { watchVideo, scoutLive, meet, openTravel, openRecommend, advancing, touch, scout, navigate } = useGame();
  const [flash, setFlash] = useState<string>();
  const [error, setError] = useState<string>();

  const act = async (fn: () => Promise<string>) => {
    setError(undefined);
    try {
      setFlash(await fn());
      setTimeout(() => setFlash(undefined), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
  };
  const video = () =>
    act(async () => {
      const r = await watchVideo(p.id);
      return `Video: +${r.after - r.before} knowledge for ${formatUSD(r.cost)}`;
    });
  const live = () =>
    act(async () => {
      const r = await scoutLive(p.id);
      return r.played
        ? `Watched him live: +${r.after - r.before} knowledge (and a look at ${r.others} others)`
        : `He didn't play. You learned a little from the warm-up (+${r.after - r.before}).`;
    });
  const meetHim = () =>
    act(async () => {
      const r = await meet({ kind: 'player', id: p.id });
      return `Rapport ${r.before} → ${r.after}`;
    });
  const togglePool = async () => {
    if (p.inPool) await engine.removeFromPool(p.id);
    else await engine.addToPool(p.id);
    await touch();
  };
  const toggleStar = async () => {
    if (!p.inPool) await engine.addToPool(p.id);
    await engine.setStarred(p.id, !p.starred);
    await touch();
  };
  const money = scout?.money ?? 0;

  return (
    <section className="panel overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">
        <div className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="panel-title">Your knowledge</span>
            <span className="num text-2xl font-bold">
              {p.knowledge}
              <span className="text-sm text-mist-400">/100</span>
            </span>
          </div>
          <div className="relative mt-3 h-2 rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-mist-400 via-flood-400 to-grass-400"
              initial={{ width: 0 }}
              animate={{ width: `${p.knowledge}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
            {MILESTONES.map((m) => (
              <span
                key={m.level}
                className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full"
                style={{ left: `calc(${m.level}% - 1px)`, background: p.knowledge >= m.level ? '#2fcf73' : '#34505c' }}
                title={`${m.level}: ${m.label}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MILESTONES.map((m) => (
              <span key={m.level} className={`chip ${p.knowledge >= m.level ? 'border-grass-400/30 text-grass-300' : 'opacity-60'}`}>
                {p.knowledge >= m.level ? '✓' : m.level} {m.label}
              </span>
            ))}
          </div>
          {p.traits && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="chip">
                Consistency: <b className="text-mist-100">{p.traits.consistency}</b>
              </span>
              <span className="chip">
                Fitness: <b className="text-mist-100">{p.traits.injuryRisk}</b>
              </span>
              {p.traits.ambition && (
                <span className="chip">
                  Ambition: <b className="text-mist-100">{p.traits.ambition}</b>
                </span>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Block title="Watch him live" hint="The only way past what footage shows">
              {p.live ? (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-mist-400">{p.live.home ? 'vs' : 'at'}</span>
                    <Crest club={p.live.opponent} size={18} />
                    <span className="truncate font-medium">{p.live.opponent.name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-mist-400">
                    {formatDate(p.live.date)} · in {p.live.daysAway} day{p.live.daysAway === 1 ? '' : 's'} · {p.live.venue.name} · ticket{' '}
                    {formatUSD(p.live.ticket)}
                  </div>
                  {p.live.inPlace ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        className="btn-primary py-1.5 text-xs"
                        disabled={advancing || money < p.live.ticket}
                        onClick={() => navigate({ screen: 'matchday', id: p.id })}
                        title="Watch the match unfold and pick up to three players to study closely"
                      >
                        Attend & watch closely
                      </button>
                      <button
                        className="btn-ghost py-1.5 text-xs"
                        disabled={advancing || money < p.live.ticket}
                        onClick={() => void live()}
                        title="Go, watch, and come back with the usual impression"
                      >
                        Quick watch ({p.live.daysAway}d)
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-ghost mt-2 w-full py-1.5 text-xs"
                      disabled={advancing}
                      onClick={() => openTravel(p.live!.venue.id, { label: `Watch ${p.firstName} ${p.lastName} live`, route: { screen: 'player', id: p.id } })}
                    >
                      Travel to {p.live.venue.name}
                    </button>
                  )}
                </>
              ) : (
                <div className="text-xs text-mist-400">
                  {p.isFreeAgent ? 'Free agents have no matches. Meet him instead.' : 'No league match in the next three weeks.'}
                </div>
              )}
            </Block>

            <Block title="Meet him" hint="Rapport makes him easier to sign, and lowers his wage demand in your deals (up to 20%)">
              {p.meeting ? (
                <MeetingControls
                  meeting={p.meeting}
                  money={money}
                  busy={advancing}
                  onMeet={() => void meetHim()}
                  onTravel={() =>
                    p.meeting!.city && openTravel(p.meeting!.city.id, { label: `Meet ${p.firstName} ${p.lastName}`, route: { screen: 'player', id: p.id } })
                  }
                />
              ) : (
                <div className="text-xs text-mist-400">Set up your scout first.</div>
              )}
            </Block>
          </div>
          {scout && <ReportBlock playerId={p.id} estimate={p.ovrRange} />}
        </div>

        <div className="flex flex-col justify-center gap-2 border-t border-white/[0.05] bg-black/20 p-4 lg:border-l lg:border-t-0">
          <button onClick={() => void video()} disabled={advancing || !p.video.available || !scout || money < p.video.cost} className="btn-primary w-full">
            {p.video.available ? `Watch video · ${formatUSD(p.video.cost)} · 1 day` : 'Footage exhausted'}
          </button>
          <div className="text-center text-[11px] text-mist-400">
            {p.video.available ? `+${p.video.gain} knowledge (video tops out at 60).` : 'Watch him live to learn more.'}
          </div>
          <button className="btn-ghost w-full border-flood-400/40 text-flood-300" disabled={!scout} onClick={() => openRecommend({ playerId: p.id })}>
            Recommend to a club…
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void togglePool()} className="btn-ghost px-2 text-xs">
              {p.inPool ? '✓ In pool' : '+ Add to pool'}
            </button>
            <button onClick={() => void toggleStar()} className={`btn-ghost px-2 text-xs ${p.starred ? 'text-flood-300' : ''}`}>
              {p.starred ? '★ Starred' : '☆ Star'}
            </button>
          </div>
          <AnimatePresence>
            {flash && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg bg-grass-500/10 px-3 py-2 text-center text-xs font-semibold text-grass-300"
              >
                {flash}
              </motion.div>
            )}
          </AnimatePresence>
          {error && <div className="rounded-lg bg-alert-500/10 px-3 py-2 text-center text-xs text-alert-400">{error}</div>}
        </div>
      </div>
    </section>
  );
}

const Block = ({ title, hint, children }: { title: string; hint: string; children: ReactNode }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-mist-300">{title}</div>
    <div className="mb-2 text-[10px] text-mist-400">{hint}</div>
    {children}
  </div>
);

/** Relationship bar plus the right next step: meet, travel first, or why they won't see you. */
export function MeetingControls({
  meeting,
  money,
  busy,
  onMeet,
  onTravel,
}: {
  meeting: MeetingView;
  money: number;
  busy: boolean;
  onMeet: () => void;
  onTravel: () => void;
}) {
  return (
    <>
      <RelationshipBar level={meeting.level} label={meeting.label} />
      {!meeting.allowed ? (
        <div className="mt-2 text-[11px] text-alert-400">Won't meet you yet: needs reputation {meeting.requiredReputation}.</div>
      ) : meeting.inPlace ? (
        <button className="btn-primary mt-2 w-full py-1.5 text-xs" disabled={busy || money < meeting.cost} onClick={onMeet}>
          {meeting.colleague ? 'Meet your colleague · free' : `${meeting.firstMeeting ? 'First meeting' : 'Catch up'} · ${formatUSD(meeting.cost)}`} ·{' '}
          {meeting.metToday ? 'same day' : '1 day'}
          {meeting.recentlyMet ? ' (met recently)' : ''}
        </button>
      ) : meeting.city ? (
        <button
          className="btn mt-2 w-full border border-flood-400/50 bg-flood-500/[0.12] py-1.5 text-xs font-semibold text-flood-200 shadow-[0_0_20px_-8px_var(--color-flood-400)] hover:bg-flood-500/[0.22]"
          disabled={busy}
          onClick={onTravel}
        >
          ✈ Travel to {meeting.city.name} to meet
        </button>
      ) : (
        <div className="mt-2 text-[11px] text-mist-400">Be anywhere in {meeting.countryName} and he'll come to you.</div>
      )}
    </>
  );
}
