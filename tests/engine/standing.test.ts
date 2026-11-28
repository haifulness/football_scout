import { describe, expect, it } from 'vitest';
import type { CountryId, StaffId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { boardReasons, boardStanding, presidentOf } from '../../src/engine/systems/board';
import { AGREEMENT_MIN_STANDING, clubTrust, proposeAgreement, standingReasons } from '../../src/engine/systems/employment';

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

  it('gives its reasons, biggest first, adding up to the number; the board shares the record', () => {
    const e = new Engine();
    e.generate(11223);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const w = (e as unknown as { state: GameState }).state;
    const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
    w.scout!.relationships[club.headCoachId] = 40;
    w.scout!.clubRecord[club.id] = { signings: 2, weakPitches: 1, missionsFailed: 1 };
    const reasons = standingReasons(w, club.id);
    expect(reasons.map((r) => r.label).slice(0, 2)).toEqual(["Coach's rapport", 'Signings here']);
    expect(Math.round(reasons.reduce((n, r) => n + r.value, 0))).toBe(clubTrust(w, club.id));
    expect(reasons.find((r) => r.label === 'Briefs failed')!.value).toBe(-8);
    expect(reasons.some((r) => r.value === 0)).toBe(false);
    expect(e.getClub(club.id).work!.reasons[0]).toEqual({ label: "Coach's rapport", value: 28 });

    const pres = presidentOf(w, club)!;
    w.scout!.relationships[pres.id] = 30;
    const board = boardReasons(w, club.id);
    expect(board[0]).toEqual({ label: "President's rapport", value: 21 });
    expect(board.find((r) => r.label === 'Signings here')!.value).toBe(16);
    expect(boardStanding(w, club.id)).toBe(21 + 16 - 8 - 3);
  });

  it('ignores the integrity score an older save may still carry', () => {
    const e = new Engine();
    e.generate(11223);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const w = (e as unknown as { state: GameState }).state;
    const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
    w.scout!.relationships[club.headCoachId] = 40;
    const fresh = clubTrust(w, club.id);
    w.scout!.integrity = 20;
    expect(clubTrust(w, club.id)).toBe(fresh);
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
