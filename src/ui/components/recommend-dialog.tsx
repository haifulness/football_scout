import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { ClubId, CountryId, LeagueId, PlayerId } from '../../engine/core/ids';
import { formatUSD, usd } from '../../engine/core/money';
import type { Official } from '../../engine/model/deal';
import type { Position } from '../../engine/model/player';
import type { DealView, OfficialPitchView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame, type RecommendBrief } from '../store/game-store';
import { DealStageBadge } from './deal-stage';
import { RelationshipBar } from './relationship';
import { OvrBadge, PosBadge, ratingColor, useCultureLookup } from './ui';
import { RivalWarning } from './rival-warning';

/** Recommend a player to a club: pick the pair, check the bar, choose who to pitch to. */
export function RecommendDialog() {
  const { recommend, closeRecommend } = useGame();
  const [playerId, setPlayerId] = useState<PlayerId>();
  const [clubId, setClubId] = useState<ClubId>();
  // The club browser's choices survive a look at one club and the way back.
  const [browse, setBrowse] = useState<BrowseState>({});
  const [lastClubId, setLastClubId] = useState<ClubId>();
  useEffect(() => {
    setPlayerId(recommend?.playerId);
    setClubId(recommend?.clubId);
    setBrowse({});
    setLastClubId(undefined);
  }, [recommend]);
  useEffect(() => {
    if (!recommend) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRecommend();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recommend, closeRecommend]);
  const pickClub = (id: ClubId) => {
    setClubId(id);
    setLastClubId(id);
  };

  return (
    <AnimatePresence>
      {recommend && (
        <motion.div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-night-950/80 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeRecommend}
        >
          <motion.div
            className="panel my-6 w-full max-w-4xl"
            initial={{ y: 24, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
              <div>
                <div className="panel-title text-flood-400">Recommendation</div>
                <div className="font-display text-2xl font-bold uppercase leading-none">
                  {!playerId ? 'Choose a player' : !clubId ? 'Choose a club' : 'Make your pitch'}
                </div>
              </div>
              <button onClick={closeRecommend} className="text-mist-400 hover:text-mist-100" aria-label="Close">
                ✕
              </button>
            </header>
            {!playerId ? (
              <PlayerPicker onPick={setPlayerId} brief={recommend.brief} />
            ) : !clubId ? (
              <ClubPicker playerId={playerId} onPick={pickClub} browse={browse} onBrowse={setBrowse} lastClubId={lastClubId} />
            ) : (
              <PitchView
                playerId={playerId}
                clubId={clubId}
                onChangeClub={recommend.clubId ? undefined : () => setClubId(undefined)}
                onChangePlayer={recommend.playerId ? undefined : () => setPlayerId(undefined)}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const POSITION_GROUPS: { label: string; positions: Position[] }[] = [
  { label: 'Goalkeepers', positions: ['GK'] },
  { label: 'Defenders', positions: ['CB', 'LB', 'RB', 'LWB', 'RWB'] },
  { label: 'Midfielders', positions: ['DM', 'CM', 'AM', 'LM', 'RM'] },
  { label: 'Forwards', positions: ['LW', 'RW', 'ST'] },
];
type PoolSort = 'ovr' | 'potential' | 'age' | 'value' | 'added';
const POOL_SORTS: { key: PoolSort; label: string }[] = [
  { key: 'ovr', label: 'Rating' },
  { key: 'potential', label: 'Potential' },
  { key: 'age', label: 'Youngest' },
  { key: 'value', label: 'Value' },
  { key: 'added', label: 'Recently added' },
];

/** Pick from your pool: search by name or club, filter by position, sort. */
function PlayerPicker({ onPick, brief }: { onPick: (id: PlayerId) => void; brief?: RecommendBrief }) {
  const pool = useEngineQuery(() => engine.getRecommendCandidates(), []);
  const [useBrief, setUseBrief] = useState(!!brief);
  const cultureOf = useCultureLookup();
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState<string>('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [yoursOnly, setYoursOnly] = useState(false);
  const [sort, setSort] = useState<PoolSort>('ovr');
  if (!pool) return <div className="p-8 text-center text-sm text-mist-400">Loading your pool…</div>;
  if (!pool.length) return <div className="p-8 text-center text-sm text-mist-400">Your Player Pool is empty. Search for players first.</div>;

  const q = query.trim().toLowerCase();
  const group = POSITION_GROUPS.find((g) => g.label === posFilter);
  // Against the brief, on what you know: "fits" if your estimate clears the bar, "might fit" if the top of your range does.
  const briefFit = (p: (typeof pool)[number]): 'yes' | 'maybe' | 'no' => {
    if (!brief) return 'yes';
    if (p.position !== brief.position) return 'no';
    if (brief.minAge !== undefined && p.age < brief.minAge) return 'no';
    if (brief.maxAge !== undefined && p.age > brief.maxAge) return 'no';
    if (brief.maxFee !== undefined && p.value > brief.maxFee) return 'no';
    return p.ovr >= brief.minOvr ? 'yes' : p.ovrRange[1] >= brief.minOvr ? 'maybe' : 'no';
  };
  // From a mission, players already under negotiation are out: you're working on them.
  const negotiating = brief ? pool.filter((p) => p.openDeal).length : 0;
  const briefMatches = brief ? pool.filter((p) => !p.openDeal && briefFit(p) !== 'no').length : 0;
  const shown = pool
    .filter(
      (p) =>
        (!brief || !p.openDeal) &&
        (!useBrief || briefFit(p) !== 'no') &&
        (!q || p.name.toLowerCase().includes(q) || (p.club?.name ?? 'free agent').toLowerCase().includes(q)) &&
        (!posFilter || (group ? group.positions.includes(p.position) : p.position === posFilter)) &&
        (!starredOnly || p.starred) &&
        (!yoursOnly || !!p.tag),
    )
    .sort((a, b) => {
      // Players you are selling or representing always come first.
      const pinned = Number(!!b.tag) - Number(!!a.tag);
      if (pinned) return pinned;
      if (useBrief) {
        const fit = Number(briefFit(b) === 'yes') - Number(briefFit(a) === 'yes');
        if (fit) return fit;
      }
      const star = Number(b.starred) - Number(a.starred);
      if (sort === 'added') return b.addedOn - a.addedOn;
      if (sort === 'age') return a.age - b.age || b.ovr - a.ovr;
      if (sort === 'value') return b.value - a.value;
      if (sort === 'potential') return (b.potential?.[1] ?? -1) - (a.potential?.[1] ?? -1) || b.ovr - a.ovr;
      return star || b.ovr - a.ovr;
    });
  const control = 'rounded-lg border border-white/10 bg-night-950/70 px-2.5 py-1.5 text-sm text-mist-100 outline-none focus:border-grass-400/60';

  return (
    <div>
      {brief && (
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-400/20 bg-sky-500/[0.06] px-5 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">Brief</span>
          <span className="text-sm font-semibold">{brief.label}</span>
          <span className="flex flex-wrap gap-1">
            {brief.summary.map((x) => (
              <span key={x} className="chip text-[11px] text-mist-200">
                {x}
              </span>
            ))}
          </span>
          <span className="ml-auto flex items-center gap-2 text-[11px] text-mist-400">
            {briefMatches ? `${briefMatches} in your pool could fit` : 'Nobody in your pool fits yet'}
            {negotiating > 0 && <span title="Players with a deal in progress are hidden">· {negotiating} under negotiation hidden</span>}
            <button className="btn-ghost px-2.5 py-1 text-[11px]" onClick={() => setUseBrief(!useBrief)}>
              {useBrief ? 'Show whole pool' : 'Filter by brief'}
            </button>
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or club…"
          aria-label="Search your pool"
          className={`${control} min-w-48 flex-1`}
        />
        <select className={control} value={posFilter} onChange={(e) => setPosFilter(e.target.value)} aria-label="Position">
          <option value="">All positions</option>
          {POSITION_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.positions.length > 1 && <option value={g.label}>All {g.label.toLowerCase()}</option>}
              {g.positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select className={control} value={sort} onChange={(e) => setSort(e.target.value as PoolSort)} aria-label="Sort by">
          {POOL_SORTS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-mist-300">
          <input type="checkbox" checked={starredOnly} onChange={(e) => setStarredOnly(e.target.checked)} className="accent-grass-500" /> ★ Starred
        </label>
        {pool.some((p) => p.tag) && (
          <label className="flex items-center gap-1.5 text-xs text-mist-300">
            <input type="checkbox" checked={yoursOnly} onChange={(e) => setYoursOnly(e.target.checked)} className="accent-flood-500" /> For sale / represented
          </label>
        )}
        <span className="ml-auto text-[11px] text-mist-400">
          {shown.length === pool.length - negotiating ? `${shown.length} players` : `${shown.length} of ${pool.length - negotiating}`}
        </span>
      </div>
      <ul className="max-h-[55vh] overflow-y-auto">
        {shown.map((p) => (
          <li key={p.id}>
            <button onClick={() => onPick(p.id)} className="data-row flex w-full items-center gap-3 px-5 py-2 text-left">
              <Portrait seed={p.portraitSeed} culture={cultureOf(p.nationality.id)} size={30} age={p.age} shirt={p.club?.colors.primary} className="rounded" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {p.starred && <span className="text-flood-400">★ </span>}
                  {p.name}
                  {p.prodigy && <span className="text-flood-300"> ✦</span>}
                  {p.tag === 'sale' && (
                    <span
                      className="ml-2 rounded bg-flood-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-flood-300"
                      title={`Selling mandate for ${p.saleFor}`}
                    >
                      For sale · {p.saleFor}
                    </span>
                  )}
                  {p.tag === 'represented' && (
                    <span className="ml-2 rounded bg-flood-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-flood-300">Your client</span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-mist-400">
                  {p.age} · {p.club?.name ?? 'Free agent'} · {formatUSD(p.value)}
                </span>
              </span>
              {useBrief && briefFit(p) === 'maybe' && (
                <span className="text-[11px] text-flood-300" title="The top of your estimate clears the bar, the middle doesn't">
                  Might fit
                </span>
              )}
              {useBrief && briefFit(p) === 'yes' && <span className="text-[11px] text-grass-300">Fits</span>}
              <PosBadge pos={p.position} />
              <OvrBadge ovr={p.ovr} range={p.ovrRange} size="sm" />
            </button>
          </li>
        ))}
        {!shown.length && (
          <li className="px-5 py-8 text-center text-sm text-mist-400">
            {useBrief ? 'Nobody in your pool fits this brief yet. Use "Search for this" on the mission to find some.' : 'No players in your pool match.'}
          </li>
        )}
      </ul>
    </div>
  );
}

interface BrowseState {
  countryId?: CountryId;
  leagueId?: LeagueId;
}

function ClubPicker({
  playerId,
  onPick,
  browse,
  onBrowse,
  lastClubId,
}: {
  playerId: PlayerId;
  onPick: (id: ClubId) => void;
  browse: BrowseState;
  onBrowse: (b: BrowseState) => void;
  lastClubId?: ClubId;
}) {
  const suggestions = useEngineQuery(() => engine.getClubSuggestions(playerId), [playerId]);
  const tree = useEngineQuery(() => engine.getLocationTree(), []);
  const { countryId, leagueId } = browse;
  const viewed = <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-mist-300">Viewed</span>;
  const leagueClubs = useEngineQuery(() => (leagueId ? engine.getLeagueClubs(leagueId) : Promise.resolve([])), [leagueId]);
  const country = tree?.continents.flatMap((c) => c.countries).find((c) => c.id === countryId);
  const select = 'rounded-lg border border-white/10 bg-night-950/70 px-2.5 py-1.5 text-sm text-mist-100 outline-none';
  return (
    <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
      <div className="border-b border-white/[0.05] md:border-b-0 md:border-r">
        <div className="panel-title px-5 pt-4 text-[11px]">Suggested (from what you can see)</div>
        <ul className="max-h-[52vh] overflow-y-auto py-2">
          {suggestions?.map((s) => (
            <li key={s.club.id}>
              <button onClick={() => onPick(s.club.id)} className="data-row flex w-full items-center gap-3 px-5 py-2 text-left">
                <Crest club={s.club} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.club.name}</span>
                  <span className="block truncate text-[11px] text-mist-400">
                    {s.club.cityName} · {s.club.leagueName}
                  </span>
                </span>
                {s.club.id === lastClubId && viewed}
                <span className="text-right text-[11px] text-mist-300">{s.reason}</span>
              </button>
            </li>
          ))}
          {suggestions && !suggestions.length && <li className="px-5 py-4 text-sm text-mist-400">No obvious fits nearby. Browse instead.</li>}
        </ul>
      </div>
      <div className="p-5">
        <div className="panel-title mb-2 text-[11px]">Any club</div>
        <div className="flex flex-col gap-2">
          <select className={select} value={countryId ?? ''} onChange={(e) => onBrowse({ countryId: (e.target.value || undefined) as CountryId | undefined })}>
            <option value="">Country…</option>
            {tree?.continents.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.countries.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {country && (
            <select
              className={select}
              value={leagueId ?? ''}
              onChange={(e) => onBrowse({ countryId, leagueId: (e.target.value || undefined) as LeagueId | undefined })}
            >
              <option value="">League…</option>
              {country.leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <ul className="mt-2 max-h-[40vh] overflow-y-auto">
          {leagueClubs?.map((c) => (
            <li key={c.id}>
              <button onClick={() => onPick(c.id)} className="data-row flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm">
                <Crest club={c} size={18} /> <span className="flex-1 truncate">{c.name}</span> {c.id === lastClubId && viewed}{' '}
                <span className="text-[11px] text-mist-400">{c.cityName}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PitchView({
  playerId,
  clubId,
  onChangeClub,
  onChangePlayer,
}: {
  playerId: PlayerId;
  clubId: ClubId;
  onChangeClub?: () => void;
  onChangePlayer?: () => void;
}) {
  const [position, setPosition] = useState<Position>();
  // Wage offered to the player: his ask by default, up to the club's ceiling.
  const [offer, setOffer] = useState<number>();
  const preview = useEngineQuery(() => engine.getPitchPreview(playerId, clubId, position), [playerId, clubId, position]);
  const { pitch, advancing, openTravel, closeRecommend, navigate } = useGame();
  const [result, setResult] = useState<DealView>();
  const [error, setError] = useState<string>();
  if (!preview) return <div className="p-8 text-center text-sm text-mist-400">Studying the squad…</div>;
  const wageOffer = Math.min(Math.max(offer ?? preview.wage, preview.wage), preview.wageCeiling);
  const span = preview.wageCeiling - preview.wage;
  const acceptance =
    span > 0
      ? preview.acceptance.atAsk + ((wageOffer - preview.wage) / span) * (preview.acceptance.atCeiling - preview.acceptance.atAsk)
      : preview.acceptance.atAsk;
  const deal = result ?? preview.existing;

  const doPitch = async (to: Official) => {
    setError(undefined);
    try {
      setResult(await pitch({ playerId, clubId, position: preview.position, to, wage: usd(wageOffer) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The pitch did not happen.');
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="text-lg font-semibold hover:text-grass-300 hover:underline"
          title="Open his page"
          onClick={() => {
            closeRecommend();
            navigate({ screen: 'player', id: playerId });
          }}
        >
          {preview.player.name}
        </button>
        <span className="text-mist-400">→</span>
        <button
          className="flex items-center gap-2 text-lg font-semibold hover:text-grass-300 hover:underline"
          title="Open the club's page"
          onClick={() => {
            closeRecommend();
            navigate({ screen: 'club', id: clubId });
          }}
        >
          <Crest club={preview.club} size={26} />
          {preview.club.name}
        </button>
        <span className="text-sm text-mist-400">
          {preview.club.cityName} · {preview.club.formation}
        </span>
        <span className="ml-auto flex gap-2 text-xs">
          {onChangePlayer && (
            <button className="text-mist-300 hover:text-grass-300" onClick={onChangePlayer}>
              Change player
            </button>
          )}
          {onChangeClub && (
            <button className="text-mist-300 hover:text-grass-300" onClick={onChangeClub}>
              ← Back to clubs
            </button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_260px]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <span className="panel-title text-[11px]">The bar at</span>
            <span className="flex flex-wrap gap-1">
              {preview.positions.map((p) => (
                <button
                  key={p}
                  onClick={() => setPosition(p)}
                  className={`rounded ${p === preview.position ? 'ring-2 ring-grass-400' : 'opacity-60 hover:opacity-100'}`}
                >
                  <PosBadge pos={p} />
                </button>
              ))}
            </span>
          </div>
          <BarCompare avg={preview.positionalAverage} est={preview.estimate} />
          <div className={`mt-2 text-sm ${preview.clearsBar === 'yes' ? 'text-grass-300' : preview.clearsBar === 'no' ? 'text-alert-400' : 'text-flood-300'}`}>
            {preview.clearsBar === 'yes'
              ? 'Even your cautious estimate beats their average.'
              : preview.clearsBar === 'no'
                ? "By your estimate he isn't better than what they have."
                : 'Too close to call with what you know. Scout him more, or take the gamble.'}
          </div>
          {preview.clearsBar !== 'yes' && (
            <div className="mt-1 text-[12px] text-mist-400">
              {preview.prospectRoute
                ? `He's young enough to be pitched as a prospect (club policy: ${preview.club.acceptsProspects === 'yes' ? 'welcome' : 'prodigies only'}). Prospects earn no signing bonus.`
                : preview.player.age <= 21
                  ? `Prospect route closed: ${preview.club.acceptsProspects === 'never' ? 'this club never takes projects' : 'prodigies only, and you haven’t identified him as one'}.`
                  : 'A rejection costs a little goodwill with whoever you pitch to.'}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
          <Row label={preview.rights === 'mandate' ? 'Asking fee' : 'Est. fee'} value={preview.fee ? formatUSD(preview.fee) : 'Free'} />
          {preview.commission !== undefined && <Row label="Your commission" value={formatUSD(preview.commission)} />}
          <Row label="Transfer budget" value={formatUSD(preview.club.transferBudget)} warn={preview.fee > preview.club.transferBudget} />
          <Row label="He asks" value={`${formatUSD(preview.wage)}/wk`} />
          {preview.wageSaving > 0 && (
            <div className="-mt-0.5 mb-1 text-right text-[11px] text-grass-300">{formatUSD(preview.wageSaving)}/wk less: he trusts you</div>
          )}
          {preview.wageCeiling > preview.wage && (
            <div className="my-1.5 rounded-lg bg-white/[0.03] px-2.5 py-2">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-mist-300">You offer</span>
                <span className="num font-semibold">{formatUSD(wageOffer)}/wk</span>
              </div>
              <input
                type="range"
                aria-label="Wage offer"
                min={preview.wage}
                max={preview.wageCeiling}
                step={Math.max(10, Math.round((preview.wageCeiling - preview.wage) / 40))}
                value={wageOffer}
                onChange={(e) => setOffer(Number(e.target.value))}
                className="w-full accent-grass-500"
              />
              <div className="flex justify-between text-[10px] text-mist-400">
                <span>his ask</span>
                <span>club ceiling {formatUSD(preview.wageCeiling)}</span>
              </div>
              <div className="mt-1 text-[11px] text-mist-300">
                He'd likely say yes: <b className="num text-grass-300">{Math.round(acceptance * 100)}%</b>
                {wageOffer > preview.wage && <span className="text-mist-400"> (vs {Math.round(preview.acceptance.atAsk * 100)}% at his ask)</span>}
              </div>
            </div>
          )}
          <Row label="Wage room" value={`${formatUSD(preview.club.wageRoom)}/wk`} warn={wageOffer > preview.club.wageRoom} />
          {wageOffer > preview.club.wageRoom && preview.affordable && (
            <div className="mt-1 text-[11px] text-alert-400">That offer is more than their wage room: the club may turn it down.</div>
          )}
          {!preview.affordable && <div className="mt-2 text-[12px] text-alert-400">{preview.affordReason}</div>}
        </div>
      </div>

      <RivalWarning rivals={preview.rivalInterest} compact />

      {(preview.rights === 'mandate' || preview.rights === 'represented') && (
        <div className="rounded-xl border border-flood-400/25 bg-flood-500/[0.06] px-4 py-3 text-sm text-mist-200">
          {preview.rights === 'mandate'
            ? "You're selling him for a client: any club can be pitched. The sale earns your commission, not a placement bonus."
            : 'You represent him: any club can be pitched. A signing earns your usual placement bonus.'}
        </div>
      )}

      {preview.missions.length > 0 && (
        <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-4">
          <div className="panel-title text-[11px] text-sky-400">Active missions from {preview.club.name}</div>
          {preview.missions.map((m) => {
            const allYes = m.checks.every((c) => c.status === 'yes');
            const anyNo = m.checks.some((c) => c.status === 'no');
            return (
              <div key={m.id} className="mt-2">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {m.position} brief · reward <b className="num">{formatUSD(m.reward)}</b>
                    {!m.samePosition && <span className="ml-2 text-[11px] text-flood-300">(pitch him as a {m.position} to count)</span>}
                  </span>
                  <span className={`text-xs font-semibold ${anyNo ? 'text-alert-400' : allYes ? 'text-grass-300' : 'text-flood-300'}`}>
                    {anyNo ? "Doesn't fit" : allYes ? 'Fits the brief' : 'Might fit'}
                  </span>
                </div>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {m.checks.map((c) => (
                    <li key={c.label} className="chip">
                      <span className={c.status === 'yes' ? 'text-grass-300' : c.status === 'no' ? 'text-alert-400' : 'text-flood-300'}>
                        {c.status === 'yes' ? '✓' : c.status === 'no' ? '✕' : '?'}
                      </span>{' '}
                      {c.label}
                    </li>
                  ))}
                </ul>
                {m.preferences && (
                  <div className="mt-1.5 text-[10px] uppercase tracking-wider text-flood-300">
                    Their preferences{' '}
                    <span className="normal-case tracking-normal text-mist-400">
                      {m.preferences.every((c) => c.status === 'yes') ? '· all met: better odds of a yes' : '· meet them all for better odds'}
                    </span>
                  </div>
                )}
                {m.preferences && (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {m.preferences.map((c) => (
                      <li key={c.label} className="chip border-flood-400/20">
                        <span className={c.status === 'yes' ? 'text-grass-300' : c.status === 'no' ? 'text-alert-400' : 'text-flood-300'}>
                          {c.status === 'yes' ? '✓' : c.status === 'no' ? '✕' : '?'}
                        </span>{' '}
                        {c.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deal && (
        <div className="rounded-xl border border-white/[0.08] bg-night-950/60 p-4">
          <div className="flex items-center justify-between">
            <span className="panel-title text-[11px]">Deal status</span>
            <DealStageBadge stage={deal.stage} />
          </div>
          <ul className="mt-2 space-y-1">
            {deal.log.slice(-4).map((l, i) => (
              <li key={i} className={`text-[13px] ${l.tone === 'good' ? 'text-grass-300' : l.tone === 'bad' ? 'text-alert-400' : 'text-mist-300'}`}>
                {l.text}
              </li>
            ))}
          </ul>
          {deal.stage === 'negotiating' && (
            <div className="mt-2 text-[12px] text-mist-400">
              Chance he and his club agree: <b className="text-mist-100">{Math.round((deal.chance ?? 0) * 100)}%</b>. Meeting him raises it. Decision expected
              by the resolve date in your Deals list.
            </div>
          )}
          <button
            className="mt-2 text-xs font-semibold text-grass-300 hover:text-grass-400"
            onClick={() => {
              closeRecommend();
              navigate({ screen: 'deals' });
            }}
          >
            Open Deals →
          </button>
        </div>
      )}
      {error && <div className="rounded-lg border border-alert-500/40 bg-alert-500/10 px-3 py-2 text-sm text-alert-400">{error}</div>}

      {!preview.work.ok && (
        <AgreementBox
          reason={preview.work.reason}
          agreement={preview.agreement}
          inCity={preview.inCity}
          cityName={preview.club.cityName}
          clubId={clubId}
          onTravel={() => {
            closeRecommend();
            openTravel(preview.club.cityId, { label: `Pitch ${preview.player.name} to ${preview.club.name}`, recommend: { playerId, clubId } });
          }}
          onDone={() => setPosition((p) => p)}
        />
      )}

      <div
        className={`rounded-lg border px-3 py-2 text-[12px] ${preview.report ? 'border-violet-400/30 text-violet-300' : 'border-white/[0.06] text-mist-400'}`}
      >
        {preview.report
          ? preview.report.sameRole
            ? `Your signed report goes with the pitch (rated ${preview.report.rating} as a ${preview.report.role}): the coach is keener.`
            : `Your report rates him as a ${preview.report.role} (${preview.report.rating}), not a ${position}: it helps half as much here.`
          : 'No report on him yet. A signed report from his player page makes coaches keener, more so once your reports have a good track record.'}
      </div>
      {preview.specialties.length > 0 && (
        <div className="rounded-lg border border-violet-400/30 px-3 py-2 text-[12px] text-violet-300">
          Right in your niche ({preview.specialties.join(', ')}): the coach trusts your eye here.
        </div>
      )}

      <OfficialPitchCard
        o={preview.coach}
        disabled={advancing || !preview.work.ok || !!deal}
        blockedReason={!preview.work.ok ? 'Not a client yet' : deal ? (deal.stage === 'rejected' ? 'Already decided' : 'Deal in progress') : undefined}
        inCity={preview.inCity}
        onPitch={() => void doPitch('coach')}
        onTravel={() => {
          closeRecommend();
          openTravel(preview.club.cityId, { label: `Pitch ${preview.player.name} to ${preview.club.name}`, recommend: { playerId, clubId } });
        }}
        cityName={preview.club.cityName}
      />
    </div>
  );
}

const Row = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div className="flex justify-between py-0.5">
    <span className="text-mist-400">{label}</span>
    <span className={`num ${warn ? 'text-alert-400' : ''}`}>{value}</span>
  </div>
);

/** Your estimate (range) against the club's positional average (line). */
function BarCompare({ avg, est }: { avg: number; est: [number, number] }) {
  const lo = Math.min(est[0], avg) - 8;
  const hi = Math.max(est[1], avg) + 8;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const c = ratingColor((est[0] + est[1]) / 2);
  return (
    <div className="relative mt-4 h-12">
      <div className="absolute inset-x-0 top-5 h-2 rounded-full bg-white/[0.06]" />
      <motion.div
        className="absolute top-4 h-4 rounded-md"
        style={{ background: `repeating-linear-gradient(135deg, ${c}55 0 4px, ${c}99 4px 8px)`, boxShadow: `0 0 12px ${c}66` }}
        initial={{ left: x(avg), width: 0 }}
        animate={{ left: x(est[0]), width: `calc(${x(est[1])} - ${x(est[0])})` }}
        transition={{ duration: 0.6 }}
      />
      <div className="absolute top-1 h-10 w-0.5 bg-flood-400" style={{ left: x(avg) }} />
      <div className="num absolute -top-1 -translate-x-1/2 text-[11px] font-bold text-flood-300" style={{ left: x(avg) }}>
        avg {avg}
      </div>
      <div className="num absolute top-9 -translate-x-1/2 text-[11px] text-mist-300" style={{ left: `calc((${x(est[0])} + ${x(est[1])}) / 2)` }}>
        you: {est[0]}–{est[1]}
      </div>
    </div>
  );
}

const READ = {
  good: { label: 'Good chance', c: 'text-grass-300' },
  'toss-up': { label: 'Toss-up', c: 'text-flood-300' },
  'long-shot': { label: 'Long shot', c: 'text-alert-400' },
} as const;

function OfficialPitchCard({
  o,
  disabled,
  blockedReason,
  inCity,
  onPitch,
  onTravel,
  cityName,
}: {
  o: OfficialPitchView;
  disabled: boolean;
  blockedReason?: string;
  inCity: boolean;
  onPitch: () => void;
  onTravel: () => void;
  cityName: string;
}) {
  const role = 'Head Coach';
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <Portrait seed={o.portraitSeed} size={48} age={o.age} shirt="#24363f" trim="#d4af37" className="rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-mist-400">{role}</div>
          <div className="truncate font-semibold">{o.name}</div>
          <div className="truncate text-[11px] text-mist-400">Cares about: {o.topPriorities.join(', ')}</div>
        </div>
        <div className={`text-right text-xs font-semibold ${READ[o.read].c}`}>{READ[o.read].label}</div>
      </div>
      <div className="mt-3">
        <RelationshipBar level={o.meeting.level} label={o.meeting.label} />
      </div>
      {blockedReason === 'Not a client yet' ? (
        <div className="mt-3 text-[12px] text-mist-400">Pitching opens once they're a client.</div>
      ) : !o.meeting.allowed ? (
        <div className="mt-3 text-[12px] text-alert-400">Won't see you yet: needs reputation {o.meeting.requiredReputation}.</div>
      ) : !inCity ? (
        <button className="btn-ghost mt-3 w-full text-xs" onClick={onTravel}>
          Travel to {cityName} to pitch in person
        </button>
      ) : (
        <button className="btn-primary mt-3 w-full text-xs" disabled={disabled} onClick={onPitch}>
          {blockedReason ?? `Pitch to the ${role} · ${formatUSD(o.meeting.cost)} · 1 day`}
        </button>
      )}
    </div>
  );
}

/** Not a client yet: explain, and offer to propose a scouting agreement in person. */
function AgreementBox({
  reason,
  agreement,
  inCity,
  cityName,
  clubId,
  onTravel,
  onDone,
}: {
  reason?: string;
  agreement: { ok: boolean; reason?: string };
  inCity: boolean;
  cityName: string;
  clubId: ClubId;
  onTravel: () => void;
  onDone: () => void;
}) {
  const { proposeAgreement, advancing } = useGame();
  const [result, setResult] = useState<{ accepted: boolean; reason: string }>();
  const [error, setError] = useState<string>();
  const propose = async () => {
    setError(undefined);
    try {
      setResult(await proposeAgreement(clubId));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The meeting did not happen.');
    }
  };
  return (
    <div className="rounded-xl border border-flood-400/30 bg-flood-500/5 p-4">
      <div className="text-sm text-flood-300">{reason}</div>
      {result ? (
        <div className={`mt-2 text-sm ${result.accepted ? 'text-grass-300' : 'text-alert-400'}`}>{result.reason}</div>
      ) : !agreement.ok ? (
        <div className="mt-2 text-[12px] text-mist-400">{agreement.reason}</div>
      ) : !inCity ? (
        <button className="btn-ghost mt-3 text-xs" onClick={onTravel}>
          Travel to {cityName} to propose an agreement
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="w-full text-[12px] text-mist-400">
            Ask the Head Coach in person (one day). He needs to know you a little first: relationship 10+.
          </span>
          <button className="btn-primary text-xs" disabled={advancing} onClick={() => void propose()}>
            Propose to the Head Coach
          </button>
        </div>
      )}
      {error && <div className="mt-2 text-[12px] text-alert-400">{error}</div>}
    </div>
  );
}
