import { addDays, ageOn, formatDate, toParts, type GameDate } from '../core/calendar';
import { recordProdigyFind } from './goals';
import type { CountryId, PlayerId } from '../core/ids';
import { clamp, hashString } from '../core/rng';
import type { ClubTier } from '../model/club';
import { ATTRIBUTES, POSITIONS, type AttributeKey, type Player, type Position } from '../model/player';
import type { Knowledge, ScoutSkills } from '../model/scout';
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

/** Average match rating this season, once he has played enough to mean something. */
const formOf = (p: Player): number | undefined => (p.stats.apps >= 5 ? p.stats.ratingSum / p.stats.apps : undefined);

/** His circumstances as you see him: club, age, form, injury. */
function contextOf(p: Player, date: GameDate): NonNullable<Knowledge['seenContext']> {
  return { clubId: p.clubId, age: ageOn(p.birthDate, date), form: formOf(p), injuredUntil: p.injury && p.injury.until > date ? p.injury.until : undefined };
}

/** Raise what you know about a player (never lowers it). */
export function learn(state: GameState, p: Player, gain: number, cap: number, date: GameDate) {
  const wasProdigyVisible = prodigyVisible(state, p);
  const current = state.knowledge[p.id]?.level ?? 0;
  const base = Math.max(current, publicLevel(state, p));
  const level = Math.max(current, Math.min(cap, base + gain));
  state.knowledge[p.id] = { ...state.knowledge[p.id], level: Math.round(level), lastUpdated: date, seenAttrs: { ...p.attributes }, seenContext: contextOf(p, date), stale: undefined };
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
  known.seenAttrs = { ...p.attributes };
  known.seenContext = contextOf(p, date);
  known.stale = undefined;
}

/**
 * The player as you last saw him: your read is a snapshot, so ranges are drawn around his attributes then,
 * not now. Public information (TV, data sites) is current, so when it beats your own, he is seen as he is.
 */
export function seenAs(state: GameState, p: Player): Player {
  const k = state.knowledge[p.id];
  if (!k?.seenAttrs || k.level <= publicLevel(state, p)) return p;
  return { ...p, attributes: k.seenAttrs };
}

export type Freshness = 'fresh' | 'ageing' | 'stale';
/** A read older than this is ageing; older than STALE_DAYS, stale. */
export const AGEING_DAYS = 90;
export const STALE_DAYS = 180;

/** How current your own read on him is (undefined: you only have public information). */
export function freshness(state: GameState, p: Player): Freshness | undefined {
  const on = seenOn(state, p);
  if (on === undefined) return undefined;
  if (state.knowledge[p.id]?.stale) return 'stale';
  const age = state.date - on;
  return age >= STALE_DAYS ? 'stale' : age >= AGEING_DAYS ? 'ageing' : 'fresh';
}

/** When you last looked at him yourself (undefined: only public information). */
export function seenOn(state: GameState, p: Player): GameDate | undefined {
  const k = state.knowledge[p.id];
  return k && k.level > publicLevel(state, p) ? k.lastUpdated : undefined;
}

export function attributeRanges(state: GameState, player: Player): Record<AttributeKey, Range> {
  const p = seenAs(state, player);
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
  // Ratings are judged on the player as you last saw him.
  const seen = seenAs(state, p);
  const positions = Object.fromEntries(POSITIONS.map((pos) => [pos, ovrRange(seen, hw, pos)])) as Record<Position, Range>;
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

/** Weeks out that make your read stale, how far form must move, and the ages when players change fastest. */
const LONG_INJURY_DAYS = 28;
const FORM_SHIFT = 0.8;
const YOUNG_AGE = 21;
const VETERAN_AGE = 31;

/** Why your read on him is out of date, if something happened since you looked. */
export function staleReason(state: GameState, p: Player): string | undefined {
  const ctx = state.knowledge[p.id]?.seenContext;
  if (!ctx) return undefined;
  const date = state.date;
  if (p.clubId !== ctx.clubId) return p.clubId ? `he moved to ${state.clubs[p.clubId]!.name}` : 'he left his club';
  if (p.injury && p.injury.until !== ctx.injuredUntil && p.injury.until - date >= LONG_INJURY_DAYS)
    return `he's out injured until ${formatDate(p.injury.until)}`;
  const age = ageOn(p.birthDate, date);
  if (age > ctx.age && (age <= YOUNG_AGE || age >= VETERAN_AGE)) return `he turned ${age}, when players change fast`;
  const form = formOf(p);
  if (form !== undefined && ctx.form !== undefined && p.stats.apps >= 8 && Math.abs(form - ctx.form) >= FORM_SHIFT)
    return `his form has ${form > ctx.form ? 'jumped' : 'dropped'} (average ${form.toFixed(1)}, was ${ctx.form.toFixed(1)})`;
  return undefined;
}

/** Weekly: players in your pool whose circumstances changed since you looked go stale, with one note. */
export function staleTick(state: GameState, date: GameDate) {
  if (!state.scout || toParts(date).weekday !== 1) return;
  const changed: { p: Player; reason: string }[] = [];
  for (const id of Object.keys(state.pool) as PlayerId[]) {
    const p = state.players[id];
    const k = state.knowledge[id];
    if (!p || !k || k.stale || seenOn(state, p) === undefined) continue;
    const reason = staleReason(state, p);
    if (!reason) continue;
    k.stale = reason;
    changed.push({ p, reason });
  }
  if (!changed.length) return;
  const name = (p: Player) => `${p.firstName} ${p.lastName}`;
  addNews(state, {
    date,
    kind: 'career',
    title: changed.length === 1 ? `Your read on ${name(changed[0]!.p)} is out of date` : `Your read on ${changed.length} pool players is out of date`,
    body: `${changed.map((c) => `${name(c.p)}: ${c.reason}.`).join(' ')} Look again (video, a match, or a check-in) to see how ${changed.length === 1 ? 'he is' : 'they are'} now.`,
    playerIds: changed.map((c) => c.p.id),
  });
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
