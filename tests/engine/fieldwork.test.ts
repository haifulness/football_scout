import { beforeAll, describe, expect, it } from 'vitest';
import type { CityId, CountryId, PlayerId, StaffId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { GameState } from '../../src/engine/model/world-state';
import { meet, meetingInfo, nextLiveOption } from '../../src/engine/systems/fieldwork';
import { knowledgeLevel } from '../../src/engine/systems/knowledge';
import { createCareer, ScoutingError } from '../../src/engine/systems/scouting';
import { quoteTravel, startTravel } from '../../src/engine/systems/travel';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;
const cityNamed = (w: GameState, name: string) => Object.values(w.cities).find((c) => c.name === name)!.id as CityId;
const stateOf = (e: Engine) => (e as unknown as { state: GameState }).state;

describe('travel', () => {
  let w: GameState;
  beforeAll(() => {
    w = generateWorld(555);
    createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'ex-pro', difficulty: 'easy' });
  }, 60_000);

  it('prices trips by distance band', () => {
    const home = w.cities[w.scout!.location]!;
    const sameRegion = w.regions[home.regionId]!.cityIds.find((c) => c !== home.id)! as CityId;
    const quotes = [sameRegion, cityNamed(w, 'Bristol'), cityNamed(w, 'Sevilla'), cityNamed(w, 'La Plata')].map((c) => quoteTravel(w, c));
    expect(quotes.map((q) => q.band)).toEqual(['region', 'country', 'continent', 'intercontinental']);
    for (let i = 1; i < quotes.length; i++) expect(quotes[i]!.cost).toBeGreaterThan(quotes[i - 1]!.cost);
    expect(quotes[3]!.days).toBeGreaterThan(quotes[0]!.days);
    expect(quotes[0]!.cost).toBeGreaterThanOrEqual(50);
    expect(quotes[3]!.cost).toBeLessThanOrEqual(4000 * 1.5);
  });

  it('moves you, charges you, and bills a hotel every night away from home', () => {
    const money = w.scout!.money;
    const dest = cityNamed(w, 'Sevilla');
    const q = startTravel(w, dest);
    expect(w.scout!.location).toBe(dest);
    expect(w.scout!.money).toBe(money - q.cost);
    const before = w.scout!.money;
    advanceDays(w, 5);
    expect(before - w.scout!.money).toBe(q.nightly * 5);
    expect(w.ledger.filter((l) => l.kind === 'accommodation').length).toBe(1); // merged into one line
    startTravel(w, w.scout!.homeCity);
    const atHome = w.scout!.money;
    advanceDays(w, 3);
    expect(w.scout!.money).toBe(atHome);
  });

  it('refuses trips you cannot afford', () => {
    const rich = w.scout!.money;
    w.scout!.money = 10 as typeof rich;
    expect(() => startTravel(w, cityNamed(w, 'Sevilla'))).toThrow(ScoutingError);
    w.scout!.money = rich;
  });
});

describe('live scouting', () => {
  it('needs you at the venue, takes you to match day, and sees past the video cap', () => {
    const e = new Engine();
    e.generate(777);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'ex-pro', difficulty: 'easy' });
    const s = stateOf(e);
    const p = Object.values(s.players).find((x) => x.clubId && s.clubs[x.clubId]!.countryId === 'esp' && s.clubs[x.clubId]!.tier >= 3)!;
    advanceDays(s, 30); // into the season
    const opt = nextLiveOption(s, p)!;
    expect(opt).not.toBeNull();
    expect(() => e.scoutLive(p.id)).toThrow(/Travel there first/);
    e.travel(opt.venue);
    const fresh = nextLiveOption(s, p)!;
    const { result } = e.scoutLive(p.id);
    expect(s.date).toBe(fresh.fixture.date);
    expect(result.after).toBeGreaterThan(result.before);
    expect(result.others).toBeGreaterThan(15);
    if (result.played) {
      // With repeated live viewing you can get past what footage allows.
      let guard = 0;
      while (knowledgeLevel(s, p) <= 60 && guard++ < 6) {
        const next = nextLiveOption(s, p);
        if (!next) break;
        if (s.scout!.location !== next.venue) e.travel(next.venue);
        e.scoutLive(p.id);
      }
      expect(knowledgeLevel(s, p)).toBeGreaterThan(60);
    }
  }, 60_000);
});

describe('meetings', () => {
  let w: GameState;
  beforeAll(() => {
    w = generateWorld(888);
    createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  }, 60_000);

  it('keeps unknown scouts away from elite coaches', () => {
    const elite = Object.values(w.clubs).find((c) => c.tier === 1 && c.countryId === eng)!;
    const info = meetingInfo(w, { kind: 'official', id: elite.headCoachId });
    expect(info.allowed).toBe(false);
    startTravel(w, elite.cityId);
    expect(() => meet(w, { kind: 'official', id: elite.headCoachId })).toThrow(/standing/);
  });

  it('builds relationships with diminishing returns, harder at bigger clubs', () => {
    const small = Object.values(w.clubs).find((c) => c.tier === 5 && c.countryId === eng)!;
    const mid = Object.values(w.clubs).find((c) => c.tier === 3 && c.countryId === eng)!;
    const coach = small.headCoachId as StaffId;
    expect(() => meet(w, { kind: 'official', id: coach })).toThrow(/need to be in/);
    startTravel(w, small.cityId);
    const gains: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = meet(w, { kind: 'official', id: coach });
      gains.push(r.after - r.before);
      advanceDays(w, 15); // avoid the repeat-meeting penalty
    }
    expect(w.scout!.relationships[coach]).toBeGreaterThan(30);
    expect(gains.at(-1)!).toBeLessThan(gains[0]!);

    startTravel(w, mid.cityId);
    const midGain = meet(w, { kind: 'official', id: mid.headCoachId });
    const smallFirst = gains[0]!;
    // Allow for meeting randomness: a tier-3 coach should rarely give more than a tier-5 one.
    expect(midGain.after - midGain.before).toBeLessThanOrEqual(smallFirst + 3);
  });

  it('meeting a player builds rapport and tells you about him', () => {
    const club = Object.values(w.clubs).find((c) => c.tier === 4 && c.countryId === eng)!;
    const pid = club.squad[0]! as PlayerId;
    startTravel(w, club.cityId);
    const before = knowledgeLevel(w, w.players[pid]!);
    const r = meet(w, { kind: 'player', id: pid });
    expect(r.after).toBeGreaterThan(0);
    expect(w.scout!.rapport[pid]).toBe(r.after);
    expect(knowledgeLevel(w, w.players[pid]!)).toBeGreaterThan(before);
  });
});

describe('save migration', () => {
  it('upgrades a v2 save: home is where you are, no relationships yet', () => {
    const w = generateWorld(9);
    createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 2;
    for (const k of ['homeCity', 'relationships', 'rapport', 'lastMet']) delete old.scout[k];
    const up = migrate(old);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.scout!.homeCity).toBe(up.scout!.location);
    expect(up.scout!.relationships).toEqual({});
  }, 30_000);
});
