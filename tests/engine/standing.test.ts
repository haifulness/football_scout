import { describe, expect, it } from 'vitest';
import type { CountryId, StaffId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { AGREEMENT_MIN_STANDING, clubTrust, proposeAgreement } from '../../src/engine/systems/employment';

const eng = 'eng' as CountryId;

describe('club standing', () => {
  it("is what a coach's card and a meeting with him show, one number with the club", () => {
    const e = new Engine();
    e.generate(11223);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
    const w = (e as unknown as { state: GameState }).state;
    w.scout!.money = usd(100_000);
    const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 5)!;
    w.scout!.location = club.cityId;

    const card = e.getClub(club.id).coach.meeting!;
    expect(card.standing).toBe(true);
    expect(card.level).toBe(clubTrust(w, club.id));

    const before = clubTrust(w, club.id);
    const r = e.meet({ kind: 'official', id: club.headCoachId as StaffId }).result;
    expect(r.before).toBe(before);
    expect(r.after).toBe(clubTrust(w, club.id));
    expect(r.after).toBeGreaterThan(r.before);
  });

  it('an agreement needs a minimum standing, said in those words', () => {
    const e = new Engine();
    e.generate(11223);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
    const w = (e as unknown as { state: GameState }).state;
    w.scout!.money = usd(100_000);
    const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 5)!;
    w.scout!.location = club.cityId;
    expect(clubTrust(w, club.id)).toBeLessThan(AGREEMENT_MIN_STANDING);
    expect(proposeAgreement(w, club.id).reason).toMatch(new RegExp(`standing ${AGREEMENT_MIN_STANDING}`));
  });
});
