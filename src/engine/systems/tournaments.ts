import { addDays, ageOn, formatDate, makeDate, type GameDate } from '../core/calendar';
import type { ClubId, ContinentId, CountryId, PlayerId } from '../core/ids';
import { formatUSD, usd } from '../core/money';
import { Rng, clamp, hashString } from '../core/rng';
import type { Club } from '../model/club';
import type { Country } from '../model/geography';
import type { Player } from '../model/player';
import type { Tournament, TournamentMatch, TournamentRound } from '../model/tournament';
import type { GameState } from '../model/world-state';
import { revalue } from './development';
import { simulateMatch } from './match-sim';
import { MATCH_TIER_MULT, MODE_MULT } from './payouts';
import { START_MORALE } from './placement-stories';
import { ovrAt } from './ratings';
import { addLedger } from './scouting';
import { addNews } from './season';

/**
 * International tournaments, every summer once the league season is over: a World Cup in even years, and your
 * continent's championship in odd years (Europe, Africa, or the Americas together). The best players of each
 * nation are named a month ahead. Those who shine become famous: everyone sees them clearly and their price
 * jumps, so the time to scout them is before. Players you placed earn a call-up bonus and a lift in morale.
 */

const SQUAD = 23;
const GKS = 3;
/** Fame fades over a year. */
const FAME_DAYS = 365;
/** How much fame raises how well everyone knows him (knowledge points per unit of fame). */
export const FAME_VISIBILITY = 80;
const CALL_UP_BASE = 400;

/** Continents that hold their own championship (the Americas play together). */
const CONTINENTAL: { ids: string[]; name: string }[] = [
  { ids: ['EU'], name: 'European Championship' },
  { ids: ['AF'], name: 'Africa Cup of Nations' },
  { ids: ['NA', 'SA'], name: 'Copa of the Americas' },
];

const rand = (state: GameState, key: string) => hashString(`${state.seed}:${key}`) / 4294967296;

/** Fame now (0 when it has faded), from a tournament's boost. */
export function fameOf(p: Player, date: GameDate): number {
  const f = p.fame;
  if (!f) return 0;
  const left = 1 - (date - f.since) / FAME_DAYS;
  return left > 0 ? f.boost * left : 0;
}

export const tournamentFor = (state: GameState, season: number) => state.tournaments?.find((t) => t.season === season);

/** Draw this summer's tournament once, at the start of the season. */
export function ensureTournament(state: GameState) {
  const season = state.season.year;
  if (!state.scout || tournamentFor(state, season)) return;
  const summer = season + 1;
  const home = state.countries[state.scout.homeCountry]!;
  const rng = Rng.derive(state.seed, `tournament:${season}`);
  let pool: Country[];
  let name: string;
  let kind: Tournament['kind'];
  const cont = CONTINENTAL.find((c) => c.ids.includes(home.continentId));
  if (summer % 2 === 1 && cont) {
    kind = 'continental';
    pool = Object.values(state.countries).filter((c) => cont.ids.includes(c.continentId));
    name = `${summer} ${cont.name}`;
  } else if (summer % 2 === 0) {
    kind = 'world';
    pool = Object.values(state.countries);
    name = `${summer} World Cup`;
  } else return;
  const size = pool.length >= 32 ? 32 : pool.length >= 16 ? 16 : 8;
  if (pool.length < 8) return;
  const ranked = [...pool].sort((a, b) => b.strength - a.strength || rand(state, `rank:${a.id}:${season}`) - rand(state, `rank:${b.id}:${season}`));
  const host = rng.weighted(ranked.slice(0, Math.min(10, ranked.length)), (c) => c.strength);
  const teams = [host, ...ranked.filter((c) => c.id !== host.id)].slice(0, size).map((c) => c.id);
  // Seeded pots, snake order: each group gets one team from each pot.
  const seeded = [...teams].sort((a, b) => state.countries[b]!.strength - state.countries[a]!.strength);
  const groupsN = size / 4;
  const groups: CountryId[][] = Array.from({ length: groupsN }, () => []);
  for (let pot = 0; pot < 4; pot++) {
    const potTeams = rng.shuffle(seeded.slice(pot * groupsN, (pot + 1) * groupsN));
    potTeams.forEach((c, i) => groups[i]!.push(c));
  }
  const start = makeDate(summer, 6, 14);
  const matches: TournamentMatch[] = [];
  const pairs = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
  ];
  groups.forEach((g, gi) =>
    pairs.forEach((p, day) => {
      matches.push({ id: `t${season}-g${gi}-${day}a`, round: 'group', group: gi, date: addDays(start, day * 4), home: g[p[0]!]!, away: g[p[1]!]! });
      matches.push({ id: `t${season}-g${gi}-${day}b`, round: 'group', group: gi, date: addDays(start, day * 4), home: g[p[2]!]!, away: g[p[3]!]! });
    }),
  );
  const rounds = koRounds(size);
  const end = addDays(start, 13 + (rounds.length - 1) * 4);
  const hostCity = Object.values(state.clubs)
    .filter((c) => c.countryId === host.id)
    .sort((a, b) => b.capacity - a.capacity)[0]!.cityId;
  const t: Tournament = {
    id: season,
    kind,
    name,
    season,
    hostId: host.id,
    cityId: hostCity,
    start,
    end,
    squadsOn: addDays(start, -30),
    teams,
    groups,
    matches,
    lines: {},
  };
  state.tournaments = [...(state.tournaments ?? []).filter((x) => x.season >= season - 2), t];
}

function koRounds(size: number): TournamentRound[] {
  return size === 32 ? ['r16', 'qf', 'sf', 'final'] : size === 16 ? ['qf', 'sf', 'final'] : ['sf', 'final'];
}

export const ROUND_LABEL: Record<TournamentRound, string> = { group: 'Group stage', r16: 'Round of 16', qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final' };

/** The nation's best players: three keepers and twenty outfield players, by rating at their own position. */
function pickSquad(byNation: Map<CountryId, Player[]>, country: CountryId): PlayerId[] {
  const all = (byNation.get(country) ?? []).map((p) => ({ p, ovr: ovrAt(p, p.naturalPosition) })).sort((a, b) => b.ovr - a.ovr);
  const gk = all.filter((x) => x.p.naturalPosition === 'GK').slice(0, GKS);
  const out = all.filter((x) => x.p.naturalPosition !== 'GK').slice(0, SQUAD - gk.length);
  return [...gk, ...out].map((x) => x.p.id);
}

/** A national team, dressed as a club for the match engine. */
function nationalTeam(state: GameState, t: Tournament, country: CountryId): Club {
  const c = state.countries[country]!;
  const squad = t.squads?.[country] ?? [];
  const captain = squad.map((id) => state.players[id]!).filter(Boolean).sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0];
  return {
    id: `nat-${country}` as ClubId,
    name: c.name,
    shortName: c.name.slice(0, 3).toUpperCase(),
    countryId: country,
    formation: '4-3-3',
    squad,
    captainId: captain?.id,
    reputation: 50 + c.strength * 10,
  } as unknown as Club;
}

function standings(t: Tournament, gi: number) {
  const table = new Map<CountryId, { id: CountryId; pts: number; gd: number; gf: number }>(t.groups[gi]!.map((id) => [id, { id, pts: 0, gd: 0, gf: 0 }]));
  for (const m of t.matches) {
    if (m.round !== 'group' || m.group !== gi || !m.result) continue;
    const h = table.get(m.home)!;
    const a = table.get(m.away)!;
    h.gf += m.result.home;
    a.gf += m.result.away;
    h.gd += m.result.home - m.result.away;
    a.gd += m.result.away - m.result.home;
    if (m.result.home > m.result.away) h.pts += 3;
    else if (m.result.home < m.result.away) a.pts += 3;
    else {
      h.pts++;
      a.pts++;
    }
  }
  return [...table.values()].sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
}
export { standings as groupTable };

/** Daily: name the squads, play today's games, draw the next round, and wrap up. */
export function tournamentTick(state: GameState, date: GameDate) {
  if (!state.scout) return;
  ensureTournament(state);
  // The knockouts run on into July, past the season's rollover: follow every tournament still going.
  for (const t of state.tournaments ?? []) {
    if (t.winner) continue;
    if (date >= t.squadsOn && !t.squads) nameSquads(state, t, date);
    const today = t.matches.filter((m) => m.date === date && !m.result);
    if (!today.length) continue;
    for (const m of today) play(state, t, m);
    nextRound(state, t, date);
  }
}

function nameSquads(state: GameState, t: Tournament, date: GameDate) {
  const byNation = new Map<CountryId, Player[]>();
  const teams = new Set(t.teams);
  for (const p of Object.values(state.players)) {
    if (!p.clubId || !teams.has(p.nationality) || ageOn(p.birthDate, date) > 36) continue;
    const list = byNation.get(p.nationality) ?? [];
    list.push(p);
    byNation.set(p.nationality, list);
  }
  t.squads = Object.fromEntries(t.teams.map((c) => [c, pickSquad(byNation, c)]));
  const host = state.countries[t.hostId]!;
  addNews(state, {
    date,
    kind: 'milestone',
    title: `${t.name}: squads named`,
    body: `${t.teams.length} nations meet in ${host.name} from ${formatDate(t.start)}. Players who shine there will be famous, and expensive, by August.`,
    countryId: t.hostId,
  });
  // Your players get the call.
  const scout = state.scout!;
  const called = new Set(Object.values(t.squads).flat());
  for (const pl of state.placements) {
    if (pl.endedOn || !called.has(pl.playerId)) continue;
    const p = state.players[pl.playerId];
    if (!p || p.clubId !== pl.clubId) continue;
    const tier = state.clubs[pl.clubId]!.tier;
    const bonus = usd(Math.round((CALL_UP_BASE * MATCH_TIER_MULT[tier] * MODE_MULT[pl.mode]) / 10) * 10);
    pl.morale = Math.min(100, (pl.morale ?? START_MORALE) + 10);
    pl.earnings.appearance += bonus;
    addLedger(state, { amount: bonus, kind: 'match-bonus', label: `Call-up bonus: ${p.firstName} ${p.lastName}` });
    addNews(state, {
      date,
      kind: 'career',
      title: `${p.firstName} ${p.lastName} is going to the ${t.name}`,
      body: `${state.countries[p.nationality]!.name} name him in their squad. You earn ${formatUSD(bonus)}, and he is walking on air.`,
      playerIds: [p.id],
    });
  }
  void scout;
}

function play(state: GameState, t: Tournament, m: TournamentMatch) {
  const home = nationalTeam(state, t, m.home);
  const away = nationalTeam(state, t, m.away);
  const sim = simulateMatch(
    Rng.derive(state.seed, `tmatch:${m.id}`),
    { club: home, squad: home.squad.map((id) => state.players[id]!).filter(Boolean) },
    { club: away, squad: away.squad.map((id) => state.players[id]!).filter(Boolean) },
    m.date,
  );
  const r = sim.result;
  m.result = { home: r.homeGoals, away: r.awayGoals };
  if (m.round !== 'group') {
    const pens = r.homeGoals === r.awayGoals;
    const homeWins = pens ? rand(state, `pens:${m.id}`) < 0.5 : r.homeGoals > r.awayGoals;
    m.result.winner = homeWins ? m.home : m.away;
    m.result.penalties = pens;
  }
  for (const l of sim.lines) {
    if (l.minutes <= 0) continue;
    const x = (t.lines[l.playerId] ??= { apps: 0, goals: 0, ratingSum: 0 });
    x.apps++;
    x.goals += l.goals;
    x.ratingSum += l.rating;
  }
}

/** Once a round is complete, draw the next; after the final, crown the winner. */
function nextRound(state: GameState, t: Tournament, date: GameDate) {
  const rounds = koRounds(t.teams.length);
  const roundOf = (r: TournamentRound) => t.matches.filter((m) => m.round === r);
  const done = (r: TournamentRound) => roundOf(r).length > 0 && roundOf(r).every((m) => m.result);
  const firstKoDay = addDays(t.start, 13);
  if (done('group') && !roundOf(rounds[0]!).length) {
    const tables = t.groups.map((_, gi) => standings(t, gi));
    const ties: [CountryId, CountryId][] = [];
    for (let gi = 0; gi < tables.length; gi += 2) {
      const a = tables[gi]!;
      const b = tables[gi + 1]!;
      ties.push([a[0]!.id, b[1]!.id], [b[0]!.id, a[1]!.id]);
    }
    ties.forEach(([h, a], i) => t.matches.push({ id: `t${t.season}-${rounds[0]}-${i}`, round: rounds[0]!, date: firstKoDay, home: h, away: a }));
    roundNews(state, t, 'group', date);
    return;
  }
  for (let ri = 0; ri < rounds.length; ri++) {
    const r = rounds[ri]!;
    if (!done(r)) continue;
    const next = rounds[ri + 1];
    if (!next) {
      if (!t.winner) finish(state, t, roundOf(r)[0]!, date);
      return;
    }
    if (roundOf(next).length) continue;
    const winners = roundOf(r).map((m) => m.result!.winner!);
    for (let i = 0; i < winners.length; i += 2)
      t.matches.push({ id: `t${t.season}-${next}-${i / 2}`, round: next, date: addDays(firstKoDay, (ri + 1) * 4), home: winners[i]!, away: winners[i + 1]! });
    roundNews(state, t, r, date);
    return;
  }
}

function roundNews(state: GameState, t: Tournament, r: TournamentRound, date: GameDate) {
  const name = (c: CountryId) => state.countries[c]!.name;
  const body =
    r === 'group'
      ? `Through to the knockouts: ${t.groups.flatMap((_, gi) => standings(t, gi).slice(0, 2).map((x) => name(x.id))).join(', ')}.`
      : t.matches
          .filter((m) => m.round === r)
          .map((m) => `${name(m.home)} ${m.result!.home}–${m.result!.away} ${name(m.away)}${m.result!.penalties ? ` (${name(m.result!.winner!)} on penalties)` : ''}`)
          .join(' · ');
  addNews(state, { date, kind: 'milestone', title: `${t.name}: ${ROUND_LABEL[r].toLowerCase()} over`, body, countryId: t.hostId });
}

function finish(state: GameState, t: Tournament, final: TournamentMatch, date: GameDate) {
  t.winner = final.result!.winner;
  const scored = Object.entries(t.lines).map(([id, x]) => ({ id: id as PlayerId, ...x, avg: x.ratingSum / x.apps }));
  const standouts = scored
    .filter((x) => x.apps >= 3 && (x.avg >= 7.15 || x.goals >= 3))
    .sort((a, b) => b.avg + b.goals * 0.2 - (a.avg + a.goals * 0.2))
    .slice(0, 12);
  const flops = scored.filter((x) => x.apps >= 3 && x.avg < 6.35).slice(0, 12);
  t.standouts = standouts.map((x) => x.id);
  t.flops = flops.map((x) => x.id);
  for (const x of standouts) {
    const p = state.players[x.id];
    if (!p) continue;
    p.fame = { boost: clamp(0.2 + (x.avg - 7) * 0.4 + x.goals * 0.03, 0.2, 0.45), since: date };
    revalue(state, p, date);
  }
  for (const x of flops) {
    const p = state.players[x.id];
    if (!p) continue;
    p.fame = { boost: -0.1, since: date };
    revalue(state, p, date);
  }
  const name = (c: CountryId) => state.countries[c]!.name;
  const star = standouts[0] && state.players[standouts[0].id];
  // An unknown who shone: someone from a smaller club.
  const breakout = standouts.map((x) => state.players[x.id]).find((p) => p && p.clubId && state.clubs[p.clubId]!.tier >= 3);
  addNews(state, {
    date,
    kind: 'milestone',
    title: `${name(t.winner!)} win the ${t.name}`,
    body:
      `${name(final.home)} ${final.result!.home}–${final.result!.away} ${name(final.away)}${final.result!.penalties ? ', on penalties' : ''} in the final.` +
      (star ? ` Player of the tournament: ${star.firstName} ${star.lastName}.` : '') +
      (breakout
        ? ` The breakout: ${breakout.firstName} ${breakout.lastName} of ${state.clubs[breakout.clubId!]!.name}, unknown a month ago, now wanted everywhere.`
        : '') +
      ` Prices for its stars have jumped.`,
    countryId: t.hostId,
    playerIds: [star?.id, breakout?.id].filter(Boolean) as PlayerId[],
  });
}

/** Continent id helper for views. */
export const continentName = (state: GameState, id: ContinentId) => state.continents[id]?.name ?? String(id);
