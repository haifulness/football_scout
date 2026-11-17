import type { GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import type { AwardResult, Objective } from './goals';
import type { LedgerEntry } from './scout';

/** One of your placed players, as he did over the season. */
export interface ReviewPlayer {
  playerId: PlayerId;
  name: string;
  clubId: ClubId;
  apps: number;
  goals: number;
  assists: number;
  /** Average match rating (0 when he didn't play). */
  rating: number;
  /** Signing bonus plus match bonuses he has earned you so far. */
  earned: number;
}

/** What happened in your season: written at each summer rollover. */
export interface SeasonReview {
  /** Starting year of the season (2026 = 2026/27). */
  season: number;
  income: number;
  expenses: number;
  byKind: Partial<Record<LedgerEntry['kind'], number>>;
  /** Players you placed this season. */
  placements: number;
  reputation: { start?: number; end: number };
  players: ReviewPlayer[];
  best?: PlayerId;
  worst?: PlayerId;
  /** Where you finished among the rival scouts by signings this season (undefined for a season started before reviews existed). */
  rank?: { position: number; of: number; signings: number; leader?: { name: string; signings: number } };
  /** The season's awards (absent for seasons before awards existed). */
  awards?: AwardResult[];
  objectives?: { title: string; status: Objective['status'] }[];
}

/** Taken at the start of each season so the review can show what changed. */
export interface ReviewBaseline {
  season: number;
  reputation: number;
  rivalSignings: Record<number, number>;
}

export interface DeadlineFeedItem {
  hour: number;
  text: string;
  tone: 'info' | 'world' | 'good' | 'bad';
}

/** The last day of a transfer window, played hour by hour. */
export interface DeadlineDay {
  date: GameDate;
  /** 9 … 24 (24 = midnight: the window has shut). */
  hour: number;
  feed: DeadlineFeedItem[];
}
