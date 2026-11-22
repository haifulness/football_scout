import type { GameDate } from '../core/calendar';
import type { ClubId, CountryId, StaffId } from '../core/ids';

/** What the board wants from the club's money. */
export type BoardPolicy = 'youth' | 'win-now' | 'homegrown' | 'sell';

/**
 * The club president: he doesn't pick players, he decides what the club can afford and where it is going.
 * He signs off big signings, hires and fires coaches, and is rarely met.
 */
export interface President {
  id: StaffId;
  firstName: string;
  lastName: string;
  nationality: CountryId;
  age: number;
  clubId: ClubId;
  policy: BoardPolicy;
  /** How hard he is to talk round, 0–100. */
  stubbornness: number;
  portraitSeed: number;
  /** When the current policy was set (absent: since before your career). */
  policySince?: GameDate;
}

/** A president you stand well with asks who should be the next Head Coach. */
export interface BoardAsk {
  id: number;
  clubId: ClubId;
  presidentId: StaffId;
  /** The coach on his way out. */
  outgoingId: StaffId;
  reason: string;
  midSeason: boolean;
  postedOn: GameDate;
  answerBy: GameDate;
  /** Out-of-work coaches you know, best first. */
  candidates: StaffId[];
}
