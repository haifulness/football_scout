import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Club } from '../../src/engine/model/club';
import type { Deal } from '../../src/engine/model/deal';
import type { Mission } from '../../src/engine/model/mission';
import type { GameState } from '../../src/engine/model/world-state';
import { clubTrust } from '../../src/engine/systems/employment';
import {
  acceptMission,
  declineMission,
  discussMission,
  missionFit,
  negotiateMission,
  negotiationOptions,
  onDealSecured,
  preferenceFit,
} from '../../src/engine/systems/missions';
import { signOffProbability } from '../../src/engine/systems/deals';
import { offeredWage } from '../../src/engine/systems/transfers';
import { ovrAt } from '../../src/engine/systems/ratings';
import { createCareer } from '../../src/engine/systems/scouting';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;

function withClient(seed = 11223): { w: GameState; club: Club } {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const club = Object.values(w.clubs).find((c) => c.tier === 3 && c.countryId === eng)!;
  if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
  return { w, club };
}

/** First mission offered by the client, advancing until one arrives. */
function firstMission(w: GameState): Mission {
  for (let i = 0; i < 12 && !w.missions.length; i++) advanceDays(w, 15);
  const m = w.missions[0];
  if (!m) throw new Error('no mission offered');
  return m;
}

/** A fake deal for player → club at the mission position. */
const dealFor = (w: GameState, m: Mission, playerId: Deal['playerId'], fee = usd(0)): Deal => ({
  id: 900 + w.deals.length,
  playerId,
  clubId: m.clubId,
  position: m.position,
  stage: 'agreed',
  pitchedTo: ['coach'],
  prospect: false,
  openedOn: w.date,
  fee,
  wage: usd(1000),
  log: [],
});

describe('mission offers', () => {
  it('come from clubs you work for, with a brief built from real needs', () => {
    const { w, club } = withClient();
    const m = firstMission(w);
    expect(m.clubId).toBe(club.id);
    expect(m.status).toBe('offered');
    expect(m.requirements.minOvr).toBeGreaterThan(30);
    expect(m.reward).toBeGreaterThanOrEqual(8_000); // tier-3 freelance band
    expect(w.news.some((n) => n.title.startsWith('Mission offer'))).toBe(true);
  }, 120_000);

  it('lapse if you do not answer, and declining costs nothing', () => {
    const { w, club } = withClient();
    const m = firstMission(w);
    const trust = clubTrust(w, club.id);
    declineMission(w, m.id);
    expect(m.status).toBe('declined');
    expect(clubTrust(w, club.id)).toBe(trust);
    const next = w.missions.find((x) => x.status === 'offered');
    if (next) {
      advanceDays(w, 11);
      expect(next.status).toBe('expired');
    }
  }, 120_000);
});

describe('completing a mission', () => {
  it('pays the reward and builds trust when a matching player signs in time', () => {
    const { w, club } = withClient();
    const m = firstMission(w);
    acceptMission(w, m.id);
    expect(m.deadline).toBe(w.date + m.weeks * 7);
    const fit = Object.values(w.players).find((p) => p.clubId !== club.id && missionFit(w, m, p, usd(0)).ok)!;
    const money = w.scout!.money;
    const trust = clubTrust(w, club.id);
    onDealSecured(w, dealFor(w, m, fit.id));
    expect(m.status).toBe('succeeded');
    expect(w.scout!.money).toBe(money + m.reward);
    expect(clubTrust(w, club.id)).toBeGreaterThan(trust);
    expect(w.ledger[0]!.kind).toBe('mission-reward');
  }, 120_000);

  it('gives no credit for a player who misses the brief', () => {
    const { w, club } = withClient();
    const m = firstMission(w);
    acceptMission(w, m.id);
    const weak = Object.values(w.players).find((p) => p.clubId !== club.id && ovrAt(p, m.position) < m.requirements.minOvr - 5)!;
    onDealSecured(w, dealFor(w, m, weak.id));
    expect(m.status).toBe('active');
  }, 120_000);

  it('costs trust and relationships when the deadline passes', () => {
    const { w, club } = withClient();
    const m = firstMission(w);
    w.scout!.relationships[club.headCoachId] = 40;
    acceptMission(w, m.id);
    const trust = clubTrust(w, club.id);
    advanceDays(w, m.weeks * 7 + 1);
    expect(m.status).toBe('failed');
    expect(clubTrust(w, club.id)).toBeLessThan(trust);
    expect(w.scout!.relationships[club.headCoachId]).toBeLessThan(40);
    expect(w.news.some((n) => n.title.startsWith('Mission failed'))).toBe(true);
  }, 120_000);
});

describe('save migration', () => {
  it('upgrades a v6 save with an empty mission book', () => {
    const old = JSON.parse(JSON.stringify(generateWorld(9)));
    old.schemaVersion = 6;
    delete old.missions;
    delete old.counters.mission;
    const up = migrate(old);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.missions).toEqual([]);
  }, 30_000);
});

describe('recommendations for a brief', () => {
  it('lists every player you recommend to the club at that position after accepting', () => {
    const e = new Engine();
    e.generate(11223);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const w = (e as unknown as { state: GameState }).state;
    const club = Object.values(w.clubs).find((c) => c.tier === 3 && c.countryId === eng)!;
    if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
    const m = firstMission(w);
    expect(e.getMissions().find((x) => x.id === m.id)!.recommendations).toEqual([]);
    acceptMission(w, m.id);
    const others = Object.values(w.players).filter((p) => p.clubId !== club.id);
    const a = dealFor(w, m, others[0]!.id);
    const b = { ...dealFor(w, m, others[1]!.id), id: a.id + 1, stage: 'negotiating' as const };
    const elsewhere = { ...dealFor(w, m, others[2]!.id), id: a.id + 2, position: m.position === 'ST' ? ('CB' as const) : ('ST' as const) };
    w.deals.unshift(a, b, elsewhere);
    const recs = e.getMissions().find((x) => x.id === m.id)!.recommendations;
    expect(recs.map((r) => r.dealId).sort()).toEqual([a.id, b.id].sort());
    for (const r of recs) expect(['yes', 'maybe', 'no']).toContain(r.fit);
  }, 120_000);
});

describe('discussing a brief', () => {
  it('reveals wage, key attributes and ideal age once, without changing the requirements', () => {
    const { w } = withClient();
    const m = firstMission(w);
    const req = JSON.stringify(m.requirements);
    const pref = discussMission(w, m.id);
    expect(pref.maxWage).toBeGreaterThan(0);
    expect(pref.keyAttributes).toHaveLength(2);
    for (const k of pref.keyAttributes) {
      expect(k.min).toBeGreaterThanOrEqual(6);
      expect(k.min).toBeLessThanOrEqual(18);
    }
    expect(pref.idealAge[0]).toBeLessThanOrEqual(pref.idealAge[1]);
    if (m.requirements.maxAge !== undefined) expect(pref.idealAge[1]).toBeLessThanOrEqual(m.requirements.maxAge);
    expect(JSON.stringify(m.requirements)).toBe(req);
    expect(discussMission(w, m.id)).toBe(pref); // asking again changes nothing
  }, 120_000);

  it('makes sign-off likelier for a player who meets every preference of an active brief', () => {
    const { w, club } = withClient();
    const m = firstMission(w);
    acceptMission(w, m.id);
    const pref = discussMission(w, m.id);
    const p = Object.values(w.players).find((x) => x.clubId !== club.id && x.naturalPosition === m.position)!;
    // Make him fit every preference.
    m.preferences!.maxWage = offeredWage(w, p, club);
    for (const k of pref.keyAttributes) p.attributes[k.attribute] = Math.max(p.attributes[k.attribute], k.min);
    p.birthDate = (w.date - Math.round(((pref.idealAge[0] + pref.idealAge[1]) / 2 + 0.5) * 365.25)) as typeof p.birthDate;
    expect(preferenceFit(w, m, p, club)).toEqual({ met: 4, total: 4 });
    const coach = w.officials[club.headCoachId]!;
    const withBrief = signOffProbability(w, coach, p, club, m.position, usd(0));
    m.preferences = undefined;
    const without = signOffProbability(w, coach, p, club, m.position, usd(0));
    expect(withBrief).toBeGreaterThan(without);
  }, 120_000);
});

describe('negotiating a brief', () => {
  it('lets a friendly club loosen a preference, once, with no cost to the reward', () => {
    const { w, club } = withClient();
    const m = firstMission(w);
    discussMission(w, m.id);
    w.scout!.relationships[club.headCoachId] = 100;
    w.officials[club.headCoachId]!.stubbornness = 0;
    const before = m.preferences!.maxWage;
    const reward = m.reward;
    const wage = negotiationOptions(w, m).find((o) => o.key === 'wage')!;
    expect(wage.chance).toBeGreaterThan(0.8);
    const r = negotiateMission(w, m.id, 'wage');
    expect(r.agreed).toBe(true);
    expect(m.preferences!.maxWage).toBeGreaterThan(before);
    expect(m.reward).toBe(reward);
    expect(() => negotiateMission(w, m.id, 'wage')).toThrow(/already/);
    expect(negotiationOptions(w, m).find((o) => o.key === 'wage')!.outcome).toBe('agreed');
  }, 120_000);

  it('loosening a requirement costs part of the reward, and a refusal costs goodwill', () => {
    const { w, club } = withClient();
    const m = firstMission(w);
    discussMission(w, m.id);
    w.scout!.relationships[club.headCoachId] = 100;
    w.officials[club.headCoachId]!.stubbornness = 0;
    const minOvr = m.requirements.minOvr;
    const reward = m.reward;
    const r = negotiateMission(w, m.id, 'rating');
    if (r.agreed) {
      expect(m.requirements.minOvr).toBe(minOvr - 2);
      expect(m.reward).toBeLessThan(reward);
    }
    // A hostile coach, after several asks: likely a no, which costs goodwill.
    w.scout!.relationships[club.headCoachId] = 10;
    w.officials[club.headCoachId]!.stubbornness = 100;
    const options = negotiationOptions(w, m).filter((o) => !o.outcome);
    for (const o of options) {
      const before = w.scout!.relationships[club.headCoachId]!;
      const res = negotiateMission(w, m.id, o.key);
      if (!res.agreed) expect(w.scout!.relationships[club.headCoachId]).toBe(Math.max(0, before - 2));
    }
  }, 120_000);
});

describe('open deals in player lists', () => {
  it('shows the club you are negotiating with under the player', () => {
    const e = new Engine();
    e.generate(11223);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const w = (e as unknown as { state: GameState }).state;
    const club = Object.values(w.clubs).find((c) => c.tier === 3 && c.countryId === eng)!;
    const p = Object.values(w.players).find((x) => x.clubId && x.clubId !== club.id)!;
    w.pool[p.id] = { addedOn: w.date, source: 'manual', starred: false };
    expect(e.getPool().find((r) => r.id === p.id)!.openDeal).toBeUndefined();
    w.deals.unshift({
      id: 777,
      playerId: p.id,
      clubId: club.id,
      position: p.naturalPosition,
      stage: 'negotiating',
      pitchedTo: ['coach'],
      prospect: false,
      openedOn: w.date,
      fee: usd(0),
      wage: usd(1000),
      log: [],
    });
    expect(e.getPool().find((r) => r.id === p.id)!.openDeal).toEqual({ club: club.name, stage: 'negotiating' });
  }, 60_000);
});
