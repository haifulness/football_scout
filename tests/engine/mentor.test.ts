import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { canWorkWith, clubTrust } from '../../src/engine/systems/employment';
import { remotePitchCheck } from '../../src/engine/systems/deals';
import { MENTOR_CUT, MENTOR_STANDING, MENTOR_TERM_DAYS, leaveMentor, mentorClients, mentorOf, mentorTick } from '../../src/engine/systems/mentor';
import { addLedger } from '../../src/engine/systems/scouting';

const eng = 'eng' as CountryId;

function career(mentor: boolean): GameState {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy', mentor });
  return (e as unknown as { state: GameState }).state;
}

describe('working under a big-name scout', () => {
  it('starting under him: his clubs take your calls and know you', () => {
    const w = career(true);
    const r = mentorOf(w)!;
    expect(r).toBeDefined();
    expect(r.reputation).toBeGreaterThanOrEqual(40);
    const clubs = mentorClients(w);
    expect(clubs.length).toBeGreaterThan(0);
    for (const id of clubs) {
      expect(canWorkWith(w, id).ok).toBe(true);
      expect(clubTrust(w, id)).toBeGreaterThanOrEqual(MENTOR_STANDING);
    }
    // A stranger's club still won't.
    const other = Object.values(w.clubs).find((c) => !clubs.includes(c.id))!;
    expect(canWorkWith(w, other.id).ok).toBe(false);
  });

  it('he takes his share of what you earn, not of what you spend', () => {
    const w = career(true);
    const before = w.scout!.money;
    addLedger(w, { amount: usd(10_000), kind: 'signing-bonus', label: 'test' });
    expect(w.scout!.money).toBe(before + 10_000 * (1 - MENTOR_CUT));
    addLedger(w, { amount: usd(-500), kind: 'travel', label: 'test' });
    expect(w.scout!.mentor!.taken).toBe(10_000 * MENTOR_CUT);
  });

  it('phone pitches open sooner while he vouches for you', () => {
    const w = career(true);
    const id = mentorClients(w)[0]!;
    const coach = w.clubs[id]!.headCoachId;
    w.scout!.relationships[coach] = 70; // about 49 standing
    const t = clubTrust(w, id);
    expect(t).toBeGreaterThanOrEqual(45);
    expect(t).toBeLessThan(60);
    expect(remotePitchCheck(w, id).ok).toBe(true);
  });

  it('leaving inside a year makes him a rival; staying the year parts on good terms', () => {
    const w = career(true);
    const r = mentorOf(w)!;
    const coach = w.clubs[mentorClients(w)[0]!]!.headCoachId;
    w.scout!.relationships[coach] = 30;
    expect(leaveMentor(w)).toMatch(/won't forget/);
    expect(r.grudge).toBe(true);
    expect(w.scout!.relationships[coach]).toBe(22);
    expect(w.scout!.mentor).toBeUndefined();

    const w2 = career(true);
    const r2 = mentorOf(w2)!;
    w2.date = (w2.date + MENTOR_TERM_DAYS) as typeof w2.date;
    expect(leaveMentor(w2)).toMatch(/good terms/);
    expect(r2.grudge).toBeUndefined();
  });

  it('a new freelancer may get an offer early on, once', () => {
    const w = career(false);
    expect(w.scout!.mentor).toBeUndefined();
    for (let d = 0; d < 180 && !w.scout!.mentorOffer; d += 7) mentorTick(w, (w.date + d) as typeof w.date);
    expect(w.scout!.mentorOffer).toBeDefined();
  });
});
