import { ageOn } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD } from '../core/money';
import { Rng } from '../core/rng';
import type { Club } from '../model/club';
import type { Player, Position } from '../model/player';
import type { Prediction } from '../model/prediction';
import type { Fixture } from '../model/season';
import type { GameState } from '../model/world-state';
import type {
  ClubBadge,
  FrontPage,
  GazetteNeed,
  TouchlineInterview,
  TouchlinePressure,
  TouchlinePundit,
  TouchlineResult,
  TouchlineRumour,
  TouchlineSection,
  TouchlineSigning,
  TouchlineTableRow,
} from '../views';
import { pressure } from './coaching';
import { POLICY_LABEL, presidentOf } from './board';
import { ovrAt } from './ratings';
import { leagueTable } from './season';
import { computeTable, promotionSpots } from './standings';
import type { SlotNeed } from './squad-needs';

/**
 * The Touchline: a weekly paper written from what actually happened. Everything here is derived on demand
 * from the world, except the pundit's pre-season picks, which are made once a season.
 */

const WEEK = 7;

const badge = (c: Club): ClubBadge => ({ id: c.id, name: c.name, shortName: c.shortName, tier: c.tier, colors: c.colors, crest: c.crest, kit: c.kit });
const name = (p: Player) => `${p.firstName} ${p.lastName}`;

export const POSITION_NAME: Record<Position, string> = {
  GK: 'goalkeeper',
  CB: 'centre-back',
  LB: 'left-back',
  RB: 'right-back',
  LWB: 'left wing-back',
  RWB: 'right wing-back',
  DM: 'holding midfielder',
  CM: 'central midfielder',
  AM: 'playmaker',
  LM: 'left midfielder',
  RM: 'right midfielder',
  LW: 'left winger',
  RW: 'right winger',
  ST: 'striker',
};

const REPORTERS = [
  'Martha Quill',
  'Desmond Okafor',
  'Ines Carvalho',
  'Tomasz Wren',
  'Priya Holloway',
  'Gus Abernathy',
  'Lena Brandt',
  'Rafael Ostrova',
  'Nell Fairweather',
  'Kofi Mensah',
  'Sasha Lindqvist',
  'Bram de Vos',
];
const SECTIONS: TouchlineSection[] = ['front', 'results', 'transfers', 'rumours', 'interview', 'pressure', 'pundit', 'corner', 'wanted'];

/** One reporter per desk; they move desks now and then, never two on one desk. */
export function bylines(issue: number): Record<TouchlineSection, string> {
  const rng = Rng.derive(issue >> 3, 'touchline:desks');
  const staff = rng.shuffle([...REPORTERS]);
  return Object.fromEntries(SECTIONS.map((s, i) => [s, staff[i]!])) as Record<TouchlineSection, string>;
}

const homeLeague = (state: GameState) => {
  const sc = state.scout;
  const leagueId = sc && state.countries[sc.homeCountry]!.leagueIds[0];
  return leagueId ? state.leagues[leagueId] : undefined;
};

/** The pundit's picks for your home top flight: made once a season (also for older saves). */
export function ensurePredictions(state: GameState) {
  const league = homeLeague(state);
  if (!league) return;
  const year = state.season.year;
  if (state.predictions?.some((p) => p.season === year && p.leagueId === league.id)) return;
  const rng = Rng.derive(state.seed, `pundit:${year}`);
  // Reputation with a pundit's hunch on top.
  const rated = league.clubIds
    .map((id) => ({ id, score: state.clubs[id]!.reputation + rng.float(-8, 8) }))
    .sort((a, b) => b.score - a.score);
  const drop = promotionSpots(league.clubIds.length);
  const young = league.clubIds
    .flatMap((id) => state.clubs[id]!.squad.map((pid) => state.players[pid]!))
    .filter((p) => ageOn(p.birthDate, state.date) <= 21)
    // Someone already near the team, with room to grow: a pick that can come good this season.
    .map((p) => ({ p, score: ovrAt(p, p.naturalPosition) * 0.6 + p.hidden.potential * 0.4 + rng.float(-4, 4) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
  const pick: Prediction = {
    season: year,
    countryId: league.countryId,
    leagueId: league.id,
    title: rated[0]!.id,
    relegated: rated.slice(-drop).map((r) => r.id),
    breakout: young[0]?.id,
  };
  state.predictions = [...(state.predictions ?? []).filter((p) => p.season >= year - 2), pick];
}

export interface TouchlineInput {
  issue: number;
  /** Clubs on your books. */
  mine: Set<ClubId>;
  /** Your clubs' wish lists, most pressing first (the old lead story). */
  yourClubs: GazetteNeed[];
  needsOf: (club: Club) => SlotNeed[];
}

export function buildTouchline(state: GameState, input: TouchlineInput) {
  const date = state.date;
  const since = date - WEEK;
  const league = homeLeague(state);
  const table = league ? leagueTable(state, league.id) : [];
  const fixtures = league ? (state.fixtures[league.id] ?? []) : [];
  const week = fixtures.filter((f) => f.result && f.date > since && f.date <= date);

  const results: TouchlineResult[] = week.map((f) => {
    const home = state.clubs[f.homeId]!;
    const away = state.clubs[f.awayId]!;
    const [h, a] = [f.result!.homeGoals, f.result!.awayGoals];
    const winner = h > a ? home : a > h ? away : undefined;
    const loser = h > a ? away : a > h ? home : undefined;
    const note: TouchlineResult['note'] =
      winner && loser && loser.reputation - winner.reputation >= 12 ? 'upset' : Math.abs(h - a) >= 3 ? 'thrashing' : h + a >= 6 ? 'goal-fest' : undefined;
    return { home: badge(home), away: badge(away), score: [h, a], note };
  });

  const tableRows: TouchlineTableRow[] = table.map((r, i) => ({
    pos: i + 1,
    club: badge(state.clubs[r.clubId]!),
    played: r.played,
    points: r.points,
    form: r.form.slice(-5),
    yours: input.mine.has(r.clubId),
  }));
  const shortTable = tableRows.length > 7 ? [...tableRows.slice(0, 4), ...tableRows.slice(-3)] : tableRows;

  const weekNews = state.news.filter((n) => n.date > since && n.date <= date);
  const transfers = weekNews
    .filter((n) => n.kind === 'transfer')
    .sort((a, b) => Number(b.countryId === league?.countryId) - Number(a.countryId === league?.countryId))
    .slice(0, 4)
    .map((n) => ({ id: n.id, title: n.title, body: n.body, date: n.date }));

  const corner = signings(state, since);
  const front = frontPage(state, { since, table, fixtures, weekNews, corner, yourClubs: input.yourClubs, leagueCountry: league?.countryId });

  return {
    leagueName: league?.name,
    front,
    results,
    table: shortTable,
    transfers,
    links: rumours(state, input),
    interview: interview(state, input),
    pressure: hotSeats(state, table, league ? league.clubIds.length : 0),
    pundit: pundit(state, table),
    corner: corner.slice(0, 6),
    bylines: bylines(input.issue),
  };
}

/** Your placed players this season, best form first. */
function signings(state: GameState, since: number): TouchlineSigning[] {
  const seen = new Set<PlayerId>();
  const out: TouchlineSigning[] = [];
  for (const pl of state.placements) {
    const p = state.players[pl.playerId];
    if (!p || p.clubId !== pl.clubId || seen.has(p.id)) continue;
    seen.add(p.id);
    const club = state.clubs[pl.clubId]!;
    const league = state.fixtures[club.leagueId] ?? [];
    const starred = league.some(
      (f) =>
        f.result &&
        f.date > since &&
        f.date <= state.date &&
        (f.homeId === club.id || f.awayId === club.id) &&
        (f.result.motmId === p.id || f.result.goals.some((g) => g.scorerId === p.id)),
    );
    const s = p.stats;
    out.push({
      player: { id: p.id, name: name(p), position: pl.position },
      club: badge(club),
      apps: s.apps,
      goals: s.goals,
      assists: s.assists,
      rating: s.apps ? Math.round((s.ratingSum / s.apps) * 10) / 10 : undefined,
      starred,
    });
  }
  return out.sort((a, b) => Number(b.starred) - Number(a.starred) || (b.rating ?? 0) - (a.rating ?? 0));
}

function frontPage(
  state: GameState,
  ctx: {
    since: number;
    table: ReturnType<typeof leagueTable>;
    fixtures: Fixture[];
    weekNews: GameState['news'];
    corner: TouchlineSigning[];
    yourClubs: GazetteNeed[];
    leagueCountry?: string;
  },
): FrontPage {
  // 1. One of yours made the headlines.
  const star = ctx.corner.find((c) => c.starred);
  if (star) {
    const p = state.players[star.player.id]!;
    const club = state.clubs[star.club.id]!;
    const games = (state.fixtures[club.leagueId] ?? []).filter(
      (f) => f.result && f.date > ctx.since && f.date <= state.date && (f.homeId === club.id || f.awayId === club.id),
    );
    const goals = games.reduce((n, f) => n + f.result!.goals.filter((g) => g.scorerId === p.id).length, 0);
    const motm = games.some((f) => f.result!.motmId === p.id);
    const headline =
      goals >= 3 ? `Hat-trick hero ${p.lastName} sinks them single-handed` : goals >= 2 ? `${p.lastName} at the double for ${club.shortName}` : goals === 1 ? `${p.lastName} strikes for ${club.shortName}` : `${p.lastName} runs the show for ${club.shortName}`;
    return {
      kind: 'yours',
      kicker: 'One of yours',
      headline,
      standfirst: `${name(p)}${goals ? ` scored ${goals === 1 ? 'once' : `${goals} times`}` : ''}${goals && motm ? ' and' : ''}${motm ? ' was named man of the match' : ''} this week. ${star.apps} games for ${club.name} this season${star.rating ? `, averaging ${star.rating.toFixed(1)}` : ''}. The scout who found him knows who he is.`,
      club: badge(club),
      player: { id: p.id, name: name(p) },
    };
  }
  // 2. A sacking at home.
  const sack = ctx.weekNews.find((n) => n.kind === 'coaching' && n.countryId === ctx.leagueCountry);
  if (sack) {
    const club = sack.clubIds?.[0] ? state.clubs[sack.clubIds[0]] : undefined;
    return { kind: 'sacking', kicker: 'The hot seat', headline: sack.title, standfirst: sack.body, club: club && badge(club) };
  }
  // 3. New orders from a boardroom.
  const board = ctx.weekNews.find((n) => n.kind === 'board' && n.countryId === ctx.leagueCountry);
  if (board) {
    const club = board.clubIds?.[0] ? state.clubs[board.clubIds[0]] : undefined;
    return { kind: 'board', kicker: 'Boardroom', headline: board.title, standfirst: board.body, club: club && badge(club) };
  }
  // 4. A change at the top.
  if (ctx.table.length && ctx.table[0]!.played >= 3) {
    const leader = ctx.table[0]!;
    const before = computeTable(
      ctx.table.map((r) => r.clubId),
      ctx.fixtures.filter((f) => f.date <= ctx.since),
    );
    if (before[0] && before[0].played > 0 && before[0].clubId !== leader.clubId) {
      const club = state.clubs[leader.clubId]!;
      const old = state.clubs[before[0].clubId]!;
      return {
        kind: 'top',
        kicker: 'Title race',
        headline: `${club.name} go top`,
        standfirst: `${club.name} replace ${old.name} at the summit on ${leader.points} points after ${leader.played} games. Form: ${leader.form.slice(-5).join(' ')}.`,
        club: badge(club),
      };
    }
  }
  // 5. A big transfer at home.
  const deal = ctx.weekNews.find((n) => n.kind === 'transfer' && n.countryId === ctx.leagueCountry);
  if (deal) {
    const club = deal.clubIds?.[0] ? state.clubs[deal.clubIds[0]] : undefined;
    const pid = deal.playerIds?.[0];
    const p = pid ? state.players[pid] : undefined;
    return { kind: 'transfer', kicker: 'Done deal', headline: deal.title, standfirst: deal.body, club: club && badge(club), player: p && { id: p.id, name: name(p) } };
  }
  // 6. The wish lists.
  const need = ctx.yourClubs[0];
  if (need) {
    const pos = POSITION_NAME[need.position];
    const urgency = need.severity >= 0.7 ? 'desperate for' : need.severity >= 0.45 ? 'short of' : 'could use';
    const depth = need.depth === 0 ? 'no natural cover' : need.depth === 1 ? 'one natural option' : `${need.depth} natural options`;
    const money = need.transferBudget > 0 ? `${formatUSD(need.transferBudget, { compact: true })} to spend` : 'no transfer budget, so think free agents';
    return {
      kind: 'need',
      kicker: need.mission ? 'Open brief' : need.severity >= 0.45 ? 'Urgent' : 'Wish list',
      headline: need.mission ? `${need.club.name} post a brief for a ${pos}` : `${need.club.name} ${urgency} a ${pos}`,
      standfirst: `With ${depth} at ${need.position} and an average of ${need.average || '–'} there, anyone rated ${(need.average || 0) + 1}+ gets a hearing. They have ${money}.`,
      club: need.club,
      need,
    };
  }
  return {
    kind: 'need',
    kicker: 'Quiet week',
    headline: 'All quiet on the touchline',
    standfirst: 'No sackings, no shocks, nothing pressing at your clubs. A good week to build your pool, or to court a new client.',
  };
}

/** Club–player links: most are real (a club that needs the position and can pay), some are idle talk. */
function rumours(state: GameState, input: TouchlineInput): TouchlineRumour[] {
  const sc = state.scout;
  if (!sc) return [];
  const rng = Rng.derive(state.seed, `touchline:rumours:${input.issue}`);
  const home = Object.values(state.clubs).filter((c) => c.countryId === sc.homeCountry);
  const players = Object.values(state.players);
  const byPos = new Map<Position, Player[]>();
  for (const p of players) {
    if (!p.clubId) continue;
    const list = byPos.get(p.naturalPosition) ?? [];
    list.push(p);
    byPos.set(p.naturalPosition, list);
  }
  const out: TouchlineRumour[] = [];
  const used = new Set<PlayerId>();
  const line = (club: Club, p: Player, text: (c: string, n: string) => string): TouchlineRumour => {
    used.add(p.id);
    const from = p.clubId ? state.clubs[p.clubId] : undefined;
    return { club: badge(club), player: { id: p.id, name: name(p), position: p.naturalPosition, clubName: from?.name }, text: text(club.name, name(p)) };
  };
  const real = [
    (c: string, n: string) => `${c} have sent scouts to watch ${n}.`,
    (c: string, n: string) => `${c} are keeping tabs on ${n}, and the money is there.`,
    (c: string, n: string) => `Word is ${c} have asked about ${n}'s contract.`,
  ];
  const idle = [
    (c: string, n: string) => `${n} has been linked with ${c}, though nobody at the club will confirm it.`,
    (c: string, n: string) => `A source close to ${n} says ${c} are interested.`,
  ];

  // The real ones: urgent need, money to spend, and a player elsewhere who clears the bar and fits the budget.
  const hungry = rng.shuffle(home.filter((c) => c.transferBudget > 0)).slice(0, 12);
  for (const club of hungry) {
    if (out.length >= 3) break;
    const need = input.needsOf(club).find((n) => n.severity >= 0.45);
    if (!need) continue;
    const bar = need.positionalAverage + 1;
    const fits = (byPos.get(need.position) ?? []).filter(
      (p) => p.clubId !== club.id && !used.has(p.id) && p.value <= club.transferBudget && ovrAt(p, need.position) >= bar && ovrAt(p, need.position) <= bar + 8,
    );
    if (!fits.length) continue;
    out.push(line(club, rng.pick(fits), rng.pick(real)));
  }
  // Idle talk: a club and a player who sound plausible together but aren't.
  const idleCount = out.length >= 3 ? 2 : 1;
  for (let i = 0; i < idleCount && home.length; i++) {
    const club = rng.pick(home);
    const candidates = players.filter((p) => p.clubId && p.clubId !== club.id && !used.has(p.id) && Math.abs(state.clubs[p.clubId]!.reputation - club.reputation) <= 15);
    if (!candidates.length) continue;
    out.push(line(club, rng.pick(candidates), rng.pick(idle)));
  }
  return rng.shuffle(out);
}

const QUOTES: Record<'defence' | 'midfield' | 'attack' | 'keeper', { mild: string[]; urgent: string[] }> = {
  keeper: {
    mild: ['A goalkeeper who commands his box would help us sleep at night.', "We're happy, but competition for the gloves never hurt anyone."],
    urgent: ["We've conceded too many soft ones. Something has to change between the sticks.", "I won't hide it: we need a goalkeeper, and soon."],
  },
  defence: {
    mild: ['We could do with another body at the back for the run-in.', "Defensively we're solid, but one more option wouldn't hurt."],
    urgent: ['We keep shipping goals. The board knows what I need.', "We're one injury away from playing a midfielder at the back."],
  },
  midfield: {
    mild: ['Someone who keeps the ball in the middle of the park would be a luxury.', "We're looking at the midfield, quietly."],
    urgent: ["We lose the middle of the pitch every week. That's where it has to start.", 'I need legs and a brain in midfield. Ideally both in one player.'],
  },
  attack: {
    mild: ['A bit more pace out wide would give us another dimension.', 'Goals win games. We could always use more.'],
    urgent: ["We create chances and don't take them. It's that simple.", 'Find me someone who scores and I will find him a shirt.'],
  },
};
const lineOf = (pos: Position): keyof typeof QUOTES =>
  pos === 'GK' ? 'keeper' : pos === 'CB' || pos === 'LB' || pos === 'RB' || pos === 'LWB' || pos === 'RWB' ? 'defence' : pos === 'DM' || pos === 'CM' || pos === 'AM' ? 'midfield' : 'attack';

/** A coach with a need talks to the paper. His quote hints at the position before any brief. */
function interview(state: GameState, input: TouchlineInput): TouchlineInterview | undefined {
  const sc = state.scout;
  if (!sc) return;
  const rng = Rng.derive(state.seed, `touchline:interview:${input.issue}`);
  const home = Object.values(state.clubs).filter((c) => c.countryId === sc.homeCountry || input.mine.has(c.id));
  // Your clubs first, then the bigger names.
  const ranked = rng.shuffle(home).sort((a, b) => Number(input.mine.has(b.id)) - Number(input.mine.has(a.id)) || a.tier - b.tier);
  const pickFrom = ranked.slice(0, 10);
  for (const club of rng.shuffle(pickFrom)) {
    const need = input.needsOf(club).find((n) => n.severity >= 0.3);
    const coach = state.officials[club.headCoachId];
    if (!need || !coach) continue;
    const q = QUOTES[lineOf(need.position)];
    const briefPosted = state.missions.some((m) => m.clubId === club.id && m.position === need.position && (m.status === 'offered' || m.status === 'active'));
    return {
      coach: `${coach.firstName} ${coach.lastName}`,
      club: badge(club),
      quote: rng.pick(need.severity >= 0.45 ? q.urgent : q.mild),
      position: need.position,
      briefPosted,
    };
  }
  return undefined;
}

/** Coaches the board is losing patience with (the carousel's own measure). */
function hotSeats(state: GameState, table: ReturnType<typeof leagueTable>, size: number): TouchlinePressure[] {
  if (!size || state.season.ended) return [];
  return table
    .map((row, i) => ({ row, i, p: pressure(state, row.clubId, table) }))
    .filter((x) => x.p.played >= 5 && x.p.pressure >= 0.2)
    .sort((a, b) => b.p.pressure - a.p.pressure || a.p.recentPoints - b.p.recentPoints)
    .slice(0, 4)
    .flatMap(({ row, i, p }) => {
      const club = state.clubs[row.clubId]!;
      const coach = state.officials[club.headCoachId];
      if (!coach) return [];
      const pres = presidentOf(state, club);
      const heat: TouchlinePressure['heat'] = p.pressure >= 0.45 && p.recentPoints <= 4 ? 'boiling' : p.pressure >= 0.35 ? 'hot' : 'warm';
      return [
        {
          club: badge(club),
          coach: `${coach.firstName} ${coach.lastName}`,
          daysInJob: coach.appointedOn !== undefined ? state.date - coach.appointedOn : undefined,
          recentPoints: p.recentPoints,
          tablePos: i + 1,
          heat,
          president: pres && `${pres.firstName} ${pres.lastName}`,
          policy: pres && POLICY_LABEL[pres.policy],
        },
      ];
    });
}

function pundit(state: GameState, table: ReturnType<typeof leagueTable>): TouchlinePundit | undefined {
  const league = homeLeague(state);
  const pick = league && state.predictions?.find((p) => p.season === state.season.year && p.leagueId === league.id);
  if (!pick || !league) return;
  const posOf = (id: ClubId) => table.findIndex((r) => r.clubId === id) + 1;
  const bp = pick.breakout ? state.players[pick.breakout] : undefined;
  return {
    title: { club: badge(state.clubs[pick.title]!), pos: posOf(pick.title) },
    relegated: pick.relegated.map((id) => ({ club: badge(state.clubs[id]!), pos: posOf(id) })),
    breakout: bp && {
      id: bp.id,
      name: name(bp),
      club: bp.clubId ? badge(state.clubs[bp.clubId]!) : undefined,
      apps: bp.stats.apps,
      goals: bp.stats.goals,
      rating: bp.stats.apps ? Math.round((bp.stats.ratingSum / bp.stats.apps) * 10) / 10 : undefined,
    },
    final: state.season.ended,
    drop: promotionSpots(league.clubIds.length),
  };
}

export type TouchlinePages = ReturnType<typeof buildTouchline>;
