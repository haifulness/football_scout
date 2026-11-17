import { addDays, makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { Rng } from '../core/rng';
import type { League } from '../model/club';
import type { Fixture } from '../model/season';

/**
 * Double round-robin (circle method). Every club meets every other club twice,
 * once at home and once away, with one match per club per round.
 */
export function roundRobin(clubIds: ClubId[], rng: Rng): { home: ClubId; away: ClubId }[][] {
  const teams: (ClubId | null)[] = rng.shuffle([...clubIds]);
  if (teams.length % 2) teams.push(null); // bye
  const n = teams.length;
  const firstHalf: { home: ClubId; away: ClubId }[][] = [];
  const rotating = teams.slice(1);
  // Venue balancing: home goes to whoever has had fewer home games so far,
  // and on a tie to whoever was away last round. This keeps runs short.
  const homes = new Map<ClubId, number>();
  const lastHome = new Map<ClubId, boolean>();
  for (let r = 0; r < n - 1; r++) {
    const lineup = [teams[0]!, ...rotating];
    const round: { home: ClubId; away: ClubId }[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = lineup[i];
      const b = lineup[n - 1 - i];
      if (!a || !b) continue;
      const ha = homes.get(a) ?? 0;
      const hb = homes.get(b) ?? 0;
      const aHome = ha !== hb ? ha < hb : lastHome.get(a) === lastHome.get(b) ? (r + i) % 2 === 0 : !lastHome.get(a);
      const [home, away] = aHome ? [a, b] : [b, a];
      round.push({ home, away });
      homes.set(home, (homes.get(home) ?? 0) + 1);
      lastHome.set(home, true);
      lastHome.set(away, false);
    }
    firstHalf.push(round);
    rotating.unshift(rotating.pop()!);
  }
  const secondHalf = firstHalf.map((round) => round.map((m) => ({ home: m.away, away: m.home })));
  return [...firstHalf, ...secondHalf];
}

/** League season runs from the second Saturday of August to late May. */
export function seasonWindow(year: number): { start: GameDate; end: GameDate } {
  return { start: nextWeekday(makeDate(year, 8, 8), 6), end: makeDate(year + 1, 5, 24) };
}

function nextWeekday(d: GameDate, weekday: number): GameDate {
  let x = d;
  while (toParts(x).weekday !== weekday) x = addDays(x, 1);
  return x;
}

/**
 * Picks `rounds` match dates: Saturdays first; if a league has more rounds
 * than weekends, midweek (Wednesday) rounds are added.
 */
export function matchDates(year: number, rounds: number): GameDate[] {
  const { start, end } = seasonWindow(year);
  const saturdays: GameDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) saturdays.push(d);
  let candidates = saturdays;
  if (rounds > saturdays.length) {
    const wednesdays = saturdays.map((s) => addDays(s, 4)).filter((d) => d < end);
    // Spread the extra midweek rounds through the season.
    const extra = rounds - saturdays.length;
    const step = wednesdays.length / extra;
    const chosen = Array.from({ length: extra }, (_, i) => wednesdays[Math.floor(i * step + step / 2)]!);
    candidates = [...saturdays, ...chosen].sort((a, b) => a - b);
  }
  // Evenly sample from candidates so smaller leagues get natural breaks.
  const step = candidates.length / rounds;
  return Array.from({ length: rounds }, (_, i) => candidates[Math.min(candidates.length - 1, Math.floor(i * step))]!);
}

export function scheduleLeague(league: League, year: number, seed: number): Fixture[] {
  const rng = Rng.derive(seed, `fixtures:${league.id}:${year}`);
  const rounds = roundRobin(league.clubIds, rng);
  const dates = matchDates(year, rounds.length);
  return rounds.flatMap((round, r) =>
    round.map((m, i) => ({ id: `${league.id}:${year}:${r + 1}:${i}`, leagueId: league.id, round: r + 1, date: dates[r]!, homeId: m.home, awayId: m.away })),
  );
}
