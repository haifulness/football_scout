import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { Rng } from '../../src/engine/core/rng';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { GameState } from '../../src/engine/model/world-state';
import { HUNT_DAYS, huntAction, huntDestination, huntPlace, huntTick, onSearchResults, shieldedPlayers, spawnHunt } from '../../src/engine/systems/hunts';
import { prodigyVisible } from '../../src/engine/systems/knowledge';
import { createCareer } from '../../src/engine/systems/scouting';
import { migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;

function setup(seed = 1357, reputation = 0): GameState {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'normal' });
  w.scout!.money = usd(1_000_000);
  w.scout!.reputation = reputation;
  return w;
}

const hunt = (w: GameState) => spawnHunt(w, w.date, Rng.derive(w.seed, 'test-hunt'))!;

describe('wonderkid hunts', () => {
  it('start from a whisper about a real, unknown prodigy at a club, with a rival on the same trail', () => {
    const w = setup();
    const h = hunt(w);
    const place = huntPlace(w, h)!;
    expect(place.player.isProdigy).toBe(true);
    expect(prodigyVisible(w, place.player)).toBe(false);
    expect(w.pool[place.player.id]).toBeUndefined();
    // A new scout hears about talent on his own continent, below the elite.
    expect(w.countries[place.countryId]!.continentId).toBe(w.countries[eng]!.continentId);
    expect(place.club.tier).toBeGreaterThanOrEqual(3);
    expect(h.rivals).toHaveLength(1);
    expect(h.clues[0]!.text).toContain(w.countries[place.countryId]!.name);
    expect(w.news.some((n) => n.link === 'hunts' && n.forYou)).toBe(true);
  });

  it('narrow clue by clue (country → region → city → name), then the player is yours to work and rivals leave him alone', () => {
    const w = setup();
    const h = hunt(w);
    const place = huntPlace(w, h)!;
    const money = w.scout!.money;
    for (let i = 0; i < 60 && h.status === 'active'; i++) huntAction(w, h.id, 'calls');
    expect(h.status).toBe('found');
    expect(h.stage).toBe(3);
    expect(w.scout!.money).toBeLessThan(money);
    expect(h.clues.some((c) => c.text.includes(w.regions[place.regionId]!.name))).toBe(true);
    expect(w.pool[place.player.id]?.starred).toBe(true);
    expect(prodigyVisible(w, place.player)).toBe(true);
    expect(w.pendingDiscoveries).toContain(place.player.id);
    expect(shieldedPlayers(w, w.date)).toContain(place.player.id);
    expect(() => huntAction(w, h.id, 'calls')).toThrow();
  });

  it('asking around in person needs you in the area the trail points to, and works far more often', () => {
    const w = setup();
    const h = hunt(w);
    const place = huntPlace(w, h)!;
    w.scout!.location = Object.values(w.cities).find((c) => c.countryId !== place.countryId)!.id;
    expect(() => huntAction(w, h.id, 'visit')).toThrow(/You need to be in/);
    let visits = 0;
    while (h.status === 'active' && visits < 20) {
      w.scout!.location = huntDestination(w, h)!;
      huntAction(w, h.id, 'visit');
      visits++;
    }
    expect(h.status).toBe('found');
    expect(visits).toBeLessThan(10);
  });

  it('are lost when a rival gets there first: he then works the player for one of his clubs', () => {
    const w = setup();
    const h = hunt(w);
    h.rivals[0]!.progress = 0.999;
    huntTick(w, addDays(w.date, 1));
    expect(h.status).toBe('lost');
    const r = w.rivals.find((x) => x.id === h.winnerId)!;
    expect(r).toBeDefined();
    if (r.employment.mode === 'fulltime' || r.employment.clients.length) expect(r.pursuit?.playerId).toBe(h.playerId);
  });

  it('give you a free clue when a rival is half-way there, and go cold after six weeks', () => {
    const w = setup();
    const h = hunt(w);
    h.rivals[0]!.progress = 0.49;
    huntTick(w, addDays(w.date, 1));
    if (h.status === 'active') {
      expect(h.rivals[0]!.spotted).toBe(true);
      expect(h.stage).toBe(1);
      expect(h.clues.some((c) => c.tone === 'rival')).toBe(true);
    }
    const w2 = setup();
    const h2 = hunt(w2);
    h2.rivals = [];
    huntTick(w2, addDays(w2.date, HUNT_DAYS));
    expect(h2.status).toBe('cold');
  });

  it('end in your favour when a search turns him up', () => {
    const w = setup();
    const h = hunt(w);
    onSearchResults(w, [h.playerId]);
    expect(h.status).toBe('found');
  });

  it('point better-known scouts at rarer talents anywhere in the world', () => {
    const w = setup(1357, 60);
    const h = hunt(w);
    expect(h.rivals).toHaveLength(2);
    expect(huntPlace(w, h)!.club.tier).toBeGreaterThanOrEqual(1);
  });

  it('upgrade a v12 save with no hunts', () => {
    const w = setup();
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 12;
    delete old.hunts;
    delete old.counters.hunt;
    const s = migrate(old) as GameState;
    expect(s.hunts).toEqual([]);
    expect(s.counters.hunt).toBe(0);
  });
});
