import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import {
  academyTick,
  intakeBoost,
  isSponsor,
  paySellOn,
  scoutSponsoredIntake,
  sponsorAcademy,
  sponsorCheck,
} from '../../src/engine/systems/academy';
import { clubTrust } from '../../src/engine/systems/employment';
import { knowledgeLevel } from '../../src/engine/systems/knowledge';

const eng = 'eng' as CountryId;

function career(): GameState {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const s = (e as unknown as { state: GameState }).state;
  s.scout!.reputation = 55;
  s.scout!.money = usd(2_000_000);
  return s;
}

describe('sponsoring a club academy', () => {
  it('needs standing at the club; then it costs a yearly fee, lifts your standing, and scouts their intake for you', () => {
    const s = career();
    const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
    expect(sponsorCheck(s, club.id).ok).toBe(false);
    s.scout!.relationships[club.headCoachId] = 60;
    const before = clubTrust(s, club.id);
    const money = s.scout!.money;
    sponsorAcademy(s, club.id);
    expect(isSponsor(s, club.id)).toBe(true);
    expect(s.scout!.money).toBeLessThan(money);
    expect(clubTrust(s, club.id)).toBeGreaterThan(before);
    expect(intakeBoost(s, club.id)).toEqual({ extra: 1, prodigy: 2 });
    const kid = club.squad[club.squad.length - 1]!;
    scoutSponsoredIntake(s, club.id, [kid], s.date);
    expect(knowledgeLevel(s, s.players[kid]!)).toBeGreaterThanOrEqual(65);
    expect(s.pool[kid]).toBeDefined();
  });
});

describe('an older save with an academy of its own', () => {
  function withOldAcademy() {
    const s = career();
    const kids = Object.values(s.players).filter((p) => !p.clubId).slice(0, 6);
    const city = Object.values(s.clubs).find((c) => c.countryId === eng)!.cityId;
    for (const p of kids) {
      s.freeAgents = s.freeAgents.filter((id) => id !== p.id);
      p.academyTraining = 0.95;
      s.pool[p.id] = { addedOn: s.date, source: 'manual', starred: false };
    }
    s.academy = {
      sponsorships: [],
      own: { name: 'Jo Academy', countryId: eng, cityId: city, openedOn: s.date, level: 2, players: kids.map((p) => p.id), graduates: [], earned: usd(0) },
    };
    return { s, kids };
  }

  it('winds it up once: the kids join clubs in its country and stay in your pool, half the build cost comes back', () => {
    const { s, kids } = withOldAcademy();
    const money = s.scout!.money;
    academyTick(s, s.date, false);
    expect(s.academy!.own).toBeUndefined();
    for (const p of kids) {
      expect(p.clubId).toBeDefined();
      expect(s.clubs[p.clubId!]!.countryId).toBe(eng);
      expect(s.clubs[p.clubId!]!.squad).toContain(p.id);
      expect(p.academyTraining).toBeUndefined();
      expect(s.pool[p.id]).toBeDefined();
    }
    const refund = s.scout!.money - money;
    expect(refund).toBe(Math.round((110_000 * s.countries[eng]!.costIndex) / 2 / 1000) * 1000);
    expect(s.news[0]!.title).toMatch(/closes/);
    academyTick(s, addDays(s.date, 1), false);
    expect(s.scout!.money).toBe(money + refund);
  });

  it('still pays the sell-on share on a graduate placed before, once', () => {
    const s = career();
    const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
    const kid = s.players[club.squad[0]!]!;
    s.placements.push({ id: 1, dealId: 1, playerId: kid.id, clubId: club.id, position: kid.naturalPosition, signedOn: s.date, expiresOn: addDays(s.date, 900), fee: usd(0), ovrGap: 0, prospect: true, mode: 'freelance', bonus: usd(0), bonusPaid: true, earnings: {}, sellOnPct: 15 } as never);
    const before = s.scout!.money;
    paySellOn(s, kid, club.id, usd(1_000_000));
    paySellOn(s, kid, club.id, usd(1_000_000));
    expect(s.scout!.money).toBe(before + 150_000);
  });
});
