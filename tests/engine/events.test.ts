import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { knowledgeLevel } from '../../src/engine/systems/knowledge';
import { advanceDays } from '../../src/engine/tick';

const eng = 'eng' as CountryId;

function career(): { e: Engine; w: GameState } {
  const e = new Engine();
  e.generate(11223);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const w = (e as unknown as { state: GameState }).state;
  w.scout!.money = usd(100_000);
  return { e, w };
}

describe('scouting events', () => {
  it("draws the season's calendar: a mix of kinds, in order, within the season", () => {
    const { e, w } = career();
    const events = e.getEvents();
    expect(events.length).toBe(8);
    expect(new Set(events.map((x) => x.kind))).toEqual(new Set(['youth-tournament', 'u20-championship', 'trial-day', 'showcase']));
    expect(events.every((x, i) => i === 0 || x.start >= events[i - 1]!.start)).toBe(true);
    expect(events.every((x) => x.start >= w.date && x.end < w.date + 366)).toBe(true);
    expect(e.getHome().upcoming.some((u) => u.key.startsWith('ev'))).toBe(true);
  });

  it('attending needs you there while it is on; then you know everyone there better, once', () => {
    const { e, w } = career();
    const ev = e.getEvents().find((x) => x.kind === 'youth-tournament')!;
    expect(ev.canAttend.ok).toBe(false);
    advanceDays(w, ev.start - w.date);
    expect(e.getEvents().find((x) => x.id === ev.id)!.status).toBe('on');
    expect(e.getHome().needsYou.some((i) => i.key === `ev-on${ev.id}`)).toBe(true);
    expect(() => e.attendEvent(ev.id)).toThrow(/need to be in/);

    w.scout!.location = ev.city.id;
    const money = w.scout!.money;
    const day = w.date;
    const r = e.attendEvent(ev.id);
    expect(w.date).toBe(day + ev.days);
    expect(w.ledger.some((l) => l.kind === 'ticket' && l.amount === -ev.ticket)).toBe(true);
    expect(w.scout!.money).toBeLessThan(money + 1);
    const seen = r.event.seen!;
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.every((p) => p.age <= 19)).toBe(true);
    expect(seen.every((p) => knowledgeLevel(w, w.players[p.id]!) >= 16)).toBe(true);
    expect(() => e.attendEvent(ev.id)).toThrow();

    e.addAllToPool(seen.map((p) => p.id));
    expect(seen.every((p) => w.pool[p.id])).toBe(true);
  }, 120_000);

  it('reminds you a fortnight before', () => {
    const { e, w } = career();
    const ev = e.getEvents()[1]!;
    advanceDays(w, ev.start - w.date - 14);
    expect(w.news.some((n) => n.title === `Coming up: ${ev.name}`)).toBe(true);
  }, 120_000);
});
