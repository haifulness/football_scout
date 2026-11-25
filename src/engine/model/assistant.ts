import type { GameDate } from '../core/calendar';
import type { ClubId, CountryId, PlayerId } from '../core/ids';
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

/** A brief handed to an assistant. */
export interface AssistantJob {
  /** The buying brief he's on (absent when he's selling). */
  missionId?: number;
  /** The selling request he's on. */
  mandateId?: number;
  startedOn: GameDate;
  /** Players he has already put forward (on a brief). */
  tried: PlayerId[];
  /** Clubs he has already offered the player to (on a sale). */
  triedClubs?: ClubId[];
  /** His deal in progress. */
  dealId?: number;
  weeklyExpenses: USD;
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
  /** Handling one of your briefs himself: he shortlists and pitches under your name, for a cut. */
  job?: AssistantJob;
  /** Working at one of your agency's bases (0 = headquarters) instead of field tasks. */
  officeId?: number;
  /** Studying a club's needs for you, until then. */
  analysis?: { clubId: import('../core/ids').ClubId; until: GameDate };
  /** Players reported over his time with you. */
  reports: number;
}

/** Someone on the job market. */
export type AssistantCandidate = Omit<Assistant, 'hiredOn' | 'xp' | 'task' | 'job' | 'reports'>;
