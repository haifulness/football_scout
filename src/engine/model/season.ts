import type { GameDate } from '../core/calendar';
import type { ClubId, CountryId, LeagueId, PlayerId } from '../core/ids';
import type { Position } from './player';

export interface GoalEvent {
  minute: number;
  clubId: ClubId;
  /** Undefined for an own goal. */
  scorerId?: PlayerId;
  assistId?: PlayerId;
  ownGoal?: boolean;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  goals: GoalEvent[];
  attendance: number;
  motmId?: PlayerId;
}

export interface Fixture {
  id: string;
  leagueId: LeagueId;
  round: number; // 1-based
  date: GameDate;
  homeId: ClubId;
  awayId: ClubId;
  result?: MatchResult;
}

/** One player's contribution to one match. Payout logic (later phases) consumes these. */
export interface PlayerMatchLine {
  playerId: PlayerId;
  clubId: ClubId;
  position: Position;
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  tackles: number;
  cleanSheet: boolean;
  captain: boolean;
  rating: number;
}

export interface SeasonStats {
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  tackles: number;
  cleanSheets: number;
  captaincies: number;
  ratingSum: number;
  motm: number;
}

export const emptyStats = (): SeasonStats => ({
  apps: 0,
  starts: 0,
  minutes: 0,
  goals: 0,
  assists: 0,
  tackles: 0,
  cleanSheets: 0,
  captaincies: 0,
  ratingSum: 0,
  motm: 0,
});

/** A completed season in a player's career. */
export interface SeasonLine extends SeasonStats {
  season: number; // starting year, e.g. 2026 for 2026/27
  clubId?: ClubId;
  ovr: number;
}

export interface ClubSeason {
  season: number;
  leagueId: LeagueId;
  position: number;
  points: number;
}

export interface Injury {
  until: GameDate;
  description: string;
}

export type NewsKind = 'season-review' | 'coaching' | 'retirement' | 'season-start' | 'milestone' | 'transfer' | 'finance' | 'career' | 'rumour' | 'board';

/** Where a message takes you when it isn't about one player, club or country. */
export type NewsLink = 'staff' | 'pool-assistants' | 'missions' | 'career' | 'hunts' | 'goals' | 'agency' | 'finances' | 'academy' | 'rivals';

export interface NewsItem {
  id: number;
  date: GameDate;
  kind: NewsKind;
  title: string;
  body: string;
  countryId?: CountryId;
  clubIds?: ClubId[];
  playerIds?: PlayerId[];
  /** Personal even though its kind is world news (e.g. a rumour about your player): goes to your inbox. */
  forYou?: boolean;
  link?: NewsLink;
}

export interface SeasonState {
  /** Starting year: 2026 means the 2026/27 season. */
  year: number;
  /** End-of-season review has been published. */
  ended: boolean;
}

/** Messages addressed to you (the Inbox), as opposed to world news. */
export const isInboxItem = (n: NewsItem) => n.kind === 'career' || n.kind === 'finance' || !!n.forYou;
