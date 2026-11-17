type Brand<T extends string> = string & { readonly __brand: T };

export type ContinentId = Brand<'Continent'>;
export type CountryId = Brand<'Country'>;
export type RegionId = Brand<'Region'>;
export type CityId = Brand<'City'>;
export type LeagueId = Brand<'League'>;
export type ClubId = Brand<'Club'>;
export type PlayerId = Brand<'Player'>;
export type StaffId = Brand<'Staff'>;

/** Sequential id factory, deterministic for a given generation order. */
export function idFactory<T extends string>(prefix: string) {
  let n = 0;
  return () => `${prefix}${(n++).toString(36)}` as T;
}

/** Next id from a persistent counter object (kept in GameState). */
export function nextId<T extends string>(counters: Record<string, number>, key: string, prefix: string): T {
  const n = counters[key] ?? 0;
  counters[key] = n + 1;
  return `${prefix}${n.toString(36)}` as T;
}
