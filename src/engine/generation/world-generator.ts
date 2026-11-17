import { CAREER_START } from '../core/calendar';
import {
  idFactory,
  nextId,
  type CityId,
  type ClubId,
  type ContinentId,
  type CountryId,
  type LeagueId,
  type PlayerId,
  type RegionId,
  type StaffId,
} from '../core/ids';
import { usd } from '../core/money';
import { clamp, lerp, Rng } from '../core/rng';
import { FORMATIONS, FORMATION_IDS, type FormationId } from '../data/formations';
import { CONTINENTS, COUNTRIES } from '../data/geography';
import { BLOCKED_CLUB_NAMES, culture } from '../data/names';
import type { Club, ClubOfficial, ClubTier, CrestPattern, CrestShape, KitPattern, League } from '../model/club';
import type { City, Continent, Country, Region } from '../model/geography';
import type { Player, Position } from '../model/player';
import type { GameState } from '../model/world-state';
import { TIER_BANDS, bandValue } from '../systems/economy';
import { scheduleLeague } from '../systems/fixtures';
import { generatePlayer } from './player-generator';

const LEAGUE_LAYOUT: Record<number, number[]> = { 5: [20, 20, 24, 24], 4: [18, 18, 20], 3: [16, 16], 2: [14, 14], 1: [12] };
export const TOP_TIER_BASE: Record<number, number> = { 5: 2, 4: 2, 3: 3, 2: 3, 1: 4 };
export const DOMESTIC_SHARE: Record<ClubTier, number> = { 1: 0.45, 2: 0.6, 3: 0.75, 4: 0.88, 5: 0.95 };
export const PRODIGY_CHANCE = 0.005;

const PALETTE = [
  '#c8102e',
  '#00205b',
  '#ffffff',
  '#111111',
  '#fdb913',
  '#006b3f',
  '#6cabdd',
  '#7a263a',
  '#f47a20',
  '#004d98',
  '#a50044',
  '#00843d',
  '#ffd200',
  '#5c2d91',
  '#e30613',
  '#0057b8',
  '#8b0000',
  '#1b458f',
  '#00a650',
  '#d4af37',
];

export const newPlayerId = (state: GameState) => nextId<PlayerId>(state.counters, 'player', 'p');
export const newStaffId = (state: GameState) => nextId<StaffId>(state.counters, 'staff', 's');

export type ProgressFn = (fraction: number, label: string) => void;

export function generateWorld(seed: number, onProgress: ProgressFn = () => {}): GameState {
  const rng = Rng.derive(seed, 'world');
  const today = CAREER_START;
  const state: GameState = {
    schemaVersion: 16,
    seed,
    date: today,
    continents: {} as GameState['continents'],
    countries: {} as GameState['countries'],
    regions: {} as GameState['regions'],
    cities: {} as GameState['cities'],
    leagues: {} as GameState['leagues'],
    clubs: {} as GameState['clubs'],
    officials: {} as GameState['officials'],
    players: {} as GameState['players'],
    freeAgents: [],
    season: { year: 2026, ended: false },
    fixtures: {} as GameState['fixtures'],
    news: [],
    knowledge: {} as GameState['knowledge'],
    pool: {} as GameState['pool'],
    searches: [],
    ledger: [],
    deals: [],
    offers: [],
    missions: [],
    mandates: [],
    rivals: [],
    assistants: [],
    assistantMarket: [],
    pendingDiscoveries: [],
    placements: [],
    pendingDealEvents: [],
    pendingPayouts: [],
    balanceHistory: [],
    ledgerTotals: {},
    seasonReviews: [],
    hunts: [],
    reports: [],
    objectives: [],
    trophies: [],
    prodigyFinds: [],
    counters: { player: 0, staff: 0, news: 0, search: 0, deal: 0, offer: 0, mission: 0, mandate: 0, assistant: 0, hunt: 0, report: 0, objective: 0, trophy: 0 },
  };

  const nextPlayerId = () => newPlayerId(state);
  const nextClubId = idFactory<ClubId>('c');
  const nextStaffId = () => newStaffId(state);

  // ── Geography ──
  for (const [code, name] of Object.entries(CONTINENTS)) {
    const id = code as ContinentId;
    state.continents[id] = { id, name } satisfies Continent;
  }
  for (const seedCountry of COUNTRIES) {
    const countryId = seedCountry.code as CountryId;
    const country: Country = {
      id: countryId,
      name: seedCountry.name,
      mapId: seedCountry.mapId,
      continentId: seedCountry.continent as ContinentId,
      strength: seedCountry.strength,
      wealthIndex: seedCountry.wealth,
      costIndex: seedCountry.cost,
      culture: seedCountry.culture,
      regionIds: [],
      leagueIds: [],
    };
    state.countries[countryId] = country;
    let r = 0;
    for (const [regionName, cities] of Object.entries(seedCountry.regions)) {
      const regionId = `${seedCountry.code}-r${r++}` as RegionId;
      const region: Region = { id: regionId, name: regionName, countryId, cityIds: [] };
      cities.forEach(([cityName, lat, lon], i) => {
        const cityId = `${regionId}-${i}` as CityId;
        state.cities[cityId] = { id: cityId, name: cityName, regionId, countryId, lat, lon } satisfies City;
        region.cityIds.push(cityId);
      });
      state.regions[regionId] = region;
      country.regionIds.push(regionId);
    }
  }

  const countries = Object.values(state.countries);
  const foreignPick = (home: Country) =>
    rng.weighted(countries, (c) => (c.id === home.id ? 0 : Math.pow(c.strength, 1.6) * (c.continentId === home.continentId ? 3 : 1)));

  // ── Leagues, clubs, squads ──
  countries.forEach((country, ci) => {
    onProgress(ci / countries.length, `Building ${country.name}`);
    const crng = Rng.derive(seed, `country:${country.id}`);
    const cul = culture(country.culture);
    const cityIds = country.regionIds.flatMap((r) => state.regions[r]!.cityIds);
    const usedNames = new Set<string>();
    const layout = LEAGUE_LAYOUT[country.strength]!;

    layout.forEach((clubCount, levelIdx) => {
      const level = levelIdx + 1;
      const leagueId = `${country.id}-l${level}` as LeagueId;
      const league: League = { id: leagueId, name: leagueName(country, level, layout.length), countryId: country.id, level, clubIds: [] };
      state.leagues[leagueId] = league;
      country.leagueIds.push(leagueId);

      for (let rank = 0; rank < clubCount; rank++) {
        const rankT = 1 - rank / Math.max(1, clubCount - 1); // 1 = strongest in league
        const tier = clamp(TOP_TIER_BASE[country.strength]! + levelIdx - (rank < clubCount * 0.2 ? 1 : 0), 1, 5) as ClubTier;
        const band = TIER_BANDS[tier];
        const cityId = crng.pick(cityIds);
        const city = state.cities[cityId]!;
        const name = uniqueClubName(crng, cul.clubs, city.name, usedNames);
        const clubId = nextClubId();
        const clubOvr = Math.round(lerp(band.squadOvr.min, band.squadOvr.max, 0.25 + rankT * 0.55 + crng.gaussian(0, 0.08)));
        const formation = crng.pick(FORMATION_IDS);
        const [primary, secondary, accent] = pickColors(crng);

        const coach = makeOfficial(crng, nextStaffId(), 'coach', clubId, country, foreignPick);
        // Clubs used to have a president too: still draw (and discard) his numbers so a seed keeps producing the same world.
        nextStaffId();
        skipLegacyPresident(crng, country);
        state.officials[coach.id] = coach;

        const club: Club = {
          id: clubId,
          name,
          shortName: shortCode(city.name, name),
          cityId,
          countryId: country.id,
          leagueId,
          tier,
          reputation: Math.round(lerp(band.reputation.min, band.reputation.max, rankT * 0.8 + crng.float(0, 0.2))),
          founded: crng.int(1868, 1995),
          stadium: crng.pick(cul.stadium).replace('{c}', city.name),
          capacity: Math.round(lerp(band.capacity.min, band.capacity.max, rankT * 0.7 + crng.float(0, 0.3)) / 100) * 100,
          transferBudget: usd(Math.round(bandValue(band.transferBudget, rankT * 0.7 + crng.float(0, 0.3), Math.sqrt(country.wealthIndex)) / 1000) * 1000),
          wageBudget: usd(0),
          formation,
          squad: [],
          headCoachId: coach.id,
          acceptsProspects: tier === 1 ? 'prodigies' : tier === 2 ? (crng.chance(0.35) ? 'yes' : 'prodigies') : crng.chance(0.1) ? 'never' : 'yes',
          colors: { primary, secondary, accent },
          crest: {
            shape: crng.pick<CrestShape>(['shield', 'round', 'heater', 'diamond', 'badge']),
            pattern: crng.pick<CrestPattern>(['plain', 'stripes', 'halves', 'hoops', 'sash', 'chevron', 'quarters', 'cross']),
            emblem: crng.pick(['ball', 'star', 'lion', 'castle', 'eagle', 'crown', 'none'] as const),
          },
          history: [],
          kit: {
            pattern: crng.weighted<KitPattern>(['plain', 'stripes', 'hoops', 'halves', 'sash', 'pinstripes', 'band'], (p) =>
              p === 'plain' ? 4 : p === 'stripes' ? 2 : 1,
            ),
          },
        };

        const squad = generateSquad(crng, club, formation, clubOvr, country, foreignPick, nextPlayerId, today);
        let wages = 0;
        for (const p of squad) {
          state.players[p.id] = p;
          club.squad.push(p.id);
          wages += p.wage;
        }
        club.wageBudget = usd(Math.round((wages * crng.float(1.02, 1.2)) / 100) * 100);
        club.captainId = pickCaptain(squad);
        state.clubs[clubId] = club;
        league.clubIds.push(clubId);
      }
    });

    // Free agents: released lower-league players looking for a club
    const faCount = Math.round(8 + country.strength * 6);
    for (let i = 0; i < faCount; i++) {
      const pos = randomPosition(crng);
      const age = crng.chance(0.3) ? crng.int(18, 21) : crng.int(22, 34);
      const p = generatePlayer(crng, {
        id: nextPlayerId(),
        position: pos,
        targetOvr: Math.round(crng.float(36, 58) + (country.strength - 3) * 2),
        age,
        nationality: country.id,
        cultureName: country.culture,
        today,
        wealthIndex: country.wealthIndex,
        prodigyChance: PRODIGY_CHANCE,
      });
      state.players[p.id] = p;
      state.freeAgents.push(p.id);
    }
  });

  for (const league of Object.values(state.leagues)) state.fixtures[league.id] = scheduleLeague(league, state.season.year, seed);

  onProgress(1, 'World ready');
  return state;
}

function generateSquad(
  rng: Rng,
  club: Club,
  formation: FormationId,
  clubOvr: number,
  country: Country,
  foreignPick: (c: Country) => Country,
  nextId: () => PlayerId,
  today: GameState['date'],
): Player[] {
  const slots = FORMATIONS[formation];
  const weakSpots = new Set<number>();
  const weakCount = rng.int(1, 2);
  while (weakSpots.size < weakCount) weakSpots.add(rng.int(1, slots.length - 1));

  const squad: Player[] = [];
  const make = (position: Position, targetOvr: number, age: number) => {
    const foreign = !rng.chance(DOMESTIC_SHARE[club.tier]);
    const nat = foreign ? foreignPick(country) : country;
    squad.push(
      generatePlayer(rng, {
        id: nextId(),
        position,
        targetOvr: clamp(Math.round(targetOvr), 25, 94),
        age,
        nationality: nat.id,
        cultureName: nat.culture,
        today,
        club: { id: club.id, tier: club.tier, wealthIndex: country.wealthIndex },
        wealthIndex: country.wealthIndex,
        prodigyChance: PRODIGY_CHANCE,
      }),
    );
  };

  slots.forEach((slot, i) => {
    const weak = weakSpots.has(i) ? rng.float(5, 11) : 0;
    make(slot.position, clubOvr + rng.gaussian(1, 3) - weak, rng.int(21, 32));
    make(slot.position, clubOvr - 4 + rng.gaussian(0, 3) - weak / 2, rng.chance(0.4) ? rng.int(19, 23) : rng.int(24, 33));
  });
  make('GK', clubOvr - 9 + rng.gaussian(0, 3), rng.int(18, 22));
  const youth = rng.int(3, 5);
  for (let i = 0; i < youth; i++) make(randomPosition(rng), clubOvr - 12 + rng.gaussian(0, 4), rng.int(17, 20));
  return squad;
}

/** Consumes exactly the random draws the removed club president used to (see makeOfficial's history). */
function skipLegacyPresident(rng: Rng, country: Country) {
  const names = culture(country.culture);
  for (let i = 0; i < 7; i++) rng.float(0.2, 1);
  rng.pick(names.first);
  rng.pick(names.last);
  rng.int(42, 76);
  rng.int(10, 90);
  rng.seed();
}

export function makeOfficial(rng: Rng, id: StaffId, role: 'coach', clubId: ClubId, country: Country, foreignPick: (c: Country) => Country): ClubOfficial {
  const nat = rng.chance(0.25) ? foreignPick(country) : country;
  const names = culture(nat.culture);
  const w = () => Math.round(rng.float(0.2, 1) * 100) / 100;
  const priorities = {
    tacticalFit: w() + 0.6,
    currentAbility: w() + 0.6,
    potential: w() * 0.6,
    value: w() * 0.4,
    resale: w() * 0.3,
    marketing: w() * 0.2,
    personality: w() + 0.3,
  };
  return {
    id,
    role,
    clubId,
    nationality: nat.id,
    firstName: rng.pick(names.first),
    lastName: rng.pick(names.last),
    age: rng.int(36, 68),
    priorities,
    stubbornness: rng.int(10, 90),
    portraitSeed: rng.seed(),
  };
}

export function pickCaptain(squad: Player[]): PlayerId | undefined {
  let best: Player | undefined;
  for (const p of squad) {
    if (!best || p.attributes.leadership * 2 + p.attributes.composure > best.attributes.leadership * 2 + best.attributes.composure) best = p;
  }
  return best?.id;
}

const POSITION_MIX: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST', 'LWB', 'RWB'];
export const randomPosition = (rng: Rng) => rng.pick(POSITION_MIX);

function uniqueClubName(rng: Rng, patterns: string[], city: string, used: Set<string>): string {
  for (let i = 0; i < 30; i++) {
    const name = rng.pick(patterns).replace('{c}', city);
    if (!used.has(name) && !BLOCKED_CLUB_NAMES.has(name)) {
      used.add(name);
      return name;
    }
  }
  let n = 2;
  while (used.has(`${city} ${romanish(n)}`)) n++;
  const fallback = `${city} ${romanish(n)}`;
  used.add(fallback);
  return fallback;
}

const romanish = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n] ?? String(n);

function shortCode(city: string, name: string): string {
  const clean = city
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  const extra =
    name
      .normalize('NFD')
      .replace(/[^A-Za-z ]/g, '')
      .split(' ')
      .find((w) => w && !city.includes(w))?.[0]
      ?.toUpperCase() ?? '';
  return (clean.slice(0, 2) + (extra || clean[2] || 'X')).slice(0, 3);
}

function pickColors(rng: Rng): [string, string, string] {
  const primary = rng.pick(PALETTE);
  let secondary = rng.pick(PALETTE);
  while (secondary === primary) secondary = rng.pick(PALETTE);
  const accent = rng.chance(0.5) ? '#ffffff' : rng.pick(PALETTE);
  return [primary, secondary, accent];
}

const LEAGUE_NAMES: Partial<Record<string, string[]>> = {
  eng: ['Premier Division', 'Championship', 'League One', 'National League'],
  esp: ['Primera División', 'Segunda División', 'Primera Federación', 'Segunda Federación'],
  ger: ['Bundesliga', '2. Bundesliga', '3. Liga', 'Regionalliga'],
  ita: ['Serie A', 'Serie B', 'Serie C', 'Serie D'],
  fra: ['Ligue 1', 'Ligue 2', 'National', 'National 2'],
  por: ['Primeira Liga', 'Segunda Liga', 'Liga 3'],
  ned: ['Eredivisie', 'Eerste Divisie', 'Tweede Divisie'],
  tur: ['Süper Lig', '1. Lig', '2. Lig'],
  bra: ['Série A', 'Série B', 'Série C'],
  arg: ['Primera División', 'Primera Nacional', 'Primera B'],
  bel: ['Pro League', 'Challenger Pro League', 'National Division 1'],
};

function leagueName(country: Country, level: number, levels: number): string {
  const base = LEAGUE_NAMES[country.id]?.[level - 1];
  if (base) return base;
  if (level === 1) return `${country.name} Premier League`;
  return levels === 2 ? `${country.name} First Division` : `${country.name} Division ${level - 1}`;
}
