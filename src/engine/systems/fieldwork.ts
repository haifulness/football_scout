import { clearSmear } from './nemesis';
import { visitPlacement } from './placement-stories';
import { aftercare } from './settling';
import type { CityId, PlayerId, StaffId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { ClubTier } from '../model/club';
import type { Player } from '../model/player';
import type { Fixture } from '../model/season';
import type { GameState } from '../model/world-state';
import { TRAIT_INFO, revealTrait, type TraitId } from './character';
import { addNews } from './season';
import { learn } from './knowledge';
import { ScoutingError, addLedger } from './scouting';

/**
 * Fieldwork: things you can only do in person. Watching a match live is the
 * only way past the video cap. Meetings build the relationships that sign-offs
 * (next phase) depend on, and bigger clubs are harder to win over.
 */

// ── Live scouting ───────────────────────────────────────────────────────

const LIVE_HORIZON_DAYS = 21;
const TICKET: Record<ClubTier, number> = { 1: 150, 2: 80, 3: 40, 4: 20, 5: 10 };

export interface LiveOption {
  fixture: Fixture;
  venue: CityId;
  daysAway: number;
  ticket: USD;
}

/** The player's next league match within three weeks: where it is and what a ticket costs. */
export function nextLiveOption(state: GameState, p: Player): LiveOption | null {
  if (!p.clubId) return null;
  const club = state.clubs[p.clubId]!;
  const next = (state.fixtures[club.leagueId] ?? [])
    .filter((f) => !f.result && f.date > state.date && f.date - state.date <= LIVE_HORIZON_DAYS && (f.homeId === club.id || f.awayId === club.id))
    .sort((a, b) => a.date - b.date)[0];
  if (!next) return null;
  const home = state.clubs[next.homeId]!;
  const ticket = usd(Math.round((TICKET[home.tier] * state.countries[home.countryId]!.costIndex) / 5) * 5);
  return { fixture: next, venue: home.cityId, daysAway: next.date - state.date, ticket };
}

/** Checks you're at the venue and buys the ticket. The caller advances to match day, then writes up the match (writeAttendedMatch). */
export function startLiveScouting(state: GameState, playerId: PlayerId): LiveOption {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  const p = state.players[playerId];
  if (!p) throw new ScoutingError('That player has retired.');
  const opt = nextLiveOption(state, p);
  if (!opt) throw new ScoutingError(p.clubId ? 'He has no league match in the next three weeks.' : 'Free agents have no matches to watch. Meet him instead.');
  if (scout.location !== opt.venue) throw new ScoutingError(`The match is in ${state.cities[opt.venue]!.name}. Travel there first.`);
  if (scout.money < opt.ticket) throw new ScoutingError(`A ticket costs ${formatUSD(opt.ticket)} but you only have ${formatUSD(scout.money)}.`);
  const home = state.clubs[opt.fixture.homeId]!;
  const away = state.clubs[opt.fixture.awayId]!;
  addLedger(state, { amount: usd(-opt.ticket), kind: 'ticket', label: `Ticket: ${home.name} v ${away.name}` });
  return opt;
}

// ── Meetings ────────────────────────────────────────────────────────────

export type MeetTarget = { kind: 'player'; id: PlayerId } | { kind: 'official'; id: StaffId };
type Role = 'player' | 'coach';

/** Reputation needed before someone at a club of this tier will sit down with you. */
const REPUTATION_GATE: Record<Role, Record<ClubTier, number>> = {
  coach: { 1: 30, 2: 15, 3: 5, 4: 0, 5: 0 },
  player: { 1: 20, 2: 10, 3: 0, 4: 0, 5: 0 },
};
const MEETING_COST: Record<'player' | 'official', Record<ClubTier, number>> = {
  player: { 1: 300, 2: 200, 3: 120, 4: 70, 5: 40 },
  official: { 1: 500, 2: 350, 3: 200, 4: 120, 5: 80 },
};
/** Bigger clubs are harder to win over: fewer points per meeting. */
const TIER_EASE: Record<ClubTier, number> = { 1: 0.45, 2: 0.6, 3: 0.8, 4: 1, 5: 1.2 };
const REPEAT_WINDOW_DAYS = 14;
/** Meetings with your own club's officials build the relationship faster. */
const COLLEAGUE_EASE = 1.6;
/** Where a new job starts you with its Head Coach: a working relationship, not trust. */
export const COLLEAGUE_START = 20;

export interface MeetingInfo {
  role: Role;
  name: string;
  /** Current relationship / rapport, 0–100. */
  level: number;
  cost: USD;
  /** City you need to be in. Undefined: anywhere in `country` (free agents come to you). */
  city?: CityId;
  country: GameState['countries'][keyof GameState['countries']]['id'];
  inPlace: boolean;
  requiredReputation: number;
  allowed: boolean;
  /** Met within the last two weeks: a repeat meeting achieves less. */
  recentlyMet: boolean;
  /** An official at the club you work for full-time: free, always available, and easier to win over. */
  colleague: boolean;
  /** Never met before: the first meeting is the full price, catch-ups after it are cheaper. */
  firstMeeting: boolean;
}

/** A catch-up costs this share of a first meeting. */
const CATCH_UP_SHARE = 0.4;

/**
 * Today's price to meet someone: the full price the first time, much less to catch up afterwards,
 * and never quite the same (±20%, by person and day, so the price you see is the price you pay).
 */
function meetingPrice(state: GameState, id: string, base: number): USD {
  const first = state.scout!.lastMet[id] === undefined;
  const swing = Rng.derive(state.seed, `meeting-price:${id}:${state.date}`).float(0.8, 1.2);
  return usd(Math.max(5, Math.round((base * (first ? 1 : CATCH_UP_SHARE) * swing) / 5) * 5));
}

function effectiveReputation(state: GameState): number {
  const s = state.scout!;
  return s.reputation + (s.skills.network >= 12 ? 5 : 0);
}

export function meetingInfo(state: GameState, target: MeetTarget): MeetingInfo {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  if (target.kind === 'player') {
    const p = state.players[target.id];
    if (!p) throw new ScoutingError('That player has retired.');
    const club = p.clubId ? state.clubs[p.clubId] : undefined;
    const tier: ClubTier = club?.tier ?? 5;
    const country = club?.countryId ?? p.nationality;
    const required = REPUTATION_GATE.player[tier];
    const inPlace = club ? scout.location === club.cityId : state.cities[scout.location]!.countryId === country;
    return {
      role: 'player',
      name: `${p.firstName} ${p.lastName}`,
      level: scout.rapport[p.id] ?? 0,
      cost: meetingPrice(state, p.id, MEETING_COST.player[tier] * state.countries[country]!.costIndex),
      city: club?.cityId,
      country,
      inPlace,
      requiredReputation: required,
      allowed: effectiveReputation(state) >= required,
      recentlyMet: recently(state, p.id),
      colleague: false,
      firstMeeting: scout.lastMet[p.id] === undefined,
    };
  }
  const o = state.officials[target.id];
  if (!o) throw new ScoutingError('That person no longer works there.');
  const club = state.clubs[o.clubId]!;
  const required = REPUTATION_GATE[o.role][club.tier];
  // Your own club's coach: you work in the same building.
  const colleague = scout.employment.mode === 'fulltime' && scout.employment.clubId === club.id;
  return {
    role: o.role,
    name: `${o.firstName} ${o.lastName}`,
    level: scout.relationships[o.id] ?? 0,
    cost: colleague ? usd(0) : meetingPrice(state, o.id, MEETING_COST.official[club.tier] * state.countries[club.countryId]!.costIndex),
    city: club.cityId,
    country: club.countryId,
    inPlace: scout.location === club.cityId,
    requiredReputation: colleague ? 0 : required,
    allowed: colleague || effectiveReputation(state) >= required,
    recentlyMet: recently(state, o.id),
    colleague,
    firstMeeting: scout.lastMet[o.id] === undefined,
  };
}

const recently = (state: GameState, id: string) => {
  const last = state.scout!.lastMet[id];
  return last !== undefined && state.date - last < REPEAT_WINDOW_DAYS;
};

export interface MeetingResult {
  before: number;
  after: number;
  cost: USD;
  /** Meeting a player: something about his character you now know. */
  trait?: TraitId;
  /** A player you placed: his mood after your visit lifted it. */
  cheered?: 'happy' | 'restless' | 'wants-out';
  /** A player you placed who is still settling in: days your visit took off it. */
  settled?: number;
  /** Meeting a coach: he lets slip something about one of his players you're tracking. */
  heard?: { playerId: PlayerId; trait: TraitId };
  /** Meeting a coach: you cleared a rival's rumour about you at his club. */
  cleared?: true;
}

/** A one-day meeting over coffee or dinner. Diminishing returns as you get closer. */
/** You already sat down with this person today: more business with them takes no extra day or fee. */
export function metToday(state: GameState, id: string): boolean {
  return state.scout?.lastMet[id] === state.date;
}

export function meet(state: GameState, target: MeetTarget): MeetingResult {
  const scout = state.scout!;
  const info = meetingInfo(state, target);
  if (!info.allowed)
    throw new ScoutingError(
      `${info.name}'s people won't arrange a meeting with a scout of your standing yet (needs reputation ${info.requiredReputation}, you have ${scout.reputation}).`,
    );
  if (!info.inPlace)
    throw new ScoutingError(info.city ? `You need to be in ${state.cities[info.city]!.name}.` : `You need to be in ${state.countries[info.country]!.name}.`);
  if (scout.money < info.cost) throw new ScoutingError(`This meeting costs ${formatUSD(info.cost)} but you only have ${formatUSD(scout.money)}.`);

  const rng = Rng.derive(state.seed, `meet:${target.id}:${state.date}`);
  const tier: ClubTier =
    target.kind === 'player'
      ? state.players[target.id]!.clubId
        ? state.clubs[state.players[target.id]!.clubId!]!.tier
        : 5
      : state.clubs[state.officials[target.id]!.clubId]!.tier;
  const stubborn = target.kind === 'official' ? state.officials[target.id]!.stubbornness : 30;
  const quality =
    20 *
    (0.75 + scout.skills.negotiation * 0.025) *
    TIER_EASE[tier] *
    (1 - stubborn / 160) *
    (1 - info.level / 110) *
    (info.recentlyMet ? (info.colleague ? 0.7 : 0.4) : 1) *
    (info.colleague ? COLLEAGUE_EASE : 1) *
    rng.float(0.7, 1.3);
  // A first introduction always leaves an impression.
  const gain = Math.max(1, Math.round(quality + (info.level === 0 ? 4 : 0)));
  const after = clamp(info.level + gain, 0, 100);
  const label = target.kind === 'player' ? `Meeting: ${info.name}` : `Meeting: ${info.name} (Head Coach)`;
  addLedger(state, { amount: usd(-info.cost), kind: 'meeting', label });
  let trait: TraitId | undefined;
  let heard: MeetingResult['heard'];
  let settled: number | undefined;
  let cheered: MeetingResult['cheered'];
  let cleared: true | undefined;
  if (target.kind === 'player') {
    scout.rapport[target.id] = after;
    // Talking to him tells you about his character and ambitions.
    learn(state, state.players[target.id]!, 8, 85, state.date);
    trait = revealTrait(state, state.players[target.id]!, 0.5 + after / 200, 'meet');
    settled = aftercare(state, state.players[target.id]!) || undefined;
    cheered = visitPlacement(state, state.players[target.id]!);
  } else {
    scout.relationships[target.id] = after;
    // A rumour about you there: now's the time to set the record straight.
    if (clearSmear(state, state.officials[target.id]!.clubId)) cleared = true;
    // Coaches talk about their players: your network decides how often something useful slips out.
    const club = state.clubs[state.officials[target.id]!.clubId]!;
    for (const id of club.squad.filter((id) => state.pool[id])) {
      const t = revealTrait(state, state.players[id]!, 0.1 + scout.skills.network * 0.02, `coach:${target.id}`);
      if (t) {
        heard = { playerId: id, trait: t };
        const p = state.players[id]!;
        const coach = state.officials[target.id]!;
        addNews(state, {
          date: state.date,
          kind: 'career',
          title: `${coach.lastName} on ${p.firstName} ${p.lastName}: ${TRAIT_INFO[t].label.toLowerCase()}`,
          body: `Over coffee, ${club.name}'s Head Coach lets slip what ${p.firstName} ${p.lastName} is like. ${TRAIT_INFO[t].effect}`,
          playerIds: [id],
        });
        break;
      }
    }
  }
  scout.lastMet[target.id] = state.date;
  return { before: info.level, after, cost: info.cost, trait, heard, settled, cheered, cleared };
}

export function relationshipLabel(level: number): string {
  if (level >= 80) return 'Close ally';
  if (level >= 60) return 'Trusted';
  if (level >= 35) return 'Good contact';
  if (level >= 15) return 'Acquaintance';
  return level > 0 ? 'Met once' : 'Stranger';
}
