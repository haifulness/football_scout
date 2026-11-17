import type { PlayerId } from '../core/ids';
import { FORMATIONS, type FormationId, type FormationSlot } from '../data/formations';
import type { Player, Position } from '../model/player';
import { ovrAt } from './ratings';

export interface LineupSlot extends FormationSlot {
  playerId?: PlayerId;
  ovr: number;
}

/**
 * Picks the strongest XI for a formation: fills the most demanding slots first,
 * each with the best remaining player at that position.
 */
export function bestXI(formation: FormationId, squad: Player[]): LineupSlot[] {
  const slots = FORMATIONS[formation];
  const used = new Set<PlayerId>();
  const result: LineupSlot[] = slots.map((s) => ({ ...s, ovr: 0 }));
  // GK first, then by scarcity: each slot picks greedily in formation order.
  const order = slots.map((_, i) => i).sort((a, b) => (slots[a]!.position === 'GK' ? -1 : slots[b]!.position === 'GK' ? 1 : 0));
  for (const i of order) {
    const pos = slots[i]!.position;
    let best: Player | undefined;
    let bestOvr = -1;
    for (const p of squad) {
      if (used.has(p.id)) continue;
      const o = ovrAt(p, pos);
      if (o > bestOvr) {
        bestOvr = o;
        best = p;
      }
    }
    if (best) {
      used.add(best.id);
      result[i] = { ...slots[i]!, playerId: best.id, ovr: bestOvr };
    }
  }
  return result;
}

/**
 * Team positional average: mean OVR of squad players whose natural (or strongly familiar)
 * position is `pos`. This is the bar a recommended player must clear.
 */
export function positionalAverage(squad: Player[], pos: Position): { average: number; count: number } {
  const relevant = squad.filter((p) => (p.positions[pos] ?? 0) >= 0.75);
  if (relevant.length === 0) return { average: 0, count: 0 };
  const total = relevant.reduce((s, p) => s + ovrAt(p, pos), 0);
  return { average: Math.round(total / relevant.length), count: relevant.length };
}

export interface SlotNeed {
  position: Position;
  starterOvr: number;
  positionalAverage: number;
  depth: number;
  /** 0 (fine) – 1 (urgent). */
  severity: number;
}

/** Positions in the club's formation where the starter is weak relative to the XI, or depth is thin. */
export function squadNeeds(formation: FormationId, squad: Player[]): SlotNeed[] {
  const xi = bestXI(formation, squad);
  const xiAvg = xi.reduce((s, x) => s + x.ovr, 0) / xi.length;
  const seen = new Set<Position>();
  const needs: SlotNeed[] = [];
  for (const slot of xi) {
    if (seen.has(slot.position)) continue;
    seen.add(slot.position);
    const slotsOfPos = xi.filter((x) => x.position === slot.position);
    const weakest = Math.min(...slotsOfPos.map((x) => x.ovr));
    const { average, count } = positionalAverage(squad, slot.position);
    const gap = Math.max(0, xiAvg - weakest) / 12;
    const thin = count < slotsOfPos.length * 2 ? 0.35 : 0;
    needs.push({
      position: slot.position,
      starterOvr: weakest,
      positionalAverage: average,
      depth: count,
      severity: Math.min(1, gap + thin),
    });
  }
  return needs.sort((a, b) => b.severity - a.severity);
}
