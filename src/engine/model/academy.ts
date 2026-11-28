import type { GameDate } from '../core/calendar';
import type { CityId, ClubId, CountryId, PlayerId } from '../core/ids';
import type { USD } from '../core/money';

/** You pay a club's academy each year: you see its intake first, and it grows better players. */
export interface Sponsorship {
  clubId: ClubId;
  since: GameDate;
  /** Charged now and every 1st of July while it runs. */
  fee: USD;
}

/** Older saves: your own academy, since removed. Wound up on the first day played (see `windUpOwnAcademy`). */
export interface OwnAcademy {
  name: string;
  countryId: CountryId;
  cityId: CityId;
  openedOn: GameDate;
  /** 1–3: pitches and coaching (how fast they grow) and reach (where they come from). */
  level: 1 | 2 | 3;
  /** Kids in the academy now. */
  players: PlayerId[];
  /** Graduates placed at clubs. */
  graduates: PlayerId[];
  /** Training fees and sell-on shares earned, all time. */
  earned: USD;
}

export interface AcademyState {
  sponsorships: Sponsorship[];
  /** Older saves only. */
  own?: OwnAcademy;
}
