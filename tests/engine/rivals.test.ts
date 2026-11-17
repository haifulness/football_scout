import { describe, expect, it } from 'vitest';
import { addDays, isTransferWindow, toParts, type GameDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Deal } from '../../src/engine/model/deal';
import type { Player } from '../../src/engine/model/player';
import type { Difficulty } from '../../src/engine/model/scout';
import type { GameState } from '../../src/engine/model/world-state';
import { formationPositions } from '../../src/engine/systems/deals';
import { rivalTick } from '../../src/engine/systems/rivals';
import { createCareer } from '../../src/engine/systems/scouting';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;

function setup(difficulty: Difficulty = 'normal', seed = 5150): GameState {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty });
  w.scout!.money = usd(1_000_000);
  return w;
}

/** The first Thursday on or after `from` inside a transfer window. */
function windowThursday(from: GameDate): GameDate {
  for (let d = 0; d < 400; d++) {
    const date = addDays(from, d);
    if (isTransferWindow(date) && toParts(date).weekday === 4) return date;
  }
  throw new Error('no window Thursday');
}

/** A rival, a buyer club of his, and a player at a smaller club who fits there. */
function chaseSetup(w: GameState) {
  const r = w.rivals.find((x) => x.employment.mode === 'fulltime' && w.clubs[x.employment.clubId]!.tier <= 3)!;
  const buyer = w.clubs[(r.employment as { clubId: string }).clubId as keyof typeof w.clubs]!;
  buyer.transferBudget = usd(50_000_000);
  const pos = formationPositions(buyer).find((p) => p !== 'GK')!;
  const p = Object.values(w.players).find(
    (x) => x.clubId && x.naturalPosition === pos && w.clubs[x.clubId]!.tier > buyer.tier && w.clubs[x.clubId]!.countryId === buyer.countryId,
  ) as Player;
  r.skill = 20;
  for (const other of w.rivals) other.restUntil = addDays(w.date, 999); // keep the others out of the way
  return { r, buyer, p };
}

const userDeal = (w: GameState, p: Player, stage: Deal['stage']): Deal => {
  const club = Object.values(w.clubs).find((c) => c.id !== p.clubId && c.tier === 5)!;
  const deal: Deal = {
    id: 500 + w.deals.length,
    playerId: p.id,
    clubId: club.id,
    sellingClubId: p.clubId,
    position: p.naturalPosition,
    stage,
    pitchedTo: ['coach'],
    prospect: false,
    openedOn: w.date,
    fee: usd(0),
    wage: usd(1000),
    log: [],
  };
  w.deals.push(deal);
  return deal;
};

describe('rival scouts', () => {
  it('are created with your career, more of them on harder difficulty, a quarter in your home country', () => {
    const easy = setup('easy');
    const hard = setup('hard');
    expect(easy.rivals.length).toBe(50);
    expect(hard.rivals.length).toBe(110);
    expect(hard.rivals.filter((r) => r.nationality === eng).length).toBeGreaterThanOrEqual(110 / 4);
    for (const r of hard.rivals) {
      expect(r.skill).toBeGreaterThanOrEqual(3);
      expect(r.skill).toBeLessThanOrEqual(19);
      if (r.employment.mode === 'fulltime') expect(hard.clubs[r.employment.clubId]).toBeDefined();
      else expect(r.employment.clients.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('chase players for their clubs and sign them in transfer windows', () => {
    const w = setup();
    advanceDays(w, 120);
    const signings = w.rivals.reduce((n, r) => n + r.record.signings, 0);
    expect(signings).toBeGreaterThan(0);
    for (const r of w.rivals.filter((x) => x.pursuit)) {
      const p = w.players[r.pursuit!.playerId];
      if (p) expect(p.clubId).not.toBe(r.pursuit!.clubId);
    }
  }, 120_000);

  it('hijack your open deal when they close first, naming the rival', () => {
    const w = setup();
    const { r, buyer, p } = chaseSetup(w);
    const deal = userDeal(w, p, 'negotiating');
    let date = windowThursday(w.date);
    for (let i = 0; i < 8 && deal.stage === 'negotiating'; i++) {
      r.pursuit = { playerId: p.id, clubId: buyer.id, startedOn: w.date, progress: 1, rumoured: true };
      r.restUntil = undefined;
      w.date = date;
      rivalTick(w, date);
      date = windowThursday(addDays(date, 1));
    }
    expect(deal.stage).toBe('hijacked');
    expect(deal.reason).toContain(r.lastName);
    expect(p.clubId).toBe(buyer.id);
    expect(r.record.steals).toBe(1);
    expect(w.pendingDealEvents.some((e) => e.kind === 'hijacked' && e.dealId === deal.id)).toBe(true);
  }, 60_000);

  it('leave players alone once your deal is agreed', () => {
    const w = setup();
    const { r, buyer, p } = chaseSetup(w);
    const deal = userDeal(w, p, 'agreed');
    const date = windowThursday(w.date);
    r.pursuit = { playerId: p.id, clubId: buyer.id, startedOn: w.date, progress: 1, rumoured: false };
    w.date = date;
    rivalTick(w, date);
    expect(deal.stage).toBe('agreed');
    expect(p.clubId).not.toBe(buyer.id);
    expect(r.pursuit).toBeUndefined();
  }, 60_000);

  it('leak rumours when they chase a player you are working on', () => {
    const w = setup();
    const { r, buyer, p } = chaseSetup(w);
    userDeal(w, p, 'negotiating');
    let date = w.date;
    for (let i = 0; i < 20 && !r.pursuit?.rumoured; i++) {
      r.pursuit ??= { playerId: p.id, clubId: buyer.id, startedOn: w.date, progress: 0.3, rumoured: false };
      r.pursuit.progress = Math.min(r.pursuit.progress, 0.6);
      do date = addDays(date, 1);
      while (toParts(date).weekday !== 4);
      w.date = date;
      if (isTransferWindow(date)) r.pursuit.progress = 0.3;
      rivalTick(w, date);
    }
    expect(r.pursuit?.rumoured).toBe(true);
    expect(w.news.some((n) => n.kind === 'rumour' && n.title === `Rival interest: ${p.firstName} ${p.lastName}`)).toBe(true);
  }, 60_000);
});

describe('save migration', () => {
  it('upgrades a v8 save and seeds rivals on the next day', () => {
    const w = setup('normal', 9);
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 8;
    delete old.rivals;
    const up = migrate(old);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.rivals).toEqual([]);
    advanceDays(up, 1);
    expect(up.rivals.length).toBe(80);
  }, 60_000);
});
