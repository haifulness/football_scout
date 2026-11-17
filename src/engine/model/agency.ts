import type { GameDate } from '../core/calendar';
import type { CityId, ClubId, CountryId, PlayerId } from '../core/ids';
import type { USD } from '../core/money';
import type { Club, ClubColors } from './club';

export interface AgencyLogo {
  colors: ClubColors;
  crest: Club['crest'];
}

/** A branch abroad. The headquarters in your home country is not an Office (it is always open). */
export interface Office {
  id: number;
  countryId: CountryId;
  cityId: CityId;
  openedOn: GameDate;
  /** Per month. */
  rent: USD;
}

/** A deal one of your staff brokered for the agency. */
export interface AgencyDeal {
  date: GameDate;
  assistantId: number;
  playerId: PlayerId;
  clubId: ClubId;
  fee: USD;
  cut: USD;
}

/** Your own scouting agency (late game, PLAN phase 19). */
export interface Agency {
  name: string;
  /** Up to 4 letters, shown on the logo. */
  shortName: string;
  logo: AgencyLogo;
  foundedOn: GameDate;
  offices: Office[];
  /** The last deals your staff brokered, newest first (capped). */
  deals: AgencyDeal[];
  /** Lifetime totals. */
  brokered: number;
  earned: USD;
}

/** Where an assistant works: the headquarters (0) or an office id. */
export const HQ = 0;
