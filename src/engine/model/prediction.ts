import type { ClubId, CountryId, LeagueId, PlayerId } from '../core/ids';

/** The paper's pundit, before a ball is kicked: who wins, who goes down, who breaks out. */
export interface Prediction {
  season: number;
  countryId: CountryId;
  leagueId: LeagueId;
  title: ClubId;
  relegated: ClubId[];
  breakout?: PlayerId;
}
