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
}

export type RivalEmployment = { mode: 'fulltime'; clubId: ClubId } | { mode: 'freelance'; clients: ClubId[] };

/** An AI scout competing with you for players, jobs and clients (PLAN §3.15). */
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
}
