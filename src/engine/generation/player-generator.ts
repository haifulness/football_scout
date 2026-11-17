import { addDays, makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId, CountryId, PlayerId } from '../core/ids';
import { usd } from '../core/money';
import { clamp, type Rng } from '../core/rng';
import { BLOCKED_PLAYER_NAMES, culture } from '../data/names';
import type { ClubTier } from '../model/club';
import { emptyStats } from '../model/season';
import { ATTRIBUTES, ATTRIBUTE_GROUPS, type AttributeKey, type Foot, type Player, type Position } from '../model/player';
import { marketValue, weeklyWage } from '../systems/economy';
import { POSITION_WEIGHTS, RELATED_POSITIONS, rawOvr } from '../systems/ratings';

export interface PlayerSpec {
  id: PlayerId;
  position: Position;
  targetOvr: number;
  age: number;
  nationality: CountryId;
  cultureName: string;
  today: GameDate;
  club?: { id: ClubId; tier: ClubTier; wealthIndex: number };
  /** Wealth of the player's home market, used for value when he has no club. */
  wealthIndex: number;
  prodigyChance: number;
}

const GK_ATTRS = new Set<AttributeKey>(ATTRIBUTE_GROUPS.Goalkeeping);
const LEFT_SIDED = new Set<Position>(['LB', 'LWB', 'LM', 'LW']);
const RIGHT_SIDED = new Set<Position>(['RB', 'RWB', 'RM', 'RW']);

/** Attribute level (1–20) that corresponds to an OVR (1–100). */
const levelFor = (ovr: number) => 1 + ((ovr - 1) / 99) * 19;

function generateAttributes(rng: Rng, pos: Position, targetOvr: number): Record<AttributeKey, number> {
  const weights = POSITION_WEIGHTS[pos];
  const maxW = Math.max(...Object.values(weights).map((w) => w ?? 0));
  const T = levelFor(targetOvr);
  const attrs = {} as Record<AttributeKey, number>;
  const isGK = pos === 'GK';

  for (const k of ATTRIBUTES) {
    const w = (weights[k] ?? 0) / maxW;
    let v: number;
    if (w > 0) v = T + (w - 0.5) * 3 + rng.gaussian(0, 1.4);
    else if (!isGK && GK_ATTRS.has(k)) v = rng.int(1, 4);
    else if (isGK && !GK_ATTRS.has(k) && ATTRIBUTE_GROUPS.Technical.includes(k as never)) v = T * 0.45 + rng.gaussian(0, 1.5);
    else v = T - 3 + rng.gaussian(0, 2.2);
    attrs[k] = v;
  }

  // Nudge weighted attributes until the position rating lands on target.
  for (let iter = 0; iter < 4; iter++) {
    const rounded = roundAttrs(attrs);
    const diff = targetOvr - rawOvr(rounded, pos);
    if (Math.abs(diff) <= 1) break;
    const step = (diff / 99) * 19;
    for (const k of Object.keys(weights) as AttributeKey[]) attrs[k] = (attrs[k] ?? 0) + step;
  }
  return roundAttrs(attrs);
}

const roundAttrs = (a: Record<AttributeKey, number>) => {
  const out = {} as Record<AttributeKey, number>;
  for (const k of ATTRIBUTES) out[k] = clamp(Math.round(a[k]), 1, 20);
  return out;
};

function familiarity(rng: Rng, natural: Position): Partial<Record<Position, number>> {
  const fam: Partial<Record<Position, number>> = { [natural]: 1 };
  const related = rng.shuffle([...RELATED_POSITIONS[natural]]);
  const count = rng.int(0, Math.min(3, related.length));
  for (let i = 0; i < count; i++) {
    const p = related[i]!;
    fam[p] = Math.round(rng.float(0.35, i === 0 ? 0.95 : 0.75) * 100) / 100;
  }
  return fam;
}

function potentialFor(rng: Rng, age: number, ovr: number, prodigy: boolean): number {
  if (prodigy) return clamp(Math.round(rng.float(88, 97)), ovr + 10, 99);
  if (age >= 29) return ovr;
  if (age >= 26) return clamp(ovr + rng.int(0, 2), ovr, 99);
  const headroom = Math.max(0, rng.gaussian((25 - age) * 2.3, 5));
  return clamp(Math.round(ovr + headroom), ovr, 94);
}

export function generatePlayer(rng: Rng, spec: PlayerSpec): Player {
  const names = culture(spec.cultureName);
  const prodigy = spec.age <= 19 && rng.chance(spec.prodigyChance);
  const attributes = generateAttributes(rng, spec.position, spec.targetOvr);
  const ovr = rawOvr(attributes, spec.position);
  const potential = potentialFor(rng, spec.age, ovr, prodigy);
  let firstName = rng.pick(names.first);
  const lastName = rng.pick(names.last);
  for (let i = 0; i < 6 && BLOCKED_PLAYER_NAMES.has(`${firstName} ${lastName}`); i++) firstName = rng.pick(names.first);

  const { year } = toParts(spec.today);
  const birthDate = addDays(makeDate(year - spec.age - 1, 7, 2), rng.int(0, 364));

  const foot: Foot = LEFT_SIDED.has(spec.position)
    ? rng.chance(0.8)
      ? 'Left'
      : rng.chance(0.5)
        ? 'Both'
        : 'Right'
    : RIGHT_SIDED.has(spec.position)
      ? rng.chance(0.85)
        ? 'Right'
        : rng.chance(0.5)
          ? 'Both'
          : 'Left'
      : rng.chance(0.72)
        ? 'Right'
        : rng.chance(0.75)
          ? 'Left'
          : 'Both';

  const heightBase = spec.position === 'GK' ? 190 : spec.position === 'CB' ? 187 : spec.position === 'ST' ? 183 : 178;
  const contractYears = spec.club ? rng.int(1, 5) : 0;
  const contractUntil = spec.club ? makeDate(year + contractYears, 6, 30) : undefined;
  const wealth = spec.club?.wealthIndex ?? spec.wealthIndex;

  return {
    id: spec.id,
    firstName,
    lastName,
    birthDate,
    nationality: spec.nationality,
    heightCm: Math.round(clamp(rng.gaussian(heightBase, 5.5), 160, 204)),
    foot,
    clubId: spec.club?.id,
    contractUntil,
    wage: spec.club ? weeklyWage(ovr, spec.club.tier, wealth) : usd(0),
    value: marketValue({ ovr, age: spec.age, potential, contractYearsLeft: contractYears, wealthIndex: wealth }),
    attributes,
    hidden: {
      potential,
      consistency: rng.int(5, 20),
      ambition: rng.int(3, 20),
      loyalty: rng.int(3, 20),
      injuryProne: rng.int(1, 16),
    },
    positions: familiarity(rng, spec.position),
    naturalPosition: spec.position,
    isProdigy: prodigy,
    portraitSeed: rng.seed(),
    stats: emptyStats(),
    history: [],
  };
}
