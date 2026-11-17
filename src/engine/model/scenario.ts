import type { GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';

export type ScenarioId = 'shoestring' | 'rescue' | 'golden' | 'audition';

/** A preset start with its own goal and time limit (phase 22). Absent for a free career. */
export interface ScenarioState {
  id: ScenarioId;
  startedOn: GameDate;
  /** Starting year of the season it began in. */
  season: number;
  /** The goal must be reached by this day. */
  deadline: GameDate;
  /** The club the scenario is about (relegation rescue, big-club audition). */
  clubId?: ClubId;
  status: 'active' | 'won' | 'lost';
  resolvedOn?: GameDate;
}
