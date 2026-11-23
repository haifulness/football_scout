import type { GameDate } from '../core/calendar';
import type { CityId, CountryId, PlayerId } from '../core/ids';
import type { USD } from '../core/money';

export type ScoutingEventKind = 'youth-tournament' | 'u20-championship' | 'trial-day' | 'showcase' | 'international';

/** A date in the scouting calendar where many players can be seen at once. */
export interface ScoutingEvent {
  id: number;
  kind: ScoutingEventKind;
  name: string;
  /** Season (starting year) it belongs to. */
  season: number;
  cityId: CityId;
  countryId: CountryId;
  start: GameDate;
  days: number;
  ticket: USD;
  /** Roughly how many players take part. */
  size: number;
  /** Set once you attend: the players you saw there. */
  seen?: PlayerId[];
  attendedOn?: GameDate;
  /** You were reminded it's coming. */
  reminded?: boolean;
}
