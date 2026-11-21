import { addDays, toParts, type GameDate } from '../core/calendar';
import type { ClubId, StaffId } from '../core/ids';
import { Rng, clamp } from '../core/rng';
import { FORMATION_IDS } from '../data/formations';
import { makeOfficial, newStaffId } from '../generation/world-generator';
import type { Club, ClubOfficial } from '../model/club';
import type { Country } from '../model/geography';
import type { GameState } from '../model/world-state';
import { seasonWindow } from './fixtures';
import { addNews, leagueTable } from './season';

/**
 * The coaching carousel: struggling clubs sack their Head Coach mid-season, sacked coaches look for work,
 * and clubs often hire one of them. Your relationship belongs to the coach, so it follows him.
 */

/** A new coach gets this long before the board loses patience. */
export const COACH_GRACE_DAYS = 90;
/** Out of work this long (or this old) and he retires. */
const RETIRE_AFTER_DAYS = 730;
const RETIRE_AGE = 67;
/** No mid-season sackings before this many league games. */
const MIN_GAMES = 8;

export interface CoachChange {
  club: Club;
  old: ClubOfficial;
  coach: ClubOfficial;
  /** He was out of work and has been hired again. */
  rehired: boolean;
  /** Where a rehired coach last worked. */
  previousClubId?: ClubId;
  formationBefore: string;
  reason: string;
}

const outOfWork = (state: GameState) => Object.values(state.officials).filter((o) => o.unemployedSince !== undefined);

function foreignPicker(state: GameState, rng: Rng) {
  const countries = Object.values(state.countries);
  return (home: Country) => rng.weighted(countries, (c) => (c.id === home.id ? 0 : Math.pow(c.strength, 1.6) * (c.continentId === home.continentId ? 3 : 1)));
}

/** Out goes the Head Coach, in comes another: often someone out of work, otherwise a newcomer. */
export function replaceCoach(state: GameState, club: Club, rng: Rng, date: GameDate, reason: string): CoachChange {
  const old = state.officials[club.headCoachId]!;
  const country = state.countries[club.countryId]!;
  const formationBefore = club.formation;

  // Someone out of work for at least a fortnight, nearer home more likely.
  const pool = outOfWork(state).filter((o) => o.id !== old.id && date - (o.unemployedSince ?? date) >= 14 && o.age < RETIRE_AGE);
  let coach: ClubOfficial;
  let rehired = false;
  let previousClubId: ClubId | undefined;
  if (pool.length && rng.chance(0.55)) {
    coach = rng.weighted(pool, (o) => (o.nationality === country.id ? 3 : 1) * (state.clubs[o.clubId]?.countryId === country.id ? 2 : 1));
    rehired = true;
    previousClubId = coach.clubId;
  } else {
    coach = makeOfficial(rng, newStaffId(state), 'coach', club.id, country, foreignPicker(state, rng));
    coach.formation = rng.pick(FORMATION_IDS);
    state.officials[coach.id] = coach;
  }
  coach.clubId = club.id;
  coach.unemployedSince = undefined;
  coach.appointedOn = date;

  old.unemployedSince = date;
  old.appointedOn = undefined;
  club.headCoachId = coach.id;
  club.coachDoubts = undefined;
  // He brings his own ideas more often than not.
  if (coach.formation && rng.chance(0.6)) club.formation = coach.formation;
  else if (!coach.formation && rng.chance(0.4)) club.formation = rng.pick(FORMATION_IDS);
  return { club, old, coach, rehired, previousClubId, formationBefore, reason };
}

/** Clubs you work with, and coaches you know: a change there is news for you. */
function relevance(state: GameState, ch: CoachChange): { yours: boolean; knowOld: number; knowNew: number } {
  const sc = state.scout;
  if (!sc) return { yours: false, knowOld: 0, knowNew: 0 };
  const e = sc.employment;
  const yours = e.mode === 'fulltime' ? e.clubId === ch.club.id : e.clients.includes(ch.club.id);
  return { yours, knowOld: Math.round(sc.relationships[ch.old.id] ?? 0), knowNew: Math.round(sc.relationships[ch.coach.id] ?? 0) };
}

/** Inbox news when a change touches you; otherwise general news for your home top flight (mid-season only). */
export function announceChange(state: GameState, ch: CoachChange, date: GameDate, midSeason: boolean) {
  const { yours, knowOld, knowNew } = relevance(state, ch);
  const { club, old, coach } = ch;
  const oldName = `${old.firstName} ${old.lastName}`;
  const newName = `${coach.firstName} ${coach.lastName}`;
  const formation = club.formation !== ch.formationBefore ? ` He switches to ${club.formation}, so the club's needs change.` : '';
  const forYou = yours || knowOld > 0 || knowNew > 0;
  const homeTopFlight = state.scout && club.countryId === state.scout.homeCountry && state.leagues[club.leagueId]!.level === 1;
  if (!forYou && !(midSeason && homeTopFlight)) return;
  const notes: string[] = [];
  if (knowNew > 0) notes.push(`You know ${coach.firstName} ${coach.lastName} (relationship ${knowNew}): a door opens at ${club.name}.`);
  else if (yours) notes.push(`You've never met ${newName}: your standing at ${club.name} now rests on him. Meet him soon.`);
  if (knowOld > 0) notes.push(`${oldName} (relationship ${knowOld}) is out of work. Your relationship stays with him if another club hires him.`);
  addNews(state, {
    date,
    kind: 'coaching',
    forYou,
    title: midSeason ? `${club.name} sack ${oldName}` : `${club.name}: ${newName} takes over`,
    body: `${club.name} part with ${oldName} ${ch.reason}. ${ch.rehired ? `${newName}, out of work since leaving ${state.clubs[ch.previousClubId!]?.name ?? 'his last club'}, ` : `${newName} `}takes over.${formation} ${notes.join(' ')}`.trim(),
    countryId: club.countryId,
    clubIds: [club.id],
  });
}

/** How far below expectations a club is: 0 (fine) to 1 (bottom when it should be top). */
function pressure(state: GameState, clubId: ClubId, rows: ReturnType<typeof leagueTable>): { pressure: number; recentPoints: number; played: number } {
  const n = rows.length;
  const byRep = [...rows].sort((a, b) => state.clubs[b.clubId]!.reputation - state.clubs[a.clubId]!.reputation);
  const expected = byRep.findIndex((r) => r.clubId === clubId);
  const actual = rows.findIndex((r) => r.clubId === clubId);
  const row = rows[actual]!;
  const recent = row.form.slice(-5);
  return {
    pressure: Math.max(0, (actual - expected) / Math.max(1, n - 1)),
    recentPoints: recent.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0),
    played: row.played,
  };
}

/** Weekly in season: boards lose patience. Monthly: long-unemployed or old coaches retire. */
export function coachTick(state: GameState, date: GameDate) {
  const { weekday, day } = toParts(date);
  if (day === 1) retireIdle(state, date);
  if (weekday !== 1 || state.season.ended) return;
  const window = seasonWindow(state.season.year);
  if (date < addDays(window.start, 56)) return;
  const rng = Rng.derive(state.seed, `coaching:${date}`);
  for (const league of Object.values(state.leagues)) {
    const rows = leagueTable(state, league.id);
    for (const row of rows) {
      const club = state.clubs[row.clubId]!;
      const coach = state.officials[club.headCoachId];
      if (!coach || (coach.appointedOn !== undefined && date - coach.appointedOn < COACH_GRACE_DAYS)) continue;
      const p = pressure(state, club.id, rows);
      if (p.played < MIN_GAMES || p.pressure < 0.25) continue;
      const chance = clamp((p.pressure - 0.2) * 0.35, 0, 0.08) * (p.recentPoints <= 4 ? 1.6 : 0.5);
      if (!rng.chance(chance)) continue;
      const ch = replaceCoach(state, club, rng, date, `after a poor run (${p.recentPoints} point${p.recentPoints === 1 ? '' : 's'} from their last five)`);
      announceChange(state, ch, date, true);
    }
  }
}

function retireIdle(state: GameState, date: GameDate) {
  for (const o of outOfWork(state)) {
    if (date - o.unemployedSince! < RETIRE_AFTER_DAYS && o.age < RETIRE_AGE) continue;
    delete state.officials[o.id as StaffId];
    if (state.scout) delete state.scout.relationships[o.id];
  }
}
