import type { Position } from '../model/player';

/** A formation slot. x: 0 (left touchline) → 100 (right); y: 0 (own goal) → 100 (opponent goal). */
export interface FormationSlot {
  position: Position;
  x: number;
  y: number;
}

const s = (position: Position, x: number, y: number): FormationSlot => ({ position, x, y });

export const FORMATIONS = {
  '4-4-2': [
    s('GK', 50, 6),
    s('LB', 14, 26),
    s('CB', 37, 22),
    s('CB', 63, 22),
    s('RB', 86, 26),
    s('LM', 14, 54),
    s('CM', 38, 50),
    s('CM', 62, 50),
    s('RM', 86, 54),
    s('ST', 38, 80),
    s('ST', 62, 80),
  ],
  '4-3-3': [
    s('GK', 50, 6),
    s('LB', 14, 26),
    s('CB', 37, 22),
    s('CB', 63, 22),
    s('RB', 86, 26),
    s('CM', 30, 50),
    s('DM', 50, 40),
    s('CM', 70, 50),
    s('LW', 16, 76),
    s('ST', 50, 84),
    s('RW', 84, 76),
  ],
  '4-2-3-1': [
    s('GK', 50, 6),
    s('LB', 14, 26),
    s('CB', 37, 22),
    s('CB', 63, 22),
    s('RB', 86, 26),
    s('DM', 38, 42),
    s('DM', 62, 42),
    s('LW', 16, 66),
    s('AM', 50, 64),
    s('RW', 84, 66),
    s('ST', 50, 86),
  ],
  '3-5-2': [
    s('GK', 50, 6),
    s('CB', 28, 22),
    s('CB', 50, 20),
    s('CB', 72, 22),
    s('LWB', 10, 48),
    s('CM', 34, 50),
    s('DM', 50, 40),
    s('CM', 66, 50),
    s('RWB', 90, 48),
    s('ST', 38, 82),
    s('ST', 62, 82),
  ],
  '3-4-3': [
    s('GK', 50, 6),
    s('CB', 28, 22),
    s('CB', 50, 20),
    s('CB', 72, 22),
    s('LWB', 12, 50),
    s('CM', 38, 46),
    s('CM', 62, 46),
    s('RWB', 88, 50),
    s('LW', 20, 76),
    s('ST', 50, 84),
    s('RW', 80, 76),
  ],
  '5-3-2': [
    s('GK', 50, 6),
    s('LWB', 10, 34),
    s('CB', 30, 20),
    s('CB', 50, 18),
    s('CB', 70, 20),
    s('RWB', 90, 34),
    s('CM', 30, 52),
    s('CM', 50, 46),
    s('CM', 70, 52),
    s('ST', 38, 80),
    s('ST', 62, 80),
  ],
  '4-1-4-1': [
    s('GK', 50, 6),
    s('LB', 14, 26),
    s('CB', 37, 22),
    s('CB', 63, 22),
    s('RB', 86, 26),
    s('DM', 50, 38),
    s('LM', 14, 60),
    s('CM', 38, 56),
    s('CM', 62, 56),
    s('RM', 86, 60),
    s('ST', 50, 84),
  ],
  '4-3-1-2': [
    s('GK', 50, 6),
    s('LB', 14, 26),
    s('CB', 37, 22),
    s('CB', 63, 22),
    s('RB', 86, 26),
    s('CM', 28, 46),
    s('DM', 50, 40),
    s('CM', 72, 46),
    s('AM', 50, 64),
    s('ST', 38, 84),
    s('ST', 62, 84),
  ],
} as const satisfies Record<string, readonly FormationSlot[]>;

export type FormationId = keyof typeof FORMATIONS;
export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];
