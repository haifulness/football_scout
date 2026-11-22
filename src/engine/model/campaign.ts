import type { GameDate } from '../core/calendar';
import type { CountryId } from '../core/ids';
import type { USD } from '../core/money';

/** Paying to raise your profile in one market: more clubs and players hear of you, and more people are watching. */
export interface Campaign {
  countryId: CountryId;
  startedOn: GameDate;
  endsOn: GameDate;
  weeklyCost: USD;
  /** Spent so far. */
  spent: USD;
  /** Clubs that invited you while it ran. */
  invites: number;
  /** Set when it finished (or you stopped it). */
  endedOn?: GameDate;
}
