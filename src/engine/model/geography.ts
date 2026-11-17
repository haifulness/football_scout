import type { CityId, ContinentId, CountryId, LeagueId, RegionId } from '../core/ids';

export interface Continent {
  id: ContinentId;
  name: string;
}

export interface Country {
  id: CountryId;
  name: string;
  /** world-atlas TopoJSON id (ISO 3166-1 numeric, zero padded). */
  mapId: string;
  continentId: ContinentId;
  /** 1 (minnow) – 5 (elite football nation). */
  strength: number;
  /** Money multiplier for wages, fees and budgets: ~0.4 (small leagues) – 1.5 (rich leagues). */
  wealthIndex: number;
  /** Multiplier for travel, accommodation and search costs. */
  costIndex: number;
  culture: string;
  regionIds: RegionId[];
  leagueIds: LeagueId[]; // ordered from top level down
}

export interface Region {
  id: RegionId;
  name: string;
  countryId: CountryId;
  cityIds: CityId[];
}

export interface City {
  id: CityId;
  name: string;
  regionId: RegionId;
  countryId: CountryId;
  lat: number;
  lon: number;
}
