import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/engine/generation/world-generator';
import { ageOn } from '../../src/engine/core/calendar';
import { BLOCKED_CLUB_NAMES, BLOCKED_PLAYER_NAMES } from '../../src/engine/data/names';
import { TIER_BANDS } from '../../src/engine/systems/economy';
import { ovrAt } from '../../src/engine/systems/ratings';
import { bestXI } from '../../src/engine/systems/squad-needs';
import { FORMATIONS } from '../../src/engine/data/formations';
import { ATTRIBUTES } from '../../src/engine/model/player';
import type { ClubTier } from '../../src/engine/model/club';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const world = generateWorld(12345);
const clubs = Object.values(world.clubs);
const players = Object.values(world.players);

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const again = generateWorld(12345);
    expect(JSON.stringify(again)).toBe(JSON.stringify(world));
  });

  it('builds a world of the planned size', () => {
    expect(Object.keys(world.countries).length).toBe(42);
    expect(clubs.length).toBeGreaterThan(1200);
    expect(players.length).toBeGreaterThan(30_000);
    expect(world.freeAgents.length).toBeGreaterThan(400);
  });

  it('gives every club a full squad and a Head Coach', () => {
    for (const c of clubs) {
      expect(c.squad.length).toBeGreaterThanOrEqual(25);
      expect(world.officials[c.headCoachId]?.role).toBe('coach');
      expect(
        bestXI(
          c.formation,
          c.squad.map((id) => world.players[id]!),
        ).every((s) => s.playerId),
      ).toBe(true);
    }
  });

  it('never generates real or duplicate club names within a country', () => {
    const seen = new Set<string>();
    for (const c of clubs) {
      expect(BLOCKED_CLUB_NAMES.has(c.name)).toBe(false);
      const key = `${c.countryId}:${c.name}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('never recreates famous real player names', () => {
    for (const p of players) expect(BLOCKED_PLAYER_NAMES.has(`${p.firstName} ${p.lastName}`)).toBe(false);
  });

  it('keeps attributes in 1–20 and money as whole dollars', () => {
    for (const p of players.slice(0, 5000)) {
      for (const k of ATTRIBUTES) {
        expect(p.attributes[k]).toBeGreaterThanOrEqual(1);
        expect(p.attributes[k]).toBeLessThanOrEqual(20);
      }
      expect(Number.isInteger(p.value)).toBe(true);
      expect(Number.isInteger(p.wage)).toBe(true);
      expect(p.hidden.potential).toBeGreaterThanOrEqual(ovrAt(p, p.naturalPosition) - 1);
    }
  });

  it('scales squad strength and wages by club tier', () => {
    const avgXI = (tier: ClubTier) => {
      const xs = clubs
        .filter((c) => c.tier === tier)
        .map((c) => {
          const xi = bestXI(
            c.formation,
            c.squad.map((id) => world.players[id]!),
          );
          return xi.reduce((s, x) => s + x.ovr, 0) / FORMATIONS[c.formation].length;
        });
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    const tiers: ClubTier[] = [1, 2, 3, 4, 5];
    const avgs = tiers.map(avgXI);
    for (let i = 1; i < avgs.length; i++) expect(avgs[i - 1]!).toBeGreaterThan(avgs[i]!);
    for (const t of tiers) {
      const band = TIER_BANDS[t].squadOvr;
      expect(avgs[t - 1]!).toBeGreaterThan(band.min - 6);
      expect(avgs[t - 1]!).toBeLessThan(band.max + 6);
    }
  });

  it('prices players inside realistic bands', () => {
    const topValues = clubs.filter((c) => c.tier === 1).flatMap((c) => c.squad.map((id) => world.players[id]!.value));
    const lowValues = clubs.filter((c) => c.tier === 5).flatMap((c) => c.squad.map((id) => world.players[id]!.value));
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    expect(median(topValues)).toBeGreaterThan(5_000_000);
    expect(median(topValues)).toBeLessThan(80_000_000);
    expect(median(lowValues)).toBeLessThan(60_000);
  });

  it('gives every position a market: each one is playable (75%+) by a decent share of players', () => {
    const can = (pos: string) => players.filter((p) => (p.positions[pos as keyof typeof p.positions] ?? 0) >= 0.75).length;
    const outfield = ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];
    const counts = outfield.map(can);
    // Formations use two centre-backs for every winger, so some gap is natural; but the thinnest position
    // keeps at least a quarter of the deepest (it used to be under a fifth).
    expect(Math.min(...counts)).toBeGreaterThan(Math.max(...counts) / 4);
  });

  it('produces a few prodigies among youngsters', () => {
    const prodigies = players.filter((p) => p.isProdigy);
    expect(prodigies.length).toBeGreaterThan(5);
    for (const p of prodigies) expect(ageOn(p.birthDate, world.date)).toBeLessThanOrEqual(19);
  });
});

describe('clubs without presidents', () => {
  it('upgrades a v10 save: presidents and their relationships go, past pitches become pitches to the coach', () => {
    const w = generateWorld(9);
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 10;
    const club = Object.values(old.clubs as Record<string, Record<string, unknown>>)[0]!;
    club.presidentId = 'st-legacy';
    old.officials['st-legacy'] = { ...old.officials[club.headCoachId as string], id: 'st-legacy', role: 'president' };
    old.scout = { relationships: { 'st-legacy': 40, [club.headCoachId as string]: 10 } };
    old.deals = [{ id: 1, pitchedTo: ['coach', 'president'], signOff: { by: 'president', date: 1, bypassed: 'coach' } }];
    const up = migrate(old) as unknown as Record<string, any>;
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.clubs[club.id as string].presidentId).toBeUndefined();
    expect(up.officials['st-legacy']).toBeUndefined();
    expect(up.scout.relationships['st-legacy']).toBeUndefined();
    expect(up.deals[0].pitchedTo).toEqual(['coach']);
    expect(up.deals[0].signOff).toEqual({ by: 'coach', date: 1 });
  }, 30_000);
});
