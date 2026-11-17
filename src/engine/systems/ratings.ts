import type { AttributeKey, Player, Position } from '../model/player';
import { POSITIONS } from '../model/player';

type Weights = Partial<Record<AttributeKey, number>>;

/** How much each attribute matters for each position. Unlisted attributes weigh 0. */
export const POSITION_WEIGHTS: Record<Position, Weights> = {
  GK: {
    reflexes: 5,
    handling: 4,
    oneOnOnes: 4,
    aerialReach: 3,
    commandOfArea: 3,
    kicking: 2,
    positioning: 3,
    decisions: 2,
    composure: 2,
    agility: 2,
    jumping: 1,
  },
  CB: { tackling: 4, marking: 5, heading: 4, positioning: 5, strength: 3, jumping: 3, anticipation: 3, decisions: 2, composure: 2, pace: 2, passing: 1 },
  LB: { tackling: 4, marking: 3, positioning: 3, pace: 4, acceleration: 3, stamina: 3, crossing: 3, workRate: 3, anticipation: 2, dribbling: 1, passing: 2 },
  RB: { tackling: 4, marking: 3, positioning: 3, pace: 4, acceleration: 3, stamina: 3, crossing: 3, workRate: 3, anticipation: 2, dribbling: 1, passing: 2 },
  LWB: { pace: 4, acceleration: 3, stamina: 4, crossing: 4, dribbling: 3, workRate: 3, tackling: 3, marking: 2, offTheBall: 2, passing: 2, technique: 1 },
  RWB: { pace: 4, acceleration: 3, stamina: 4, crossing: 4, dribbling: 3, workRate: 3, tackling: 3, marking: 2, offTheBall: 2, passing: 2, technique: 1 },
  DM: { tackling: 4, positioning: 4, anticipation: 4, passing: 3, decisions: 3, workRate: 3, marking: 3, stamina: 3, strength: 2, composure: 2, vision: 1 },
  CM: {
    passing: 5,
    vision: 3,
    decisions: 4,
    firstTouch: 3,
    technique: 3,
    stamina: 3,
    workRate: 3,
    composure: 3,
    tackling: 2,
    offTheBall: 2,
    anticipation: 2,
    longShots: 1,
  },
  AM: { passing: 4, vision: 5, technique: 4, dribbling: 3, firstTouch: 4, offTheBall: 3, composure: 3, decisions: 3, longShots: 2, finishing: 2, agility: 2 },
  LM: { crossing: 4, pace: 3, stamina: 3, workRate: 3, dribbling: 3, passing: 3, technique: 2, offTheBall: 2, acceleration: 2, tackling: 1, decisions: 2 },
  RM: { crossing: 4, pace: 3, stamina: 3, workRate: 3, dribbling: 3, passing: 3, technique: 2, offTheBall: 2, acceleration: 2, tackling: 1, decisions: 2 },
  LW: { dribbling: 5, pace: 4, acceleration: 4, technique: 3, crossing: 3, offTheBall: 3, finishing: 3, agility: 3, firstTouch: 2, composure: 2 },
  RW: { dribbling: 5, pace: 4, acceleration: 4, technique: 3, crossing: 3, offTheBall: 3, finishing: 3, agility: 3, firstTouch: 2, composure: 2 },
  ST: {
    finishing: 5,
    offTheBall: 4,
    composure: 4,
    firstTouch: 3,
    heading: 2,
    pace: 3,
    acceleration: 3,
    strength: 2,
    technique: 2,
    anticipation: 3,
    dribbling: 2,
  },
};

const WEIGHT_SUM: Record<Position, number> = Object.fromEntries(
  POSITIONS.map((p) => [p, Object.values(POSITION_WEIGHTS[p]).reduce((a, b) => a + (b ?? 0), 0)]),
) as Record<Position, number>;

/** Raw ability at a position from attributes alone (1–100), ignoring familiarity. */
export function rawOvr(attributes: Record<AttributeKey, number>, pos: Position): number {
  let sum = 0;
  for (const [k, w] of Object.entries(POSITION_WEIGHTS[pos])) sum += attributes[k as AttributeKey] * (w ?? 0);
  const avg = sum / WEIGHT_SUM[pos]; // 1–20
  return Math.round(((avg - 1) / 19) * 99 + 1);
}

/** Familiarity 1 → no penalty; 0 (never played there) → about −40%. */
export const familiarityFactor = (familiarity: number) => 0.6 + 0.4 * familiarity;

export function ovrAt(player: Pick<Player, 'attributes' | 'positions'>, pos: Position): number {
  return Math.round(rawOvr(player.attributes, pos) * familiarityFactor(player.positions[pos] ?? 0));
}

export function bestPosition(player: Pick<Player, 'attributes' | 'positions'>): { position: Position; ovr: number } {
  let best: { position: Position; ovr: number } = { position: 'GK', ovr: -1 };
  for (const pos of POSITIONS) {
    const o = ovrAt(player, pos);
    if (o > best.ovr) best = { position: pos, ovr: o };
  }
  return best;
}

/** Positions that are natural neighbours: a CB can usually cover DM, a LW can play LM, etc. */
export const RELATED_POSITIONS: Record<Position, Position[]> = {
  GK: [],
  CB: ['DM', 'LB', 'RB'],
  LB: ['LWB', 'CB', 'LM'],
  RB: ['RWB', 'CB', 'RM'],
  LWB: ['LB', 'LM'],
  RWB: ['RB', 'RM'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM'],
  AM: ['CM', 'ST', 'LW', 'RW'],
  LM: ['LW', 'LWB', 'CM'],
  RM: ['RW', 'RWB', 'CM'],
  LW: ['LM', 'RW', 'AM', 'ST'],
  RW: ['RM', 'LW', 'AM', 'ST'],
  ST: ['AM', 'LW', 'RW'],
};
