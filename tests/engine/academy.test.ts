import { describe, expect, it } from 'vitest';
import { addDays, makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import {
  CAPACITY,
  PLACE_AGE,
  SELL_ON_PCT,
  academyTick,
  intakeBoost,
  isAcademyPlayer,
  isSponsor,
  onGraduate,
  openAcademy,
  paySellOn,
  scoutSponsoredIntake,
  sponsorAcademy,
  sponsorCheck,
} from '../../src/engine/systems/academy';
import { clubTrust } from '../../src/engine/systems/employment';
import { knowledgeLevel } from '../../src/engine/systems/knowledge';
import { pitchRights } from '../../src/engine/systems/market';
import { aiTransferWeek } from '../../src/engine/systems/transfers';

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

describe('your own academy', () => {
  const withAcademy = () => {
    const s = career();
    s.agency = { name: 'Jo Scouting', shortName: 'JS', logo: {} as never, foundedOn: s.date, offices: [], deals: [], brokered: 0, earned: usd(0) };
    const own = openAcademy(s, eng);
    return { s, own };
  };

  it('opens with a first intake of known kids that no AI club can sign', () => {
    const { s, own } = withAcademy();
    expect(own.players.length).toBeGreaterThan(0);
    const kid = s.players[own.players[0]!]!;
    expect(kid.clubId).toBeUndefined();
    expect(s.freeAgents).not.toContain(kid.id);
    expect(knowledgeLevel(s, kid)).toBeGreaterThanOrEqual(80);
    const { moved } = aiTransferWeek(s, makeDate(2026, 7, 6));
    expect(moved.some((id) => own.players.includes(id))).toBe(false);
  });

  it('kids can be placed from 17, as players you represent', () => {
    const { s, own } = withAcademy();
    const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
    const kid = s.players[own.players[0]!]!;
    expect(pitchRights(s, kid, club).ok).toBe(false);
    kid.birthDate = makeDate(2026 - PLACE_AGE - 1, 1, 1);
    expect(pitchRights(s, kid, club)).toMatchObject({ ok: true, represented: true });
  });

  it('a graduate pays a training fee on signing, and the sell-on share when he is sold on', () => {
    const { s, own } = withAcademy();
    const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
    const kid = s.players[own.players[0]!]!;
    kid.clubId = club.id;
    const pl = { id: 1, dealId: 1, playerId: kid.id, clubId: club.id, position: kid.naturalPosition, signedOn: s.date, expiresOn: addDays(s.date, 900), fee: usd(0), ovrGap: 0, prospect: true, mode: 'freelance', bonus: usd(0), bonusPaid: true, earnings: {} } as never;
    s.placements.push(pl);
    const before = s.scout!.money;
    onGraduate(s, kid, pl);
    expect(isAcademyPlayer(s, kid.id)).toBe(false);
    expect(own.graduates).toContain(kid.id);
    expect(s.scout!.money).toBeGreaterThan(before);
    const afterFee = s.scout!.money;
    paySellOn(s, kid, club.id, usd(1_000_000));
    expect(s.scout!.money).toBe(afterFee + (1_000_000 * SELL_ON_PCT) / 100);
    paySellOn(s, kid, club.id, usd(1_000_000));
    expect(s.scout!.money).toBe(afterFee + (1_000_000 * SELL_ON_PCT) / 100);
  });

  it('each July: 19-year-olds leave as free agents and a new intake arrives, within capacity', () => {
    const { s, own } = withAcademy();
    const old = s.players[own.players[0]!]!;
    old.birthDate = makeDate(2007, 1, 1);
    const rollover = makeDate(2027, 7, 1);
    academyTick(s, rollover, true);
    expect(own.players).not.toContain(old.id);
    expect(s.freeAgents).toContain(old.id);
    expect(own.players.length).toBeLessThanOrEqual(CAPACITY[own.level]);
    expect(own.players.length).toBeGreaterThan(1);
  });
});
