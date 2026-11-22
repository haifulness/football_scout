import { addDays, ageOn, type GameDate } from '../core/calendar';
import type { CountryId } from '../core/ids';
import type { Club } from '../model/club';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { hasTrait, knownTraits } from './character';

/**
 * Settling in after a move. A player arriving from abroad plays below his level for a while: a new language, a new
 * city, new teammates. How long and how badly depends on how far he has come, his age, his character and whether a
 * countryman is in the dressing room. While it lasts he is picked less and rated lower. A visit from the scout who
 * brought him helps.
 */

/** How far he has come: the same language group (country culture), the same continent, or the other side of the world. */
type Distance = 'home' | 'culture' | 'continent' | 'world';
const BASE: Record<Distance, { days: number; penalty: number }> = {
  home: { days: 0, penalty: 0 },
  culture: { days: 45, penalty: 0.04 },
  continent: { days: 90, penalty: 0.07 },
  world: { days: 150, penalty: 0.1 },
};
/** A visit cuts what's left by this share, at most once in this many days. */
export const AFTERCARE_SHARE = 0.3;
export const AFTERCARE_EVERY = 28;

export const DISTANCE_LABEL: Record<Distance, string> = {
  home: 'at home',
  culture: 'same language',
  continent: 'same continent',
  world: 'another continent',
};

/** Where he is settled now: the country of his club, or his own country if he has none. */
function settledIn(state: GameState, p: Player): CountryId {
  return p.clubId ? state.clubs[p.clubId]!.countryId : p.nationality;
}

function distance(state: GameState, from: CountryId, p: Player, to: CountryId): Distance {
  if (to === from || to === p.nationality) return 'home';
  const a = state.countries[from]!;
  const b = state.countries[to]!;
  if (a.culture === b.culture || state.countries[p.nationality]!.culture === b.culture) return 'culture';
  return a.continentId === b.continentId ? 'continent' : 'world';
}

interface Forecast {
  distance: Distance;
  days: number;
  penalty: number;
  /** Plain-words reasons, longest first. */
  reasons: string[];
}

/** How a move to this club would go. `traitsKnown` limits it to what you know of him (for the pitch dialog). */
export function settleForecast(state: GameState, p: Player, buyer: Club, date: GameDate, traitsKnown = false): Forecast {
  const d = distance(state, settledIn(state, p), p, buyer.countryId);
  const base = BASE[d];
  const reasons: string[] = [];
  if (d === 'home') return { distance: d, days: 0, penalty: 0, reasons };
  reasons.push(DISTANCE_LABEL[d]);
  const has = traitsKnown ? (t: Parameters<typeof hasTrait>[1]) => knownTraits(state, p).includes(t) : (t: Parameters<typeof hasTrait>[1]) => hasTrait(p, t);
  let days = base.days;
  let penalty = base.penalty;
  if (has('adaptable')) {
    days *= 0.5;
    penalty *= 0.5;
    reasons.push('adaptable');
  }
  if (has('homesick')) {
    days *= 1.8;
    penalty *= 1.4;
    reasons.push('homesick');
  }
  if (has('professional')) {
    days *= 0.8;
    reasons.push('professional');
  }
  const age = ageOn(p.birthDate, date);
  if (age < 20 || age > 30) {
    days *= 1.25;
    reasons.push(age < 20 ? 'very young' : 'older');
  }
  if (buyer.squad.some((id) => id !== p.id && state.players[id]?.nationality === p.nationality)) {
    days *= 0.75;
    reasons.push('a countryman in the squad');
  }
  return { distance: d, days: Math.round(days), penalty: Math.round(penalty * 1000) / 1000, reasons };
}

/** On a move: start (or clear) his settling period. Call before he joins the squad. */
export function startSettling(state: GameState, p: Player, buyer: Club, date: GameDate) {
  const f = settleForecast(state, p, buyer, date);
  p.settling = f.days > 0 ? { since: date, until: addDays(date, f.days), start: f.penalty } : undefined;
}

/** Share of his rating he's missing today (0 once settled). */
export function settlePenalty(p: Player, date: GameDate): number {
  const s = p.settling;
  if (!s || date >= s.until) return 0;
  const span = Math.max(1, s.until - s.since);
  return s.start * ((s.until - date) / span);
}

export function isSettling(p: Player, date: GameDate): boolean {
  return settlePenalty(p, date) > 0;
}

/** You placed him at his current club and his bonuses are still running. */
export function placedByYou(state: GameState, p: Player): boolean {
  return state.placements.some((x) => x.playerId === p.id && x.clubId === p.clubId && !x.endedOn);
}

/** Can a visit help him settle today? */
export function aftercareCheck(state: GameState, p: Player): { ok: boolean; reason?: string } {
  if (!isSettling(p, state.date)) return { ok: false, reason: 'He has settled.' };
  if (!placedByYou(state, p)) return { ok: false, reason: 'Only players you placed lean on you to settle.' };
  const last = p.settling!.visited;
  if (last !== undefined && state.date - last < AFTERCARE_EVERY) {
    const ago = state.date - last;
    const when = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`;
    return { ok: false, reason: `You visited him ${when}. Another visit helps in ${AFTERCARE_EVERY - ago} days.` };
  }
  return { ok: true };
}

/** A visit from you: cuts what's left of his settling period. Returns the days saved (0 if it couldn't help). */
export function aftercare(state: GameState, p: Player): number {
  if (!aftercareCheck(state, p).ok) return 0;
  const s = p.settling!;
  const left = s.until - state.date;
  const saved = Math.max(1, Math.round(left * AFTERCARE_SHARE));
  // Keep the fade continuous: today's penalty stays, it just runs out sooner.
  const now = settlePenalty(p, state.date);
  s.since = state.date;
  s.until = addDays(s.until, -saved);
  s.start = now;
  s.visited = state.date;
  return saved;
}
