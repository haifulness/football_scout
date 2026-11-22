import { ageOn, formatDate, makeDate, toParts, type GameDate } from '../core/calendar';
import { seasonHonours, setSeasonObjectives } from './goals';
import { snapshotReviewBaseline, writeSeasonReview } from './review';
import type { ClubId, LeagueId } from '../core/ids';
import { usd } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { FORMATIONS, type FormationId } from '../data/formations';
import { DOMESTIC_SHARE, PRODIGY_CHANCE, TOP_TIER_BASE, newPlayerId, pickCaptain } from '../generation/world-generator';
import { generatePlayer } from '../generation/player-generator';
import type { Club, ClubTier } from '../model/club';
import type { Country } from '../model/geography';
import { POSITIONS, type Player, type Position } from '../model/player';
import { emptyStats, type NewsItem } from '../model/season';
import type { GameState } from '../model/world-state';
import { TIER_BANDS, bandValue, weeklyWage } from './economy';
import { scheduleLeague, seasonWindow } from './fixtures';
import { ovrAt } from './ratings';
import { bestXI } from './squad-needs';
import { computeTable, promotionSpots, type TableRow } from './standings';
import { boardNewSeason, sackOrAsk } from './board';

const MIN_SQUAD = 22;
const MAX_SQUAD = 32;

const EPHEMERAL_NEWS = new Set(['milestone', 'transfer', 'coaching', 'retirement', 'rumour']);

export function addNews(state: GameState, item: Omit<NewsItem, 'id'>): NewsItem {
  const news = { ...item, id: state.counters.news++ };
  state.news.unshift(news);
  // When the feed is full, drop the oldest world news first; keep personal news (career, money) longer.
  while (state.news.length > 400) {
    let i = state.news.length - 1;
    while (i >= 0 && !EPHEMERAL_NEWS.has(state.news[i]!.kind)) i--;
    state.news.splice(i >= 0 ? i : state.news.length - 1, 1);
  }
  return news;
}

const clubName = (state: GameState, id: ClubId) => state.clubs[id]!.name;
const playerName = (p: Player) => `${p.firstName} ${p.lastName}`;

export function leagueTable(state: GameState, leagueId: LeagueId): TableRow[] {
  return computeTable(state.leagues[leagueId]!.clubIds, state.fixtures[leagueId] ?? []);
}

/** XI average: the level a club plays at. */
export function clubLevel(state: GameState, club: Club, date: GameDate): number {
  const squad = club.squad.map((id) => state.players[id]!).filter((p) => !p.injury || p.injury.until <= date);
  const xi = bestXI(club.formation as FormationId, squad);
  return xi.reduce((s, x) => s + x.ovr, 0) / Math.max(1, xi.length);
}

/** Late May: final tables, club histories and a season review per country. */
export function endSeason(state: GameState, date: GameDate) {
  const year = state.season.year;
  for (const country of Object.values(state.countries)) {
    const parts: string[] = [];
    let title = '';
    const clubIds: ClubId[] = [];
    country.leagueIds.forEach((lid, idx) => {
      const league = state.leagues[lid]!;
      const table = leagueTable(state, lid);
      table.forEach((row, i) => state.clubs[row.clubId]!.history.push({ season: year, leagueId: lid, position: i + 1, points: row.points }));
      const champ = table[0]!;
      clubIds.push(champ.clubId);
      if (idx === 0) {
        title = `${country.name}: ${clubName(state, champ.clubId)} are champions`;
        parts.push(`${clubName(state, champ.clubId)} win the ${league.name} with ${champ.points} points.`);
        const scorer = topScorer(state, league.clubIds);
        if (scorer) parts.push(`Golden Boot: ${playerName(scorer)} (${clubName(state, scorer.clubId!)}), ${scorer.stats.goals} goals.`);
      }
      const spots = promotionSpots(league.clubIds.length);
      if (idx > 0)
        parts.push(
          `Promoted from the ${league.name}: ${table
            .slice(0, spots)
            .map((r) => clubName(state, r.clubId))
            .join(', ')}.`,
        );
      if (idx < country.leagueIds.length - 1)
        parts.push(
          `Relegated from the ${league.name}: ${table
            .slice(-spots)
            .map((r) => clubName(state, r.clubId))
            .join(', ')}.`,
        );
    });
    addNews(state, { date, kind: 'season-review', title, body: parts.join(' '), countryId: country.id, clubIds });
  }
  state.season.ended = true;
}

function topScorer(state: GameState, clubIds: ClubId[]): Player | undefined {
  let best: Player | undefined;
  for (const cid of clubIds)
    for (const pid of state.clubs[cid]!.squad) {
      const p = state.players[pid]!;
      if (!best || p.stats.goals > best.stats.goals) best = p;
    }
  return best && best.stats.goals > 0 ? best : undefined;
}

const tierBase = (country: Country, levelIdx: number) => clamp(TOP_TIER_BASE[country.strength]! + levelIdx, 1, 5);

function setTier(state: GameState, club: Club, tier: ClubTier) {
  if (tier === club.tier) return;
  club.tier = tier;
  const wealth = Math.sqrt(state.countries[club.countryId]!.wealthIndex);
  club.transferBudget = usd(Math.round(bandValue(TIER_BANDS[tier].transferBudget, 0.5, wealth) / 1000) * 1000);
}

function promoteAndRelegate(state: GameState, country: Country, rng: Rng): { sacked: { club: Club; reason: string }[] } {
  const tables = country.leagueIds.map((lid) => leagueTable(state, lid));
  const moves: { clubId: ClubId; from: number; to: number }[] = [];
  for (let i = 0; i < country.leagueIds.length - 1; i++) {
    const upper = tables[i]!;
    const lower = tables[i + 1]!;
    const spots = Math.min(promotionSpots(upper.length), promotionSpots(lower.length));
    for (const r of upper.slice(-spots)) moves.push({ clubId: r.clubId, from: i, to: i + 1 });
    for (const r of lower.slice(0, spots)) moves.push({ clubId: r.clubId, from: i + 1, to: i });
  }
  for (const m of moves) {
    const fromLeague = state.leagues[country.leagueIds[m.from]!]!;
    const toLeague = state.leagues[country.leagueIds[m.to]!]!;
    fromLeague.clubIds = fromLeague.clubIds.filter((id) => id !== m.clubId);
    toLeague.clubIds.push(m.clubId);
    const club = state.clubs[m.clubId]!;
    club.leagueId = toLeague.id;
    const base = tierBase(country, m.to);
    if (m.to < m.from) {
      club.reputation = clamp(club.reputation + 5, 1, 99);
      if (club.tier > base) setTier(state, club, base as ClubTier);
    } else {
      club.reputation = clamp(club.reputation - 5, 1, 99);
      setTier(state, club, Math.max(club.tier, base - 1) as ClubTier);
    }
  }
  // Big clubs stranded in low leagues slowly shrink to their level.
  country.leagueIds.forEach((lid, idx) => {
    for (const cid of state.leagues[lid]!.clubIds) {
      const club = state.clubs[cid]!;
      if (club.tier < tierBase(country, idx) - 1) setTier(state, club, (club.tier + 1) as ClubTier);
    }
  });

  // Coaches pay for bad seasons.
  const sacked: { club: Club; reason: string }[] = [];
  const relegated = new Set(moves.filter((m) => m.to > m.from).map((m) => m.clubId));
  tables.forEach((table, idx) => {
    table.forEach((row, i) => {
      const club = state.clubs[row.clubId]!;
      const frac = i / table.length;
      const chance = relegated.has(club.id) ? 0.5 : i === 0 && idx === 0 ? 0 : frac >= 0.75 ? 0.3 : 0.06;
      if (rng.chance(chance))
        sacked.push({ club, reason: relegated.has(club.id) ? 'after relegation' : frac >= 0.75 ? 'after a poor season' : 'by mutual consent' });
    });
  });
  return { sacked };
}

function release(state: GameState, club: Club, p: Player) {
  club.squad = club.squad.filter((id) => id !== p.id);
  if (club.captainId === p.id) club.captainId = undefined;
  p.clubId = undefined;
  p.contractUntil = undefined;
  p.wage = usd(0);
  state.freeAgents.push(p.id);
}

/** Signs a free agent. The free-agent list is cleaned once at the end of the rollover, not here. */
function sign(state: GameState, club: Club, p: Player, years: number, date: GameDate) {
  p.clubId = club.id;
  p.contractUntil = makeDate(toParts(date).year + years, 6, 30);
  p.wage = weeklyWage(ovrAt(p, p.naturalPosition), club.tier, state.countries[club.countryId]!.wealthIndex);
  club.squad.push(p.id);
}

function retire(state: GameState, p: Player) {
  if (p.clubId) {
    const club = state.clubs[p.clubId]!;
    club.squad = club.squad.filter((id) => id !== p.id);
    if (club.captainId === p.id) club.captainId = undefined;
  }
  // The free-agent list is cleaned once at the end of the rollover.
  delete state.players[p.id];
  delete state.pool[p.id];
  if (state.scout) delete state.scout.rapport[p.id];
  delete state.knowledge[p.id];
}

/** Free agents kept on the market after each summer (the world starts with about 3,000). */
const FREE_AGENT_CAP = 3_500;

/** Positions the formation uses, with how many players a healthy squad keeps for each. */
function depthTargets(formation: FormationId): Map<Position, number> {
  const m = new Map<Position, number>();
  for (const s of FORMATIONS[formation]) m.set(s.position, (m.get(s.position) ?? 0) + 2);
  m.set('GK', 3);
  return m;
}

function neediestPosition(state: GameState, club: Club): Position {
  const squad = club.squad.map((id) => state.players[id]!);
  let best: Position = 'CM';
  let bestGap = -Infinity;
  for (const [pos, target] of depthTargets(club.formation)) {
    const have = squad.filter((p) => (p.positions[pos] ?? 0) >= 0.75).length;
    if (target - have > bestGap) {
      bestGap = target - have;
      best = pos;
    }
  }
  return best;
}

/**
 * July 1st: archive the season, move clubs between divisions, renew or release
 * contracts, retire veterans, bring in academy players, keep squads playable,
 * and publish the new fixture list.
 */
/** A club's wage budget each summer, as a multiple of its wage bill (plus up to 0.1 for the best-supported clubs). */
export const WAGE_HEADROOM = 1.08;

export function rolloverSeason(state: GameState, date: GameDate) {
  const rng = Rng.derive(state.seed, `rollover:${state.season.year}`);
  const oldYear = state.season.year;
  if (!state.season.ended) endSeason(state, date);
  seasonHonours(state, oldYear, date, writeSeasonReview(state, oldYear));

  // 1. Archive player seasons.
  for (const p of Object.values(state.players)) {
    if (p.stats.apps > 0 || p.clubId) p.history.push({ ...p.stats, season: oldYear, clubId: p.clubId, ovr: ovrAt(p, p.naturalPosition) });
    p.stats = emptyStats();
  }

  // 2. Promotion, relegation, coaching changes.
  const countries = Object.values(state.countries);
  const foreignPick = (home: Country) =>
    rng.weighted(countries, (c) => (c.id === home.id ? 0 : Math.pow(c.strength, 1.6) * (c.continentId === home.continentId ? 3 : 1)));
  for (const country of countries) {
    const { sacked } = promoteAndRelegate(state, country, rng);
    const lines: string[] = [];
    for (const { club, reason } of sacked) {
      const old = state.officials[club.headCoachId]!;
      const ch = sackOrAsk(state, club, rng, date, reason, false);
      if (!ch) {
        lines.push(`${club.name}: ${old.firstName} ${old.lastName} is on his way out ${reason}.`);
        continue;
      }
      const { coach } = ch;
      lines.push(
        `${club.name}: ${old.firstName} ${old.lastName} leaves ${reason}; ${coach.firstName} ${coach.lastName} takes over${club.formation !== ch.formationBefore ? ` and switches to ${club.formation}` : ''}.`,
      );
    }
    if (lines.length)
      addNews(state, {
        date,
        kind: 'coaching',
        title: `${country.name}: ${lines.length} coaching change${lines.length > 1 ? 's' : ''}`,
        body: lines.join(' '),
        countryId: country.id,
        clubIds: sacked.map((s) => s.club.id),
      });
  }

  // 3. Contracts: renew the useful, release the rest.
  let released = 0;
  for (const club of Object.values(state.clubs)) {
    const level = clubLevel(state, club, date);
    for (const pid of [...club.squad]) {
      const p = state.players[pid]!;
      if (!p.contractUntil || p.contractUntil >= date) continue;
      const age = ageOn(p.birthDate, date);
      const ovr = ovrAt(p, p.naturalPosition);
      const keep = (ovr >= level - 8 && age <= 33 && rng.chance(0.8)) || (age <= 21 && p.hidden.potential >= level && rng.chance(0.85));
      if (keep) {
        const years = age >= 31 ? 1 : rng.int(2, 4);
        p.contractUntil = makeDate(oldYear + 1 + years, 6, 30);
        p.wage = weeklyWage(ovr, club.tier, state.countries[club.countryId]!.wealthIndex);
      } else {
        release(state, club, p);
        released++;
      }
    }
  }

  // 4. Retirements.
  const notable: Player[] = [];
  let retired = 0;
  for (const p of Object.values(state.players)) {
    const age = ageOn(p.birthDate, date);
    const ovr = ovrAt(p, p.naturalPosition);
    const free = !p.clubId;
    // Unsigned free agents drift out of the game (otherwise the pool only ever grows).
    const chance = age >= 38 ? 1 : age >= 34 ? (age - 33) * 0.22 : !free ? 0 : age >= 30 ? 0.6 : age >= 24 ? 0.35 : 0.1;
    if (chance && rng.chance(chance)) {
      if (ovr >= 72 || p.history.reduce((n, h) => n + h.apps, 0) >= 300) notable.push(p);
      retire(state, p);
      retired++;
    }
  }
  if (notable.length) {
    const top = notable.sort((a, b) => ovrAt(b, b.naturalPosition) - ovrAt(a, a.naturalPosition)).slice(0, 6);
    addNews(state, {
      date,
      kind: 'retirement',
      title: `${notable.length} notable players hang up their boots`,
      body: top.map((p) => `${playerName(p)} (${ageOn(p.birthDate, date)}, ${state.countries[p.nationality]!.name})`).join(', ') + '.',
    });
  }

  // 5. Youth intake.
  let youth = 0;
  for (const club of Object.values(state.clubs)) {
    const country = state.countries[club.countryId]!;
    const level = clubLevel(state, club, date);
    const academyBoost = club.tier <= 2 ? 1.5 : 1;
    const count = rng.int(2, 4);
    for (let i = 0; i < count; i++) {
      const nat = rng.chance(DOMESTIC_SHARE[club.tier]) ? country : foreignPick(country);
      const p = generatePlayer(rng, {
        id: newPlayerId(state),
        position: rng.pick(FORMATIONS[club.formation]).position,
        targetOvr: clamp(Math.round(level - 20 + rng.gaussian(0, 5)), 25, 70),
        age: rng.int(16, 17),
        nationality: nat.id,
        cultureName: nat.culture,
        today: date,
        club: { id: club.id, tier: club.tier, wealthIndex: country.wealthIndex },
        wealthIndex: country.wealthIndex,
        prodigyChance: PRODIGY_CHANCE * academyBoost,
      });
      p.contractUntil = makeDate(oldYear + 4, 6, 30);
      state.players[p.id] = p;
      club.squad.push(p.id);
      youth++;
    }
  }

  // 6. Keep squads between MIN and MAX: trim deadwood, then sign free agents (or trialists).
  // Free agents by country and position they can play, each rated once (rating them per signing was quadratic).
  const faByCountryPos = new Map<string, { p: Player; ovr: number }[]>();
  for (const id of state.freeAgents) {
    const p = state.players[id];
    if (!p || p.clubId) continue;
    for (const pos of POSITIONS) {
      if ((p.positions[pos] ?? 0) < 0.75) continue;
      const key = `${p.nationality}:${pos}`;
      const list = faByCountryPos.get(key) ?? [];
      list.push({ p, ovr: ovrAt(p, pos) });
      faByCountryPos.set(key, list);
    }
  }
  let signed = 0;
  for (const club of Object.values(state.clubs)) {
    const country = state.countries[club.countryId]!;
    if (club.squad.length > MAX_SQUAD) {
      const worth = (p: Player) =>
        ovrAt(p, p.naturalPosition) + (ageOn(p.birthDate, date) <= 20 ? (p.hidden.potential - ovrAt(p, p.naturalPosition)) * 0.5 : 0);
      const ranked = club.squad.map((id) => state.players[id]!).sort((a, b) => worth(a) - worth(b));
      for (const p of ranked.slice(0, club.squad.length - MAX_SQUAD)) release(state, club, p);
    }
    const level = clubLevel(state, club, date);
    while (club.squad.length < MIN_SQUAD) {
      const pos = neediestPosition(state, club);
      const fit = (faByCountryPos.get(`${country.id}:${pos}`) ?? [])
        .filter((x) => !x.p.clubId && x.ovr <= level + 3 && x.ovr >= level - 14)
        .reduce<{ p: Player; ovr: number } | undefined>((best, x) => (!best || x.ovr > best.ovr ? x : best), undefined)?.p;
      if (fit) {
        sign(state, club, fit, rng.int(1, 3), date);
      } else {
        const p = generatePlayer(rng, {
          id: newPlayerId(state),
          position: pos,
          targetOvr: clamp(Math.round(level - 6 + rng.gaussian(0, 3)), 25, 90),
          age: rng.int(19, 29),
          nationality: country.id,
          cultureName: country.culture,
          today: date,
          club: { id: club.id, tier: club.tier, wealthIndex: country.wealthIndex },
          wealthIndex: country.wealthIndex,
          prodigyChance: 0,
        });
        p.contractUntil = makeDate(oldYear + 1 + rng.int(1, 2), 6, 30);
        state.players[p.id] = p;
        club.squad.push(p.id);
      }
      signed++;
    }
    if (!club.captainId || !club.squad.includes(club.captainId)) club.captainId = pickCaptain(club.squad.map((id) => state.players[id]!));
  }

  state.freeAgents = state.freeAgents.filter((id) => state.players[id] && !state.players[id]!.clubId);
  // Keep the free-agent market near its starting size: the weakest and oldest beyond the cap leave the game.
  // Players you are working with (pool, represented, open deals) are never removed.
  if (state.freeAgents.length > FREE_AGENT_CAP) {
    const yours = new Set<string>([
      ...Object.keys(state.pool),
      ...(state.scout?.represented ?? []),
      ...state.deals.filter((d) => d.stage === 'negotiating' || d.stage === 'agreed').map((d) => d.playerId),
    ]);
    const keep = (p: Player) => ovrAt(p, p.naturalPosition) - Math.max(0, ageOn(p.birthDate, date) - 24) * 1.5;
    const ranked = state.freeAgents
      .map((id) => state.players[id]!)
      .filter((p) => !yours.has(p.id))
      .sort((a, b) => keep(a) - keep(b));
    for (const p of ranked.slice(0, state.freeAgents.length - FREE_AGENT_CAP)) {
      retire(state, p);
      retired++;
    }
    state.freeAgents = state.freeAgents.filter((id) => state.players[id]);
  }

  // 7. Fresh budgets for the new season: transfers (part carried over), and wages set from this summer's bill
  // with some headroom, so a club can afford to strengthen every year rather than being frozen at its founding payroll.
  for (const club of Object.values(state.clubs)) {
    const band = TIER_BANDS[club.tier];
    const repT = clamp((club.reputation - band.reputation.min) / Math.max(1, band.reputation.max - band.reputation.min), 0, 1);
    const fresh = bandValue(band.transferBudget, 0.3 + repT * 0.6, Math.sqrt(state.countries[club.countryId]!.wealthIndex));
    club.transferBudget = usd(Math.round((fresh * 0.7 + club.transferBudget * 0.3) / 1000) * 1000);
    const bill = club.squad.reduce((n, id) => n + state.players[id]!.wage, 0);
    club.wageBudget = usd(Math.round((bill * (WAGE_HEADROOM + repT * 0.1)) / 100) * 100);
  }

  // 8. New season.
  state.season = { year: oldYear + 1, ended: false };
  boardNewSeason(state, date);
  snapshotReviewBaseline(state);
  setSeasonObjectives(state);
  for (const league of Object.values(state.leagues)) state.fixtures[league.id] = scheduleLeague(league, state.season.year, state.seed);
  addNews(state, {
    date,
    kind: 'season-start',
    title: `The ${state.season.year}/${String(state.season.year + 1).slice(2)} season is set`,
    body: `Fixtures are out: the first league matches kick off on ${formatDate(seasonWindow(state.season.year).start)}. This summer ${youth.toLocaleString('en-US')} academy players were registered, ${released.toLocaleString('en-US')} players were released, ${retired.toLocaleString('en-US')} retired and ${signed.toLocaleString('en-US')} squad places were filled.`,
  });
}
