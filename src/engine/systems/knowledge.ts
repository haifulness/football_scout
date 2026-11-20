import { addDays, type GameDate } from '../core/calendar';
import { recordProdigyFind } from './goals';
import type { CountryId } from '../core/ids';
import { clamp, hashString } from '../core/rng';
import type { ClubTier } from '../model/club';
import { ATTRIBUTES, POSITIONS, type AttributeKey, type Player, type Position } from '../model/player';
import type { ScoutSkills } from '../model/scout';
import type { GameState } from '../model/world-state';
import { ovrAt } from './ratings';
import { addNews } from './season';

/**
 * Fog of war. You see every player through ranges whose width depends on how
 * much you know: your own scouting work, the player's public profile (stars at
 * big clubs are well known), your knowledge of his market, and your judging
 * skill. The true value is always inside the range you're shown.
 */

const MAX_HALF_WIDTH = 6; // attribute points (1–20) at zero knowledge
const PUBLIC_VISIBILITY: Record<ClubTier, number> = { 1: 32, 2: 24, 3: 16, 4: 9, 5: 4 };
/** Knowledge needed before hidden potential is shown at all. */
export const POTENTIAL_REVEAL_LEVEL = 40;
export const TRAITS_REVEAL_LEVEL = 60;
/** Video can't replace seeing a player live: it tops out here. */
export const VIDEO_KNOWLEDGE_CAP = 60;

const DEFAULT_SKILLS: ScoutSkills = { judgingAbility: 10, judgingPotential: 10, network: 10, dataAnalysis: 10, negotiation: 10 };
const skillsOf = (state: GameState) => state.scout?.skills ?? DEFAULT_SKILLS;

/** The market a player belongs to: his club's country, or his nationality if free. */
export function marketOf(state: GameState, p: Player): CountryId {
  return p.clubId ? state.clubs[p.clubId]!.countryId : p.nationality;
}

/** What anyone can piece together from TV, data sites and reputation. */
export function publicLevel(state: GameState, p: Player): number {
  const tier = p.clubId ? state.clubs[p.clubId]!.tier : 5;
  const market = state.scout?.regionKnowledge[marketOf(state, p)] ?? 0;
  return Math.round(PUBLIC_VISIBILITY[tier] + market * 0.25);
}

export function knowledgeLevel(state: GameState, p: Player): number {
  const own = state.knowledge[p.id]?.level ?? 0;
  return clamp(Math.max(own, publicLevel(state, p)), 0, 100);
}

/** Raise what you know about a player (never lowers it). */
export function learn(state: GameState, p: Player, gain: number, cap: number, date: GameDate) {
  const wasProdigyVisible = prodigyVisible(state, p);
  const current = state.knowledge[p.id]?.level ?? 0;
  const base = Math.max(current, publicLevel(state, p));
  const level = Math.max(current, Math.min(cap, base + gain));
  state.knowledge[p.id] = { ...state.knowledge[p.id], level: Math.round(level), lastUpdated: date };
  // The moment your work reveals a prodigy (shown as a special reveal).
  if (!wasProdigyVisible && prodigyVisible(state, p) && !state.pendingDiscoveries.includes(p.id)) {
    state.pendingDiscoveries.push(p.id);
    recordProdigyFind(state, p.id, date);
    addNews(state, {
      date,
      kind: 'career',
      title: `Prodigy discovered: ${p.firstName} ${p.lastName}`,
      body: `Your work reveals ${p.firstName} ${p.lastName} (${p.naturalPosition}) as a genuine prodigy. Every club will want him, even elite clubs that never take on projects.`,
      playerIds: [p.id],
    });
  }
}

export function prodigyVisible(state: GameState, p: Player): boolean {
  const level = knowledgeLevel(state, p);
  return p.isProdigy && (level >= 70 || (level >= POTENTIAL_REVEAL_LEVEL && skillsOf(state).judgingPotential >= 15));
}

function halfWidth(level: number, skills: ScoutSkills): number {
  return MAX_HALF_WIDTH * (1 - level / 100) * (1 - (skills.judgingAbility - 1) * 0.025);
}

/** Stable per-player, per-attribute noise in [-1, 1], so ranges don't jump between screens. */
function noise(p: Player, key: string): number {
  return (hashString(`${p.portraitSeed}:${key}`) / 4294967295) * 2 - 1;
}

export type Range = [number, number];

/** How well you know one attribute: the overall level, or better if you've watched it up close. */
export function attributeLevel(state: GameState, p: Player, k: AttributeKey): number {
  return Math.max(knowledgeLevel(state, p), state.knowledge[p.id]?.attrs?.[k] ?? 0);
}

/** Watching one attribute up close (raises only that attribute's knowledge). */
export function learnAttribute(state: GameState, p: Player, k: AttributeKey, gain: number, cap: number, date: GameDate) {
  const known = (state.knowledge[p.id] ??= { level: 0, lastUpdated: date });
  const attrs = (known.attrs ??= {});
  attrs[k] = Math.round(Math.max(attrs[k] ?? 0, Math.min(cap, attributeLevel(state, p, k) + gain)));
  known.lastUpdated = date;
}

export function attributeRanges(state: GameState, p: Player): Record<AttributeKey, Range> {
  const skills = skillsOf(state);
  const out = {} as Record<AttributeKey, Range>;
  for (const k of ATTRIBUTES) {
    const hw = halfWidth(attributeLevel(state, p, k), skills);
    const truth = p.attributes[k];
    const center = truth + noise(p, k) * hw * 0.6;
    const lo = clamp(Math.floor(center - hw), 1, truth);
    const hi = clamp(Math.ceil(center + hw), truth, 20);
    out[k] = [lo, hi];
  }
  return out;
}

/**
 * OVR range at a position. Errors on individual attributes partly cancel out,
 * so the overall rating is judged more tightly than a sum of worst cases would suggest.
 */
export function ovrRange(p: Player, hw: number, pos: Position): Range {
  const truth = ovrAt(p, pos);
  const half = hw * (99 / 19) * 0.45;
  const center = truth + noise(p, `ovr:${pos}`) * half * 0.6;
  return [clamp(Math.floor(center - half), 1, truth), clamp(Math.ceil(center + half), truth, 99)];
}

export const estimate = ([lo, hi]: Range) => Math.round((lo + hi) / 2);

/** What a search teaches you about a player it turns up: a little more than what's public, up to a modest ceiling. */
export function searchLearning(state: GameState, p: Player): { gain: number; cap: number } {
  return { gain: 10, cap: Math.min(55, Math.max(35, publicLevel(state, p) + 10)) };
}

/**
 * The OVR range you'll see at a position once a search has turned him up: the same fog the
 * results show, so a search judges players by exactly the estimate it then displays.
 */
export function searchRange(state: GameState, p: Player, pos: Position): Range {
  const { gain, cap } = searchLearning(state, p);
  const current = state.knowledge[p.id]?.level ?? 0;
  const level = clamp(Math.max(current, Math.min(cap, Math.max(current, publicLevel(state, p)) + gain)), 0, 100);
  return ovrRange(p, halfWidth(Math.max(level, publicLevel(state, p)), skillsOf(state)), pos);
}

export interface FoggedPlayer {
  level: number;
  attributes: Record<AttributeKey, Range>;
  ovr: Range;
  positions: Record<Position, Range>;
  /** Undefined until knowledge passes POTENTIAL_REVEAL_LEVEL. */
  potential?: Range;
  /** Only once you know enough to tell. */
  prodigy: boolean;
  traits?: { consistency: string; injuryRisk: string; ambition?: string };
}

const word = (v: number, words: [string, string, string, string]) => words[v <= 5 ? 0 : v <= 10 ? 1 : v <= 15 ? 2 : 3];

export function fog(state: GameState, p: Player): FoggedPlayer {
  const level = knowledgeLevel(state, p);
  const skills = skillsOf(state);
  const attributes = attributeRanges(state, p);
  const hw = halfWidth(level, skills);
  const positions = Object.fromEntries(POSITIONS.map((pos) => [pos, ovrRange(p, hw, pos)])) as Record<Position, Range>;
  const ovr = positions[p.naturalPosition];

  let potential: Range | undefined;
  if (level >= POTENTIAL_REVEAL_LEVEL) {
    const truth = p.hidden.potential;
    const hw = 18 * (1 - level / 100) * (1 - (skills.judgingPotential - 1) * 0.03);
    const center = truth + noise(p, 'potential') * hw * 0.5;
    potential = [clamp(Math.floor(center - hw), ovr[0], truth), clamp(Math.ceil(center + hw), truth, 99)];
  }
  const prodigy = prodigyVisible(state, p);
  const traits =
    level >= TRAITS_REVEAL_LEVEL
      ? {
          consistency: word(p.hidden.consistency, ['Erratic', 'Streaky', 'Reliable', 'Metronomic']),
          injuryRisk: word(p.hidden.injuryProne, ['Rarely injured', 'Robust', 'Injury-prone', 'Fragile']),
          ambition: level >= 80 ? word(p.hidden.ambition, ['Content', 'Settled', 'Driven', 'Hungry for the top']) : undefined,
        }
      : undefined;
  return { level, attributes, ovr, positions, potential, prodigy, traits };
}

/** Monthly: what you learned long ago slowly goes stale as players change. */
export function decayKnowledge(state: GameState, date: GameDate) {
  for (const [id, k] of Object.entries(state.knowledge)) {
    if (addDays(k.lastUpdated, 60) < date && k.level > 0) {
      k.level = Math.max(0, k.level - 2);
      for (const a of Object.keys(k.attrs ?? {}) as AttributeKey[]) k.attrs![a] = Math.max(0, k.attrs![a]! - 2);
    }
    if (!state.players[id as keyof GameState['players']]) delete state.knowledge[id as keyof GameState['knowledge']];
  }
}
