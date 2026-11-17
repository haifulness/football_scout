import { motion } from 'motion/react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { AwardResult } from '../../engine/model/goals';
import type { GoalsView, ObjectiveView, SpecialtyView, TrophyView } from '../../engine/views';
import { ClubLink } from '../components/club-link';
import { Collapsible, Loading, Panel } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';
import { Cup } from '../components/trophy-reveal';
import { Legacy } from '../components/legacy';

const STATUS = {
  done: { label: 'Done', className: 'border-grass-400/50 text-grass-300' },
  missed: { label: 'Missed', className: 'border-white/10 text-mist-400' },
  active: { label: 'In progress', className: 'border-flood-400/40 text-flood-300' },
} as const;


export function GoalsScreen() {
  const g = useEngineQuery(() => engine.getGoals(), []);
  if (!g) return <Loading label="Polishing the cabinet" />;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-flood-300">Goals, awards & specialties</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">Goals</h1>
        <p className="mt-2 max-w-2xl text-sm text-mist-400">
          Each season brings three goals suited to where you are, paid with a bonus and reputation the moment you reach them. When the season ends, scouts
          are voted Scout of the Year in your country and worldwide, and the best new signing in each league is named. Where your placements cluster, you
          earn a specialty, and clubs in that niche come looking for you.
        </p>
      </header>

      <Objectives g={g} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Specialties g={g} />
        <Cabinet trophies={g.trophies} />
      </div>
      {g.lastAwards && <Awards label={g.lastAwards.label} awards={g.lastAwards.awards} />}
      <Legacy />
      {g.past.length > 0 && (
        <Collapsible id="goals-past" title="Past seasons' goals" count={g.past.length}>
          <ul>
            {g.past.map((s) => (
              <li key={s.season} className="flex flex-wrap items-center gap-2 border-b border-white/[0.04] px-4 py-2 text-sm last:border-0">
                <span className="num w-16 font-semibold">{s.label}</span>
                <span className="text-[12px] text-mist-400">
                  {s.items.filter((i) => i.status === 'done').length}/{s.items.length}
                </span>
                {s.items.map((i, k) => (
                  <span key={k} className={`chip ${STATUS[i.status].className}`}>
                    {i.status === 'done' ? '✓ ' : ''}
                    {i.title}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

function Objectives({ g }: { g: GoalsView }) {
  const done = g.objectives.filter((o) => o.status === 'done').length;
  return (
    <Panel
      title={`This season · ${g.seasonLabel}`}
      right={
        <span className="text-[12px] text-mist-400">
          {done} of {g.objectives.length} reached{done === 3 ? ' · clean sweep!' : ' · all three earn a Clean sweep trophy'}
        </span>
      }
    >
      {g.objectives.length ? (
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {g.objectives.map((o) => (
            <ObjectiveCard key={o.id} o={o} />
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-mist-400">Your goals for the season arrive with the new season.</div>
      )}
    </Panel>
  );
}

function fmt(o: ObjectiveView, n: number) {
  return o.unit === 'money' ? formatUSD(n, { compact: true }) : String(Math.round(n));
}

function ObjectiveCard({ o }: { o: ObjectiveView }) {
  const from = o.unit === 'reputation' ? (o.start ?? 0) : 0;
  const frac = Math.max(0, Math.min(1, (o.progress - from) / Math.max(1, o.target - from)));
  const shown = o.status === 'done' ? 1 : frac;
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-3 ${o.status === 'done' ? 'border-grass-400/40 bg-grass-500/[0.06]' : 'border-white/[0.07] bg-white/[0.02]'}`}
    >
      <div className="flex items-start gap-2">
        <div className="font-semibold leading-snug">{o.title}</div>
        <span className={`chip ml-auto shrink-0 ${STATUS[o.status].className}`}>{STATUS[o.status].label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div
          className={`h-full rounded-full ${o.status === 'done' ? 'bg-grass-400' : 'bg-flood-400'}`}
          initial={{ width: 0 }}
          animate={{ width: `${shown * 100}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      <div className="flex items-center gap-2 text-[12px] text-mist-400">
        <span className="num">
          {o.status === 'done' ? 'Reached' : `${fmt(o, Math.max(o.progress, o.unit === 'money' ? o.progress : 0))} / ${fmt(o, o.target)}`}
          {o.doneOn ? ` on ${formatDate(o.doneOn)}` : ''}
        </span>
        <span className="ml-auto">
          {formatUSD(o.reward.money)} · rep +{o.reward.reputation}
        </span>
      </div>
      {o.atSeasonEnd && o.status === 'active' && <div className="text-[11px] text-mist-400">Judged when the season ends.</div>}
    </div>
  );
}

function Specialties({ g }: { g: GoalsView }) {
  const earned = g.specialties.filter((s) => s.level > 0);
  const near = g.specialties.filter((s) => s.level === 0).slice(0, 4);
  return (
    <Panel title="Specialties" right={<span className="text-[12px] text-mist-400">from {g.placements} placements</span>}>
      <div className="flex flex-col gap-3 p-4">
        {earned.length ? (
          earned.map((s) => <SpecialtyRow key={s.key} s={s} />)
        ) : (
          <div className="text-sm text-mist-400">
            No specialty yet. Place {g.rules.specialistCount} players in the same niche (a continent other than your own, a position group, young players or
            free agents), making up at least {Math.round(g.rules.share * 100)}% of all your placements.
          </div>
        )}
        {near.length > 0 && (
          <div>
            <div className="panel-title mb-1 text-[11px]">Building</div>
            <ul className="flex flex-col gap-1">
              {near.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  <span className="text-mist-300">{s.label}</span>
                  <span className="ml-auto text-[12px] text-mist-400">
                    {s.count} placed · {Math.round(s.share * 100)}%
                    {s.needed > 0 ? ` · ${s.needed} more` : ` · needs ${Math.round(g.rules.share * 100)}% of your placements`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="text-[11px] text-mist-400">
          Specialist at {g.rules.specialistCount} placements, expert at {g.rules.expertCount}, while the niche is at least {Math.round(g.rules.share * 100)}% of
          your work.
        </div>
      </div>
    </Panel>
  );
}

function SpecialtyRow({ s }: { s: SpecialtyView }) {
  return (
    <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.05] p-3">
      <div className="flex items-center gap-2">
        <span className="chip border-violet-400/50 text-violet-200">{s.level === 2 ? '★★' : '★'}</span>
        <span className="font-semibold">{s.label}</span>
        <span className="ml-auto text-[12px] text-mist-400">
          {s.count} placed · {Math.round(s.share * 100)}%{s.level === 1 && s.needed > 0 ? ` · expert in ${s.needed}` : ''}
        </span>
      </div>
      <div className="mt-1 text-[12px] text-mist-400">{s.effect}</div>
    </div>
  );
}

function Cabinet({ trophies }: { trophies: TrophyView[] }) {
  return (
    <Panel title="Trophy cabinet" right={<span className="text-[12px] text-mist-400">{trophies.length} won</span>}>
      {trophies.length ? (
        <ul className="grid gap-2 p-4 sm:grid-cols-2">
          {trophies.map((t, i) => (
            <motion.li
              key={t.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.04 }}
              className="flex items-start gap-3 rounded-xl border border-flood-400/25 bg-flood-500/[0.05] p-3"
            >
              <span className="shrink-0" aria-hidden>
                <Cup size={40} kind={t.kind} />
              </span>
              <div className="min-w-0">
                <div className="font-semibold leading-snug">{t.title}</div>
                <div className="text-[12px] text-mist-400">{t.detail}</div>
                {t.club && (
                  <div className="mt-1 flex items-center gap-1.5 text-[12px]">
                    <Crest club={t.club} size={16} />
                    <ClubLink club={t.club} />
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      ) : (
        <div className="p-6 text-center text-sm text-mist-400">
          Empty for now. Reach all three season goals, win a Scout of the Year vote, or place the best new signing in a league.
        </div>
      )}
    </Panel>
  );
}

export function Awards({ label, awards }: { label: string; awards: AwardResult[] }) {
  const { navigate } = useGame();
  const votes = awards.filter((a) => a.table);
  const signings = awards.filter((a) => a.kind === 'signing');
  return (
    <Panel title={`${label} awards`}>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {votes.map((a) => (
          <div key={a.kind}>
            <div className="flex items-center gap-2">
              <div className="font-semibold">{a.title}</div>
              <span className={`chip ml-auto ${a.you ? 'border-flood-400/60 text-flood-300' : 'text-mist-300'}`}>
                {a.you ? 'You won!' : a.yourPlace ? `You: ${a.yourPlace}${a.yourPlace === 1 ? 'st' : a.yourPlace === 2 ? 'nd' : a.yourPlace === 3 ? 'rd' : 'th'}` : 'You: no signings'}
              </span>
            </div>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-mist-400">
                  <th className="w-6 font-normal">#</th>
                  <th className="font-normal">Scout</th>
                  <th className="text-right font-normal">Signings</th>
                  <th className="text-right font-normal">Rep</th>
                  <th className="text-right font-normal">Points</th>
                </tr>
              </thead>
              <tbody>
                {a.table!.map((r, i) => (
                  <tr key={i} className={r.you ? 'font-semibold text-flood-300' : ''}>
                    <td className="num py-0.5">{i + 1}</td>
                    <td>{r.you ? `${r.name} (you)` : r.name}</td>
                    <td className="num text-right">{r.signings}</td>
                    <td className="num text-right">{r.reputation}</td>
                    <td className="num text-right">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {signings.length > 0 && (
          <div className="lg:col-span-2">
            <div className="font-semibold">Signing of the Season</div>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {signings.map((a) => (
                <li key={a.title} className="flex flex-wrap items-center gap-2">
                  <span className="text-mist-400">{a.title.replace('Signing of the Season · ', '')}:</span>
                  <button className="font-semibold hover:underline" onClick={() => a.playerId && navigate({ screen: 'player', id: a.playerId })}>
                    {a.winner}
                  </button>
                  <span className="text-[12px] text-mist-400">{a.detail?.split(': ')[1]}</span>
                  {a.you && <span className="chip border-flood-400/60 text-flood-300">Your signing!</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!votes.length && !signings.length && <div className="text-sm text-mist-400">No awards were voted this season.</div>}
      </div>
    </Panel>
  );
}
