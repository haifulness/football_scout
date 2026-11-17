import { ageOn, type GameDate } from '../core/calendar';
import { Rng, clamp } from '../core/rng';
import type { AttributeKey, Player } from '../model/player';
import { ATTRIBUTES } from '../model/player';
import type { GameState } from '../model/world-state';
import { marketValue } from './economy';
import { POSITION_WEIGHTS, ovrAt } from './ratings';

const PHYSICAL_DECLINE: AttributeKey[] = ['pace', 'pace', 'acceleration', 'acceleration', 'stamina', 'agility', 'jumping', 'strength'];
const LATE_BLOOM: AttributeKey[] = ['decisions', 'composure', 'leadership', 'positioning', 'anticipation'];

function bump(p: Player, key: AttributeKey, delta: number) {
  p.attributes[key] = clamp(p.attributes[key] + delta, 1, 20);
}

function relevantAttribute(rng: Rng, p: Player): AttributeKey {
  const weights = POSITION_WEIGHTS[p.naturalPosition];
  if (rng.chance(0.2)) return rng.pick(ATTRIBUTES.filter((k) => p.naturalPosition === 'GK' || !k.startsWith('reflex')));
  const keys = Object.keys(weights) as AttributeKey[];
  // Favour attributes with room to grow.
  return rng.weighted(keys, (k) => (weights[k] ?? 0) * (21 - p.attributes[k]));
}

/**
 * Monthly growth and decline. Young players grow toward their hidden potential
 * (faster with minutes played), players in their late twenties plateau, and
 * thirty-somethings lose physical edge while gaining a little game intelligence.
 */
export function developPlayer(p: Player, rng: Rng, date: GameDate) {
  const age = ageOn(p.birthDate, date);
  const ovr = ovrAt(p, p.naturalPosition);
  const playing = p.clubId ? clamp(0.6 + p.stats.minutes / 1500, 0.6, 1.4) : 0.45;

  if (age <= 23 && p.hidden.potential > ovr) {
    const chance = clamp(((p.hidden.potential - ovr) / 38) * playing * (p.isProdigy ? 1.35 : 1), 0, 0.95);
    if (rng.chance(chance)) bump(p, relevantAttribute(rng, p), 1);
    if (rng.chance(chance * 0.6)) bump(p, relevantAttribute(rng, p), 1);
  } else if (age <= 29) {
    if (p.hidden.potential > ovr && rng.chance(0.12 * playing)) bump(p, relevantAttribute(rng, p), 1);
    if (rng.chance(0.03)) bump(p, rng.pick(ATTRIBUTES), -1);
  } else {
    if (rng.chance((age - 29) * 0.045)) bump(p, rng.pick(PHYSICAL_DECLINE), -1);
    if (age >= 33 && rng.chance((age - 32) * 0.03)) bump(p, rng.pick(ATTRIBUTES), -1);
    if (rng.chance(0.04)) bump(p, rng.pick(LATE_BLOOM), 1);
  }
}

export function contractYearsLeft(p: Player, date: GameDate): number {
  return p.contractUntil ? Math.max(0, (p.contractUntil - date) / 365) : 0;
}

export function revalue(state: GameState, p: Player, date: GameDate) {
  const club = p.clubId ? state.clubs[p.clubId] : undefined;
  const wealth = state.countries[club?.countryId ?? p.nationality]!.wealthIndex;
  p.value = marketValue({
    ovr: ovrAt(p, p.naturalPosition),
    age: ageOn(p.birthDate, date),
    potential: p.hidden.potential,
    contractYearsLeft: contractYearsLeft(p, date),
    wealthIndex: wealth,
  });
}

/** First of every month: development, then market values. */
export function monthlyUpdate(state: GameState, date: GameDate) {
  const rng = Rng.derive(state.seed, `development:${date}`);
  for (const p of Object.values(state.players)) {
    developPlayer(p, rng, date);
    revalue(state, p, date);
  }
}
