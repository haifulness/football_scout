import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Player } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import { AGEING_DAYS, STALE_DAYS, VIDEO_KNOWLEDGE_CAP, fog, freshness, learn, publicLevel, seenOn, staleTick } from '../../src/engine/systems/knowledge';
import { executeTransfer } from '../../src/engine/systems/transfers';
import { usd } from '../../src/engine/core/money';
import { toParts } from '../../src/engine/core/calendar';
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

/** The next Monday on or after today (when the weekly check runs). */
const monday = (w: GameState) => {
  let d = w.date;
  while (toParts(d).weekday !== 1) d = (d + 1) as typeof d;
  w.date = d;
  return d;
};

describe('events that make your read stale', () => {
  const inPool = (w: GameState, p: Player) => {
    w.pool[p.id] = { addedOn: w.date, source: 'manual', starred: false };
    learn(w, p, 60, 80, w.date);
  };

  it('a move marks it stale, with one inbox note', () => {
    const { w, p } = setup();
    inPool(w, p);
    const buyer = Object.values(w.clubs).find((c) => c.id !== p.clubId && c.tier === 4)!;
    executeTransfer(w, p, buyer, usd(10_000), usd(1_000), w.date);
    staleTick(w, monday(w));
    expect(w.knowledge[p.id]!.stale).toMatch(new RegExp(`moved to ${buyer.name}`));
    expect(freshness(w, p)).toBe('stale');
    staleTick(w, monday(w));
    expect(w.news.filter((n) => n.title.includes('is out of date')).length).toBe(1);
  });

  it('a long injury, a big birthday, or a jump in form also do; players outside the pool are left alone', () => {
    const injured = setup();
    inPool(injured.w, injured.p);
    injured.p.injury = { until: (injured.w.date + 60) as typeof injured.w.date, description: 'Knee' };
    staleTick(injured.w, monday(injured.w));
    expect(injured.w.knowledge[injured.p.id]!.stale).toMatch(/out injured/);

    const young = setup();
    young.p.birthDate = (young.w.date - 20 * 365 + 3) as typeof young.w.date; // turns 20 in a few days
    inPool(young.w, young.p);
    young.w.date = (young.w.date + 10) as typeof young.w.date;
    staleTick(young.w, monday(young.w));
    expect(young.w.knowledge[young.p.id]!.stale).toMatch(/turned 20/);

    const form = setup();
    Object.assign(form.p.stats, { apps: 6, ratingSum: 6 * 6.5 });
    inPool(form.w, form.p);
    Object.assign(form.p.stats, { apps: 10, ratingSum: 10 * 7.6 });
    staleTick(form.w, monday(form.w));
    expect(form.w.knowledge[form.p.id]!.stale).toMatch(/form has jumped/);

    const outside = setup();
    learn(outside.w, outside.p, 60, 80, outside.w.date); // known, but not in the pool
    outside.p.injury = { until: (outside.w.date + 60) as typeof outside.w.date, description: 'Knee' };
    staleTick(outside.w, monday(outside.w));
    expect(outside.w.knowledge[outside.p.id]!.stale).toBeUndefined();
  });
});

describe('video', () => {
  it('once footage has told you all it can, catches an old read up for a small fee, without new knowledge or time', async () => {
    const { videoCheck, watchVideo } = await import('../../src/engine/systems/scouting');
    const { w, p } = setup();
    w.scout!.money = usd(10_000);
    learn(w, p, 60, 80, w.date);
    expect(w.knowledge[p.id]!.level).toBeGreaterThanOrEqual(VIDEO_KNOWLEDGE_CAP);
    expect(videoCheck(w, p).ok).toBe(false); // a fresh read: nothing for footage to add
    w.date = (w.date + STALE_DAYS) as typeof w.date;
    w.knowledge[p.id]!.stale = 'he moved club';
    grow(p, 4);
    const now = ovrAt(p, p.naturalPosition);
    expect(fog(w, p).ovr[1]).toBeLessThan(now);

    const level = w.knowledge[p.id]!.level;
    const money = w.scout!.money;
    const day = w.date;
    const r = watchVideo(w, p.id);
    expect(r.catchUp).toBe(true);
    expect(w.scout!.money).toBe(money - r.cost);
    expect(w.date).toBe(day);
    expect(w.knowledge[p.id]!.level).toBe(level);
    expect(freshness(w, p)).toBe('fresh');
    const fresh = fog(w, p).ovr;
    expect(fresh[0]).toBeLessThanOrEqual(now);
    expect(fresh[1]).toBeGreaterThanOrEqual(now);
    expect(videoCheck(w, p).ok).toBe(false);
  });

  it('below the cap, adds knowledge and brings the read up to date', async () => {
    const { watchVideo } = await import('../../src/engine/systems/scouting');
    const { w, p } = setup();
    w.scout!.money = usd(10_000);
    learn(w, p, 25, 80, w.date);
    w.date = (w.date + STALE_DAYS) as typeof w.date;
    w.knowledge[p.id]!.stale = 'he moved club';
    const level = w.knowledge[p.id]!.level;
    const r = watchVideo(w, p.id);
    expect(r.catchUp).toBe(false);
    expect(w.knowledge[p.id]!.level).toBeGreaterThan(level);
    expect(freshness(w, p)).toBe('fresh');
  });
});
