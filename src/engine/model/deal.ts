import type { BoardPolicy } from './president';
import type { GameDate } from '../core/calendar';
import type { ClubId, CountryId, PlayerId, StaffId } from '../core/ids';
import type { USD } from '../core/money';
import type { Position } from './player';

/** Who signs off a proposal: the club's Head Coach. */
export type Official = 'coach';

export type DealStage =
  /** Signed off by the club: fee and terms are being worked out, the player is deciding. */
  | 'negotiating'
  /** Everyone agreed outside a transfer window: completes when the next window opens. */
  | 'agreed'
  | 'completed'
  /** The club said no (gate, money, or the official you pitched to). */
  | 'rejected'
  /** The player or his club said no. */
  | 'failed'
  /** Another club signed him first. */
  | 'hijacked'
  /** Something else ended it (retirement, he already moved, the club changed its mind). */
  | 'collapsed';

export interface DealLogEntry {
  date: GameDate;
  text: string;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface Deal {
  id: number;
  playerId: PlayerId;
  /** The club you recommended him to. */
  clubId: ClubId;
  /** His club when you pitched (undefined = free agent). */
  sellingClubId?: ClubId;
  position: Position;
  stage: DealStage;
  /** Who you pitched to, in order. A second pitch means going over the first one's head. */
  pitchedTo: Official[];
  signOff?: { by: Official; date: GameDate };
  /** A club-level "no" (not good enough, can't afford it): asking the other official won't help. */
  clubLevelRejection?: boolean;
  /** Pitched by one of your assistants on a brief you handed him (he takes a cut). */
  delegatedTo?: number;
  /** The board had its say on a big signing (after the coach's yes). */
  boardChecked?: boolean;
  /** The board blocked the money. */
  boardBlocked?: boolean;
  /** The board's policy when it blocked the money (a change of direction lets you try again). */
  boardPolicy?: BoardPolicy;
  /** The coach who said no (a different coach may see it differently). */
  rejectedBy?: StaffId;
  /** Your estimate of him at this position when you pitched (to tell when you know more). */
  estimateThen?: number;
  /** Below the positional average, accepted on potential: no placement bonus later. */
  prospect: boolean;
  /** Selling for a client under a mandate: commission instead of placement bonuses. */
  mandateId?: number;
  /** A free agent you represent. */
  represented?: boolean;
  /** Pitched without a scouting agreement (freelance): half the signing bonus, no match bonuses. */
  open?: boolean;
  openedOn: GameDate;
  /** When negotiations conclude. */
  resolvesOn?: GameDate;
  completedOn?: GameDate;
  fee: USD;
  /** The wage offered to the player (you can offer more than he asks, up to the club's ceiling). */
  wage: USD;
  /** What he asked for when you pitched. */
  wageDemand?: USD;
  /** Last computed chance that the player and his club say yes, 0–1 (for the UI). */
  chance?: number;
  reason?: string;
  log: DealLogEntry[];
}

/** A completed signing that keeps paying the scout (payouts arrive with the economy phase). */
export interface Placement {
  id: number;
  dealId: number;
  playerId: PlayerId;
  clubId: ClubId;
  position: Position;
  signedOn: GameDate;
  /** Bonuses run for the player's first contract at the club. */
  expiresOn: GameDate;
  fee: USD;
  /** Player OVR minus the club's positional average when he signed. */
  ovrGap: number;
  prospect: boolean;
  /** Who he was when he signed (for specialties). */
  nationality?: CountryId;
  age?: number;
  /** Signed as a free agent. */
  free?: boolean;
  mode: 'freelance' | 'fulltime';
  /** Signed from an open pitch (no scouting agreement): half the signing bonus, no match bonuses. */
  open?: boolean;
  /** One-off signing bonus (0 for prospects). */
  bonus: USD;
  bonusPaid: boolean;
  /** Match bonuses earned so far, by kind. */
  earnings: PlacementEarnings;
  /** Set when bonuses stop: contract ended or he left the club. */
  endedOn?: GameDate;
  endReason?: string;
}

export interface PlacementEarnings {
  appearance: number;
  goals: number;
  assists: number;
  tackles: number;
  cleanSheets: number;
  captain: number;
}

export const emptyEarnings = (): PlacementEarnings => ({ appearance: 0, goals: 0, assists: 0, tackles: 0, cleanSheets: 0, captain: 0 });

export type PayoutKind = keyof PlacementEarnings;

/** Bonuses one placed player earned you in one match (drives the matchday ticker). */
export interface PayoutEvent {
  playerId: PlayerId;
  clubId: ClubId;
  opponentId: ClubId;
  date: GameDate;
  home: boolean;
  score: [number, number];
  position: Position;
  items: { kind: PayoutKind; label: string; amount: USD }[];
  total: USD;
}

/** Something that happened to one of your deals during a time advance (drives the "Here we go" reveal). */
export interface DealEvent {
  dealId: number;
  kind: 'completed' | 'agreed' | 'failed' | 'hijacked' | 'collapsed';
  playerId: PlayerId;
  clubId: ClubId;
  text: string;
}
