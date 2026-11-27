import { describe, expect, it } from 'vitest';
import { makeDate, toParts } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Club } from '../../src/engine/model/club';
import type { GameState } from '../../src/engine/model/world-state';
import { assistantTick, fireAssistant, ownStaff } from '../../src/engine/systems/assistants';
import { ANALYST_KNOWLEDGE, acceptOffer, resign, salaryFor } from '../../src/engine/systems/employment';
import { createCareer } from '../../src/engine/systems/scouting';
import { startTravel } from '../../src/engine/systems/travel';
import { WINDOW_BONUS, windowPlanTick } from '../../src/engine/systems/window-plan';
import { advanceDays } from '../../src/engine/tick';

const eng = 'eng' as CountryId;
function setup(): GameState {
  const w = generateWorld(8642);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  w.scout!.money = usd(100_000);
  return w;
}
const englishClub = (w: GameState, tier: number) => Object.values(w.clubs).find((c) => c.tier === tier && c.countryId === eng)!;
function hire(w: GameState, club: Club) {
  w.offers.push({ id: 99, kind: 'fulltime', clubId: club.id, title: 'Scout', salary: salaryFor(club.tier, 20, 1), seasons: 2, createdOn: w.date, expiresOn: (w.date + 21) as never });
  acceptOffer(w, 99);
}

describe("the club's resources", () => {
  it('pays all your travel in its own country', () => {
    const w = setup();
    hire(w, englishClub(w, 3));
    const money = w.scout!.money;
    const away = Object.values(w.cities).find((c) => c.countryId === eng && c.id !== w.scout!.location)!;
    startTravel(w, away.id);
    expect(w.scout!.money).toBe(money);
  });

  it('gives you a junior scout the club pays, who stays behind when you leave', () => {
    const w = setup();
    hire(w, englishClub(w, 3));
    const junior = w.assistants.find((a) => a.clubPaid)!;
    expect(junior).toBeDefined();
    expect(ownStaff(w)).toHaveLength(0);
    expect(() => fireAssistant(w, junior.id)).toThrow(/works for the club/);
    // Monday: no wage line for him.
    let d = w.date;
    while (toParts(d).weekday !== 1) d++;
    w.date = d;
    assistantTick(w, d);
    expect(w.ledger.some((l) => l.kind === 'assistant')).toBe(false);
    resign(w);
    advanceDays(w, 29);
    expect(w.scout!.employment.mode).toBe('freelance');
    expect(w.assistants.some((a) => a.clubPaid)).toBe(false);
  }, 60_000);

  it("shares the analysts' first read on every player in your league", () => {
    const w = setup();
    const club = englishClub(w, 3);
    hire(w, club);
    const rival = w.clubs[w.leagues[club.leagueId]!.clubIds.find((id) => id !== club.id)!]!;
    for (const pid of rival.squad) expect(w.knowledge[pid]?.level ?? 0).toBeGreaterThanOrEqual(ANALYST_KNOWLEDGE);
  });

  it('sets a window plan and pays a bonus when it is all delivered', () => {
    const w = setup();
    const club = englishClub(w, 3);
    hire(w, club);
    windowPlanTick(w, w.date);
    const plan = w.windowPlan!;
    expect(plan.clubId).toBe(club.id);
    expect(plan.buys.length + plan.sells.length).toBeGreaterThan(0);
    for (const b of plan.buys) expect(w.missions.some((m) => m.clubId === club.id && m.position === b.position)).toBe(true);
    // Deliver it all, then let the window shut.
    for (const x of [...plan.buys, ...plan.sells]) x.done = true;
    const money = w.scout!.money;
    w.date = plan.closes;
    windowPlanTick(w, plan.closes);
    expect(plan.result).toBe('done');
    const salary = (w.scout!.employment as { salary: number }).salary;
    expect(w.scout!.money - money).toBe(Math.round((salary * WINDOW_BONUS) / 100) * 100);
  });

  it('pays nothing for a window plan left undone', () => {
    const w = setup();
    hire(w, englishClub(w, 3));
    windowPlanTick(w, w.date);
    const plan = w.windowPlan!;
    const money = w.scout!.money;
    w.date = plan.closes;
    windowPlanTick(w, plan.closes);
    expect(plan.result).toBe('missed');
    expect(w.scout!.money).toBe(money);
    expect(makeDate(2026, 9, 1)).toBe(plan.closes);
  });
});
