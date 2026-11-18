import { describe, expect, it } from 'vitest';
import { addDays, makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Club } from '../../src/engine/model/club';
import type { GameState } from '../../src/engine/model/world-state';
import { pitch } from '../../src/engine/systems/deals';
import {
  acceptOffer,
  canWorkWith,
  clientSlots,
  clubTrust,
  declineOffer,
  dropClient,
  onSigningCompleted,
  proposeAgreement,
  resign,
  salaryFor,
} from '../../src/engine/systems/employment';
import { createCareer, startSearch } from '../../src/engine/systems/scouting';
import { COLLEAGUE_START, meet, meetingInfo } from '../../src/engine/systems/fieldwork';
import { startTravel } from '../../src/engine/systems/travel';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;
function setup(seed = 8642): GameState {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  w.scout!.money = usd(200_000);
  return w;
}
const englishClub = (w: GameState, tier: number) => Object.values(w.clubs).find((c) => c.tier === tier && c.countryId === eng)!;

/** A full-time offer from `club`, accepted. */
function hire(w: GameState, club: Club) {
  w.offers.push({
    id: 99,
    kind: 'fulltime',
    clubId: club.id,
    title: 'Scout',
    salary: salaryFor(club.tier, w.scout!.reputation, 1.5),
    seasons: 2,
    createdOn: w.date,
    expiresOn: (w.date + 21) as never,
  });
  acceptOffer(w, 99);
}

describe('freelance clients', () => {
  it('only lets you pitch to clients, and slots grow with reputation', () => {
    const w = setup();
    const club = englishClub(w, 5);
    w.scout!.location = club.cityId;
    const target = Object.values(w.players).find((p) => p.clubId && p.clubId !== club.id)!;
    expect(canWorkWith(w, club.id).ok).toBe(false);
    expect(() => pitch(w, { playerId: target.id, clubId: club.id, position: 'ST', to: 'coach' })).toThrow(/isn't one of your clients/);
    expect([0, 15, 30, 50, 70].map(clientSlots)).toEqual([2, 2, 3, 4, 5]);
  });

  it('needs a relationship before a club agrees to take you on', () => {
    const w = setup();
    const club = englishClub(w, 4);
    startTravel(w, club.cityId);
    const cold = proposeAgreement(w, club.id);
    expect(cold.accepted).toBe(false);
    expect(cold.reason).toMatch(/don't know you/);
    w.scout!.relationships[club.headCoachId] = 60;
    w.scout!.relationships[club.headCoachId] = 60;
    let accepted = false;
    for (let i = 0; i < 6 && !accepted; i++) {
      accepted = proposeAgreement(w, club.id).accepted;
      advanceDays(w, 1);
    }
    expect(accepted).toBe(true);
    expect(canWorkWith(w, club.id).ok).toBe(true);
  });

  it('refuses another client when your slots are full; dropping one frees it', () => {
    const w = setup();
    const tier5 = Object.values(w.clubs).filter((c) => c.tier === 5 && c.countryId === eng);
    const [a, a2, b] = [tier5[0]!, tier5[1]!, tier5[2]!];
    if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(a.id, a2.id);
    w.scout!.relationships[b.headCoachId] = 80;
    startTravel(w, b.cityId);
    expect(() => proposeAgreement(w, b.id)).toThrow(/slots are taken/);
    dropClient(w, a.id);
    expect(() => proposeAgreement(w, b.id)).not.toThrow();
  });

  it('counts signings towards trust and keeps the club on as a client', () => {
    const w = setup();
    const club = englishClub(w, 4);
    const before = clubTrust(w, club.id);
    onSigningCompleted(w, club.id);
    expect(clubTrust(w, club.id)).toBe(before + 8);
    expect(canWorkWith(w, club.id).ok).toBe(true);
  });
});

describe('full-time employment', () => {
  it('pays a weekly salary, covers expenses, and restricts pitches to the employer', () => {
    const w = setup();
    const employer = englishClub(w, 3);
    const other = englishClub(w, 4);
    hire(w, employer);
    expect(w.scout!.employment.mode).toBe('fulltime');
    expect(canWorkWith(w, employer.id).ok).toBe(true);
    expect(canWorkWith(w, other.id).reason).toMatch(/only recommend to them/);

    const money = w.scout!.money;
    advanceDays(w, 14);
    const salary = w.ledger.find((l) => l.kind === 'salary')!;
    expect(salary.amount).toBeGreaterThan(0);
    expect(w.scout!.money).toBeGreaterThan(money);

    const search = startSearch(w, { location: { scope: 'country', id: eng }, positions: [], attributes: [], includeFreeAgents: false });
    const line = w.ledger.find((l) => l.kind === 'search')!;
    expect(line.label).toMatch(/club pays 70%/);
    expect(-line.amount).toBeLessThan(search.cost);
  }, 60_000);

  it('serves four weeks of notice after resigning, then goes freelance', () => {
    const w = setup();
    hire(w, englishClub(w, 4));
    resign(w);
    advanceDays(w, 27);
    expect(w.scout!.employment.mode).toBe('fulltime');
    advanceDays(w, 2);
    expect(w.scout!.employment).toEqual({ mode: 'freelance', clients: [] });
  }, 60_000);

  it('offers one renewal when the contract ends; ignoring it means you leave', () => {
    const w = setup();
    const club = englishClub(w, 4);
    hire(w, club);
    w.scout!.relationships[club.headCoachId] = 90; // trusted: they want you to stay
    const e = w.scout!.employment as Extract<NonNullable<GameState['scout']>['employment'], { mode: 'fulltime' }>;
    advanceDays(w, e.until - w.date + 1);
    expect(w.offers.filter((o) => o.renewal)).toHaveLength(1);
    // Let it expire: no second offer, the contract runs out.
    advanceDays(w, 40);
    expect(w.scout!.employment.mode).toBe('freelance');
    expect(w.offers.some((o) => o.renewal)).toBe(false);
  }, 60_000);

  it('turning down the renewal sends you back to freelance work', () => {
    const w = setup();
    const club = englishClub(w, 4);
    hire(w, club);
    w.scout!.relationships[club.headCoachId] = 90;
    const e = w.scout!.employment as Extract<NonNullable<GameState['scout']>['employment'], { mode: 'fulltime' }>;
    advanceDays(w, e.until - w.date + 1);
    const offer = w.offers.find((o) => o.renewal)!;
    declineOffer(w, offer.id);
    expect(w.scout!.employment).toEqual({ mode: 'freelance', clients: [] });
  }, 60_000);

  it('makes no renewal offer once you have handed in your notice', () => {
    const w = setup();
    const club = englishClub(w, 4);
    hire(w, club);
    w.scout!.relationships[club.headCoachId] = 90;
    const e = w.scout!.employment as Extract<NonNullable<GameState['scout']>['employment'], { mode: 'fulltime' }>;
    e.until = addDays(w.date, 5); // contract ends during the notice period
    resign(w);
    advanceDays(w, 10);
    expect(w.offers.some((o) => o.renewal)).toBe(false);
    expect(w.scout!.employment.mode).toBe('freelance');
  }, 60_000);

  it('dismisses you when the club stops trusting you', () => {
    const w = setup();
    const club = englishClub(w, 4);
    hire(w, club);
    w.scout!.relationships[club.headCoachId] = 0;
    w.scout!.relationships[club.headCoachId] = 0;
    w.scout!.clubRecord[club.id] = { signings: 0, weakPitches: 10 };
    advanceDays(w, makeDate(2026, 11, 2) - w.date);
    expect(w.scout!.employment.mode).toBe('freelance');
    expect(w.news.some((n) => n.title.includes('leaves'))).toBe(true);
  }, 60_000);
});

describe('job offers', () => {
  it('arrive over a season once your reputation reaches a tier, and expire', () => {
    const w = setup();
    w.scout!.reputation = 35;
    advanceDays(w, 365);
    expect(w.counters.offer).toBeGreaterThan(0);
    expect(w.news.some((n) => n.kind === 'career' && /Job offer|want you/.test(n.title))).toBe(true); // personal news survives the feed cap
    for (const o of w.offers) expect(o.expiresOn).toBeGreaterThanOrEqual(w.date);
  }, 180_000);
});

describe('save migration', () => {
  it('upgrades a v5 save: freelance, with existing placement clubs as clients', () => {
    const w = setup();
    const club = englishClub(w, 4);
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 5;
    delete old.offers;
    delete old.counters.offer;
    delete old.scout.employment;
    delete old.scout.clubRecord;
    old.placements = [
      {
        id: 0,
        dealId: 0,
        playerId: club.squad[0],
        clubId: club.id,
        position: 'ST',
        signedOn: w.date,
        expiresOn: w.date + 400,
        fee: 0,
        ovrGap: 2,
        prospect: false,
        mode: 'freelance',
        bonus: 750,
        bonusPaid: true,
        earnings: {},
      },
    ];
    const up = migrate(old);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.scout!.employment).toEqual({ mode: 'freelance', clients: [club.id] });
    expect(up.scout!.clubRecord[club.id]!.signings).toBe(1);
  }, 30_000);
});

describe('colleagues at your own club', () => {
  it('start you with a working relationship, and meetings with them are free, ungated and more effective', () => {
    const w = setup();
    const club = englishClub(w, 2);
    const coach = club.headCoachId;
    const outsider = Object.values(w.clubs).find((c) => c.tier === 2 && c.countryId === eng && c.id !== club.id)!;
    hire(w, club);
    expect(w.scout!.relationships[coach]).toBeGreaterThanOrEqual(COLLEAGUE_START);
    const info = meetingInfo(w, { kind: 'official', id: coach });
    expect(info).toMatchObject({ colleague: true, cost: 0, allowed: true });
    expect(meetingInfo(w, { kind: 'official', id: outsider.headCoachId }).colleague).toBe(false);
    // Same stubbornness and starting level: a colleague gains more from one meeting.
    w.officials[coach]!.stubbornness = 50;
    w.officials[outsider.headCoachId]!.stubbornness = 50;
    w.scout!.relationships[coach] = 30;
    w.scout!.relationships[outsider.headCoachId] = 30;
    w.scout!.reputation = 100;
    w.scout!.location = club.cityId;
    const a = meet(w, { kind: 'official', id: coach });
    w.scout!.location = outsider.cityId;
    const b = meet(w, { kind: 'official', id: outsider.headCoachId });
    expect(a.cost).toBe(0);
    expect(a.after - a.before).toBeGreaterThan(b.after - b.before);
  }, 60_000);
});
