import type { GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import type { USD } from '../core/money';
import type { AttributeKey, Foot, Position } from './player';

export interface MissionRequirements {
  /** Rating at the mission position, judged on the truth (you only see estimates). */
  minOvr: number;
  minAge?: number;
  maxAge?: number;
  /** Transfer fee the club will pay at most (free agents always fit). */
  maxFee?: USD;
  foot?: Exclude<Foot, 'Both'>;
}

/** What the club told you when you discussed the brief: preferences, not requirements. */
export interface MissionPreferences {
  /** Weekly wage they're comfortable paying. */
  maxWage: USD;
  /** The attributes that matter most at the position, with the level they hope for (1–20). */
  keyAttributes: { attribute: AttributeKey; min: number }[];
  idealAge: [number, number];
  discussedOn: GameDate;
}

/** Something you can ask a club to loosen. Preferences are easier to move; requirements cost part of the reward. */
export type NegotiationKey = 'wage' | 'idealAge' | 'fee' | 'rating' | 'ageLimit' | `attr:${AttributeKey}`;

export type MissionStatus = 'offered' | 'active' | 'succeeded' | 'failed' | 'declined' | 'expired';

export interface Mission {
  id: number;
  clubId: ClubId;
  position: Position;
  requirements: MissionRequirements;
  /** Why the club wants this (shown in the brief). */
  brief: string;
  postedOn: GameDate;
  /** Offer lapses if not accepted by then. */
  acceptBy: GameDate;
  weeks: number;
  /** Set when accepted. */
  deadline?: GameDate;
  reward: USD;
  status: MissionStatus;
  /** The deal that completed it. */
  dealId?: number;
  resolvedOn?: GameDate;
  /** Set once you have discussed the brief with the club. */
  preferences?: MissionPreferences;
  /** What you asked for, and the answer. Each term can be asked once. */
  negotiation?: Partial<Record<NegotiationKey, 'agreed' | 'refused'>>;
}

/** A client club asks you to find a buyer for one of its players (freelance only). */
export interface Mandate {
  id: number;
  /** The selling club (one of your clients). */
  clubId: ClubId;
  playerId: PlayerId;
  /** The club won't sell for less. */
  askingFee: USD;
  /** Your cut of the sale fee, in percent (3–5). */
  commissionPct: number;
  reason: string;
  postedOn: GameDate;
  acceptBy: GameDate;
  weeks: number;
  deadline?: GameDate;
  status: MissionStatus;
  dealId?: number;
  resolvedOn?: GameDate;
  /** Why it ended, if not by your sale. */
  note?: string;
}
