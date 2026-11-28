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

/** One line of what the agency did (newest first on the agency screen). */
export interface AgencyLogEntry {
  date: GameDate;
  /** 'rival': a rival agency brokered a signing before your staff could. */
  kind: 'brief' | 'lead' | 'deal' | 'pitch' | 'rival';
  assistantId?: number;
  text: string;
}

/** Your own scouting agency (late game). */
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
  /** What the staff have been doing, newest first (capped). */
  log?: AgencyLogEntry[];
}

/** Another scouting agency competing with yours for brokered deals and staff. */
export interface RivalAgency {
  id: number;
  name: string;
  /** Up to 4 letters for its badge. */
  shortName: string;
  color: string;
  /** Countries where it has a base (its home first). */
  countries: CountryId[];
  /** 1–20: how often it beats you to a deal, and how much it can offer your staff. */
  strength: number;
  foundedOn: GameDate;
  /** Deals it brokered: lifetime, and the dates of recent ones (capped). */
  brokered: number;
  recent: GameDate[];
  /** Staff of yours it hired away. */
  hired: number;
}

/** Where an assistant works: the headquarters (0) or an office id. */
export const HQ = 0;
