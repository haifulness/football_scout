import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Player } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import { AGEING_DAYS, STALE_DAYS, fog, freshness, learn, publicLevel, seenOn } from '../../src/engine/systems/knowledge';
import { ovrAt } from '../../src/engine/systems/ratings';
import { createCareer } from '../../src/engine/systems/scouting';

const eng = 'eng' as CountryId;

function setup(): { w: GameState; p: Player } {
  const w = generateWorld(4242);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  // An obscure player (low public visibility), so what you know is your own read.
  const p = Object.values(w.players).find((x) => x.clubId && w.clubs[x.clubId]!.tier === 5 && x.naturalPosition !== 'GK' && publicLevel(w, x) < 30)!;
  return { w, p };
}

/** He improves a lot while you aren't looking. */
const grow = (p: Player, by: number) => {
  for (const k of Object.keys(p.attributes) as (keyof Player['attributes'])[]) p.attributes[k] = Math.min(20, p.attributes[k] + by);
};

describe('your read is a snapshot', () => {
  it("keeps what you saw: if he improves while you aren't looking, your read doesn't follow him", () => {
    const { w, p } = setup();
    learn(w, p, 60, 80, w.date);
    const then = ovrAt(p, p.naturalPosition);
    const before = fog(w, p).ovr;
    expect(before[0]).toBeLessThanOrEqual(then);
    expect(before[1]).toBeGreaterThanOrEqual(then);
    expect(seenOn(w, p)).toBe(w.date);

    grow(p, 4);
    const now = ovrAt(p, p.naturalPosition);
    expect(now).toBeGreaterThan(then + 5);
    // Same read as before: still contains how he was, not how he is.
    expect(fog(w, p).ovr).toEqual(before);
    expect(fog(w, p).ovr[1]).toBeLessThan(now);

    // A fresh look catches up.
    learn(w, p, 5, 80, (w.date + 30) as typeof w.date);
    const fresh = fog(w, p).ovr;
    expect(fresh[0]).toBeLessThanOrEqual(now);
    expect(fresh[1]).toBeGreaterThanOrEqual(now);
  });

  it('public information is always current', () => {
    const { w, p } = setup();
    // No look of your own: what everyone can see follows him.
    grow(p, 4);
    const now = ovrAt(p, p.naturalPosition);
    const r = fog(w, p).ovr;
    expect(r[0]).toBeLessThanOrEqual(now);
    expect(r[1]).toBeGreaterThanOrEqual(now);
    expect(seenOn(w, p)).toBeUndefined();
  });

  it('older saves without a snapshot read him as he is', () => {
    const { w, p } = setup();
    learn(w, p, 60, 80, w.date);
    delete w.knowledge[p.id]!.seenAttrs;
    grow(p, 4);
    const now = ovrAt(p, p.naturalPosition);
    const r = fog(w, p).ovr;
    expect(r[0]).toBeLessThanOrEqual(now);
    expect(r[1]).toBeGreaterThanOrEqual(now);
  });
});

describe('how current your read is', () => {
  it('is fresh, then ageing after three months, stale after six, and fresh again when you look', () => {
    const { w, p } = setup();
    expect(freshness(w, p)).toBeUndefined();
    learn(w, p, 60, 80, w.date);
    const start = w.date;
    expect(freshness(w, p)).toBe('fresh');
    w.date = (start + AGEING_DAYS) as typeof w.date;
    expect(freshness(w, p)).toBe('ageing');
    w.date = (start + STALE_DAYS) as typeof w.date;
    expect(freshness(w, p)).toBe('stale');
    learn(w, p, 5, 80, w.date);
    expect(freshness(w, p)).toBe('fresh');
  });

  it('goes stale at once when something happens, until you look again', () => {
    const { w, p } = setup();
    learn(w, p, 60, 80, w.date);
    w.knowledge[p.id]!.stale = 'he moved club';
    expect(freshness(w, p)).toBe('stale');
    learn(w, p, 5, 80, w.date);
    expect(freshness(w, p)).toBe('fresh');
    expect(w.knowledge[p.id]!.stale).toBeUndefined();
  });
});
