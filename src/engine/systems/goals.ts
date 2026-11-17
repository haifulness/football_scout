import { ageOn, makeDate, type GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD, usd } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { Club } from '../model/club';
import type { AwardResult, Objective, ObjectiveKind, PositionGroup, Specialty, Trophy, VoteRow } from '../model/goals';
import type { Placement } from '../model/deal';
import type { Player, Position } from '../model/player';
import type { SeasonReview } from '../model/review';
import type { GameState } from '../model/world-state';
import { AGREEMENT_GATE } from './employment';
import { ordinal } from './review';
import { addLedger } from './scouting';
import { addNews } from './season';

/**
 * Goals, awards and specialties (PLAN §5a, phase 18): three objectives each
 * season, a Scout of the Year vote and Signing of the Season at each rollover,
 * and specialty labels earned from where your placements cluster.
 */

const KEEP_SEASONS = 20;
/** A Signing of the Season needs this many league games for his new club. */
const SIGNING_MIN_APPS = 10;
const SPECIALIST = { count: 3, share: 0.3 };
const EXPERT = { count: 8, share: 0.3 };
export const SPECIALTY_RULES = { specialistCount: SPECIALIST.count, expertCount: EXPERT.count, share: SPECIALIST.share };
const YOUTH_AGE = 21;

const seasonStart = (year: number) => makeDate(year, 7, 1);
const seasonEnd = (year: number) => makeDate(year + 1, 7, 1);

/* ------------------------------------------------------------ objectives */

function bestTier(state: GameState): number {
  const scout = state.scout!;
  if (scout.employment.mode === 'fulltime') return state.clubs[scout.employment.clubId]!.tier;
  for (const t of [1, 2, 3, 4, 5] as const) if (scout.reputation >= AGREEMENT_GATE[t]) return t;
  return 5;
}

/** Placements since a date (your own signings, not client sales). */
function placementsSince(state: GameState, from: GameDate): Placement[] {
  return state.placements.filter((pl) => pl.signedOn >= from);
}

function seasonNet(state: GameState, year: number): number {
  return Object.entries(state.ledgerTotals[year] ?? {}).reduce((n, [k, v]) => (k === 'starting-funds' ? n : n + (v ?? 0)), 0);
}

/** How far along an objective is (same unit as its target). */
export function objectiveProgress(state: GameState, o: Objective): number {
  const scout = state.scout;
  if (!scout) return 0;
  switch (o.kind) {
    case 'placements':
      return placementsSince(state, o.from).length;
    case 'tier-placements':
      return placementsSince(state, o.from).filter((pl) => (state.clubs[pl.clubId]?.tier ?? 9) <= o.tier!).length;
    case 'abroad':
      return placementsSince(state, o.from).filter((pl) => state.clubs[pl.clubId]?.countryId !== scout.homeCountry).length;
    case 'prodigy':
      return (state.prodigyFinds ?? []).filter((f) => f.date >= o.from).length;
    case 'missions':
      return state.missions.filter((m) => m.status === 'succeeded' && (m.resolvedOn ?? 0) >= o.from).length;
    case 'reports':
      return (state.reports ?? []).filter((r) => r.date >= o.from).length;
    case 'reputation':
      return scout.reputation;
    case 'profit':
      return seasonNet(state, o.season);
  }
}

interface Candidate {
  kind: ObjectiveKind;
  weight: number;
  make: () => Pick<Objective, 'title' | 'target' | 'tier' | 'start'> & { difficulty: number };
}

/** Pick this season's three objectives, suited to where you stand. */
export function setSeasonObjectives(state: GameState) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  const year = state.season.year;
  if (state.objectives.some((o) => o.season === year)) return;
  const rng = Rng.derive(state.seed, `objectives:${year}`);
  const rep = scout.reputation;
  const tier = bestTier(state);
  const home = state.countries[scout.homeCountry]!;
  const lastNet = seasonNet(state, year - 1);
  const hasWork = scout.employment.mode === 'fulltime' || scout.employment.clients.length > 0;
  const placementsTarget = clamp(Math.round(2 + rep / 20), 2, 6);

  const pool: Candidate[] = [
    { kind: 'placements', weight: 3, make: () => ({ title: `Place ${placementsTarget} players`, target: placementsTarget, difficulty: 1 }) },
    {
      kind: 'tier-placements',
      weight: tier <= 4 ? 3 : 0,
      make: () => {
        const n = tier <= 2 ? 1 : 2;
        return { title: `Place ${n === 1 ? 'a player' : `${n} players`} at tier ${tier} or higher`, target: n, tier, difficulty: 1.3 };
      },
    },
    { kind: 'abroad', weight: 2, make: () => ({ title: `Place a player outside ${home.name}`, target: 1, difficulty: 1.1 }) },
    { kind: 'prodigy', weight: 2, make: () => ({ title: 'Find a prodigy', target: 1, difficulty: 1.4 }) },
    {
      kind: 'missions',
      weight: hasWork ? 2 : 0,
      make: () => {
        const n = scout.employment.mode === 'fulltime' ? 2 : 1;
        return { title: n === 1 ? 'Complete a mission' : `Complete ${n} missions`, target: n, difficulty: 1 };
      },
    },
    { kind: 'reports', weight: 1.5, make: () => ({ title: 'Sign 3 scouting reports', target: 3, difficulty: 0.6 }) },
    {
      kind: 'reputation',
      weight: rep < 90 ? 2 : 0,
      make: () => {
        const target = Math.min(100, rep + (rep < 30 ? 8 : rep < 60 ? 6 : 4));
        return { title: `Reach reputation ${target}`, target, start: rep, difficulty: 1.2 };
      },
    },
    {
      kind: 'profit',
      weight: 2.5,
      make: () => {
        const target = Math.max(0, Math.round((lastNet * 1.2) / 5000) * 5000);
        return { title: target > 0 ? `Make a profit of ${formatUSD(target)}` : 'Finish the season in profit', target: Math.max(1, target), difficulty: 1.2 };
      },
    },
  ];

  const picked: Candidate[] = [];
  let left = pool.filter((c) => c.weight > 0);
  while (picked.length < 3 && left.length) {
    const c = rng.weighted(left, (x) => x.weight);
    picked.push(c);
    left = left.filter((x) => x !== c);
  }
  for (const c of picked) {
    const { difficulty, ...spec } = c.make();
    const money = usd(Math.round(((800 + rep * 120) * difficulty) / 250) * 250);
    state.objectives.push({
      id: state.counters.objective++,
      season: year,
      kind: c.kind,
      ...spec,
      from: state.date,
      reward: { money, reputation: difficulty >= 1.3 ? 2 : 1 },
      status: 'active',
    });
  }
  const seasons = [...new Set(state.objectives.map((o) => o.season))].sort((a, b) => b - a).slice(0, KEEP_SEASONS);
  state.objectives = state.objectives.filter((o) => seasons.includes(o.season));
}

function complete(state: GameState, o: Objective, date: GameDate) {
  const scout = state.scout!;
  o.status = 'done';
  o.doneOn = date;
  addLedger(state, { amount: o.reward.money, kind: 'award', label: `Season goal: ${o.title}` });
  scout.reputation = clamp(scout.reputation + o.reward.reputation, 0, 100);
  addNews(state, {
    date,
    kind: 'career',
    forYou: true,
    link: 'goals',
    title: `Goal reached: ${o.title}`,
    body: `One of your goals for the season is done. Bonus ${formatUSD(o.reward.money)} and reputation +${o.reward.reputation}.`,
  });
}

/** Daily: mark goals done the moment you reach them (profit is only judged when the season ends). */
export function objectiveTick(state: GameState, date: GameDate) {
  // A save from before goals existed gets this season's on its first day back.
  if (!state.objectives.some((o) => o.season === state.season.year)) setSeasonObjectives(state);
  for (const o of state.objectives) {
    if (o.status !== 'active' || o.season !== state.season.year || o.kind === 'profit') continue;
    if (objectiveProgress(state, o) >= o.target) complete(state, o, date);
  }
}

/** Season end: judge the profit goal and close the rest. All three done earns a trophy. */
function closeObjectives(state: GameState, year: number, date: GameDate): Objective[] {
  const mine = state.objectives.filter((o) => o.season === year);
  for (const o of mine) {
    if (o.status !== 'active') continue;
    if (objectiveProgress(state, o) >= o.target) complete(state, o, date);
    else o.status = 'missed';
  }
  if (mine.length === 3 && mine.every((o) => o.status === 'done'))
    addTrophy(state, { season: year, kind: 'clean-sweep', title: 'Clean sweep', detail: `Every season goal reached in ${seasonLabel(year)}`, date });
  return mine;
}

/* ---------------------------------------------------------------- awards */

export const seasonLabel = (year: number) => `${year}/${String(year + 1).slice(2)}`;

function addTrophy(state: GameState, t: Omit<Trophy, 'id'>) {
  const id = state.counters.trophy++;
  state.trophies.push({ ...t, id });
  (state.pendingTrophies ??= []).push(id);
}

function rivalCountries(state: GameState, clubs: ClubId[]): Set<string> {
  return new Set(clubs.map((id) => state.clubs[id]?.countryId).filter((c): c is NonNullable<typeof c> => !!c));
}

/**
 * Scout of the Year: standing counts most (the judges vote for names they know), then this season's signings,
 * plus the judges' taste. A newcomer can't win it, whatever his season: it's a mid- to late-career honour.
 */
function vote(rows: Omit<VoteRow, 'points'>[], rng: Rng): VoteRow[] {
  return rows
    .map((r) => ({ ...r, points: Math.round(r.reputation * 0.8 + r.signings * 5 + rng.gaussian(0, 4)) }))
    .filter((r) => r.signings > 0)
    .sort((a, b) => b.points - a.points);
}

function signingOfTheSeason(state: GameState, year: number, date: GameDate, results: AwardResult[]) {
  const from = seasonStart(year);
  const to = seasonEnd(year);
  const mineByPlayer = new Map<PlayerId, Placement>();
  for (const pl of state.placements) if (pl.signedOn >= from && pl.signedOn < to && !pl.endedOn) mineByPlayer.set(pl.playerId, pl);
  if (!mineByPlayer.size) return;
  // Only leagues where one of your signings is playing: that's the award you'd hear about.
  const leagues = new Set<string>();
  for (const pl of mineByPlayer.values()) {
    const club = state.clubs[pl.clubId];
    if (club) leagues.add(club.leagueId);
  }
  const best = new Map<string, { p: Player; club: Club; avg: number }>();
  for (const p of Object.values(state.players)) {
    if (!p.clubId || p.joinedOn === undefined || p.joinedOn < from || p.joinedOn >= to || p.stats.apps < SIGNING_MIN_APPS) continue;
    const club = state.clubs[p.clubId]!;
    if (!leagues.has(club.leagueId)) continue;
    const avg = p.stats.ratingSum / p.stats.apps;
    const cur = best.get(club.leagueId);
    if (!cur || avg > cur.avg) best.set(club.leagueId, { p, club, avg });
  }
  for (const [leagueId, { p, club, avg }] of best) {
    const league = state.leagues[leagueId as keyof typeof state.leagues]!;
    const you = mineByPlayer.get(p.id)?.clubId === club.id;
    const name = `${p.firstName} ${p.lastName}`;
    const title = `Signing of the Season · ${league.name}`;
    const detail = `${name} at ${club.name}: ${p.stats.apps} games, average rating ${avg.toFixed(2)}`;
    results.push({ kind: 'signing', title, winner: name, you, detail, playerId: p.id, clubId: club.id });
    if (you) {
      addTrophy(state, { season: year, kind: 'signing', title, detail, date, leagueId: league.id, playerId: p.id, clubId: club.id });
      state.scout!.reputation = clamp(state.scout!.reputation + 1, 0, 100);
    }
  }
}

/** Rollover: goals closed, awards voted. Adds them to the season's review. */
export function seasonHonours(state: GameState, year: number, date: GameDate, review: SeasonReview | undefined) {
  const scout = state.scout;
  if (!scout) return;
  const objectives = closeObjectives(state, year, date);
  const results: AwardResult[] = [];
  const base = state.reviewBaseline?.season === year ? state.reviewBaseline : undefined;
  if (base) {
    const rng = Rng.derive(state.seed, `awards:${year}`);
    const mine = state.placements.filter((pl) => pl.signedOn >= seasonStart(year) && pl.signedOn < seasonEnd(year)).length;
    const you: Omit<VoteRow, 'points'> = { name: scout.name, you: true, signings: mine, reputation: scout.reputation };
    const rivals = state.rivals.map((r) => ({
      row: {
        name: `${r.firstName} ${r.lastName}`,
        rivalId: r.id,
        you: false,
        signings: r.record.signings - (base.rivalSignings[r.id] ?? r.record.signings),
        reputation: Math.round(r.reputation),
      } satisfies Omit<VoteRow, 'points'>,
      countries: rivalCountries(state, r.employment.mode === 'fulltime' ? [r.employment.clubId] : r.employment.clients),
    }));
    const home = state.countries[scout.homeCountry]!;
    const races: { kind: 'scout-country' | 'scout-world'; title: string; rows: Omit<VoteRow, 'points'>[]; rep: number }[] = [
      { kind: 'scout-country', title: `Scout of the Year · ${home.name}`, rows: [you, ...rivals.filter((r) => r.countries.has(home.id)).map((r) => r.row)], rep: 2 },
      { kind: 'scout-world', title: 'World Scout of the Year', rows: [you, ...rivals.map((r) => r.row)], rep: 3 },
    ];
    for (const race of races) {
      const table = vote(race.rows, rng);
      const winner = table[0];
      if (!winner) continue;
      const place = table.findIndex((r) => r.you);
      results.push({
        kind: race.kind,
        title: race.title,
        winner: winner.name,
        you: winner.you,
        table: table.slice(0, 5),
        yourPlace: place >= 0 ? place + 1 : undefined,
        detail: `${winner.signings} signing${winner.signings === 1 ? '' : 's'}, ${winner.points} points`,
      });
      if (winner.you) {
        addTrophy(state, {
          season: year,
          kind: race.kind,
          title: race.title,
          detail: `${seasonLabel(year)}: ${winner.signings} signings, ${winner.points} points`,
          date,
          countryId: race.kind === 'scout-country' ? home.id : undefined,
        });
        scout.reputation = clamp(scout.reputation + race.rep, 0, 100);
      }
    }
  }
  signingOfTheSeason(state, year, date, results);

  const won = results.filter((r) => r.you);
  const done = objectives.filter((o) => o.status === 'done').length;
  addNews(state, {
    date,
    kind: 'career',
    forYou: won.length > 0,
    link: 'goals',
    title: won.length ? `Award${won.length > 1 ? 's' : ''} for you: ${won.map((r) => r.title).join(', ')}` : `${seasonLabel(year)} awards`,
    body: `${results
      .filter((r) => r.kind !== 'signing' || r.you)
      .map((r) => `${r.title}: ${r.you ? 'you' : r.winner}${r.yourPlace && !r.you ? ` (you were ${ordinal(r.yourPlace)})` : ''}.`)
      .join(' ')} Season goals reached: ${done} of ${objectives.length}.`.trim(),
  });
  if (review) {
    review.awards = results;
    review.objectives = objectives.map((o) => ({ title: o.title, status: o.status }));
    review.reputation.end = scout.reputation;
  }
}

/* ------------------------------------------------------------ specialties */

export function positionGroup(pos: Position): PositionGroup {
  if (pos === 'GK') return 'GK';
  if (pos === 'CB' || pos === 'LB' || pos === 'RB' || pos === 'LWB' || pos === 'RWB') return 'DEF';
  if (pos === 'DM' || pos === 'CM' || pos === 'AM' || pos === 'LM' || pos === 'RM') return 'MID';
  return 'ATT';
}

const GROUP_LABEL: Record<PositionGroup, [string, string]> = {
  GK: ['Goalkeeper specialist', 'Goalkeeper expert'],
  DEF: ['Defender specialist', 'Defender expert'],
  MID: ['Midfield specialist', 'Midfield expert'],
  ATT: ['Forward specialist', 'Forward expert'],
};

export interface SpecialtyProgress extends Omit<Specialty, 'level'> {
  level: 0 | 1 | 2;
  share: number;
  /** Placements needed for the next level (0 when it's the share holding you back). */
  needed: number;
}

/** Every niche your placements touch, with how close each is to a label. */
export function specialtyProgress(state: GameState): SpecialtyProgress[] {
  const scout = state.scout;
  if (!scout) return [];
  const homeContinent = state.countries[scout.homeCountry]!.continentId;
  const total = state.placements.length;
  const buckets = new Map<string, Omit<SpecialtyProgress, 'level' | 'share' | 'needed' | 'label'> & { labels: [string, string] }>();
  const bump = (key: string, init: () => Omit<SpecialtyProgress, 'level' | 'share' | 'needed' | 'label' | 'count'> & { labels: [string, string] }) => {
    const b = buckets.get(key) ?? { ...init(), count: 0 };
    b.count++;
    buckets.set(key, b);
  };
  for (const pl of state.placements) {
    const nat = pl.nationality ?? state.players[pl.playerId]?.nationality;
    const continentId = nat ? state.countries[nat]?.continentId : undefined;
    // Your home continent is where everyone starts: specialties are earned further afield.
    if (continentId && continentId !== homeContinent) {
      const name = state.continents[continentId]!.name;
      bump(`continent:${continentId}`, () => ({ key: `continent:${continentId}`, kind: 'continent', continentId, labels: [`${name} specialist`, `${name} expert`] }));
    }
    const group = positionGroup(pl.position);
    bump(`position:${group}`, () => ({ key: `position:${group}`, kind: 'position', group, labels: GROUP_LABEL[group] }));
    if (pl.age !== undefined && pl.age <= YOUTH_AGE) bump('youth', () => ({ key: 'youth', kind: 'youth', labels: ['Youth specialist', 'Youth expert'] }));
    if (pl.free) bump('free', () => ({ key: 'free', kind: 'free', labels: ['Free-agent hunter', 'Free-agent master'] }));
  }
  const out: SpecialtyProgress[] = [];
  for (const { labels, ...b } of buckets.values()) {
    const share = total ? b.count / total : 0;
    const level: 0 | 1 | 2 = b.count >= EXPERT.count && share >= EXPERT.share ? 2 : b.count >= SPECIALIST.count && share >= SPECIALIST.share ? 1 : 0;
    const next = level === 0 ? SPECIALIST.count : EXPERT.count;
    out.push({ ...b, level, share, label: labels[level === 2 ? 1 : 0], needed: level === 2 ? 0 : Math.max(0, next - b.count) });
  }
  return out.sort((a, b) => b.level - a.level || b.count - a.count);
}

export function specialties(state: GameState): Specialty[] {
  return specialtyProgress(state)
    .filter((s): s is SpecialtyProgress & { level: 1 | 2 } => s.level > 0)
    .map(({ share: _s, needed: _n, ...s }) => s);
}

/** Does this player fall in one of your specialties? */
function matches(state: GameState, s: Specialty, p: Player, pos: Position, free: boolean): boolean {
  switch (s.kind) {
    case 'continent':
      return state.countries[p.nationality]?.continentId === s.continentId;
    case 'position':
      return positionGroup(pos) === s.group;
    case 'youth':
      return ageOn(p.birthDate, state.date) <= YOUTH_AGE;
    case 'free':
      return free;
  }
}

/** Specialties this pitch falls in. */
export function matchingSpecialties(state: GameState, p: Player, pos: Position): Specialty[] {
  const free = !p.clubId;
  return specialties(state).filter((s) => matches(state, s, p, pos, free));
}

/** Added to the sign-off logit when you pitch inside your niche (capped). */
export function specialtyBonus(state: GameState, p: Player, pos: Position): number {
  const sum = matchingSpecialties(state, p, pos).reduce((n, s) => n + (s.level === 2 ? 0.25 : 0.15), 0);
  return Math.min(0.4, sum);
}

/** How much more a club wants you because of your specialties (invitation weighting). */
export function specialtyAppeal(state: GameState, club: Club, specs: Specialty[]): number {
  let w = 1;
  for (const s of specs) {
    if (s.kind === 'continent' && state.countries[club.countryId]?.continentId === s.continentId) w *= s.level === 2 ? 4 : 3;
    if (s.kind === 'youth' && club.acceptsProspects === 'yes') w *= 1.5;
  }
  return w;
}

/** Remember a prodigy you revealed. */
export function recordProdigyFind(state: GameState, playerId: PlayerId, date: GameDate) {
  state.prodigyFinds ??= [];
  if (!state.prodigyFinds.some((f) => f.playerId === playerId)) state.prodigyFinds.push({ playerId, date });
}
