import type { GameDate } from '../core/calendar';
import { hashString } from '../core/rng';
import { TRAITS, type Player, type TraitId } from '../model/player';

export { TRAITS, type TraitId };
import type { GameState } from '../model/world-state';

/**
 * Character: up to two traits per player that say what kind of person he is. They are part of who he is (drawn
 * from his portrait seed and hidden values, so they never change and need no save space), but you only know the
 * ones your work has uncovered: meetings, watching him live, contacts at his club, reports and your staff.
 */

export const TRAIT_INFO: Record<TraitId, { label: string; tone: 'good' | 'bad' | 'mixed'; effect: string }> = {
  professional: { label: 'Professional', tone: 'good', effect: 'Trains hard: grows a little faster, and coaches like him.' },
  leader: { label: 'Leader', tone: 'good', effect: 'Organises the dressing room: coaches like him.' },
  'big-game': { label: 'Big-game player', tone: 'good', effect: 'Raises his game against stronger teams.' },
  homesick: { label: 'Homesick', tone: 'bad', effect: 'Struggles to settle far from home.' },
  adaptable: { label: 'Adaptable', tone: 'good', effect: 'Settles quickly anywhere.' },
  hothead: { label: 'Hothead', tone: 'bad', effect: 'Rows with coaches: they are wary of him.' },
  'late-bloomer': { label: 'Late bloomer', tone: 'good', effect: 'Keeps improving until about 26.' },
  mercenary: { label: 'Mercenary', tone: 'mixed', effect: 'Follows the money: asks for more, moves for a raise.' },
  loyal: { label: 'Loyal', tone: 'mixed', effect: 'Attached to his club: harder to prise away.' },
  'media-darling': { label: 'Media darling', tone: 'mixed', effect: 'Sells shirts: clubs value the publicity.' },
};

/** Pairs that can't both describe one man. */
const CLASH: [TraitId, TraitId][] = [
  ['homesick', 'adaptable'],
  ['professional', 'hothead'],
  ['mercenary', 'loyal'],
];

const roll = (p: Player, key: string) => hashString(`${p.portraitSeed}:char:${key}`) / 4294967296;

const cache = new WeakMap<Player, readonly TraitId[]>();

/** His traits (all of them, known or not). Stable for life. */
export function characterOf(p: Player): readonly TraitId[] {
  const hit = cache.get(p);
  if (hit) return hit;
  const n = roll(p, 'count');
  const count = n < 0.3 ? 0 : n < 0.75 ? 1 : 2;
  const weight: Record<TraitId, number> = {
    professional: 0.6 + p.hidden.consistency / 20,
    leader: 0.8,
    'big-game': 0.8,
    homesick: 0.8,
    adaptable: 0.8,
    hothead: 0.7 + (20 - p.hidden.consistency) / 40,
    'late-bloomer': 0.6,
    mercenary: 0.4 + p.hidden.ambition / 25 + (20 - p.hidden.loyalty) / 50,
    loyal: 0.3 + p.hidden.loyalty / 20,
    'media-darling': 0.5,
  };
  const out: TraitId[] = [];
  for (let i = 0; i < count; i++) {
    const open = TRAITS.filter((t) => !out.includes(t) && !CLASH.some(([a, b]) => (a === t && out.includes(b)) || (b === t && out.includes(a))));
    const total = open.reduce((s, t) => s + weight[t], 0);
    let r = roll(p, `pick${i}`) * total;
    const pick = open.find((t) => (r -= weight[t]) < 0) ?? open[open.length - 1]!;
    out.push(pick);
  }
  cache.set(p, out);
  return out;
}

export const hasTrait = (p: Player, t: TraitId) => characterOf(p).includes(t);

/** The traits you have uncovered. */
export function knownTraits(state: GameState, p: Player): TraitId[] {
  const seen = state.knowledge[p.id]?.characterSeen ?? [];
  return characterOf(p).filter((t) => seen.includes(t));
}

/**
 * Uncover one trait you don't know yet, with this chance, optionally only from those a situation can show
 * (a match shows nerve and temper, not homesickness). Returns what you learned.
 */
export function revealTrait(state: GameState, p: Player, chance: number, why: string, only?: readonly TraitId[]): TraitId | undefined {
  const date: GameDate = state.date;
  // Its own dice (from the world seed, the player, the occasion and the day), so no other random stream shifts.
  if (hashString(`${state.seed}:trait:${p.id}:${why}:${date}`) / 4294967296 >= chance) return undefined;
  const known = state.knowledge[p.id]?.characterSeen ?? [];
  const hidden = characterOf(p).filter((t) => !known.includes(t) && (!only || only.includes(t)));
  if (!hidden.length) return undefined;
  const t = hidden[Math.floor(roll(p, `reveal:${why}:${date}`) * hidden.length)]!;
  const k = (state.knowledge[p.id] ??= { level: 0, lastUpdated: date });
  k.characterSeen = [...known, t];
  return t;
}

/** What a match shows of a man. */
export const ON_THE_PITCH: readonly TraitId[] = ['big-game', 'hothead', 'leader', 'professional'];

/** Your read on his character, for the player view: what you know, and whether there is more. */
export function characterView(state: GameState, p: Player): { known: TraitId[]; total: number; met: boolean } {
  const total = characterOf(p).length;
  const known = knownTraits(state, p);
  const met = (state.scout?.rapport[p.id] ?? 0) > 0 || known.length > 0;
  return { known, total, met };
}
