import { motion } from 'motion/react';
import type { PlayerId } from '../../engine/core/ids';
import { formatDate } from '../../engine/core/calendar';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABEL, type Position } from '../../engine/model/player';
import { AttrBar, KnowledgeMeter, Loading, Money, OvrBadge, Panel, PosBadge, StatTile, TierBadge, ratingColor, useCultureLookup } from '../components/ui';
import { ScoutingPanel } from '../components/scouting-panel';
import { FreelanceCard } from '../components/freelance-card';
import { RivalWarning } from '../components/rival-warning';
import { Crest } from '../visuals/crest';
import { ClubLink } from '../components/club-link';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

/** Where each position sits on a horizontal pitch map (x: own goal → opponent goal, y: left → right). */
const POS_XY: Record<Position, [number, number]> = {
  GK: [6, 50],
  CB: [22, 50],
  LB: [26, 14],
  RB: [26, 86],
  LWB: [40, 10],
  RWB: [40, 90],
  DM: [38, 50],
  CM: [52, 50],
  AM: [68, 50],
  LM: [55, 14],
  RM: [55, 86],
  LW: [76, 16],
  RW: [76, 84],
  ST: [88, 50],
};

export function PlayerScreen({ id }: { id: PlayerId }) {
  const p = useEngineQuery(() => engine.getPlayer(id), [id]);
  const navigate = useGame((s) => s.navigate);
  const cultureOf = useCultureLookup();
  if (p === undefined) return <Loading label="Pulling the file" />;
  if (p === null)
    return (
      <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
        <div className="panel-title text-flood-400">File closed</div>
        <p className="mt-2 text-mist-300">This player has retired from professional football.</p>
      </div>
    );
  const shirt = p.club?.colors.primary ?? 'var(--color-night-600)';
  const trim = p.club?.colors.secondary ?? 'var(--color-mist-400)';
  const groups = (
    p.naturalPosition === 'GK' ? ['Goalkeeping', 'Mental', 'Physical', 'Technical'] : ['Technical', 'Mental', 'Physical']
  ) as (keyof typeof ATTRIBUTE_GROUPS)[];

  return (
    <div className="flex flex-col gap-4">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-night-900"
        style={{
          backgroundImage: `linear-gradient(110deg, ${shirt}40, transparent 55%), radial-gradient(500px 200px at 85% -10%, rgba(255,236,170,0.18), transparent 70%)`,
        }}
      >
        <div className="relative flex flex-wrap items-end gap-6 p-6">
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 16 }}>
            <Portrait
              seed={p.portraitSeed}
              culture={cultureOf(p.nationality.id)}
              size={140}
              age={p.age}
              shirt={shirt}
              trim={trim}
              className="rounded-xl shadow-2xl ring-1 ring-white/10"
            />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <PosBadge pos={p.naturalPosition} />
              {p.isCaptain && <span className="chip border-flood-500/40 text-flood-300">Captain</span>}
              {p.isFreeAgent && <span className="chip border-grass-400/40 text-grass-300">Free agent</span>}
              {p.assistantReport && (
                <span className="chip border-grass-400/40 text-grass-300" title="Your assistant's rating. Your own estimate may differ.">
                  {p.assistantReport.by} rates him {p.assistantReport.rating}
                </span>
              )}
              {p.representation?.status === 'represented' && <span className="chip border-flood-500/40 text-flood-300">Your client</span>}
              {p.mandate?.status === 'active' && <span className="chip border-flood-500/40 text-flood-300">For sale via you</span>}
              {p.injury && (
                <span className="chip border-alert-500/40 text-alert-400">
                  Injured · {p.injury.description} · back {formatDate(p.injury.until)}
                </span>
              )}
            </div>
            <div className="mt-2 text-lg font-medium text-mist-300">{p.firstName}</div>
            <h1 className="font-display text-6xl font-bold uppercase leading-[0.85] tracking-tight">{p.lastName}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-mist-300">
              <span>
                <b className="text-mist-100">{p.age}</b> yrs · born {formatDate(p.birthDate)}
              </span>
              <span>{p.nationality.name}</span>
              <span>{p.heightCm} cm</span>
              <span>{p.foot} foot</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <OvrBadge ovr={p.ovr} range={p.ovrRange} size="lg" />
            <span className="panel-title text-[10px]">{p.ovrRange[0] === p.ovrRange[1] ? 'Overall' : 'Estimated'}</span>
            <KnowledgeMeter level={p.knowledge} compact />
          </div>
        </div>
        {p.club && (
          <button
            onClick={() => navigate({ screen: 'club', id: p.club!.id })}
            className="relative flex w-full items-center gap-3 border-t border-white/[0.06] bg-black/20 px-6 py-3 text-left transition-colors hover:bg-black/30"
          >
            <Crest club={p.club} size={26} />
            <span className="font-semibold">{p.club.name}</span>
            <TierBadge tier={p.club.tier} compact />
            <span className="text-sm text-mist-400">
              {p.club.leagueName} · {p.club.countryName}
            </span>
            <span className="ml-auto text-xs text-mist-400">View club →</span>
          </button>
        )}
      </motion.header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Market value" accent="var(--color-flood-400)">
          <Money value={p.value} animated />
        </StatTile>
        <StatTile label="Wage" accent="var(--color-sky-400)">
          {p.isFreeAgent ? (
            '–'
          ) : (
            <>
              <Money value={p.wage} animated />
              <span className="text-sm text-mist-400">/wk</span>
            </>
          )}
        </StatTile>
        <StatTile label="Contract" accent="var(--color-mist-300)">
          {p.contractUntil ? formatDate(p.contractUntil) : 'None'}
        </StatTile>
        <StatTile
          label="Potential"
          sub={p.potential ? (p.prodigy ? '★ A genuine prodigy' : 'Your judgement of his ceiling') : 'Learn more to judge his ceiling'}
          accent="var(--color-alert-400)"
        >
          {p.potential ? (
            <span className={p.prodigy ? 'text-flood-300' : ''}>
              {p.potential[0] === p.potential[1] ? p.potential[0] : `${p.potential[0]}–${p.potential[1]}`}
            </span>
          ) : (
            <span className="text-xl text-mist-400">? ? ?</span>
          )}
        </StatTile>
      </div>

      <RivalWarning rivals={p.rivalInterest} />

      <FreelanceCard player={p} />

      <ScoutingPanel player={p} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title="This season" right={<span className="text-[11px] text-mist-400">League matches</span>}>
          <div className="grid grid-cols-3 gap-px bg-white/[0.04] md:grid-cols-6">
            <SeasonStat label="Apps" value={p.stats.apps} sub={`${p.stats.starts} starts`} />
            <SeasonStat
              label={p.naturalPosition === 'GK' ? 'Clean sheets' : 'Goals'}
              value={p.naturalPosition === 'GK' ? p.stats.cleanSheets : p.stats.goals}
            />
            <SeasonStat label="Assists" value={p.stats.assists} />
            <SeasonStat label="Tackles" value={p.stats.tackles} />
            <SeasonStat label="Captain" value={p.stats.captaincies} />
            <SeasonStat label="Avg rating" value={p.stats.avgRating?.toFixed(2) ?? '–'} sub={p.stats.motm ? `${p.stats.motm}× MOTM` : undefined} />
          </div>
        </Panel>
        <Panel title="Career">
          {p.history.length === 0 ? (
            <div className="p-6 text-center text-sm text-mist-400">No completed seasons yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-mist-400">
                  <th className="py-2 pl-4 font-medium">Season</th>
                  <th className="font-medium">Club</th>
                  <th className="num text-right font-medium">Apps</th>
                  <th className="num text-right font-medium">G</th>
                  <th className="num pr-4 text-right font-medium">Rtg</th>
                </tr>
              </thead>
              <tbody>
                {p.history.map((h) => (
                  <tr key={h.season} className="border-b border-white/[0.04]">
                    <td className="num py-1.5 pl-4 text-mist-300">{h.season}</td>
                    <td>
                      {h.club ? (
                        <span className="flex items-center gap-1.5">
                          <Crest club={h.club} size={14} />
                          <ClubLink club={h.club} />
                        </span>
                      ) : (
                        <span className="text-mist-400">Free agent</span>
                      )}
                    </td>
                    <td className="num text-right">{h.apps}</td>
                    <td className="num text-right">{h.goals}</td>
                    <td className="num pr-4 text-right">{h.avgRating?.toFixed(1) ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <Panel
          title="Attributes"
          right={p.ovrRange[0] !== p.ovrRange[1] ? <span className="text-[11px] text-mist-400">Ranges narrow as you learn more</span> : undefined}
        >
          <div className={`grid grid-cols-1 gap-x-8 gap-y-4 p-4 ${groups.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            {groups.map((g) => (
              <div key={g}>
                <div className="panel-title mb-2 text-[11px] text-flood-400">{g}</div>
                {ATTRIBUTE_GROUPS[g].map((k) => (
                  <AttrBar key={k} label={ATTRIBUTE_LABEL[k]} value={p.attributes[k]} />
                ))}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Positions">
          <div className="p-4">
            <div
              className="relative aspect-[100/64] w-full overflow-hidden rounded-lg"
              style={{ background: 'repeating-linear-gradient(90deg, #0f4d2e 0 10%, #125a36 10% 20%)' }}
            >
              <svg viewBox="0 0 100 64" className="absolute inset-0 h-full w-full" aria-hidden>
                <g fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={0.4}>
                  <rect x={1} y={1} width={98} height={62} />
                  <line x1={50} y1={1} x2={50} y2={63} />
                  <circle cx={50} cy={32} r={7} />
                  <rect x={1} y={18} width={14} height={28} />
                  <rect x={85} y={18} width={14} height={28} />
                </g>
              </svg>
              {p.positionRatings
                .filter((r) => r.familiarity > 0 || r.position === p.naturalPosition)
                .map((r, i) => {
                  const [x, y] = POS_XY[r.position];
                  const mid = (r.ovr[0] + r.ovr[1]) / 2;
                  const c = ratingColor(mid);
                  return (
                    <motion.div
                      key={r.position}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                      style={{ left: `${x}%`, top: `${y}%` }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1 + i * 0.06, type: 'spring' }}
                    >
                      <span
                        className="num flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[12px] font-bold text-night-950"
                        style={{ background: c, boxShadow: `0 0 14px ${c}`, opacity: 0.45 + r.familiarity * 0.55 }}
                      >
                        {r.ovr[0] === r.ovr[1] ? r.ovr[0] : Math.round(mid)}
                      </span>
                      <span className="num mt-0.5 text-[10px] font-bold text-white/80">{r.position}</span>
                    </motion.div>
                  );
                })}
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1">
              {p.positionRatings.map((r) => (
                <div key={r.position} className={`rounded py-1 text-center ${r.familiarity > 0 ? 'bg-white/[0.05]' : 'opacity-40'}`}>
                  <div className="num text-[10px] text-mist-400">{r.position}</div>
                  <div className="num text-[12px] font-bold" style={{ color: ratingColor((r.ovr[0] + r.ovr[1]) / 2) }}>
                    {r.ovr[0] === r.ovr[1] ? r.ovr[0] : `${r.ovr[0]}–${r.ovr[1]}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const SeasonStat = ({ label, value, sub }: { label: string; value: number | string; sub?: string }) => (
  <div className="bg-night-900 px-4 py-3">
    <div className="text-[10px] uppercase tracking-wider text-mist-400">{label}</div>
    <div className="num mt-1 text-2xl font-bold leading-none">{value}</div>
    {sub && <div className="mt-1 text-[10px] text-mist-400">{sub}</div>}
  </div>
);
