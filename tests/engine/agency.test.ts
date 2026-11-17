import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { AgencyLogo } from '../../src/engine/model/agency';
import type { GameState } from '../../src/engine/model/world-state';
import {
  FOUNDING_COST,
  agencyCheck,
  agencyOnSignings,
  agencyTick,
  clientCapacity,
  foundAgency,
  openOffice,
  placeAssistant,
  staffCapacity,
} from '../../src/engine/systems/agency';
import { assignTask, hireAssistant, refreshMarket } from '../../src/engine/systems/assistants';
import { acceptOffer } from '../../src/engine/systems/employment';
import { createCareer, estimateSearch, searchReach } from '../../src/engine/systems/scouting';
import { nightlyCost } from '../../src/engine/systems/travel';
import { addDays, makeDate } from '../../src/engine/core/calendar';
import { migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;
const esp = 'esp' as CountryId;
const logo: AgencyLogo = { colors: { primary: '#123456', secondary: '#ffffff', accent: '#ffcc00' }, crest: { shape: 'shield', pattern: 'plain', emblem: 'star' } };

function fresh(): GameState {
  const w = generateWorld(13579);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'normal' });
  return w;
}

function founded(): GameState {
  const w = fresh();
  w.scout!.reputation = 65;
  w.scout!.money = usd(300_000);
  foundAgency(w, { name: 'North Star Scouting', logo });
  return w;
}

describe('your agency', () => {
  it('needs reputation 60, freelance work and the founding money', () => {
    const w = fresh();
    expect(agencyCheck(w).ok).toBe(false);
    w.scout!.reputation = 65;
    w.scout!.money = usd(FOUNDING_COST - 1);
    expect(agencyCheck(w).reason).toMatch(/Founding costs/);
    w.scout!.money = usd(100_000);
    expect(agencyCheck(w).ok).toBe(true);
    foundAgency(w, { name: 'North Star Scouting', logo });
    expect(w.agency!.shortName).toBe('NSS');
    expect(w.scout!.money).toBe(100_000 - FOUNDING_COST);
    expect(() => foundAgency(w, { name: 'Again', logo })).toThrow(/already/);
  });

  it('offices add capacity, charge rent, and make their country feel like home', () => {
    const w = founded();
    const clients = clientCapacity(w);
    const staff = staffCapacity(w);
    const madrid = w.regions[w.countries[esp]!.regionIds[1]!]!.cityIds[0]!;
    const hotelBefore = nightlyCost(w, madrid);
    const f = { location: { scope: 'country' as const, id: esp }, positions: [], attributes: [], includeFreeAgents: false };
    const searchBefore = estimateSearch(w, f).cost;
    const p = Object.values(w.players).find((x) => x.clubId && w.clubs[x.clubId]!.countryId === esp && w.clubs[x.clubId]!.tier === 1)!;
    const reachBefore = searchReach(w, p);
    const money = w.scout!.money;
    const office = openOffice(w, esp);
    expect(w.scout!.money).toBeLessThan(money);
    expect(clientCapacity(w)).toBe(clients + 2);
    expect(staffCapacity(w)).toBe(staff + 2);
    expect(hotelBefore).toBeGreaterThan(0);
    expect(nightlyCost(w, madrid)).toBe(0);
    expect(estimateSearch(w, f).cost).toBeLessThan(searchBefore);
    expect(searchReach(w, p)).toBeGreaterThan(reachBefore);
    expect(w.scout!.regionKnowledge[esp]).toBeGreaterThanOrEqual(50);
    const before = w.scout!.money;
    agencyTick(w, makeDate(2026, 9, 1)); // a Tuesday, the 1st: rent only
    expect(w.scout!.money).toBe(before - office.rent);
    expect(() => openOffice(w, esp)).toThrow(/already/);
    expect(() => openOffice(w, eng)).toThrow(/headquarters/);
  });

  it('staff at a base broker some of the signings into its country, and the agency banks a cut', () => {
    const w = founded();
    openOffice(w, esp);
    refreshMarket(w, w.date);
    const a = hireAssistant(w, w.assistantMarket[0]!.id);
    a.skill = 15;
    placeAssistant(w, a.id, w.agency!.offices[0]!.id);
    expect(() => assignTask(w, a.id, { location: { scope: 'country', id: esp }, positions: [] }, 2)).toThrow(/office/);
    const spanish = Object.values(w.clubs).filter((c) => c.countryId === esp);
    const players = Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId]!.countryId !== esp);
    const signings = Array.from({ length: 400 }, (_, i) => ({ playerId: players[i]!.id, clubId: spanish[i % spanish.length]!.id, fee: usd(500_000) }));
    const money = w.scout!.money;
    agencyOnSignings(w, signings, w.date, 'test');
    const n = w.agency!.brokered;
    expect(n).toBeGreaterThan(15); // 8.5% of 400 at skill 15
    expect(n).toBeLessThan(60);
    expect(w.scout!.money).toBe(money + w.agency!.earned);
    expect(w.ledgerTotals[w.season.year]!['agency-cut']).toBe(w.agency!.earned);
    // Nobody at headquarters: English signings earn nothing.
    const english = Object.values(w.clubs).find((c) => c.countryId === eng)!;
    agencyOnSignings(w, signings.map((s) => ({ ...s, clubId: english.id })), addDays(w.date, 7), 'test-2');
    expect(w.agency!.brokered).toBe(n);
  });

  it('rules out a club job while you run it', () => {
    const w = founded();
    const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
    w.offers.push({ id: 77, kind: 'fulltime', clubId: club.id, title: 'Scout', salary: usd(50_000), seasons: 2, createdOn: w.date, expiresOn: addDays(w.date, 20) });
    expect(() => acceptOffer(w, 77)).toThrow(/walking away/);
  });

  it('upgrade a v15 save without one', () => {
    const w = fresh();
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 15;
    const s = migrate(old) as GameState;
    expect(s.schemaVersion).toBe(16);
    expect(s.agency).toBeUndefined();
  });
});
