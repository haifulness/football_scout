import { describe, expect, it } from 'vitest';
import { makeDate, toParts } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { roundPrice, usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { GameState } from '../../src/engine/model/world-state';
import { closeDeadline, isDeadlineDay, passDeadlineHours } from '../../src/engine/systems/deadline';
import { pitchFee } from '../../src/engine/systems/deals';
import { createCareer } from '../../src/engine/systems/scouting';
import { offeredWage, transferFee } from '../../src/engine/systems/transfers';
import { advanceDays, advanceUntilEvent, UNTIL_EVENT_MAX_DAYS } from '../../src/engine/tick';
import { migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;

function setup(seed = 8642): GameState {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  w.scout!.money = usd(1_000_000);
  return w;
}

/** A deal the club has signed off, waiting on the player, due to settle long after the window. */
function openDeal(w: GameState) {
  const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
  const p = Object.values(w.players).find((x) => x.clubId && x.clubId !== club.id && w.clubs[x.clubId]!.tier === 4)!;
  const deal = {
    id: w.counters.deal++,
    playerId: p.id,
    clubId: club.id,
    sellingClubId: p.clubId,
    position: p.naturalPosition,
    stage: 'negotiating' as const,
    pitchedTo: ['coach' as const],
    prospect: false,
    openedOn: w.date,
    fee: transferFee(w, p),
    wage: offeredWage(w, p, club),
    log: [],
    resolvesOn: makeDate(2026, 12, 1),
  };
  w.deals.unshift(deal);
  return deal;
}

describe('deadline day', () => {
  it('falls on the last day of each window', () => {
    expect(isDeadlineDay(makeDate(2026, 8, 31))).toBe(true);
    expect(isDeadlineDay(makeDate(2027, 1, 31))).toBe(true);
    expect(isDeadlineDay(makeDate(2026, 8, 30))).toBe(false);
    expect(isDeadlineDay(makeDate(2026, 12, 31))).toBe(false);
  });

  it('stops the main clock the morning of 31 August, runs hour by hour, and settles every open deal by midnight', () => {
    const w = setup();
    advanceDays(w, 90, undefined, { stopAtDeadline: true });
    expect(w.date).toBe(makeDate(2026, 8, 30));
    expect(w.deadline).toMatchObject({ date: makeDate(2026, 8, 31), hour: 9 });

    const deal = openDeal(w);
    passDeadlineHours(w, 3);
    expect(w.deadline!.hour).toBe(12);
    expect(w.date).toBe(makeDate(2026, 8, 30)); // the calendar waits for midnight

    // Clubs pay more and are keener for players brought to them today.
    const p = w.players[deal.playerId]!;
    expect(pitchFee(w, p)).toBe(roundPrice(transferFee(w, p) * 1.1));

    closeDeadline(w);
    expect(w.deadline).toBeUndefined();
    expect(['completed', 'failed', 'hijacked', 'collapsed']).toContain(deal.stage);
    advanceDays(w, 1, undefined, { stopAtDeadline: true });
    expect(w.date).toBe(makeDate(2026, 8, 31)); // finishing it never starts it again
    expect(w.deadline).toBeUndefined();
    expect(pitchFee(w, p)).toBe(transferFee(w, p));
  });

  it('does not interrupt searches and trips (only the main time controls stop for it)', () => {
    const w = setup();
    advanceDays(w, 90);
    expect(w.deadline).toBeUndefined();
    expect(toParts(w.date).month).toBe(9);
  });
});

describe('advance until something happens', () => {
  it('stops at the first event that needs you, with a reason, and never runs past the limit', () => {
    const w = setup();
    const from = w.date;
    const r = advanceUntilEvent(w);
    expect(r.stoppedFor).toBeTruthy();
    expect(w.date - from).toBeGreaterThan(0);
    expect(w.date - from).toBeLessThanOrEqual(UNTIL_EVENT_MAX_DAYS);
  });

  it('stops for deadline day', () => {
    const w = setup();
    advanceDays(w, 55); // 25 August
    let r = advanceUntilEvent(w);
    for (let i = 0; i < 5 && !w.deadline; i++) r = advanceUntilEvent(w);
    expect(r.stoppedFor).toBe('Deadline day');
    expect(w.date).toBe(makeDate(2026, 8, 30));
  });
});

describe('season review', () => {
  it('is written at the summer rollover with money, placements, reputation and your rank among rival scouts', () => {
    const w = setup();
    expect(w.reviewBaseline?.season).toBe(2026);
    advanceDays(w, 366);
    expect(w.seasonReviews).toHaveLength(1);
    const r = w.seasonReviews[0]!;
    expect(r.season).toBe(2026);
    expect(w.pendingReview).toBe(2026);
    expect(r.reputation.start).toBeDefined();
    expect(r.rank?.of).toBe(w.rivals.length + 1);
    expect(r.expenses).toBeLessThanOrEqual(0);
    expect(w.reviewBaseline?.season).toBe(2027);
    expect(w.news.some((n) => n.kind === 'career' && n.title.includes('2026/27 season in review'))).toBe(true);
   }, 120_000);

  it('upgrades a v11 save with an empty review list', () => {
    const w = setup();
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 11;
    delete old.seasonReviews;
    const s = migrate(old) as GameState;
    expect(s.seasonReviews).toEqual([]);
  });
});
