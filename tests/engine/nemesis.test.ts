import { describe, expect, it } from 'vitest';
import { addDays, makeDate } from '../../src/engine/core/calendar';
import type { ClubId, CountryId, PlayerId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Deal } from '../../src/engine/model/deal';
import type { GameState } from '../../src/engine/model/world-state';
import { clubTrust } from '../../src/engine/systems/employment';
import { meet } from '../../src/engine/systems/fieldwork';
import { SMEAR_CLEARED, SMEAR_STANDING, headToHead, nemesisOf, nemesisSeason, nemesisTick, smearPenalty } from '../../src/engine/systems/nemesis';
import { seedRivals } from '../../src/engine/systems/rivals';

const eng = 'eng' as CountryId;

function career() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
  const s = (e as unknown as { state: GameState }).state;
  if (!s.rivals.length) seedRivals(s);
  s.scout!.startedOn = s.date;
  return { e, s };
}

function withNemesis() {
  const c = career();
  c.s.date = makeDate(2026, 9, 1);
  nemesisTick(c.s, c.s.date);
  return { ...c, r: nemesisOf(c.s)! };
}

describe('your nemesis', () => {
  it('notices you after a few weeks: a freelancer from home, a little ahead of you, style known', () => {
    const { s } = career();
    nemesisTick(s, makeDate(2026, 7, 1));
    expect(s.scout!.nemesis).toBeUndefined();
    nemesisTick(s, makeDate(2026, 9, 1));
    const r = nemesisOf(s)!;
    expect(r.employment.mode).toBe('freelance');
    expect(r.nationality).toBe(eng);
    expect(r.styleKnown).toBe(true);
    expect(r.reputation).toBeGreaterThan(s.scout!.reputation);
    expect(s.news[0]!.title).toMatch(/noticed you/);
  });

  it('keeps a step ahead of your reputation', () => {
    const { s, r } = withNemesis();
    s.scout!.reputation = 40;
    const before = r.reputation;
    nemesisTick(s, makeDate(2026, 10, 1));
    expect(r.reputation).toBeGreaterThan(before);
    expect(r.reputation).toBeLessThan(44);
  });

  it('settles the season on 1 July: more signings wins reputation, and the tally resets', () => {
    const { s, r } = withNemesis();
    const club = Object.values(s.clubs).find((c) => c.countryId === eng)!;
    const players = Object.values(s.players).slice(0, 3);
    for (const p of players.slice(0, 2))
      s.deals.unshift({ id: s.counters.deal++, playerId: p.id, clubId: club.id, position: 'CM', stage: 'completed', completedOn: makeDate(2027, 1, 10), pitchedTo: ['coach'], prospect: false, openedOn: makeDate(2027, 1, 1), fee: usd(0), wage: usd(0), log: [] } as unknown as Deal);
    r.signed = [{ playerId: players[2]!.id as PlayerId, clubId: club.id as ClubId, date: makeDate(2027, 1, 12) }];
    s.scout!.nemesis!.steals = 1;
    expect(headToHead(s, makeDate(2027, 6, 30))).toMatchObject({ you: 2, him: 1 });
    const rep = s.scout!.reputation;
    nemesisSeason(s, makeDate(2027, 7, 1));
    expect(s.scout!.nemesis!.won).toBe(1);
    expect(s.scout!.reputation).toBe(rep + 3);
    expect(s.scout!.nemesis!.history[0]).toMatchObject({ year: 2026, you: 2, him: 1, won: true });
    expect(s.scout!.nemesis!.steals).toBe(0);
  });
});

describe('dirty tricks', () => {
  it('a rumour at a club you work with costs standing; meeting the coach wins back half', () => {
    const { s } = withNemesis();
    const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
    if (s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(club.id);
    s.scout!.relationships[club.headCoachId] = 50;
    const trust = clubTrust(s, club.id);
    let d = makeDate(2026, 9, 15);
    for (let i = 0; i < 24 && !s.scout!.smears?.[club.id]; i++, d = addDays(d, 30)) {
      s.date = makeDate(2026 + Math.floor((8 + i) / 12), ((8 + i) % 12) + 1, 15);
      nemesisTick(s, s.date);
    }
    expect(s.scout!.smears?.[club.id]).toBeDefined();
    expect(smearPenalty(s, club.id)).toBe(SMEAR_STANDING);
    expect(clubTrust(s, club.id)).toBeLessThan(trust);
    s.scout!.location = club.cityId;
    s.scout!.money = usd(10_000);
    const res = meet(s, { kind: 'official', id: club.headCoachId });
    expect(res.cleared).toBe(true);
    expect(smearPenalty(s, club.id)).toBe(SMEAR_CLEARED);
    s.date = addDays(s.date, 200);
    expect(smearPenalty(s, club.id)).toBe(0);
  });
});
