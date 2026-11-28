import { ageOn, makeDate, type GameDate } from '../core/calendar';
import type { Club, ClubTier } from '../model/club';
import type { ScenarioId, ScenarioState } from '../model/scenario';
import type { CareerSetup, Difficulty } from '../model/scout';
import type { GameState } from '../model/world-state';
import { clubTrust, jobTitle, salaryFor } from './employment';
import { addLedger } from './scouting';
import { addNews, clubLevel, leagueTable } from './season';
import { promotionSpots } from './standings';
import { usd } from '../core/money';

/**
 * Scenarios: short, focused starts with their own goal and time limit.
 * Winning or losing ends the career; its score (with a bonus for winning early)
 * goes into the hall of fame.
 */

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  tagline: string;
  goal: string;
  rules: string[];
  /** Overrides the difficulty picked on the setup screen. */
  difficulty: Difficulty;
}

export const SHOESTRING_TARGET = 100_000;
export const GOLDEN_TARGET = 3;
export const GOLDEN_MAX_AGE = 17;
export const AUDITION_TRUST = 60;
const WIN_BONUS = 400;
const SPEED_BONUS = 300;

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  shoestring: {
    id: 'shoestring',
    name: 'Shoestring',
    tagline: 'Start broke in the poorest football country in the world.',
    goal: `Have ${'$100,000'} in the bank within 3 seasons.`,
    rules: ['Your home market is the poorest country with professional football.', 'You start with $1,000.', 'Going bankrupt ends it.'],
    difficulty: 'hard',
  },
  rescue: {
    id: 'rescue',
    name: 'Relegation rescue',
    tagline: 'The weakest club in your top flight hires you as its scout.',
    goal: 'Keep them up this season.',
    rules: ['You start full-time at the weakest top-flight club in your home market.', 'The board adds 50% to the transfer budget.', 'Losing the job ends it.'],
    difficulty: 'normal',
  },
  golden: {
    id: 'golden',
    name: 'The golden generation',
    tagline: 'The future is out there, and it is very young.',
    goal: `Be the first to reveal ${GOLDEN_TARGET} prodigies aged ${GOLDEN_MAX_AGE} or under, within 3 seasons.`,
    rules: ['Only prodigies you reveal while they are 17 or younger count.', 'Wonderkid hunts and searches both count.'],
    difficulty: 'normal',
  },
  audition: {
    id: 'audition',
    name: 'Big-club audition',
    tagline: 'A top-flight giant gives you one season on trial.',
    goal: `Reach standing ${AUDITION_TRUST} with them before the season ends, and they hire you.`,
    rules: ['They take you on as a freelance client from day one.', 'You start with reputation 35 and $25,000.', 'Dropping them ends it.'],
    difficulty: 'normal',
  },
};

/** Shoestring's home: the poorest country that has clubs. */
function poorestCountry(state: GameState) {
  const withClubs = new Set(Object.values(state.clubs).map((c) => c.countryId));
  return Object.values(state.countries)
    .filter((c) => withClubs.has(c.id))
    .sort((a, b) => a.wealthIndex - b.wealthIndex)[0]!;
}

/** The setup the career is created with: some scenarios choose your home and difficulty. */
export function scenarioSetup(state: GameState, setup: CareerSetup): CareerSetup {
  if (!setup.scenario) return setup;
  const def = SCENARIOS[setup.scenario];
  if (!def) throw new Error('Unknown scenario.');
  const out = { ...setup, difficulty: def.difficulty };
  if (setup.scenario === 'shoestring') {
    const c = poorestCountry(state);
    out.homeCountry = c.id;
  }
  return out;
}

function setMoney(state: GameState, amount: number) {
  const scout = state.scout!;
  addLedger(state, { amount: usd(amount - scout.money), kind: 'starting-funds', label: 'Scenario start' });
}

function topFlight(state: GameState, countryId: string): Club[] {
  const country = state.countries[countryId as keyof typeof state.countries]!;
  return state.leagues[country.leagueIds[0]!]!.clubIds.map((id) => state.clubs[id]!);
}

/** Right after the career is created: put the scenario's world in place. */
export function startScenario(state: GameState, id: ScenarioId) {
  const scout = state.scout!;
  const year = state.season.year;
  const sc: ScenarioState = { id, startedOn: state.date, season: year, deadline: makeDate(year + 1, 6, 30), status: 'active' };
  const rivalJobs = new Set(state.rivals.flatMap((r) => (r.employment.mode === 'fulltime' ? [r.employment.clubId] : [])));
  if (id === 'shoestring') {
    sc.deadline = makeDate(year + 3, 6, 30);
    setMoney(state, 1_000);
  } else if (id === 'golden') {
    sc.deadline = makeDate(year + 3, 6, 30);
  } else if (id === 'rescue') {
    const club = topFlight(state, scout.homeCountry)
      .filter((c) => !rivalJobs.has(c.id))
      .sort((a, b) => clubLevel(state, a, state.date) - clubLevel(state, b, state.date))[0]!;
    scout.reputation = 20;
    club.transferBudget = usd(Math.round((club.transferBudget * 1.5) / 1000) * 1000);
    scout.employment = {
      mode: 'fulltime',
      clubId: club.id,
      title: jobTitle(club.tier, scout.reputation),
      salary: salaryFor(club.tier, scout.reputation, state.countries[club.countryId]!.wealthIndex),
      since: state.date,
      until: makeDate(year + 1, 6, 30),
    };
    scout.relationships[club.headCoachId] = Math.max(scout.relationships[club.headCoachId] ?? 0, 40);
    sc.clubId = club.id;
  } else {
    const tierOne = Object.values(state.clubs).filter((c) => c.countryId === scout.homeCountry && c.tier === (1 as ClubTier));
    const pool = tierOne.length ? tierOne : topFlight(state, scout.homeCountry);
    const club = [...pool].sort((a, b) => a.reputation - b.reputation)[0]!;
    scout.reputation = 35;
    setMoney(state, 25_000);
    scout.employment = { mode: 'freelance', clients: [club.id] };
    scout.relationships[club.headCoachId] = Math.max(scout.relationships[club.headCoachId] ?? 0, 30);
    sc.clubId = club.id;
  }
  scout.startReputation = scout.reputation;
  state.scenario = sc;
  addNews(state, {
    date: state.date,
    kind: 'career',
    forYou: true,
    link: 'career',
    title: `Scenario: ${SCENARIOS[id].name}`,
    body: `${SCENARIOS[id].goal} ${SCENARIOS[id].rules.join(' ')}`,
  });
}

export interface ScenarioProgress {
  value: number;
  target: number;
  /** One line for the UI. */
  label: string;
  /** 0–1 toward the goal. */
  fraction: number;
}

function youngFinds(state: GameState): number {
  return (state.prodigyFinds ?? []).filter((f) => {
    const p = state.players[f.playerId];
    return p && ageOn(p.birthDate, f.date) <= GOLDEN_MAX_AGE;
  }).length;
}

/** Where a club stands in its league, and the lowest place that stays up. */
function safety(state: GameState, club: Club): { position: number; safe: number; size: number } {
  const country = state.countries[club.countryId]!;
  const table = leagueTable(state, club.leagueId);
  const idx = country.leagueIds.indexOf(club.leagueId);
  const lower = country.leagueIds[idx + 1];
  const spots = lower ? Math.min(promotionSpots(table.length), promotionSpots(state.leagues[lower]!.clubIds.length)) : 0;
  return { position: table.findIndex((r) => r.clubId === club.id) + 1, safe: table.length - spots, size: table.length };
}

export function scenarioProgress(state: GameState): ScenarioProgress | undefined {
  const sc = state.scenario;
  const scout = state.scout;
  if (!sc || !scout) return undefined;
  switch (sc.id) {
    case 'shoestring':
      return {
        value: scout.money,
        target: SHOESTRING_TARGET,
        label: `$${Math.round(scout.money).toLocaleString('en-US')} of $${SHOESTRING_TARGET.toLocaleString('en-US')}`,
        fraction: Math.max(0, Math.min(1, scout.money / SHOESTRING_TARGET)),
      };
    case 'golden': {
      const n = youngFinds(state);
      return { value: n, target: GOLDEN_TARGET, label: `${n} of ${GOLDEN_TARGET} young prodigies found`, fraction: n / GOLDEN_TARGET };
    }
    case 'audition': {
      const t = clubTrust(state, sc.clubId!);
      return { value: t, target: AUDITION_TRUST, label: `Standing at ${state.clubs[sc.clubId!]!.name}: ${t} of ${AUDITION_TRUST}`, fraction: Math.min(1, t / AUDITION_TRUST) };
    }
    case 'rescue': {
      const club = state.clubs[sc.clubId!]!;
      const s = safety(state, club);
      const pos = s.position || s.size;
      return {
        value: pos,
        target: s.safe,
        label: `${club.name}: ${pos} of ${s.size} · safe in ${s.safe}th or better`,
        fraction: pos <= s.safe ? 1 : Math.max(0, 1 - (pos - s.safe) / Math.max(1, s.size - s.safe)),
      };
    }
  }
}

function resolve(state: GameState, date: GameDate, won: boolean, why: string) {
  const sc = state.scenario!;
  sc.status = won ? 'won' : 'lost';
  sc.resolvedOn = date;
  const name = SCENARIOS[sc.id].name;
  // A bankruptcy has already ended the career: keep that, just record the scenario as lost.
  if (!state.careerOver) state.careerOver = { date, kind: 'scenario', reason: `${name}: ${won ? 'won' : 'lost'}. ${why}` };
  addNews(state, { date, kind: 'career', forYou: true, title: `Scenario ${won ? 'won' : 'lost'}: ${name}`, body: why });
}

/** Daily: has the goal been reached, or the chance gone? */
export function scenarioTick(state: GameState, date: GameDate) {
  const sc = state.scenario;
  const scout = state.scout;
  if (!sc || sc.status !== 'active' || !scout) return;
  if (state.careerOver) return resolve(state, date, false, 'The money ran out first.');
  switch (sc.id) {
    case 'shoestring':
      if (scout.money >= SHOESTRING_TARGET) return resolve(state, date, true, `$${SHOESTRING_TARGET.toLocaleString('en-US')} in the bank, from nothing.`);
      break;
    case 'golden':
      if (youngFinds(state) >= GOLDEN_TARGET) return resolve(state, date, true, `${GOLDEN_TARGET} prodigies found before they turned 18.`);
      break;
    case 'audition': {
      const club = state.clubs[sc.clubId!]!;
      if (scout.employment.mode !== 'freelance' || !scout.employment.clients.includes(club.id))
        return resolve(state, date, false, `You no longer work for ${club.name}.`);
      if (clubTrust(state, club.id) >= AUDITION_TRUST) return resolve(state, date, true, `${club.name} offer you a job: the audition worked.`);
      break;
    }
    case 'rescue': {
      const club = state.clubs[sc.clubId!]!;
      if (scout.employment.mode !== 'fulltime' || scout.employment.clubId !== club.id) return resolve(state, date, false, `You lost your job at ${club.name}.`);
      if (state.season.ended && state.season.year === sc.season) {
        const s = safety(state, club);
        return s.position <= s.safe
          ? resolve(state, date, true, `${club.name} finish ${s.position} of ${s.size} and stay up.`)
          : resolve(state, date, false, `${club.name} finish ${s.position} of ${s.size} and go down.`);
      }
      break;
    }
  }
  if (date > sc.deadline) resolve(state, date, false, 'Time ran out.');
}

/** Score for winning, more the earlier you did it. */
export function scenarioBonus(state: GameState): number {
  const sc = state.scenario;
  if (!sc || sc.status !== 'won' || sc.resolvedOn === undefined) return 0;
  const left = Math.max(0, (sc.deadline - sc.resolvedOn) / Math.max(1, sc.deadline - sc.startedOn));
  return Math.round(WIN_BONUS + SPEED_BONUS * left);
}
