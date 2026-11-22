import { describe, expect, it } from 'vitest';
import { addDays, makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Deal } from '../../src/engine/model/deal';
import type { Difficulty } from '../../src/engine/model/scout';
import type { GameState } from '../../src/engine/model/world-state';
import { clientYear, reviewClients } from '../../src/engine/systems/client-review';
import { TAX_RATE, payTax, taxFor, weeklyLiving } from '../../src/engine/systems/overheads';
import { bonusTaper } from '../../src/engine/systems/payouts';
import { addLedger } from '../../src/engine/systems/scouting';

const eng = 'eng' as CountryId;

function career(difficulty: Difficulty = 'normal'): GameState {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty });
  return (e as unknown as { state: GameState }).state;
}

describe('tax', () => {
  it('takes the difficulty’s share of profit, after work costs; living costs are not deductible', () => {
    const s = career('normal');
    const y = s.season.year;
    addLedger(s, { amount: usd(40_000), kind: 'signing-bonus', label: 't' });
    addLedger(s, { amount: usd(-10_000), kind: 'travel', label: 't' });
    addLedger(s, { amount: usd(-5_000), kind: 'living', label: 't' });
    expect(taxFor(s, y).profit).toBe(30_000);
    expect(taxFor(s, y).bill).toBe(30_000 * TAX_RATE.normal);
    const before = s.scout!.money;
    payTax(s, y, s.date);
    expect(s.scout!.money).toBe(before - 30_000 * TAX_RATE.normal);
  });

  it('a losing season owes nothing', () => {
    const s = career();
    addLedger(s, { amount: usd(-3_000), kind: 'search', label: 't' });
    expect(taxFor(s, s.season.year).bill).toBe(0);
  });
});

describe('living costs', () => {
  it('rise with your reputation and with difficulty', () => {
    const s = career('normal');
    s.scout!.reputation = 5;
    const start = weeklyLiving(s);
    s.scout!.reputation = 60;
    const famous = weeklyLiving(s);
    expect(famous).toBeGreaterThan(start * 8);
    s.scout!.difficulty = 'hard';
    expect(weeklyLiving(s)).toBeGreaterThan(famous);
  });
});

describe('match bonus taper', () => {
  it('is full in the first year at the club, then 60%, then 30%', () => {
    const d = makeDate(2026, 8, 1);
    expect(bonusTaper(d, addDays(d, 100))).toBe(1);
    expect(bonusTaper(d, addDays(d, 400))).toBe(0.6);
    expect(bonusTaper(d, addDays(d, 800))).toBe(0.3);
    expect(bonusTaper(d, addDays(d, 1500))).toBe(0.3);
  });
});

describe('client reviews', () => {
  const withClient = () => {
    const s = career('normal');
    const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
    if (s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(club.id);
    s.scout!.clientSince = { [club.id]: addDays(s.date, -300) };
    s.scout!.relationships[club.headCoachId] = 50;
    return { s, club };
  };
  const review = makeDate(2027, 7, 1);
  const signing = (s: GameState, clubId: string, n: number): Deal =>
    ({ id: 1000 + n, playerId: s.clubs[clubId as never]!.squad[0], clubId, stage: 'completed', completedOn: makeDate(2027, 1, 10), log: [] }) as unknown as Deal;

  it('a quiet year earns a warning; a second one ends the agreement', () => {
    const { s, club } = withClient();
    expect(clientYear(s, club.id, review).outlook).toBe('at-risk');
    reviewClients(s, review);
    expect(s.scout!.clientWarned).toContain(club.id);
    expect((s.scout!.employment as { clients: string[] }).clients).toContain(club.id);
    expect(s.scout!.relationships[club.headCoachId]).toBeLessThan(50);
    reviewClients(s, makeDate(2028, 7, 1));
    expect((s.scout!.employment as { clients: string[] }).clients).not.toContain(club.id);
  });

  it('a busy year delights them and lifts the warning', () => {
    const { s, club } = withClient();
    s.scout!.clientWarned = [club.id];
    s.deals.push(signing(s, club.id, 1), signing(s, club.id, 2), signing(s, club.id, 3));
    expect(clientYear(s, club.id, review).outlook).toBe('delighted');
    reviewClients(s, review);
    expect(s.scout!.clientWarned).not.toContain(club.id);
    expect(s.scout!.relationships[club.headCoachId]).toBeGreaterThan(50);
  });

  it('a client that took you on recently waits for next year', () => {
    const { s, club } = withClient();
    s.scout!.clientSince = { [club.id]: addDays(review, -30) };
    reviewClients(s, review);
    expect(s.scout!.clientWarned ?? []).not.toContain(club.id);
  });
});
