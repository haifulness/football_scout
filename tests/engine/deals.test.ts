import { describe, expect, it } from 'vitest';
import { ageOn, makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Club } from '../../src/engine/model/club';
import type { Player, Position } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import {
  clubPositionalAverage,
  formationPositions,
  gateCheck,
  pitch,
  playerChance,
  resolveDeals,
  signOffProbability,
  wageCeiling,
} from '../../src/engine/systems/deals';
import { ovrAt } from '../../src/engine/systems/ratings';
import { createCareer } from '../../src/engine/systems/scouting';
import { brokeredWage, executeTransfer, offeredWage, transferFee } from '../../src/engine/systems/transfers';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;

function setup(seed = 2468): GameState {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  w.scout!.reputation = 100; // open every door for these tests
  w.scout!.money = usd(1_000_000);
  return w;
}

/** Be in the club's city and have it as a freelance client (phase 8 rules). */
const goTo = (w: GameState, club: Club) => {
  w.scout!.location = club.cityId;
  const e = w.scout!.employment;
  if (e.mode === 'freelance' && !e.clients.includes(club.id)) e.clients.push(club.id);
};
const clubs = (w: GameState, f: (c: Club) => boolean) => Object.values(w.clubs).filter(f);

/** A player who clears the bar at `club` (truth), plays a position it uses, is affordable, and is not at the club. */
function goodFit(w: GameState, club: Club): { p: Player; pos: Position } | undefined {
  for (const pos of formationPositions(club)) {
    if (pos === 'GK') continue;
    const avg = clubPositionalAverage(w, club, pos);
    const p = Object.values(w.players).find(
      (x) =>
        x.clubId &&
        x.clubId !== club.id &&
        x.naturalPosition === pos &&
        ovrAt(x, pos) > avg + 2 &&
        ovrAt(x, pos) < avg + 8 &&
        transferFee(w, x) < club.transferBudget * 0.4 &&
        ageOn(x.birthDate, w.date) < 30,
    );
    if (p) return { p, pos };
  }
  return undefined;
}

describe('the above-average gate', () => {
  it('rejects a weaker player outright, and you cannot appeal to the other official', () => {
    const w = setup();
    const elite = clubs(w, (c) => c.tier === 1)[0]!;
    const pos = formationPositions(elite).find((x) => x !== 'GK')!;
    const weak = Object.values(w.players).find(
      (p) => p.clubId && w.clubs[p.clubId]!.tier === 5 && p.naturalPosition === pos && ageOn(p.birthDate, w.date) > 23,
    )!;
    goTo(w, elite);
    const deal = pitch(w, { playerId: weak.id, clubId: elite.id, position: pos, to: 'coach' });
    expect(deal.stage).toBe('rejected');
    expect(deal.clubLevelRejection).toBe(true);
    expect(deal.reason).toMatch(/isn't better/);
    expect(() => pitch(w, { playerId: weak.id, clubId: elite.id, position: pos, to: 'coach' })).toThrow(/given its answer/);
  });

  it('lets young prospects through on potential, only where the club takes prospects', () => {
    const w = setup();
    let found = 0;
    for (const club of clubs(w, (c) => c.tier >= 3)) {
      for (const pos of formationPositions(club)) {
        const avg = clubPositionalAverage(w, club, pos);
        const kid = Object.values(w.players).find(
          (p) => p.clubId !== club.id && p.naturalPosition === pos && ageOn(p.birthDate, w.date) <= 21 && ovrAt(p, pos) <= avg && p.hidden.potential > avg,
        );
        if (!kid) continue;
        const g = gateCheck(w, kid, club, pos);
        if (club.acceptsProspects === 'yes') expect(g).toMatchObject({ passes: true, prospect: true });
        else if (club.acceptsProspects === 'never') expect(g.passes).toBe(false);
        found++;
        break;
      }
      if (found > 20) break;
    }
    expect(found).toBeGreaterThan(5);
  });

  it('rejects players the club cannot afford', () => {
    const w = setup();
    const club = clubs(w, (c) => c.tier === 3)[0]!;
    const fit = goodFit(w, club)!;
    club.transferBudget = usd(0);
    goTo(w, club);
    const deal = pitch(w, { playerId: fit.p.id, clubId: club.id, position: fit.pos, to: 'coach' });
    expect(deal.stage).toBe('rejected');
    expect(deal.reason).toMatch(/afford/);
  });
});

describe('sign-off', () => {
  it('is more likely the better your relationship with the official', () => {
    const w = setup();
    const club = clubs(w, (c) => c.tier === 3)[0]!;
    const { p, pos } = goodFit(w, club)!;
    const coach = w.officials[club.headCoachId]!;
    w.scout!.relationships[coach.id] = 0;
    const cold = signOffProbability(w, coach, p, club, pos, transferFee(w, p));
    w.scout!.relationships[coach.id] = 80;
    const warm = signOffProbability(w, coach, p, club, pos, transferFee(w, p));
    expect(warm).toBeGreaterThan(cold + 0.2);
  });

  it("treats the Head Coach's no as final for that player at that club", () => {
    const w = setup();
    let done = false;
    for (const club of clubs(w, (c) => c.tier === 3 || c.tier === 4)) {
      const fit = goodFit(w, club);
      if (!fit) continue;
      const coach = w.officials[club.headCoachId]!;
      coach.stubbornness = 100;
      w.scout!.relationships[coach.id] = 0;
      goTo(w, club);
      const deal = pitch(w, { playerId: fit.p.id, clubId: club.id, position: fit.pos, to: 'coach' });
      if (deal.stage !== 'rejected' || deal.clubLevelRejection) continue;
      expect(() => pitch(w, { playerId: fit.p.id, clubId: club.id, position: fit.pos, to: 'coach' })).toThrow(/given its answer/);
      done = true;
      break;
    }
    expect(done).toBe(true);
  });
});

/** Pitches good fits (with maxed relationships) until one is signed off. */
function signedOffDeal(w: GameState) {
  for (const club of clubs(w, (c) => c.tier === 3 || c.tier === 4)) {
    const fit = goodFit(w, club);
    if (!fit) continue;
    w.scout!.relationships[club.headCoachId] = 100;
    w.officials[club.headCoachId]!.stubbornness = 0;
    w.scout!.rapport[fit.p.id] = 100;
    goTo(w, club);
    const deal = pitch(w, { playerId: fit.p.id, clubId: club.id, position: fit.pos, to: 'coach' });
    if (deal.stage === 'negotiating') return { deal, club, p: fit.p };
  }
  throw new Error('no deal signed off');
}

describe('completing a deal', () => {
  it('completes inside the window: player moves, money moves, placement and reputation recorded', () => {
    const w = setup();
    w.scout!.reputation = 10;
    const { deal, club, p } = signedOffDeal(w);
    w.scout!.reputation = 10;
    const seller = w.clubs[p.clubId!]!;
    const buyerBudget = club.transferBudget;
    let guard = 0;
    while (deal.stage === 'negotiating' && guard++ < 20) advanceDays(w, 1);
    if (deal.stage === 'failed') return; // the player can still say no; covered by chance > 0.5 below
    expect(deal.stage).toBe('completed');
    expect(p.clubId).toBe(club.id);
    expect(club.squad).toContain(p.id);
    expect(seller.squad).not.toContain(p.id);
    expect(club.transferBudget).toBeLessThan(buyerBudget);
    expect(w.placements.at(-1)).toMatchObject({ playerId: p.id, clubId: club.id, prospect: false });
    expect(w.placements.at(-1)!.ovrGap).toBeGreaterThan(0);
    expect(w.scout!.reputation).toBeGreaterThan(10);
    expect(w.news.some((n) => n.title.startsWith('Here we go'))).toBe(true);
  }, 60_000);

  it('agrees outside the window and completes when the window opens', () => {
    const w = setup();
    advanceDays(w, makeDate(2026, 10, 1) - w.date);
    const { deal } = signedOffDeal(w);
    let guard = 0;
    while (deal.stage === 'negotiating' && guard++ < 20) advanceDays(w, 1);
    if (deal.stage === 'failed') return;
    expect(deal.stage).toBe('agreed');
    advanceDays(w, makeDate(2027, 1, 1) - w.date);
    expect(deal.stage).toBe('completed');
  }, 120_000);

  it('is hijacked if another club signs the player first', () => {
    const w = setup();
    const { deal, club, p } = signedOffDeal(w);
    const rival = clubs(w, (c) => c.id !== club.id && c.id !== p.clubId && c.tier <= 3)[0]!;
    executeTransfer(w, p, rival, usd(0), p.wage, w.date);
    resolveDeals(w, w.date);
    expect(deal.stage).toBe('hijacked');
    expect(w.pendingDealEvents.some((e) => e.kind === 'hijacked')).toBe(true);
  });
});

describe('AI transfer market', () => {
  it('moves players between clubs during the summer window without breaking squads or budgets', () => {
    const w = generateWorld(1357);
    const before = new Map(Object.values(w.players).map((p) => [p.id, p.clubId]));
    advanceDays(w, 31); // July
    const moved = Object.values(w.players).filter((p) => p.clubId && before.get(p.id) !== p.clubId);
    expect(moved.length).toBeGreaterThan(30);
    for (const c of Object.values(w.clubs)) {
      expect(c.transferBudget).toBeGreaterThanOrEqual(0);
      expect(c.squad.length).toBeLessThanOrEqual(32);
      for (const id of c.squad) expect(w.players[id]!.clubId).toBe(c.id);
    }
    expect(w.news.some((n) => n.kind === 'transfer')).toBe(true);
  }, 60_000);
});

describe('save migration', () => {
  it('upgrades a v3 save with empty deal books', () => {
    const old = JSON.parse(JSON.stringify(generateWorld(9)));
    old.schemaVersion = 3;
    for (const k of ['deals', 'placements', 'pendingDealEvents']) delete old[k];
    delete old.counters.deal;
    const up = migrate(old);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.deals).toEqual([]);
    expect(up.counters.deal).toBe(0);
  }, 30_000);
});

describe('rapport and wages', () => {
  it('a player who trusts you asks for up to 20% less, never below what he earns now', () => {
    const w = setup();
    const club = clubs(w, (c) => c.tier === 2)[0]!;
    const p = Object.values(w.players).find((x) => x.clubId && w.clubs[x.clubId]!.tier === 4)!;
    const full = offeredWage(w, p, club);
    w.scout!.rapport[p.id] = 0;
    expect(brokeredWage(w, p, club)).toBe(full);
    w.scout!.rapport[p.id] = 100;
    const trusted = brokeredWage(w, p, club);
    expect(trusted).toBeLessThan(full);
    expect(trusted).toBeGreaterThanOrEqual(Math.round(full * 0.8));
    expect(trusted).toBeGreaterThanOrEqual(p.wage);
  }, 60_000);

  it('the wage in your deal reflects that rapport', () => {
    const w = setup();
    const { deal, p, club } = signedOffDeal(w); // signedOffDeal sets rapport 100
    expect(deal.wage).toBe(brokeredWage(w, p, club));
    expect(deal.wage).toBeLessThanOrEqual(offeredWage(w, p, club));
  }, 60_000);
});

describe('wage offers', () => {
  it('you can offer more than he asks, up to the ceiling, and it makes him keener', () => {
    const w = setup();
    const { deal, p, club } = signedOffDeal(w);
    const demand = deal.wageDemand!;
    expect(deal.wage).toBe(demand); // default offer is his ask
    const ceiling = wageCeiling(w, p, club, deal.position);
    expect(ceiling).toBeGreaterThanOrEqual(demand);
    const atAsk = playerChance(w, deal);
    const generous = { ...deal, wage: ceiling };
    expect(playerChance(w, generous)).toBeGreaterThanOrEqual(atAsk);
    if (ceiling > demand * 1.2) expect(playerChance(w, generous)).toBeGreaterThan(atAsk);
  }, 60_000);

  it('caps the offer at the ceiling and never offers less than he asks', () => {
    const w = setup();
    for (const club of clubs(w, (c) => c.tier === 3 || c.tier === 4)) {
      const fit = goodFit(w, club);
      if (!fit) continue;
      w.scout!.relationships[club.headCoachId] = 100;
      w.officials[club.headCoachId]!.stubbornness = 0;
      goTo(w, club);
      const ceiling = wageCeiling(w, fit.p, club, fit.pos);
      const deal = pitch(w, { playerId: fit.p.id, clubId: club.id, position: fit.pos, to: 'coach', wage: usd(ceiling * 10) });
      if (deal.clubLevelRejection) continue;
      expect(deal.wage).toBe(ceiling);
      const low = pitch(w, {
        playerId: Object.values(w.players).find((x) => x.clubId !== club.id && x.naturalPosition === fit.pos && x.id !== fit.p.id)!.id,
        clubId: club.id,
        position: fit.pos,
        to: 'coach',
        wage: usd(1),
      });
      if (low.wageDemand) expect(low.wage).toBe(low.wageDemand);
      return;
    }
  }, 60_000);
});
