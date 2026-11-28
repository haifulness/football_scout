import type { GameDate } from '../core/calendar';
import type { ClubId, CountryId, PlayerId } from '../core/ids';

/** A rival's current chase: a player for one of his clubs. */
export interface RivalPursuit {
  playerId: PlayerId;
  /** The club he is trying to sign the player for. */
  clubId: ClubId;
  startedOn: GameDate;
  /** 0 → 1: scouting, talks, paperwork. At 1 he tries to close in the next window. */
  progress: number;
  /** A rumour about this chase has reached the news (so you know about it). */
  rumoured: boolean;
  /** Chasing a need he read about in the paper (the club isn't his client): the position. */
  lead?: import('./player').Position;
  /** The club is one of yours: he's pitching to your client. */
  poach?: boolean;
}

export type RivalEmployment = { mode: 'fulltime'; clubId: ClubId } | { mode: 'freelance'; clients: ClubId[] };

/** An AI scout competing with you for players, jobs and clients. */
export interface RivalScout {
  id: number;
  firstName: string;
  lastName: string;
  nationality: CountryId;
  portraitSeed: number;
  /** Overall scouting skill, 1–20: how well he judges players and how fast he works. */
  skill: number;
  reputation: number;
  employment: RivalEmployment;
  pursuit?: RivalPursuit;
  /** Between chases. */
  restUntil?: GameDate;
  record: { signings: number; steals: number; failed: number };
  /** You left him early: he goes after your players. */
  grudge?: boolean;
  /** You swapped reads with him: he knows what you're after until then. */
  tippedUntil?: GameDate;
  /** You've seen enough of him (a rumour, a steal, a trade) to know how he works. */
  styleKnown?: true;
  /** Players he has signed for clubs lately, newest first (capped): what your clients compare you with. */
  signed?: { playerId: PlayerId; clubId: ClubId; date: GameDate }[];
}
