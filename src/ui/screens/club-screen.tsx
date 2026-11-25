import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { ClubId } from '../../engine/core/ids';
import type { Position } from '../../engine/model/player';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { ClubView, OfficialView, PlayerRow } from '../../engine/views';
import { FormationPitch } from '../components/formation-pitch';
import { FixtureRow } from '../components/match';
import { MeetingControls } from '../components/scouting-panel';
import { Loading, Money, OvrBadge, Panel, PosBadge, StatTile, TierBadge, ratingColor, useCulture, useCultureLookup } from '../components/ui';
import { Crest, darken } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

export function ClubScreen({ id }: { id: ClubId }) {
  const club = useEngineQuery(() => engine.getClub(id), [id]);
  const navigate = useGame((s) => s.navigate);
  const searchFor = useGame((s) => s.searchFor);
  const pool = useEngineQuery(() => engine.getPool(), []);
  const [browse, setBrowse] = useState<Position>();
  if (!club) return <Loading label="Entering the stadium" />;
  // Turn needs into a search: the position(s), a rating that beats the average, what the club can pay, in its country.
  const searchNeeds = (needs: typeof club.needs) =>
    searchFor({
      positions: needs.map((n) => n.position),
      // Each position has its own bar: a candidate must beat the average where he would play.
      ratingFloors: Object.fromEntries(needs.map((n) => [n.position, (n.positionalAverage || 0) + 1])),
      maxValue: club.transferBudget > 0 ? club.transferBudget : undefined,
      countryId: club.country.id,
      clubId: club.id,
      clubName: club.name,
      label: `${club.name}: ${needs.map((n) => n.position).join('/')}`,
    });
  const topNeeds = club.needs.filter((n) => n.severity >= 0.2).slice(0, 3);
  const openPlayer = (pid: string) => navigate({ screen: 'player', id: pid as PlayerRow['id'] });
  // Your pool by position, minus players already at this club.
  const poolAt = (pos: Position) => (pool ?? []).filter((p) => p.position === pos && p.club?.id !== club.id);
  const browseNeed = club.needs.find((n) => n.position === browse);

  return (
    <div className="flex flex-col gap-4">
      <ClubHero club={club} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Transfer budget" accent="var(--color-good-400)">
          <Money value={club.transferBudget} animated />
        </StatTile>
        <StatTile label="Wage budget" sub={`Bill ${formatUSD(club.wageBill)}/wk`} accent="var(--color-sky-400)">
          <Money value={club.wageBudget} animated />
          <span className="text-sm text-mist-400">/wk</span>
        </StatTile>
        <StatTile label="Squad value" accent="var(--color-flood-400)">
          <Money value={club.squadValue} animated />
        </StatTile>
        <StatTile label="Average age" accent="var(--color-mist-300)">
          {club.averageAge}
        </StatTile>
        <StatTile label="Prospects" sub="Below-average youngsters" accent="var(--color-alert-400)">
          <span className="text-xl">
            {club.acceptsProspects === 'yes' ? 'Welcome' : club.acceptsProspects === 'prodigies' ? 'Prodigies only' : 'Not wanted'}
          </span>
        </StatTile>
      </div>

      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
        <span className="panel-title text-[11px]">How they play</span>
        <span className="font-display text-lg font-semibold uppercase leading-none text-flood-300">{club.style.label}</span>
        <span className="min-w-[200px] flex-1 text-[12px] text-mist-300">{club.style.blurb}</span>
        <span className="flex flex-wrap gap-1">
          {club.style.attrs.map((a) => (
            <span key={a} className="chip text-[11px]">
              {a}
            </span>
          ))}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[440px_1fr]">
        <Panel title={`Best XI · ${club.formation}`} right={<span className="chip">Tap a player</span>}>
          <div className="p-4">
            <FormationPitch club={club} needs={club.needs} onPlayer={openPlayer} />
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel
            title="Recruitment needs"
            right={
              <span className="flex items-center gap-3">
                <span className="hidden text-[11px] text-mist-400 md:inline">A signing must beat the positional average</span>
                {topNeeds.length > 0 && (
                  <button className="btn-primary px-2.5 py-1 text-[11px]" onClick={() => searchNeeds(topNeeds)} title="Search for the most pressing needs">
                    ⌕ Search top needs ({topNeeds.map((n) => n.position).join(', ')})
                  </button>
                )}
              </span>
            }
          >
            <NeedsRead club={club} />
            {club.needs.length === 0 && club.needsRead.tier !== 'unknown' && (
              <div className="px-4 pt-3 text-[12px] text-mist-400">
                {club.needsRead.tier === 'rough' ? 'Nothing looks pressing from the outside. A closer read would show the smaller gaps.' : 'No gaps worth filling right now.'}
              </div>
            )}
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 md:grid-cols-2">
              {club.needs.map((n, i) => (
                <motion.div
                  key={n.position}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3"
                >
                  <button
                    onClick={() => searchNeeds([n])}
                    className="group flex items-center gap-1 rounded-md"
                    title={`Search for a ${n.position} rated ${(n.positionalAverage || 1) + 1}+ that ${club.name} can afford`}
                  >
                    <PosBadge pos={n.position} />
                    <span className="text-[11px] text-mist-400 group-hover:text-grass-300">⌕</span>
                  </button>
                  <button
                    onClick={() => setBrowse(browse === n.position ? undefined : n.position)}
                    className={`num shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                      browse === n.position
                        ? 'border-grass-400/70 bg-grass-500/20 text-grass-200'
                        : poolAt(n.position).length
                          ? 'border-grass-400/30 text-grass-300 hover:bg-grass-500/10'
                          : 'border-white/10 text-mist-400 hover:bg-white/[0.05]'
                    }`}
                    title={`Browse the ${n.position}s in your player pool`}
                  >
                    ☰ {poolAt(n.position).length}
                  </button>
                  <div className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: n.severity >= 0.45 ? 'var(--color-alert-500)' : n.severity >= 0.2 ? 'var(--color-flood-500)' : 'var(--color-good-400)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(6, n.severity * 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.2 + i * 0.04 }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-mist-400">
                      <span>
                        {n.severity >= 0.45 ? 'Urgent' : n.severity >= 0.2 ? 'Could improve' : 'Covered'}
                        {n.depth ? ` · depth ${n.depth}` : ''}
                      </span>
                      <span>
                        avg{' '}
                        <b className="num text-[13px]" style={{ color: n.positionalAverage ? ratingColor(n.positionalAverage) : undefined }}>
                          {!n.avgRange ? '?' : n.avgRange[0] === n.avgRange[1] ? n.avgRange[0] : `${n.avgRange[0]}–${n.avgRange[1]}`}
                        </b>
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {browseNeed && (
                <PoolBrowser
                  key={browseNeed.position}
                  need={browseNeed}
                  club={club}
                  players={poolAt(browseNeed.position)}
                  onOpen={openPlayer}
                  onExpand={() => searchNeeds([browseNeed])}
                  onClose={() => setBrowse(undefined)}
                />
              )}
            </AnimatePresence>
          </Panel>

          <OfficialCard official={club.coach} club={club} />
          {club.president && <PresidentCard club={club} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <FixturesPanel club={club} />
        <Panel title="Club history">
          {club.history.length === 0 ? (
            <div className="p-6 text-center text-sm text-mist-400">The first season is under way. Final positions are recorded here.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {club.history.map((h) => (
                  <tr key={h.season} className="border-b border-white/[0.04]">
                    <td className="num py-2 pl-4 text-mist-300">{h.season}</td>
                    <td className="text-mist-300">{h.leagueName}</td>
                    <td className="num text-right font-bold" style={{ color: h.position === 1 ? 'var(--color-flood-400)' : undefined }}>
                      {ordinal(h.position)}
                    </td>
                    <td className="num pr-4 text-right text-mist-400">{h.points} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <SquadTable club={club} onOpen={openPlayer} />
    </div>
  );
}

function ClubHero({ club }: { club: ClubView }) {
  const { primary, secondary } = club.colors;
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-white/[0.06]"
      style={{ background: `linear-gradient(115deg, ${darken(primary, 0.35)} 0%, ${darken(primary, 0.7)} 45%, var(--color-night-950) 100%)` }}
    >
      {/* stadium floodlights + stands */}
      <div className="absolute inset-0 bg-[radial-gradient(600px_220px_at_80%_-20%,rgba(255,236,170,0.28),transparent_70%)]" />
      <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 7px)' }} />
      <div
        className="absolute -right-10 top-0 h-full w-1/2 opacity-20"
        style={{ background: `repeating-linear-gradient(115deg, transparent 0 40px, ${secondary} 40px 52px)` }}
      />
      <div className="relative flex flex-wrap items-center gap-4 p-4 sm:gap-6 sm:p-6">
        <motion.div
          initial={{ scale: 0.6, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 14 }}
          className="drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]"
        >
          <Crest club={club} size={96} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={club.tier} />
            <span className="chip">{club.league.name}</span>
            {club.leaguePosition && <span className="chip border-flood-500/40 text-flood-300">{ordinal(club.leaguePosition)} place</span>}
            <span className="chip">Rep {club.reputation}</span>
            <TravelHere cityId={club.city.id} cityName={club.city.name} clubId={club.id} clubName={club.name} />
            {club.work && (
              <span
                className={`chip ${club.work.status === 'none' ? '' : club.work.status === 'employer' ? 'border-flood-400/50 text-flood-300' : 'border-grass-400/50 text-grass-300'}`}
              >
                {club.work.status === 'employer' ? 'Your employer' : club.work.status === 'client' ? 'Your client' : 'Not a client'} · standing {club.work.trust}
              </span>
            )}
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold uppercase leading-none tracking-tight drop-shadow sm:text-5xl">{club.name}</h1>
          <div className="mt-2 text-sm text-mist-300">
            {club.city.name}, {club.country.name} · Founded {club.founded} · {club.stadium} ({club.capacity.toLocaleString('en-US')})
          </div>
        </div>
        <RecommendHere clubId={club.id} />
      </div>
    </motion.header>
  );
}

const PRIORITY_LABEL: Record<keyof OfficialView['priorities'], string> = {
  tacticalFit: 'Tactical fit',
  currentAbility: 'Current ability',
  potential: 'Potential',
  value: 'Value for money',
  resale: 'Resale value',
  marketing: 'Marketing appeal',
  personality: 'Personality',
};

function OfficialCard({ official, club }: { official: OfficialView; club: ClubView }) {
  const culture = useCulture(club.country.id);
  const { meet, openTravel, advancing, scout, proposeAgreement } = useGame();
  const [error, setError] = useState<string>();
  const top = (Object.entries(official.priorities) as [keyof OfficialView['priorities'], number][]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const max = Math.max(...Object.values(official.priorities));
  return (
    <Panel title="Head Coach" right={<span className="chip">Signs off every pitch</span>}>
      <div className="flex gap-4 p-4">
        <Portrait
          seed={official.portraitSeed}
          culture={culture}
          size={72}
          age={official.age}
          shirt={official.role === 'coach' ? club.colors.primary : 'var(--color-night-700)'}
          trim={official.role === 'coach' ? club.colors.secondary : '#d4af37'}
          className="shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {official.firstName} {official.lastName}
          </div>
          <div className="text-[11px] text-mist-400">
            {official.age} · {official.nationality}
          </div>
          <div className="mt-2 space-y-1">
            {top.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className="w-28 truncate text-mist-300">{PRIORITY_LABEL[k]}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full bg-flood-400" style={{ width: `${(v / max) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-mist-400">
            {official.stubbornness >= 66 ? 'Hard to convince' : official.stubbornness >= 33 ? 'Open to a good pitch' : 'Easily persuaded'}
          </div>
        </div>
      </div>
      {official.meeting && (
        <div className="border-t border-white/[0.05] px-4 py-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-mist-400">Your standing with {club.name}</div>
          <MeetingControls
            meeting={official.meeting}
            money={scout?.money ?? 0}
            busy={advancing}
            onTravel={() =>
              openTravel(club.city.id, {
                label: `Meet the Head Coach of ${club.name}`,
                route: { screen: 'club', id: club.id },
              })
            }
            onMeet={() => {
              setError(undefined);
              meet({ kind: 'official', id: official.id }).catch((e) => setError(e instanceof Error ? e.message : 'The meeting fell through.'));
            }}
          />
          {club.work?.status === 'none' && club.work.canPropose && official.meeting.inPlace && official.meeting.allowed && (
            <button
              className="btn-ghost mt-2 w-full border-flood-400/40 py-1.5 text-xs text-flood-300"
              disabled={advancing}
              onClick={() => {
                setError(undefined);
                proposeAgreement(club.id)
                  .then((r) => setError(r.accepted ? undefined : r.reason))
                  .catch((e) => setError(e instanceof Error ? e.message : 'The meeting did not happen.'));
              }}
            >
              Propose a scouting agreement · {official.meeting.metToday ? 'same day' : '1 day'}
            </button>
          )}
          {error && <div className="mt-1 text-[11px] text-alert-400">{error}</div>}
        </div>
      )}
    </Panel>
  );
}

type SortKey = 'position' | 'name' | 'age' | 'ovr' | 'apps' | 'goals' | 'assists' | 'rating' | 'value' | 'wage' | 'contract';

const SORT_VALUE: Record<Exclude<SortKey, 'position'>, (p: PlayerRow) => number | string> = {
  name: (p) => p.name,
  age: (p) => p.age,
  ovr: (p) => p.ovr,
  apps: (p) => p.stats.apps,
  goals: (p) => p.stats.goals,
  assists: (p) => p.stats.assists,
  rating: (p) => p.stats.avgRating ?? 0,
  value: (p) => p.value,
  wage: (p) => p.wage,
  contract: (p) => p.contractUntil ?? 0,
};

function SquadTable({ club, onOpen }: { club: ClubView; onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'position', dir: 1 });
  const cultureOf = useCultureLookup();
  const rows = useMemo(() => {
    if (sort.key === 'position') return sort.dir === 1 ? club.squad : [...club.squad].reverse();
    const get = SORT_VALUE[sort.key];
    return [...club.squad].sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * sort.dir);
  }, [club.squad, sort]);

  const Th = ({ k, children, right }: { k: SortKey; children: string; right?: boolean }) => (
    <th
      className={`cursor-pointer select-none py-2 font-medium hover:text-mist-100 ${right ? 'text-right' : ''}`}
      onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : k === 'name' || k === 'position' ? 1 : -1 }))}
    >
      {children}
      {sort.key === k && <span className="ml-1 text-grass-400">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </th>
  );

  return (
    <Panel title={`Squad · ${club.squad.length} players`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-mist-400">
              <th className="w-4 pl-4" />
              <Th k="position">Pos</Th>
              <Th k="name">Player</Th>
              <th className="font-medium">Nation</th>
              <Th k="age" right>
                Age
              </Th>
              <Th k="ovr" right>
                OVR
              </Th>
              <Th k="apps" right>
                Apps
              </Th>
              <Th k="goals" right>
                G
              </Th>
              <Th k="assists" right>
                A
              </Th>
              <Th k="rating" right>
                Rtg
              </Th>
              <Th k="value" right>
                Value
              </Th>
              <Th k="wage" right>
                Wage
              </Th>
              <Th k="contract" right>
                Contract
              </Th>
              <th className="pr-4" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="data-row" onClick={() => onOpen(p.id)}>
                <td className="pl-4" />
                <td className="py-1.5">
                  <PosBadge pos={p.position} />
                </td>
                <td>
                  <span className="flex items-center gap-2.5">
                    <Portrait
                      seed={p.portraitSeed}
                      culture={cultureOf(p.nationality.id)}
                      size={28}
                      age={p.age}
                      shirt={club.colors.primary}
                      trim={club.colors.secondary}
                      className="rounded"
                    />
                    <span className="font-medium">{p.name}</span>
                    {p.isCaptain && <span className="num rounded bg-flood-500 px-1 text-[10px] font-bold text-night-950">C</span>}
                    {p.injury && (
                      <span title={p.injury} className="rounded bg-alert-500/20 px-1 text-[10px] font-bold text-alert-400">
                        INJ
                      </span>
                    )}
                  </span>
                </td>
                <td className="text-mist-300">{p.nationality.name}</td>
                <td className="num text-right">{p.age}</td>
                <td className="text-right">
                  <OvrBadge ovr={p.ovr} range={p.ovrRange} size="sm" />
                </td>
                <td className="num text-right">{p.stats.apps}</td>
                <td className="num text-right">{p.stats.goals || ''}</td>
                <td className="num text-right">{p.stats.assists || ''}</td>
                <td className="num text-right" style={{ color: p.stats.avgRating ? ratingColor((p.stats.avgRating - 5) * 20) : undefined }}>
                  {p.stats.avgRating?.toFixed(1) ?? '–'}
                </td>
                <td className="num text-right">{formatUSD(p.value)}</td>
                <td className="num text-right text-mist-300">
                  {formatUSD(p.wage)}
                  <span className="text-[10px] text-mist-400">/wk</span>
                </td>
                <td className="num text-right text-mist-300">{p.contractUntil ? formatDate(p.contractUntil).slice(-4) : '–'}</td>
                <td className="pr-4" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}

function FixturesPanel({ club }: { club: ClubView }) {
  const played = club.fixtures.filter((f) => f.result);
  const upcoming = club.fixtures.filter((f) => !f.result);
  const [tab, setTab] = useState<'results' | 'upcoming'>(played.length ? 'results' : 'upcoming');
  const list = tab === 'results' ? [...played].reverse() : upcoming;
  const record = played.reduce(
    (r, f) => {
      const mine = f.home.id === club.id ? f.result!.homeGoals : f.result!.awayGoals;
      const theirs = f.home.id === club.id ? f.result!.awayGoals : f.result!.homeGoals;
      return mine > theirs ? { ...r, w: r.w + 1 } : mine < theirs ? { ...r, l: r.l + 1 } : { ...r, d: r.d + 1 };
    },
    { w: 0, d: 0, l: 0 },
  );
  return (
    <Panel
      title="Fixtures & results"
      right={
        <span className="flex items-center gap-3">
          <span className="num text-xs text-mist-400">
            <b className="text-good-300">{record.w}W</b> · {record.d}D · <b className="text-alert-400">{record.l}L</b>
          </span>
          <span className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
            {(['results', 'upcoming'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold capitalize ${tab === t ? 'bg-white/[0.1] text-mist-100' : 'text-mist-400'}`}
              >
                {t}
              </button>
            ))}
          </span>
        </span>
      }
    >
      <div className="max-h-[360px] overflow-y-auto">
        {list.length ? (
          list.map((f) => <FixtureRow key={f.id} f={f} focus={club.id} />)
        ) : (
          <div className="p-6 text-center text-sm text-mist-400">Nothing here yet.</div>
        )}
      </div>
    </Panel>
  );
}

type PoolPlayer = PlayerRow & { starred: boolean };

/** Your pool at one needed position: who beats the bar and fits the budget, with a quick pitch, or a search for more. */
function PoolBrowser({
  need,
  club,
  players,
  onOpen,
  onExpand,
  onClose,
}: {
  need: ClubView['needs'][number];
  club: ClubView;
  players: PoolPlayer[];
  onOpen: (id: string) => void;
  onExpand: () => void;
  onClose: () => void;
}) {
  const openRecommend = useGame((s) => s.openRecommend);
  const bar = (need.positionalAverage || 0) + 1;
  const rows = [...players].sort((a, b) => Number(b.ovr >= bar) - Number(a.ovr >= bar) || b.ovr - a.ovr);
  const fits = rows.filter((p) => p.ovr >= bar).length;
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden border-t border-grass-400/20 bg-grass-500/[0.03]"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <PosBadge pos={need.position} />
        <span className="text-sm font-semibold">Your pool</span>
        <span className="text-[11px] text-mist-400">
          {rows.length ? `${rows.length} player${rows.length > 1 ? 's' : ''} · ${fits} at ${bar}+ (beats the average)` : 'Nobody yet'}
        </span>
        <button className="ml-auto text-[11px] text-mist-400 hover:text-mist-100" onClick={onClose}>
          Close
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-sm text-mist-400">You have no {need.position}s in your pool. Search to find some.</div>
      ) : (
        <ul className="mt-2 max-h-72 overflow-y-auto">
          {rows.map((p) => {
            const beats = p.ovr >= bar;
            const affordable = club.transferBudget <= 0 || p.value <= club.transferBudget;
            return (
              <li key={p.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2 last:border-0 hover:bg-white/[0.03]">
                <OvrBadge ovr={p.ovr} range={p.ovrRange} size="sm" />
                <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(p.id)}>
                  <div className="truncate text-sm font-semibold hover:text-grass-300">
                    {p.starred && <span className="mr-1 text-flood-400">★</span>}
                    {p.name}
                  </div>
                  <div className="truncate text-[11px] text-mist-400">
                    {p.age} · {p.club?.name ?? 'Free agent'}
                  </div>
                </button>
                <span className={`hidden text-[11px] sm:inline ${beats ? 'text-grass-300' : 'text-mist-400'}`} title={`The bar here is ${bar}`}>
                  {beats ? '✓ beats avg' : `below ${bar}`}
                </span>
                <span className={`num w-16 text-right text-[12px] ${affordable ? 'text-mist-200' : 'text-alert-400'}`} title={affordable ? 'Within the transfer budget' : 'Over the transfer budget'}>
                  {formatUSD(p.value, { compact: true })}
                </span>
                <button
                  className={`${beats ? 'btn-primary' : 'btn-ghost'} shrink-0 px-2.5 py-1 text-[11px]`}
                  onClick={() => openRecommend({ playerId: p.id, clubId: club.id })}
                >
                  Recommend
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.05] px-4 py-2.5 text-[12px]">
        <span className="min-w-0 flex-1 text-mist-400">
          Want more options? Search for {need.position}s rated {bar}+ that {club.name} can afford.
        </span>
        <button className="btn-ghost border-grass-400/40 px-3 py-1 text-xs text-grass-200" onClick={onExpand}>
          ⌕ Expand the pool →
        </button>
      </div>
    </motion.div>
  );
}

/** "You're here" or a one-click trip to the club's city. */
function TravelHere({ cityId, cityName, clubId, clubName }: { cityId: ClubView['city']['id']; cityName: string; clubId: ClubView['id']; clubName: string }) {
  const { scout, openTravel, advancing } = useGame();
  if (!scout) return null;
  if (scout.location.cityId === cityId) return <span className="chip border-grass-400/40 text-grass-300">⌖ You're in {cityName}</span>;
  return (
    <button
      className="chip hover:border-flood-400/50 hover:text-flood-300"
      disabled={advancing}
      onClick={() => openTravel(cityId, { label: `Visit ${clubName}`, route: { screen: 'club', id: clubId } })}
    >
      ✈ Travel to {cityName}
    </button>
  );
}

function RecommendHere({ clubId }: { clubId: ClubView['id'] }) {
  const { scout, openRecommend } = useGame();
  if (!scout) return null;
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="btn shrink-0 bg-flood-400 px-6 py-3 text-base font-bold text-night-950 shadow-[0_0_32px_-6px_var(--color-flood-400)] hover:bg-flood-300"
      onClick={() => openRecommend({ clubId })}
    >
      ★ Recommend a player
    </motion.button>
  );
}

/** The president: never pitched to, but his money decides big signings and his patience decides the coach. */
function PresidentCard({ club }: { club: ClubView }) {
  const p = club.president!;
  const scout = useGame((s) => s.scout);
  const culture = useCulture(club.country.id);
  return (
    <Panel title="President" right={<span className="chip">Signs off big money</span>}>
      <div className="flex gap-4 p-4">
        <Portrait seed={p.portraitSeed} culture={culture} size={60} age={p.age} shirt="var(--color-night-700)" trim="#d4af37" className="shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{p.name}</div>
          <div className="text-[11px] text-mist-400">
            {p.age} · {p.nationality}
          </div>
          <div className="mt-2 inline-block rounded border border-flood-400/30 px-1.5 py-0.5 text-[11px] font-semibold text-flood-300">{p.policyLabel}</div>
          <p className="mt-1.5 text-[12px] leading-snug text-mist-300">{p.policyLine}</p>
          <p className="mt-1 text-[11px] text-mist-400">
            Fees over {formatUSD(p.feeThreshold, { compact: true })} (or a big wage) need his yes after the coach's.
          </p>
        </div>
      </div>
      {scout && (
        <div className="border-t border-white/[0.05] px-4 py-2.5 text-[12px] text-mist-300">
          Board standing <b className="num text-mist-100">{p.standing}</b>
          <span className="text-mist-400">
            {' '}
            · {p.standing >= 45 ? 'he asks your advice when the coach goes' : 'built by signings that work and his end-of-season review'}
          </span>
        </div>
      )}
    </Panel>
  );
}

const READ_LABEL = { unknown: 'Unknown', rough: 'Rough', good: 'Good', sure: 'Sure' } as const;
const READ_CLASS = { unknown: 'text-alert-400', rough: 'text-flood-300', good: 'text-grass-300', sure: 'text-good-300' } as const;

/** How well you know what they need, why it may be out of date, and a way to learn more. */
function NeedsRead({ club }: { club: ClubView }) {
  const { studyClub, advancing } = useGame();
  const [msg, setMsg] = useState<string>();
  const r = club.needsRead;
  const study = () =>
    studyClub(club.id).then(
      (x) => setMsg(`${x.days} days with their games and players: your read goes from ${x.before} to ${x.after}.`),
      (e) => setMsg(e instanceof Error ? e.message : 'That did not work.'),
    );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.05] px-4 py-2.5 text-[12px]">
      <span className="text-mist-400">
        Your read on their needs: <b className={READ_CLASS[r.tier]}>{READ_LABEL[r.tier]}</b>
      </span>
      <span className="min-w-[200px] flex-1 text-mist-400">
        {r.floor ??
          (r.tier === 'unknown'
            ? 'You have no idea what they need yet.'
            : r.tier === 'rough'
              ? 'You know where they are thin, roughly.'
              : r.tier === 'good'
                ? 'You know their needs, give or take.'
                : 'You know exactly what they need.')}
        {r.stale && <span className="text-flood-300"> Out of date: {r.stale}.</span>}
      </span>
      {r.study.useful && (
        <button className="btn-ghost px-2.5 py-1 text-[11px]" disabled={advancing} onClick={() => void study()} title="Go through their games and players. Only as good as what you know of their squad.">
          Study their squad · {r.study.days} days
        </button>
      )}
      {msg && <span className="w-full text-mist-300">{msg}</span>}
    </div>
  );
}
