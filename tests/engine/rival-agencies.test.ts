import { describe, expect, it } from 'vitest';
import { makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import { HQ } from '../../src/engine/model/agency';
import type { GameState } from '../../src/engine/model/world-state';
import { agencyOnSignings, openOffice } from '../../src/engine/systems/agency';
import { agenciesIn, matchOffer, rivalAgencyTick } from '../../src/engine/systems/rival-agencies';

const eng = 'eng' as CountryId;

function setup() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
  const s = (e as unknown as { state: GameState }).state;
  s.scout!.reputation = 65;
  s.scout!.money = usd(500_000);
  e.foundAgency({ name: 'Test Agency', logo: { colors: { primary: '#fff', secondary: '#000' }, crest: 'shield' } as never });
  const hire = (id: number, skill: number) =>
    s.assistants.push({ id, firstName: 'A', lastName: String(id), nationality: eng, portraitSeed: id, age: 30, skill, speciality: eng, wage: usd(600), hiredOn: s.date, xp: 0, reports: 0, officeId: HQ });
  return { e, s, hire };
}

describe('rival agencies', () => {
  it('are already there when you found yours, at home', () => {
    const { s } = setup();
    expect(s.rivalAgencies!.length).toBe(3);
    expect(s.rivalAgencies!.every((a) => a.countries[0] === eng)).toBe(true);
    expect(new Set(s.rivalAgencies!.map((a) => a.name)).size).toBe(3);
  });

  it('beat your staff to some deals where you share a country', () => {
    const run = (withRivals: boolean) => {
      const { s, hire } = setup();
      hire(100, 14);
      hire(101, 14);
      if (withRivals) for (const a of s.rivalAgencies!) a.strength = 20;
      else s.rivalAgencies = [];
      const signings = Object.values(s.players)
        .filter((p) => p.clubId && s.clubs[p.clubId]!.countryId === eng)
        .slice(0, 400)
        .map((p) => ({ playerId: p.id, clubId: p.clubId!, fee: usd(500_000) }));
      agencyOnSignings(s, signings as never, s.date, 'test');
      return { mine: s.agency!.brokered, theirs: (s.rivalAgencies ?? []).reduce((n, a) => n + a.brokered, 0) };
    };
    const alone = run(false);
    const contested = run(true);
    expect(contested.theirs).toBeGreaterThan(0);
    expect(contested.mine).toBeLessThan(alone.mine);
  });

  it('show in your agency log when they take a deal', () => {
    const { s, hire } = setup();
    hire(100, 14);
    for (const a of s.rivalAgencies!) a.strength = 20;
    const signings = Object.values(s.players)
      .filter((p) => p.clubId && s.clubs[p.clubId]!.countryId === eng)
      .slice(0, 400)
      .map((p) => ({ playerId: p.id, clubId: p.clubId!, fee: usd(500_000) }));
    agencyOnSignings(s, signings as never, s.date, 'test');
    const taken = s.rivalAgencies!.reduce((n, a) => n + a.brokered, 0);
    const lines = (s.agency!.log ?? []).filter((l) => l.kind === 'rival');
    expect(taken).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(taken);
    expect(lines[0]!.text).toMatch(/before your staff got a look/);
  });

  it('follow you abroad', () => {
    const { s } = setup();
    const office = openOffice(s, 'esp' as CountryId);
    s.rivalAgencies = s.rivalAgencies!.map((a) => ({ ...a, countries: a.countries.filter((c) => c !== office.countryId) }));
    for (let m = 8; m < 32 && !agenciesIn(s, office.countryId).length; m++) rivalAgencyTick(s, makeDate(2026 + Math.floor(m / 12), (m % 12) + 1, 1));
    expect(agenciesIn(s, office.countryId).length).toBeGreaterThan(0);
  });

  it('make offers to your best staff: match and he stays, ignore it and he goes', () => {
    const { s, hire } = setup();
    hire(100, 19);
    const keep = s.assistants[0];
    let m = 8;
    const month = () => {
      s.date = makeDate(2026 + Math.floor(m / 12), (m % 12) + 1, 1);
      rivalAgencyTick(s, s.date);
      m++;
    };
    while (!keep!.offer && m < 80) month();
    expect(keep!.offer).toBeDefined();
    const offered = keep!.offer!.wage;
    matchOffer(s, keep!.id);
    expect(keep!.wage).toBe(offered);
    expect(keep!.loyalUntil).toBeGreaterThan(s.date);
    hire(101, 19);
    const lose = s.assistants.find((a) => a.id === 101);
    while (!lose!.offer && m < 160) month();
    expect(lose!.offer).toBeDefined();
    rivalAgencyTick(s, lose!.offer!.until);
    expect(s.assistants.find((a) => a.id === lose!.id)).toBeUndefined();
    expect(s.rivalAgencies!.reduce((n, a) => n + a.hired, 0)).toBeGreaterThanOrEqual(1);
  });
});
