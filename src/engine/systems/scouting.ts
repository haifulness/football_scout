import { ageOn, formatDate, type GameDate } from '../core/calendar';
import { setSeasonObjectives } from './goals';
import { scenarioSetup, startScenario } from './scenarios';
import { snapshotReviewBaseline } from './review';
import { onSearchResults } from './hunts';
import type { CityId, CountryId, PlayerId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { ClubTier } from '../model/club';
import { ATTRIBUTE_LABEL, type Player, type Position } from '../model/player';
import type { Background, CareerSetup, Difficulty, LedgerEntry, LedgerKind, Scout, ScoutSkills, SearchFilters, SearchRecord } from '../model/scout';
import { VALUE_NO_MAX } from '../model/scout';
import type { GameState } from '../model/world-state';
import { CHECK_IN_DAYS, VIDEO_KNOWLEDGE_CAP, estimate, knowledgeLevel, learn, marketOf, refreshRead, searchLearning, searchRange, seenOn } from './knowledge';
import { searchWage } from './transfers';
import { seedRivals } from './rivals';
import { refreshMarket } from './assistants';
import { OFFICE_REACH, OFFICE_SEARCH_DISCOUNT, hasBase } from './agency';

// ── Career ──────────────────────────────────────────────────────────────

/**
 * Each background's skills (fixed for the career) and, in plain words, what they do in play. Perks are what
 * the UI shows; keep them in step with where each skill is used.
 */
export const BACKGROUNDS: Record<Background, { label: string; perks: { good: string[]; bad: string[] }; skills: ScoutSkills }> = {
  'ex-pro': {
    label: 'Ex-pro player',
    perks: {
      good: ['Coaches treat you as more senior: they agree to meet you sooner', 'Tight rating ranges, and you learn a lot watching live', 'Phone leads on hunts pay off more often'],
      bad: ['Searches cost more and take longer'],
    },
    skills: { judgingAbility: 13, judgingPotential: 9, network: 14, dataAnalysis: 6, negotiation: 10 },
  },
  analyst: {
    label: 'Data analyst',
    perks: {
      good: ['Searches are cheaper, faster and more accurate', 'Video teaches you more about a player'],
      bad: ['Few contacts: hunts by phone rarely pay off', 'Coaches are a little harder to persuade'],
    },
    skills: { judgingAbility: 11, judgingPotential: 10, network: 5, dataAnalysis: 15, negotiation: 7 },
  },
  'agent-assistant': {
    label: "Agent's assistant",
    perks: {
      good: ['Persuasive: coaches sign off more often', 'Meetings build relationships faster'],
      bad: ['Untrained eye: wider rating ranges until you know a player well'],
    },
    skills: { judgingAbility: 7, judgingPotential: 8, network: 11, dataAnalysis: 8, negotiation: 15 },
  },
  'youth-coach': {
    label: 'Youth coach',
    perks: {
      good: ['Potential shows sooner, and prodigies reveal themselves earlier', 'Searches for players 21 and under cost 25% less'],
      bad: ['Few contacts: hunts by phone pay off less often'],
    },
    skills: { judgingAbility: 10, judgingPotential: 15, network: 7, dataAnalysis: 8, negotiation: 8 },
  },
};

export const STARTING_MONEY: Record<Difficulty, number> = { easy: 25_000, normal: 10_000, hard: 3_000 };

/** Full-time scouts: the employer pays part of work expenses. */
const COVERED: ReadonlySet<LedgerKind> = new Set(['search', 'video', 'travel', 'accommodation', 'ticket', 'meeting', 'assistant-task']);
/** Share of work expenses a full-time employer pays, by club tier. */
export const EXPENSE_COVER: Record<ClubTier, number> = { 1: 0.9, 2: 0.8, 3: 0.7, 4: 0.6, 5: 0.5 };
function withExpenseCover(state: GameState, e: Omit<LedgerEntry, 'date'>): Omit<LedgerEntry, 'date'> {
  const job = state.scout?.employment;
  if (e.amount >= 0 || !COVERED.has(e.kind) || job?.mode !== 'fulltime') return e;
  const cover = EXPENSE_COVER[state.clubs[job.clubId]!.tier];
  return { ...e, amount: usd(Math.round(e.amount * (1 - cover))), label: `${e.label} (club pays ${Math.round(cover * 100)}%)` };
}

/**
 * Records income or an expense and updates your balance. With `merge`, a repeat of
 * the latest entry (same kind and label) is added to it instead of a new line,
 * so a two-week hotel stay is one line, not fourteen.
 */
export function addLedger(state: GameState, entryIn: Omit<LedgerEntry, 'date'>, opts: { date?: GameDate; merge?: boolean } = {}) {
  const date = opts.date ?? state.date;
  const entry = withExpenseCover(state, entryIn);
  const last = state.ledger[0];
  if (opts.merge && last && last.kind === entry.kind && last.label === entry.label) {
    last.amount = usd(last.amount + entry.amount);
    last.date = date;
  } else {
    state.ledger.unshift({ ...entry, date });
    if (state.ledger.length > 500) state.ledger.length = 500;
  }
  state.scout!.money = usd(state.scout!.money + entry.amount);
  const season = (state.ledgerTotals[state.season.year] ??= {});
  season[entry.kind] = (season[entry.kind] ?? 0) + entry.amount;
}

export function createCareer(state: GameState, rawSetup: CareerSetup): Scout {
  const setup = scenarioSetup(state, rawSetup);
  const name = setup.name.trim().slice(0, 40) || 'Unnamed Scout';
  const home = state.countries[setup.homeCountry];
  if (!home || !state.countries[setup.nationality]) throw new Error('Unknown country');
  const regionKnowledge = {} as Record<CountryId, number>;
  for (const c of Object.values(state.countries)) regionKnowledge[c.id] = c.id === home.id ? 60 : c.continentId === home.continentId ? 15 : 0;
  const city = state.regions[home.regionIds[0]!]!.cityIds[0]! as CityId;
  state.scout = {
    name,
    nationality: setup.nationality,
    homeCountry: home.id,
    background: setup.background,
    difficulty: setup.difficulty,
    money: usd(0),
    location: city,
    homeCity: city,
    reputation: 5,
    skills: { ...BACKGROUNDS[setup.background].skills },
    regionKnowledge,
    relationships: {},
    rapport: {},
    lastMet: {},
    employment: { mode: 'freelance', clients: [] },
    represented: [],
    clubRecord: {},
    startedOn: state.date,
    startReputation: 5,
  };
  addLedger(state, { amount: usd(STARTING_MONEY[setup.difficulty]), kind: 'starting-funds', label: 'Savings at the start of your career' });
  seedRivals(state);
  state.inboxSeenId = state.counters.news;
  refreshMarket(state, state.date);
  if (setup.scenario) startScenario(state, setup.scenario);
  snapshotReviewBaseline(state);
  setSeasonObjectives(state);
  return state.scout;
}

function requireScout(state: GameState): Scout {
  if (!state.scout) throw new ScoutingError('Set up your scout first.');
  return state.scout;
}

export class ScoutingError extends Error {}

// ── Search ──────────────────────────────────────────────────────────────

const GEO_WIDTH = { city: 1, region: 2, country: 4, continent: 10, world: 20 } as const;
const BASE_SEARCH = 150;
export const RESULT_CAP = 30;
export const MAX_POSITIONS = 3;
export const MAX_ATTRIBUTE_FILTERS = 4;

/** The country whose costs and market knowledge apply (if the search is inside one). */
function searchCountry(state: GameState, f: SearchFilters): CountryId | undefined {
  const l = f.location;
  if (l.scope === 'country') return l.id;
  if (l.scope === 'region') return state.regions[l.id]?.countryId;
  if (l.scope === 'city') return state.cities[l.id]?.countryId;
  return undefined;
}

export interface SearchEstimate {
  cost: USD;
  days: number;
  affordable: boolean;
  /** Why it costs what it costs, for the UI. */
  factors: { label: string; effect: string }[];
}

export function estimateSearch(state: GameState, f: SearchFilters): SearchEstimate {
  const scout = requireScout(state);
  const s = scout.skills;
  const width = GEO_WIDTH[f.location.scope];
  const load =
    f.positions.length +
    (f.age ? 0.5 : 0) +
    (f.value ? 0.5 : 0) +
    (f.wage ? 0.5 : 0) +
    (f.leagueId ? 0.5 : 0) +
    (f.rating || f.ratingFloors ? 1.5 : 0) +
    f.attributes.length * 2;
  const country = searchCountry(state, f);
  const costIndex = country ? state.countries[country]!.costIndex : 1;
  const market = country ? (scout.regionKnowledge[country] ?? 0) : 0;
  const office = country && hasBase(state, country) ? OFFICE_SEARCH_DISCOUNT : 1;
  const youthDiscount = scout.background === 'youth-coach' && f.age && f.age[1] <= 21 ? 0.75 : 1;
  const skillFactor = (1 - s.network * 0.01) * (1.25 - s.dataAnalysis * 0.025);
  const cost = usd(Math.round((BASE_SEARCH * Math.pow(width, 0.6) * (1 + load * 0.25) * skillFactor * costIndex * youthDiscount * office) / 10) * 10);
  const days = Math.round(clamp(2 + width * 0.8 + load * 1.5 - market * 0.05 - s.dataAnalysis * 0.1 - (office < 1 ? 2 : 0), 2, 42));
  const factors = [
    { label: 'Area', effect: `${f.location.scope} ×${Math.pow(width, 0.6).toFixed(1)}` },
    { label: 'Filters', effect: `+${Math.round(load * 25)}%` },
    { label: 'Your network & data skills', effect: `×${skillFactor.toFixed(2)}` },
  ];
  if (country) factors.push({ label: `${state.countries[country]!.name} costs`, effect: `×${costIndex.toFixed(2)}` });
  if (youthDiscount < 1) factors.push({ label: 'Youth-coach discount', effect: '−25%' });
  if (office < 1) factors.push({ label: 'Your agency office', effect: `−${Math.round((1 - office) * 100)}%` });
  return { cost, days, affordable: scout.money >= cost, factors };
}

/** Is the player inside the filter's area (club city, or home market for free agents)? */
export function inLocation(state: GameState, p: Player, f: SearchFilters): boolean {
  const l = f.location;
  if (p.clubId) {
    const club = state.clubs[p.clubId]!;
    if (f.leagueId && club.leagueId !== f.leagueId) return false;
    switch (l.scope) {
      case 'world':
        return true;
      case 'continent':
        return state.countries[club.countryId]!.continentId === l.id;
      case 'country':
        return club.countryId === l.id;
      case 'region':
        return state.cities[club.cityId]!.regionId === l.id;
      case 'city':
        return club.cityId === l.id;
    }
  }
  // Free agents have no club city: they're found through their home market.
  if (!f.includeFreeAgents || f.leagueId) return false;
  if (l.scope === 'world') return true;
  if (l.scope === 'continent') return state.countries[p.nationality]!.continentId === l.id;
  if (l.scope === 'country') return p.nationality === l.id;
  return false;
}

/** How high up the pyramid your contacts reach, by club tier (free agents count as tier 5). */
const REACH_THRESHOLD: Record<ClubTier, number> = { 5: 0, 4: 15, 3: 30, 2: 50, 1: 70 };

/**
 * Chance a search turns up this player, 0.03–1: your reputation, network skill and
 * knowledge of his market against the level of his club. Early in a career you mostly
 * find lower-league players; stars rarely come through your contacts.
 */
export function searchReach(state: GameState, p: Player, market = state.scout!.regionKnowledge[marketOf(state, p)] ?? 0): number {
  const scout = state.scout!;
  const tier: ClubTier = p.clubId ? state.clubs[p.clubId]!.tier : 5;
  const local = state.agency && hasBase(state, marketOf(state, p)) ? OFFICE_REACH : 0;
  const access = scout.reputation * 0.6 + scout.skills.network * 2 + market / 5 + local;
  return clamp(1 / (1 + Math.exp(-(access - REACH_THRESHOLD[tier] + 3) / 10)), 0.03, 1);
}

/** Pays for a search and records it. The caller advances time, then calls completeSearch. */
export function startSearch(state: GameState, f: SearchFilters): SearchRecord {
  const scout = requireScout(state);
  validateFilters(f);
  const est = estimateSearch(state, f);
  if (!est.affordable) throw new ScoutingError(`This search costs ${formatUSD(est.cost)} but you only have ${formatUSD(scout.money)}.`);
  return createPendingSearch(state, f, est);
}

function validateFilters(f: SearchFilters) {
  if (f.positions.length > MAX_POSITIONS) throw new ScoutingError(`Pick at most ${MAX_POSITIONS} positions.`);
  if (f.attributes.length > MAX_ATTRIBUTE_FILTERS) throw new ScoutingError(`Use at most ${MAX_ATTRIBUTE_FILTERS} attribute filters.`);
}

/** Pays for the search and records it; results are filled in by completeSearch when the time has passed. */
function createPendingSearch(state: GameState, f: SearchFilters, est: SearchEstimate): SearchRecord {
  const id = state.counters.search++;
  const label = describeSearch(state, f);
  addLedger(state, { amount: usd(-est.cost), kind: 'search', label: `Search: ${label}` });
  const record: SearchRecord = {
    id,
    filters: f,
    label,
    startedOn: state.date,
    completedOn: state.date,
    cost: est.cost,
    days: est.days,
    results: [],
    matched: 0,
  };
  state.searches.unshift(record);
  if (state.searches.length > 50) state.searches.length = 50;
  return record;
}

/**
 * Runs the matching once the search's days have passed. Hard filters (position,
 * age, value: public facts) are exact; ability filters are judged, so they're noisy.
 */
export function completeSearch(state: GameState, record: SearchRecord) {
  const scout = requireScout(state);
  const f = record.filters;
  const rng = (id: PlayerId) => Rng.derive(state.seed, `search:${record.id}:${id}`);
  const accuracy = 2.4 * (1 - scout.skills.dataAnalysis / 25);
  const club = f.forClub ? state.clubs[f.forClub] : undefined;
  // Working a market teaches you about it (first, so results are judged with what you'll know afterwards).
  const country = searchCountry(state, f);
  if (country) scout.regionKnowledge[country] = clamp((scout.regionKnowledge[country] ?? 0) + 2, 0, 100);
  const scored: { p: Player; score: number; pos: Position }[] = [];
  let alreadyInPool = 0;
  for (const p of Object.values(state.players)) {
    if (!inLocation(state, p, f)) continue;
    if (club && p.clubId === club.id) continue; // searching for a club: not its own players
    if (f.positions.length && !f.positions.some((pos) => (p.positions[pos] ?? 0) >= 0.75)) continue;
    const age = ageOn(p.birthDate, state.date);
    if (f.age && (age < f.age[0] || age > f.age[1])) continue;
    if (f.value && (p.value < f.value[0] || p.value > f.value[1])) continue;
    // The wage that matters: his ask at the club the search is for, else what he earns (or expects, if free).
    if (f.wage) {
      const wage = searchWage(state, p, club);
      if (wage < f.wage[0] || wage > f.wage[1]) continue;
    }
    const r = rng(p.id);
    const market = scout.regionKnowledge[marketOf(state, p)] ?? 0;
    // Your network only turns up players within your reach.
    if (!r.chance(searchReach(state, p, market))) continue;
    const sd = accuracy * (1 - market / 200);
    let ok = true;
    for (const a of f.attributes) {
      const judged = p.attributes[a.attribute] + r.gaussian(0, sd);
      if (judged < a.min || (a.max !== undefined && a.max < 20 && judged > a.max)) ok = false;
    }
    if (!ok) continue;
    // Judge him by the estimate you'll see once the search turns him up (the same fog the results show),
    // at the searched position where he looks best against that position's bar.
    const options = f.positions.length ? f.positions.filter((x) => (p.positions[x] ?? 0) >= 0.75) : [p.naturalPosition];
    const floor = (x: Position) => f.ratingFloors?.[x] ?? 0;
    const judged = (x: Position) => estimate(searchRange(state, p, x));
    const pos = options.sort((a, b) => judged(b) - floor(b) - (judged(a) - floor(a)))[0]!;
    const score = judged(pos);
    if (f.rating && (score < f.rating[0] || score > f.rating[1])) continue;
    if (f.ratingFloors && score < floor(pos)) continue;
    // You already have him: a search is for finding new players.
    if (state.pool[p.id]) {
      alreadyInPool++;
      continue;
    }
    scored.push({ p, score, pos });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, RESULT_CAP);
  const results = top.map((x) => x.p);
  for (const p of results) {
    const { gain, cap } = searchLearning(state, p);
    learn(state, p, gain, cap, state.date);
    if (!state.pool[p.id]) state.pool[p.id] = { addedOn: state.date, source: 'search', starred: false };
  }
  record.judgedAs = Object.fromEntries(top.filter((x) => x.pos !== x.p.naturalPosition).map((x) => [x.p.id, x.pos]));
  record.results = results.map((p) => p.id);
  onSearchResults(state, record.results);
  record.matched = scored.length;
  record.alreadyInPool = alreadyInPool;
  record.completedOn = state.date;
}

export function describeSearch(state: GameState, f: SearchFilters): string {
  const l = f.location;
  const where =
    l.scope === 'world'
      ? 'Worldwide'
      : l.scope === 'continent'
        ? state.continents[l.id]!.name
        : l.scope === 'country'
          ? state.countries[l.id]!.name
          : l.scope === 'region'
            ? state.regions[l.id]!.name
            : state.cities[l.id]!.name;
  const parts = [where];
  if (f.leagueId) parts.push(state.leagues[f.leagueId]!.name);
  if (f.positions.length) parts.push(f.positions.join('/'));
  if (f.age) parts.push(`age ${f.age[0]}–${f.age[1]}`);
  if (f.rating) parts.push(`rating ${f.rating[0]}–${f.rating[1]}`);
  if (f.ratingFloors)
    parts.push(
      Object.entries(f.ratingFloors)
        .map(([pos, n]) => `${pos} ${n}+`)
        .join(', '),
    );
  if (f.wage)
    parts.push(
      f.wage[1] >= VALUE_NO_MAX
        ? `wage ${formatUSD(f.wage[0])}+/wk`
        : f.wage[0] <= 0
          ? `wage up to ${formatUSD(f.wage[1])}/wk`
          : `wage ${formatUSD(f.wage[0])}–${formatUSD(f.wage[1])}/wk`,
    );
  if (f.value)
    parts.push(
      f.value[1] >= VALUE_NO_MAX
        ? `value ${formatUSD(f.value[0])}+`
        : f.value[0] <= 0
          ? `value up to ${formatUSD(f.value[1])}`
          : `value ${formatUSD(f.value[0])}–${formatUSD(f.value[1])}`,
    );
  for (const a of f.attributes)
    parts.push(a.max !== undefined && a.max < 20 ? `${ATTRIBUTE_LABEL[a.attribute]} ${a.min}–${a.max}` : `${ATTRIBUTE_LABEL[a.attribute]} ${a.min}+`);
  return parts.join(' · ');
}

// ── Video scouting ──────────────────────────────────────────────────────

const VIDEO_COST: Record<ClubTier, number> = { 1: 400, 2: 250, 3: 150, 4: 90, 5: 50 };

export function videoCost(state: GameState, p: Player): USD {
  const tier = p.clubId ? state.clubs[p.clubId]!.tier : 5;
  return usd(Math.round((VIDEO_COST[tier] * state.countries[marketOf(state, p)]!.costIndex) / 5) * 5);
}

/** A check-in costs a fraction of a video session. */
export function checkInCost(state: GameState, p: Player): USD {
  return usd(Math.max(20, Math.round((videoCost(state, p) * 0.25) / 5) * 5));
}

/** May you check in on him now? Only on players you've scouted yourself, once a month each. */
export function checkInCheck(state: GameState, p: Player): { ok: boolean; reason?: string; cost: USD } {
  const scout = requireScout(state);
  const cost = checkInCost(state, p);
  const k = state.knowledge[p.id];
  if (seenOn(state, p) === undefined) return { ok: false, reason: 'You have nothing of your own on him to update yet.', cost };
  if (k?.checkedOn !== undefined && state.date - k.checkedOn < CHECK_IN_DAYS)
    return { ok: false, reason: `You checked in on ${formatDate(k.checkedOn)}: once a month.`, cost };
  if (scout.money < cost) return { ok: false, reason: `A check-in costs ${formatUSD(cost)} but you only have ${formatUSD(scout.money)}.`, cost };
  return { ok: true, cost };
}

/** A quick call to his club and a look at recent highlights: your read is up to date again (no new knowledge, no time). */
export function checkIn(state: GameState, playerId: PlayerId): { cost: USD } {
  const p = state.players[playerId];
  if (!p) throw new ScoutingError('That player has retired.');
  const check = checkInCheck(state, p);
  if (!check.ok) throw new ScoutingError(check.reason!);
  addLedger(state, { amount: usd(-check.cost), kind: 'video', label: `Check-in: ${p.firstName} ${p.lastName}` });
  refreshRead(state, p, state.date);
  return { cost: check.cost };
}

export function videoGain(state: GameState): number {
  return Math.round(12 + requireScout(state).skills.dataAnalysis * 0.5);
}

/** One day studying match footage. Cheap, but can't take you past VIDEO_KNOWLEDGE_CAP. */
export function watchVideo(state: GameState, playerId: PlayerId): { cost: USD; before: number; after: number } {
  const scout = requireScout(state);
  const p = state.players[playerId];
  if (!p) throw new ScoutingError('That player has retired.');
  const before = knowledgeLevel(state, p);
  if (before >= VIDEO_KNOWLEDGE_CAP) throw new ScoutingError('Footage has told you all it can. You need to see him live.');
  const cost = videoCost(state, p);
  if (scout.money < cost) throw new ScoutingError(`Video analysis costs ${formatUSD(cost)} but you only have ${formatUSD(scout.money)}.`);
  addLedger(state, { amount: usd(-cost), kind: 'video', label: `Video analysis: ${p.firstName} ${p.lastName}` });
  learn(state, p, videoGain(state), VIDEO_KNOWLEDGE_CAP, state.date);
  if (!state.pool[p.id]) state.pool[p.id] = { addedOn: state.date, source: 'manual', starred: false };
  return { cost, before, after: knowledgeLevel(state, p) };
}
