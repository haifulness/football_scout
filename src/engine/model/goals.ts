import type { GameDate } from '../core/calendar';
import type { ClubId, ContinentId, CountryId, LeagueId, PlayerId } from '../core/ids';
import type { USD } from '../core/money';

export type ObjectiveKind =
  | 'placements'
  | 'tier-placements'
  | 'abroad'
  | 'prodigy'
  | 'missions'
  | 'reports'
  | 'reputation'
  | 'profit';

/** One of your three goals for a season. */
export interface Objective {
  id: number;
  season: number;
  kind: ObjectiveKind;
  title: string;
  /** What counts as done (a count, a reputation, or dollars of profit). */
  target: number;
  /** For 'tier-placements': the club tier you must reach (or better). */
  tier?: number;
  /** For 'reputation': where you started. */
  start?: number;
  /** Things done since this date count. */
  from: GameDate;
  reward: { money: USD; reputation: number };
  status: 'active' | 'done' | 'missed';
  doneOn?: GameDate;
}

export type TrophyKind = 'scout-country' | 'scout-world' | 'signing' | 'clean-sweep';

/** Something you won: kept in your trophy cabinet. */
export interface Trophy {
  id: number;
  season: number;
  kind: TrophyKind;
  title: string;
  detail: string;
  date: GameDate;
  countryId?: CountryId;
  leagueId?: LeagueId;
  playerId?: PlayerId;
  clubId?: ClubId;
}

/** One line of a Scout of the Year vote. */
export interface VoteRow {
  name: string;
  /** Undefined for you. */
  rivalId?: number;
  you: boolean;
  signings: number;
  reputation: number;
  points: number;
}

export interface AwardResult {
  kind: 'scout-country' | 'scout-world' | 'signing';
  title: string;
  /** Who won (a scout's name, or a player's for Signing of the Season). */
  winner: string;
  you: boolean;
  /** Top of the vote (Scout of the Year only). */
  table?: VoteRow[];
  /** Your place in the vote, when you were in it. */
  yourPlace?: number;
  detail?: string;
  playerId?: PlayerId;
  clubId?: ClubId;
}

export type SpecialtyKind = 'continent' | 'position' | 'youth' | 'free';
export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

/** A niche your placements have built: clubs ask for you there. */
export interface Specialty {
  key: string;
  kind: SpecialtyKind;
  label: string;
  /** 1 = specialist, 2 = expert. */
  level: 1 | 2;
  count: number;
  continentId?: ContinentId;
  group?: PositionGroup;
}

/** A prodigy you were first to reveal. */
export interface ProdigyFind {
  playerId: PlayerId;
  date: GameDate;
}
