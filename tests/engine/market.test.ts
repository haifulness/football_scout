import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Club } from '../../src/engine/model/club';
import type { Mandate } from '../../src/engine/model/mission';
import type { Player, Position } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import { clubPositionalAverage, formationPositions, pitch } from '../../src/engine/systems/deals';
import { learn } from '../../src/engine/systems/knowledge';
import { acceptMandate, endFreelanceWork, pitchRights, represent, representCheck } from '../../src/engine/systems/market';
import { ovrAt } from '../../src/engine/systems/ratings';
import { createCareer } from '../../src/engine/systems/scouting';
import { canAfford, executeTransfer, offeredWage } from '../../src/engine/systems/transfers';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;

function setup(seed = 4242): GameState {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  w.scout!.reputation = 100;
  w.scout!.money = usd(1_000_000);
  return w;
}

const clients = (w: GameState) => {
  const e = w.scout!.employment;
  if (e.mode !== 'freelance') throw new Error('expected a freelancer');
  return e.clients;
};

/** A seller (made a client), one of its players, and a non-client buyer where he clears the bar and fits the budget. */
function saleSetup(w: GameState): { seller: Club; buyer: Club; p: Player; pos: Position; mandate: Mandate } {
  const all = Object.values(w.clubs);
  for (const seller of all.filter((c) => c.tier === 2)) {
    for (const id of seller.squad) {
      const p = w.players[id]!;
      if (id === seller.captainId) continue;
      const pos = p.naturalPosition;
      if (pos === 'GK') continue;
      const buyer = all.find(
        (c) =>
          c.id !== seller.id &&
          c.tier === 3 &&
          !clients(w).includes(c.id) &&
          formationPositions(c).includes(pos) &&
          ovrAt(p, pos) > clubPositionalAverage(w, c, pos) + 3 &&
          canAfford(w, c, p.value, offeredWage(w, p, c)).ok,
      );
      if (!buyer) continue;
      clients(w).push(seller.id);
      const mandate: Mandate = {
        id: w.counters.mandate++,
        clubId: seller.id,
        playerId: p.id,
        askingFee: p.value,
        commissionPct: 4,
        reason: 'We need to raise funds.',
        postedOn: w.date,
        acceptBy: addDays(w.date, 10),
        weeks: 8,
        status: 'offered',
      };
      w.mandates.push(mandate);
      return { seller, buyer, p, pos, mandate };
    }
  }
  throw new Error('no sale setup found');
}

describe('selling mandates', () => {
  it('are offered by clients over time, for players the club wants to move on', () => {
    const w = setup();
    const club = Object.values(w.clubs).find((c) => c.tier === 3 && c.countryId === eng)!;
    clients(w).push(club.id);
    for (let i = 0; i < 16 && !w.mandates.length; i++) advanceDays(w, 14);
    const m = w.mandates[0];
    expect(m).toBeDefined();
    expect(m!.clubId).toBe(club.id);
    expect(m!.status === 'offered' || m!.status === 'expired').toBe(true);
    expect(m!.commissionPct).toBeGreaterThanOrEqual(3);
    expect(m!.commissionPct).toBeLessThanOrEqual(5);
    expect(w.news.some((n) => n.title.startsWith('Selling mandate'))).toBe(true);
  }, 180_000);

  it('let you pitch the player to any club once accepted', () => {
    const w = setup();
    const { buyer, p, mandate } = saleSetup(w);
    // Before the mandate it's only an open pitch (no agreement, reduced pay).
    expect(pitchRights(w, p, buyer)).toMatchObject({ ok: true, open: true });
    acceptMandate(w, mandate.id);
    expect(mandate.deadline).toBe(w.date + mandate.weeks * 7);
    const rights = pitchRights(w, p, buyer);
    expect(rights.ok).toBe(true);
    expect(rights.mandate?.id).toBe(mandate.id);
  }, 60_000);

  it('pay a commission on the sale fee, with no placement bonus', () => {
    const w = setup();
    const { seller, buyer, p, pos, mandate } = saleSetup(w);
    acceptMandate(w, mandate.id);
    w.scout!.location = buyer.cityId;
    w.scout!.relationships[buyer.headCoachId] = 100;
    w.officials[buyer.headCoachId]!.stubbornness = 0;
    w.scout!.rapport[p.id] = 100;
    const deal = pitch(w, { playerId: p.id, clubId: buyer.id, position: pos, to: 'coach' });
    expect(deal.mandateId).toBe(mandate.id);
    expect(deal.fee).toBe(mandate.askingFee);
    if (deal.stage !== 'negotiating') return; // sign-off is still a roll
    const placements = w.placements.length;
    let guard = 0;
    while ((deal.stage === 'negotiating' || deal.stage === 'agreed') && guard++ < 200) advanceDays(w, 1);
    if ((deal.stage as string) === 'failed') return;
    expect(deal.stage).toBe('completed');
    expect(p.clubId).toBe(buyer.id);
    expect(seller.squad).not.toContain(p.id);
    expect(mandate.status).toBe('succeeded');
    expect(w.placements.length).toBe(placements);
    const entry = w.ledger.find((l) => l.kind === 'sale-commission');
    expect(entry?.amount).toBe(Math.round((deal.fee * 4) / 100));
  }, 120_000);

  it('fail when the deadline passes without a sale', () => {
    const w = setup();
    const { seller, mandate } = saleSetup(w);
    w.scout!.relationships[seller.headCoachId] = 40;
    acceptMandate(w, mandate.id);
    advanceDays(w, mandate.weeks * 7 + 1);
    expect(mandate.status).toBe('failed');
    expect(w.scout!.relationships[seller.headCoachId]).toBeLessThan(40);
  }, 120_000);

  it('end when you take a full-time job', () => {
    const w = setup();
    const { mandate } = saleSetup(w);
    acceptMandate(w, mandate.id);
    endFreelanceWork(w, 'You joined a club full-time.');
    expect(mandate.status).toBe('expired');
  }, 60_000);
});

describe('representing free agents', () => {
  function freeAgent(w: GameState): Player {
    const p = Object.values(w.players).find((x) => !x.clubId && x.nationality === eng);
    if (!p) throw new Error('no English free agent');
    return p;
  }

  it('needs rapport and being in his country', () => {
    const w = setup();
    const p = freeAgent(w);
    w.scout!.location = Object.values(w.cities).find((c) => c.countryId !== eng)!.id;
    expect(representCheck(w, p).ok).toBe(false);
    w.scout!.rapport[p.id] = 30;
    expect(representCheck(w, p).reason).toMatch(/Be in/);
    w.scout!.location = Object.values(w.cities).find((c) => c.countryId === eng)!.id;
    expect(representCheck(w, p).ok).toBe(true);
  }, 60_000);

  it('opens every club to him, and ends when he signs elsewhere', () => {
    const w = setup();
    const p = freeAgent(w);
    w.scout!.rapport[p.id] = 30;
    w.scout!.location = Object.values(w.cities).find((c) => c.countryId === eng)!.id;
    const club = Object.values(w.clubs).find((c) => !clients(w).includes(c.id) && c.tier === 5)!;
    expect(pitchRights(w, p, club)).toMatchObject({ ok: true, open: true });
    represent(w, p.id);
    expect(w.scout!.represented).toContain(p.id);
    expect(pitchRights(w, p, club)).toMatchObject({ ok: true, represented: true });
    executeTransfer(w, p, club, usd(0), p.wage || usd(500), w.date);
    advanceDays(w, 1);
    expect(w.scout!.represented).not.toContain(p.id);
  }, 60_000);
});

describe('prodigy discovery', () => {
  it('fires once, the moment your knowledge reveals him', () => {
    const w = setup();
    const p = Object.values(w.players).find((x) => x.isProdigy);
    if (!p) return;
    w.pendingDiscoveries = [];
    learn(w, p, 30, 100, w.date);
    learn(w, p, 60, 100, w.date);
    expect(w.pendingDiscoveries).toEqual([p.id]);
    learn(w, p, 10, 100, w.date);
    expect(w.pendingDiscoveries).toEqual([p.id]);
    expect(w.news.some((n) => n.title === `Prodigy discovered: ${p.firstName} ${p.lastName}`)).toBe(true);
  }, 60_000);
});

describe('save migration', () => {
  it('upgrades a v7 save with an empty market', () => {
    const w = setup(9);
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 7;
    delete old.mandates;
    delete old.pendingDiscoveries;
    delete old.counters.mandate;
    delete old.scout.represented;
    const up = migrate(old);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.mandates).toEqual([]);
    expect(up.pendingDiscoveries).toEqual([]);
    expect(up.scout!.represented).toEqual([]);
  }, 30_000);
});

describe('recommend candidates', () => {
  it('include players you are selling, pinned with the selling club, even outside your pool', () => {
    const e = new Engine();
    e.generate(4242);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
    const w = (e as unknown as { state: GameState }).state;
    w.scout!.money = usd(1_000_000);
    const { seller, p, mandate } = saleSetup(w);
    acceptMandate(w, mandate.id);
    delete w.pool[p.id];
    const row = e.getRecommendCandidates().find((r) => r.id === p.id);
    expect(row).toMatchObject({ tag: 'sale', saleFor: seller.name });
  }, 60_000);
});

describe('mandate view', () => {
  it('lists the clubs you have pitched the player to under the mandate', () => {
    const e = new Engine();
    e.generate(4242);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
    const w = (e as unknown as { state: GameState }).state;
    w.scout!.money = usd(1_000_000);
    w.scout!.reputation = 100;
    const { buyer, p, pos, mandate } = saleSetup(w);
    acceptMandate(w, mandate.id);
    w.scout!.location = buyer.cityId;
    w.scout!.relationships[buyer.headCoachId] = 100;
    const deal = pitch(w, { playerId: p.id, clubId: buyer.id, position: pos, to: 'coach' });
    const view = e.getMarket().mandates.find((m) => m.id === mandate.id)!;
    expect(view.deals).toEqual([expect.objectContaining({ dealId: deal.id, club: expect.objectContaining({ id: buyer.id }), stage: deal.stage })]);
  }, 60_000);
});

describe("the selling club's report", () => {
  it('is tighter at big clubs and flatters the player when the club barely knows you', async () => {
    const { Rng } = await import('../../src/engine/core/rng');
    const { clubReport, CLUB_REPORT_FLATTERY } = await import('../../src/engine/systems/market');
    const w = setup();
    const big = Object.values(w.clubs).find((c) => c.tier === 1)!;
    const small = Object.values(w.clubs).find((c) => c.tier === 5)!;
    const p = w.players[big.squad.find((id) => w.players[id]!.naturalPosition !== 'GK')!]!;
    const truth = ovrAt(p, p.naturalPosition);
    const errors = (club: Club) => Array.from({ length: 200 }, (_, i) => clubReport(w, club, p, Rng.derive(i, 'r')).rating - truth);
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    // Strangers: flattered by about the full amount.
    expect(mean(errors(big))).toBeGreaterThan(CLUB_REPORT_FLATTERY - 1.5);
    expect(spread(errors(big))).toBeLessThan(spread(errors(small)));
    // Known well: straight.
    w.scout!.relationships[big.headCoachId] = 100;
    expect(Math.abs(mean(errors(big)))).toBeLessThan(1);
  });

  it('comes with the mandate, and accepting gets you his file: more knowledge, and their rating in your pool', () => {
    const w = setup();
    const { p, mandate } = saleSetup(w);
    mandate.report = { rating: 70, potential: 'B', strengths: ['pace'] };
    delete w.pool[p.id];
    const before = w.knowledge[p.id]?.level ?? 0;
    acceptMandate(w, mandate.id);
    expect(w.knowledge[p.id]!.level).toBeGreaterThan(before);
    expect(w.pool[p.id]?.report).toMatchObject({ rating: 70 });
    expect(w.pool[p.id]!.report!.assistantId).toBeUndefined();
  }, 60_000);
});
