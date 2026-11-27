import { describe, expect, it } from 'vitest';
import { addDays, makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Club } from '../../src/engine/model/club';
import type { ContractTerms } from '../../src/engine/model/scout';
import type { GameState } from '../../src/engine/model/world-state';
import { EXTENDED_SALARY, TERMS, acceptOffer, bonusMult, employmentTick } from '../../src/engine/systems/employment';
import { SMEAR_DAYS_EMPLOYER, smearPenalty } from '../../src/engine/systems/nemesis';
import { EMPLOYER_PATIENCE_NOES, PATIENCE_NOES, patienceNoes } from '../../src/engine/systems/pitch-pressure';
import { createCareer } from '../../src/engine/systems/scouting';

const eng = 'eng' as CountryId;
function setup(): GameState {
  const w = generateWorld(8642);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  w.scout!.money = usd(0);
  return w;
}
const englishClubs = (w: GameState, tier: number) => Object.values(w.clubs).filter((c) => c.tier === tier && c.countryId === eng);
const OFFER = 100_000;
function hire(w: GameState, club: Club, terms?: ContractTerms) {
  w.offers.push({ id: 99, kind: 'fulltime', clubId: club.id, title: 'Scout', salary: usd(OFFER), seasons: 2, createdOn: w.date, expiresOn: (w.date + 21) as never });
  acceptOffer(w, 99, terms);
  return w.scout!.employment as Extract<NonNullable<GameState['scout']>['employment'], { mode: 'fulltime' }>;
}

describe('job security', () => {
  it("doubles the coach's patience at your employer, not elsewhere", () => {
    const w = setup();
    const [employer, other] = englishClubs(w, 4);
    hire(w, employer!);
    expect(patienceNoes(w, employer!.id)).toBe(EMPLOYER_PATIENCE_NOES);
    expect(patienceNoes(w, other!.id)).toBe(PATIENCE_NOES);
  });

  it('lets a rumour about you at your employer fade after two months', () => {
    const w = setup();
    const [employer, other] = englishClubs(w, 4);
    hire(w, employer!);
    const date = addDays(w.date, -(SMEAR_DAYS_EMPLOYER + 1));
    w.scout!.smears = { [employer!.id]: { rivalId: 'x' as never, date, amount: 10 }, [other!.id]: { rivalId: 'x' as never, date, amount: 10 } } as never;
    expect(smearPenalty(w, employer!.id)).toBe(0);
    expect(smearPenalty(w, other!.id)).toBe(10);
  });
});

describe('contract terms', () => {
  it('trades salary for bonuses, and an extra season for a little pay', () => {
    const w = setup();
    const e = hire(w, englishClubs(w, 3)[0]!, { focus: 'bonuses', extended: true });
    expect(e.salary).toBe(Math.round((OFFER * TERMS.bonuses.salary * EXTENDED_SALARY) / 1000) * 1000);
    expect(bonusMult(w)).toBe(TERMS.bonuses.bonuses);
    expect(e.until).toBe(makeDate(2029, 6, 30));
  });

  it('pays out up to six months when they sack you, a year on an extended contract', () => {
    for (const extended of [false, true]) {
      const w = setup();
      const club = englishClubs(w, 3)[0]!;
      const e = hire(w, club, extended ? { focus: 'standard', extended } : undefined);
      // Months later, the coach has lost faith.
      const later = makeDate(2026, 11, 1);
      w.date = later;
      e.since = makeDate(2026, 7, 1);
      w.scout!.relationships[club.headCoachId] = 0;
      w.scout!.clubRecord[club.id] = { signings: 0, weakPitches: 10, missionsFailed: 5 };
      w.scout!.money = usd(0);
      employmentTick(w, later);
      expect(w.scout!.employment.mode).toBe('freelance');
      const days = extended ? 365 : 182;
      expect(w.scout!.money).toBe(Math.round((e.salary * days) / 365 / 100) * 100);
    }
  });
});
