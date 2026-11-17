import { beforeAll, describe, expect, it } from 'vitest';
import { ageOn } from '../../src/engine/core/calendar';
import type { CountryId, PlayerId } from '../../src/engine/core/ids';
import { generateWorld } from '../../src/engine/generation/world-generator';
import { ATTRIBUTES } from '../../src/engine/model/player';
import type { SearchFilters } from '../../src/engine/model/scout';
import type { GameState } from '../../src/engine/model/world-state';
import { VIDEO_KNOWLEDGE_CAP, fog, knowledgeLevel, learn, publicLevel } from '../../src/engine/systems/knowledge';
import { ovrAt } from '../../src/engine/systems/ratings';
import {
  STARTING_MONEY,
  ScoutingError,
  completeSearch,
  createCareer,
  estimateSearch,
  searchReach,
  startSearch,
  watchVideo,
} from '../../src/engine/systems/scouting';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;
const baseFilters = (over: Partial<SearchFilters> = {}): SearchFilters => ({
  location: { scope: 'country', id: eng },
  positions: [],
  attributes: [],
  includeFreeAgents: true,
  ...over,
});

let world: GameState;
beforeAll(() => {
  world = generateWorld(31337);
  createCareer(world, { name: 'Alex Morgan', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
}, 60_000);

describe('career', () => {
  it('starts with the difficulty’s savings, background skills and home-market knowledge', () => {
    const s = world.scout!;
    expect(s.money).toBe(STARTING_MONEY.easy);
    expect(s.skills.dataAnalysis).toBe(15);
    expect(s.regionKnowledge[eng]).toBe(60);
    expect(s.regionKnowledge['esp' as CountryId]).toBe(15); // same continent
    expect(s.regionKnowledge['bra' as CountryId]).toBe(0);
    expect(world.ledger[0]!.kind).toBe('starting-funds');
  });
});

describe('fog of war', () => {
  it('always shows ranges that contain the truth', () => {
    for (const p of Object.values(world.players).slice(0, 4000)) {
      const f = fog(world, p);
      for (const k of ATTRIBUTES) {
        const [lo, hi] = f.attributes[k];
        expect(lo).toBeLessThanOrEqual(p.attributes[k]);
        expect(hi).toBeGreaterThanOrEqual(p.attributes[k]);
      }
      const ovr = ovrAt(p, p.naturalPosition);
      expect(f.ovr[0]).toBeLessThanOrEqual(ovr);
      expect(f.ovr[1]).toBeGreaterThanOrEqual(ovr);
    }
  });

  it('makes stars at big clubs better known than semi-pros', () => {
    const byTier = (t: number) =>
      Object.values(world.players).find((p) => p.clubId && world.clubs[p.clubId]!.tier === t && world.clubs[p.clubId]!.countryId === 'bra')!;
    expect(publicLevel(world, byTier(2))).toBeGreaterThan(publicLevel(world, byTier(4)));
  });

  it('narrows ranges and reveals potential as you learn more', () => {
    const p = Object.values(world.players).find((x) => x.clubId && world.clubs[x.clubId]!.countryId === 'bra' && !world.knowledge[x.id])!;
    const before = fog(world, p);
    const width = (f: typeof before) => f.ovr[1] - f.ovr[0];
    expect(before.potential).toBeUndefined();
    learn(world, p, 60, 100, world.date);
    const after = fog(world, p);
    expect(width(after)).toBeLessThan(width(before));
    expect(after.potential).toBeDefined();
    expect(after.potential![0]).toBeLessThanOrEqual(p.hidden.potential);
    expect(after.potential![1]).toBeGreaterThanOrEqual(p.hidden.potential);
    learn(world, p, 100, 100, world.date);
    const full = fog(world, p);
    expect(full.ovr[0]).toBe(full.ovr[1]);
  });
});

describe('search', () => {
  it('costs more for wider areas and more filters, and is cheaper in markets you know', () => {
    const country = estimateSearch(world, baseFilters());
    const world_ = estimateSearch(world, baseFilters({ location: { scope: 'world' } }));
    const filtered = estimateSearch(world, baseFilters({ positions: ['ST', 'LW'], attributes: [{ attribute: 'pace', min: 14 }] }));
    expect(world_.cost).toBeGreaterThan(country.cost);
    expect(world_.days).toBeGreaterThan(country.days);
    expect(filtered.cost).toBeGreaterThan(country.cost);
    expect(filtered.days).toBeGreaterThan(country.days);
    const unknownMarket = estimateSearch(world, baseFilters({ location: { scope: 'country', id: 'arg' as CountryId } }));
    expect(unknownMarket.days).toBeGreaterThan(country.days);
    for (const e of [country, world_, filtered]) {
      expect(Number.isInteger(e.cost)).toBe(true);
      expect(e.cost).toBeGreaterThanOrEqual(100);
      expect(e.cost).toBeLessThan(5000);
    }
  });

  it('charges you, takes time, and returns players matching the hard filters', () => {
    const f = baseFilters({ positions: ['CB'], age: [20, 26], value: [100_000, 20_000_000], attributes: [{ attribute: 'tackling', min: 13 }] });
    const est = estimateSearch(world, f);
    const money = world.scout!.money;
    const date = world.date;
    const record = startSearch(world, f);
    expect(world.scout!.money).toBe(money - est.cost);
    advanceDays(world, record.days);
    completeSearch(world, record);
    expect(world.date - date).toBe(est.days);
    expect(record.results.length).toBeGreaterThan(0);
    expect(record.results.length).toBeLessThanOrEqual(30);
    let mostlyTacklers = 0;
    for (const id of record.results) {
      const p = world.players[id]!;
      const age = ageOn(p.birthDate, world.date);
      expect(world.clubs[p.clubId!]?.countryId ?? p.nationality).toBe(eng);
      expect(p.positions.CB ?? 0).toBeGreaterThanOrEqual(0.75);
      expect(age).toBeGreaterThanOrEqual(20);
      expect(age).toBeLessThanOrEqual(26);
      expect(p.value).toBeGreaterThanOrEqual(100_000);
      if (p.attributes.tackling >= 12) mostlyTacklers++;
      expect(world.pool[id]).toBeDefined();
      expect(knowledgeLevel(world, p)).toBeGreaterThan(publicLevel(world, p));
    }
    // Ability filters are judged, so a few near-misses slip through, but not many.
    expect(mostlyTacklers / record.results.length).toBeGreaterThan(0.8);
  }, 60_000);

  it('only reaches as high as your reputation, network and market knowledge allow', () => {
    const byTier = (tier: number) =>
      Object.values(world.players).find((p) => p.clubId && world.clubs[p.clubId]!.tier === tier && world.clubs[p.clubId]!.countryId === eng)!;
    const rep = world.scout!.reputation;
    const low = [5, 4, 3, 2, 1].map((t) => searchReach(world, byTier(t)));
    for (let i = 1; i < low.length; i++) expect(low[i]!).toBeLessThanOrEqual(low[i - 1]!);
    expect(low[4]!).toBeLessThan(0.1); // stars rarely come through a new scout's contacts
    world.scout!.reputation = 90;
    expect(searchReach(world, byTier(1))).toBeGreaterThan(low[4]! * 5);
    world.scout!.reputation = rep;
  });

  it('per-position rating floors: each candidate must beat the bar where he would play', () => {
    world.scout!.money = 1_000_000 as never;
    const floors = { CB: 60, ST: 50 };
    const f = baseFilters({ positions: ['CB', 'ST'], ratingFloors: floors });
    const record = startSearch(world, f);
    advanceDays(world, record.days);
    completeSearch(world, record);
    expect(record.label).toContain('CB 60+');
    expect(record.results.length).toBeGreaterThan(0);
    let clear = 0;
    for (const id of record.results) {
      const p = world.players[id]!;
      const best = Math.max(...(['CB', 'ST'] as const).filter((x) => (p.positions[x] ?? 0) >= 0.75).map((x) => ovrAt(p, x) - floors[x]));
      if (best >= -4) clear++; // judged by your network: a few near misses
    }
    expect(clear / record.results.length).toBeGreaterThan(0.8);
  }, 60_000);

  it('filters by weekly wage exactly (a public fact)', () => {
    world.scout!.money = 1_000_000 as never;
    const f = baseFilters({ positions: ['CM'], wage: [500, 3_000], includeFreeAgents: false });
    const record = startSearch(world, f);
    advanceDays(world, record.days);
    completeSearch(world, record);
    expect(record.label).toContain('wage');
    expect(record.results.length).toBeGreaterThan(0);
    for (const id of record.results) {
      const w = world.players[id]!.wage;
      expect(w).toBeGreaterThanOrEqual(500);
      expect(w).toBeLessThanOrEqual(3_000);
    }
  }, 60_000);

  it('filters by an overall rating range at the searched position (judged, so mostly)', () => {
    world.scout!.money = 1_000_000 as never;
    const f = baseFilters({ positions: ['CB'], rating: [55, 65] });
    const record = startSearch(world, f);
    advanceDays(world, record.days);
    completeSearch(world, record);
    expect(record.label).toContain('rating 55–65');
    expect(record.results.length).toBeGreaterThan(0);
    const near = record.results.filter((id) => {
      const r = ovrAt(world.players[id]!, 'CB');
      return r >= 50 && r <= 70;
    }).length;
    expect(near / record.results.length).toBeGreaterThan(0.8);
  }, 60_000);

  it('honours an upper bound on an ability filter (judged, so mostly)', () => {
    world.scout!.money = 1_000_000 as never;
    const f = baseFilters({ positions: ['ST'], attributes: [{ attribute: 'pace', min: 8, max: 12 }] });
    const record = startSearch(world, f);
    advanceDays(world, record.days);
    completeSearch(world, record);
    expect(record.label).toContain('Pace 8–12');
    expect(record.results.length).toBeGreaterThan(0);
    const inRange = record.results.filter((id) => {
      const pace = world.players[id]!.attributes.pace;
      return pace >= 7 && pace <= 13;
    }).length;
    expect(inRange / record.results.length).toBeGreaterThan(0.8);
  }, 60_000);

  it('refuses searches you cannot afford', () => {
    const rich = world.scout!.money;
    world.scout!.money = 50 as typeof rich;
    expect(() => startSearch(world, baseFilters({ location: { scope: 'world' } }))).toThrow(ScoutingError);
    world.scout!.money = rich;
  });
});

describe('video scouting', () => {
  it('raises knowledge, costs money, and stops at the video cap', () => {
    const p = Object.values(world.players).find((x) => x.clubId && world.clubs[x.clubId]!.countryId === 'ger' && !world.knowledge[x.id])!;
    const money = world.scout!.money;
    const r = watchVideo(world, p.id as PlayerId);
    expect(r.after).toBeGreaterThan(r.before);
    expect(world.scout!.money).toBe(money - r.cost);
    while (knowledgeLevel(world, p) < VIDEO_KNOWLEDGE_CAP) watchVideo(world, p.id);
    expect(knowledgeLevel(world, p)).toBe(VIDEO_KNOWLEDGE_CAP);
    expect(() => watchVideo(world, p.id)).toThrow(/see him live/);
  });
});

describe('save migration', () => {
  it('upgrades a pre-scouting save and leaves the career to be set up', () => {
    const old = JSON.parse(JSON.stringify(generateWorld(9)));
    old.schemaVersion = 1;
    for (const k of ['knowledge', 'pool', 'searches', 'ledger', 'scout']) delete old[k];
    delete old.counters.search;
    const upgraded = migrate(old);
    expect(upgraded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(upgraded.scout).toBeUndefined();
    expect(upgraded.pool).toEqual({});
    expect(upgraded.counters.search).toBe(0);
  }, 30_000);
});
