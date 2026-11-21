import { describe, expect, it } from 'vitest';
import type { CountryId, PlayerId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { clubTrust } from '../../src/engine/systems/employment';
import { advanceDays } from '../../src/engine/tick';

const eng = 'eng' as CountryId;

function career(): { e: Engine; w: GameState; clubId: string } {
  const e = new Engine();
  e.generate(11223);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const w = (e as unknown as { state: GameState }).state;
  w.scout!.money = usd(100_000);
  const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
  if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
  // A pool with young and established players elsewhere, so every kind can be drawn.
  for (const p of Object.values(w.players).filter((x) => x.clubId && x.clubId !== club.id && x.clubId.length > 0).slice(0, 40))
    w.pool[p.id as PlayerId] = { addedOn: w.date, source: 'manual', starred: false };
  return { e, w, clubId: club.id };
}

/** Advance until a dilemma is waiting (they come about monthly). */
function waitForDilemma(e: Engine, w: GameState) {
  for (let i = 0; i < 20 && !e.getDilemmas().some((d) => d.daysLeft !== undefined); i++) advanceDays(w, 10);
  return e.getDilemmas().find((d) => d.daysLeft !== undefined)!;
}

describe('dilemmas', () => {
  it('arrive about monthly, built from your career, with an inbox note', () => {
    const { e, w } = career();
    const d = waitForDilemma(e, w);
    expect(d).toBeDefined();
    expect(d.choices.length).toBeGreaterThanOrEqual(2);
    expect(w.news.some((n) => n.title.startsWith('A choice to make'))).toBe(true);
    // Only one open at a time.
    advanceDays(w, 1);
    expect(e.getDilemmas().filter((x) => x.daysLeft !== undefined).length).toBeLessThanOrEqual(1);
  }, 180_000);

  it('an answer applies once and moves integrity, which moves club trust', () => {
    const { e, w, clubId } = career();
    const d = waitForDilemma(e, w);
    const trustBefore = clubTrust(w, clubId as never);
    const integrityBefore = w.scout!.integrity ?? 50;
    // The last option is always the straight one.
    const honest = d.choices.at(-1)!.key;
    const r = e.resolveDilemma(d.id, honest);
    expect(r.outcome.length).toBeGreaterThan(0);
    expect(w.scout!.integrity!).toBeGreaterThan(integrityBefore);
    expect(() => e.resolveDilemma(d.id, honest)).toThrow();
    // Integrity alone, all else equal: higher integrity, higher trust.
    w.scout!.integrity = 100;
    const high = clubTrust(w, clubId as never);
    w.scout!.integrity = 0;
    const low = clubTrust(w, clubId as never);
    expect(high).toBeGreaterThan(low);
    expect(trustBefore).toBeGreaterThanOrEqual(0);
  }, 180_000);

  it('lapse without an answer, with no effect', () => {
    const { e, w } = career();
    const d = waitForDilemma(e, w);
    const integrity = w.scout!.integrity ?? 50;
    advanceDays(w, (d.daysLeft ?? 0) + 1);
    expect(w.dilemmas!.find((x) => x.id === d.id)!.lapsed).toBe(true);
    expect(w.scout!.integrity ?? 50).toBe(integrity);
    // No money changed hands.
    expect(w.ledger.some((l) => l.kind === 'award' && /agent|family/.test(l.label))).toBe(false);
  }, 180_000);
});
