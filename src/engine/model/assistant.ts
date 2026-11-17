import type { GameDate } from '../core/calendar';
import type { CountryId } from '../core/ids';
import type { USD } from '../core/money';
import type { Position } from './player';
import type { LocationScope } from './scout';

/** Where and what an assistant scans. Country, region or city only. */
export interface AssistantBrief {
  location: Extract<LocationScope, { scope: 'country' | 'region' | 'city' }>;
  /** Up to 3; empty = any. */
  positions: Position[];
  age?: [number, number];
  /** Skip players worth more than this. */
  maxValue?: USD;
}

export interface AssistantTask extends AssistantBrief {
  startedOn: GameDate;
  endsOn: GameDate;
  weeks: number;
  /** Task expenses charged each week of work. */
  weeklyExpenses: USD;
  /** Players reported so far. */
  found: number;
}

/** A scout you employ (PLAN §3.13). */
export interface Assistant {
  id: number;
  firstName: string;
  lastName: string;
  nationality: CountryId;
  portraitSeed: number;
  age: number;
  /** Judging skill, 1–20: how close his ratings are to the truth, and how many players he finds. */
  skill: number;
  /** His home market: cheaper and sharper there. */
  speciality: CountryId;
  /** Per week. */
  wage: USD;
  hiredOn: GameDate;
  /** Weeks worked toward his next level. */
  xp: number;
  task?: AssistantTask;
  /** Working at one of your agency's bases (0 = headquarters) instead of field tasks. */
  officeId?: number;
  /** Players reported over his time with you. */
  reports: number;
}

/** Someone on the job market. */
export type AssistantCandidate = Omit<Assistant, 'hiredOn' | 'xp' | 'task' | 'reports'>;
