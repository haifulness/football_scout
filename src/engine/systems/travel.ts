import type { CityId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { clamp } from '../core/rng';
import type { City } from '../model/geography';
import type { GameState } from '../model/world-state';
import { ScoutingError, addLedger, coverFor } from './scouting';
import { hasBase } from './agency';

/**
 * Travel. Trips cost money and days by distance band (PLAN §3.9a):
 * same region $50–200 · same country $150–500 · same continent $400–1.2k ·
 * intercontinental $1.2k–4k, scaled by how expensive the two countries are.
 * Every night away from your home city costs a hotel.
 */

export type TravelBand = 'here' | 'region' | 'country' | 'continent' | 'intercontinental';

const BANDS: Record<Exclude<TravelBand, 'here'>, { min: number; max: number; perKm: number; days: number }> = {
  region: { min: 50, max: 200, perKm: 0.6, days: 1 },
  country: { min: 150, max: 500, perKm: 0.45, days: 1 },
  continent: { min: 400, max: 1200, perKm: 0.3, days: 1 },
  intercontinental: { min: 1200, max: 4000, perKm: 0.16, days: 2 },
};
const HOTEL_BASE = 120;

export function distanceKm(a: City, b: City): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bandBetween(state: GameState, a: City, b: City): TravelBand {
  if (a.id === b.id) return 'here';
  if (a.regionId === b.regionId) return 'region';
  if (a.countryId === b.countryId) return 'country';
  if (state.countries[a.countryId]!.continentId === state.countries[b.countryId]!.continentId) return 'continent';
  return 'intercontinental';
}

export interface TravelQuote {
  from: CityId;
  to: CityId;
  band: TravelBand;
  distanceKm: number;
  cost: USD;
  days: number;
  /** Hotel cost per night at the destination (0 if it's your home city). */
  nightly: USD;
  affordable: boolean;
}

export function nightlyCost(state: GameState, cityId: CityId): USD {
  const city = state.cities[cityId]!;
  const home = state.scout ? state.cities[state.scout.homeCity] : undefined;
  // At home, or a day trip within your home region: you sleep in your own bed.
  if (!home || home.id === cityId || home.regionId === city.regionId) return usd(0);
  // Your agency's base in the country puts you up.
  if (hasBase(state, city.countryId)) return usd(0);
  return usd(Math.round((HOTEL_BASE * state.countries[city.countryId]!.costIndex) / 5) * 5);
}

export function quoteTravel(state: GameState, to: CityId): TravelQuote {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  const a = state.cities[scout.location]!;
  const b = state.cities[to];
  if (!b) throw new ScoutingError('Unknown destination.');
  const band = bandBetween(state, a, b);
  const km = Math.round(distanceKm(a, b));
  if (band === 'here') return { from: a.id, to: b.id, band, distanceKm: 0, cost: usd(0), days: 0, nightly: nightlyCost(state, b.id), affordable: true };
  const spec = BANDS[band];
  const costIndex = (state.countries[a.countryId]!.costIndex + state.countries[b.countryId]!.costIndex) / 2;
  const cost = usd(Math.round((clamp(spec.min + km * spec.perKm, spec.min, spec.max) * costIndex) / 10) * 10);
  const days = spec.days + (band === 'continent' && km > 2500 ? 1 : 0);
  // A full-time scout's employer pays some or all of it.
  const youPay = cost * (1 - coverFor(state, 'travel', b.countryId));
  return { from: a.id, to: b.id, band, distanceKm: km, cost, days, nightly: nightlyCost(state, b.id), affordable: scout.money >= youPay };
}

/** Pays for the trip and moves you. The caller advances the travel days. */
export function startTravel(state: GameState, to: CityId): TravelQuote {
  const q = quoteTravel(state, to);
  if (q.band === 'here') throw new ScoutingError('You are already there.');
  // Going home is always possible, even into debt: being stranded in a hotel would only make things worse.
  if (!q.affordable && to !== state.scout!.homeCity)
    throw new ScoutingError(`This trip costs ${formatUSD(q.cost)} but you only have ${formatUSD(state.scout!.money)}.`);
  const dest = state.cities[to]!;
  // A trip to (or within) your employer's country is on the club.
  addLedger(state, { amount: usd(-q.cost), kind: 'travel', label: `Travel to ${dest.name}, ${state.countries[dest.countryId]!.name}` }, { countryId: dest.countryId });
  state.scout!.location = to;
  return q;
}

/** Nightly: a hotel bill for every night away from home. Merged into one ledger line per stay. */
export function chargeAccommodation(state: GameState) {
  const scout = state.scout;
  if (!scout || scout.location === scout.homeCity) return;
  const cost = nightlyCost(state, scout.location);
  if (cost <= 0) return;
  const city = state.cities[scout.location]!;
  addLedger(state, { amount: usd(-cost), kind: 'accommodation', label: `Hotel in ${city.name}` }, { merge: true });
}
