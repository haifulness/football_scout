import { describe, expect, it } from 'vitest';
import { makeDate } from '../../src/engine/core/calendar';
import type { ClubId, CountryId, PlayerId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine';
import { generateWorld } from '../../src/engine/generation/world-generator';
import { emptyEarnings } from '../../src/engine/model/deal';
import type { Position } from '../../src/engine/model/player';
import type { PlayerMatchLine } from '../../src/engine/model/season';
import type { GameState } from '../../src/engine/model/world-state';
import { BANKRUPTCY_DAYS, matchPayout, signingBonus } from '../../src/engine/systems/payouts';
import { createCareer } from '../../src/engine/systems/scouting';
import { executeTransfer } from '../../src/engine/systems/transfers';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;
const line = (o: Partial<PlayerMatchLine> & { position: Position }): PlayerMatchLine => ({
  playerId: 'p0' as PlayerId,
  clubId: 'c0' as ClubId,
  started: true,
  minutes: 90,
  goals: 0,
  assists: 0,
  tackles: 0,
  cleanSheet: false,
  captain: false,
  rating: 7,
  ...o,
});
const total = (l: PlayerMatchLine, tier: 1 | 2 | 3 | 4 | 5, mode: 'freelance' | 'fulltime') => matchPayout(l, tier, mode).total;

describe('match bonuses', () => {
  it('stack for a scoring captain, scaled by tier and doubled for freelancers', () => {
    // tier 1 (×8) freelance (×2) = ×16: app 50 + 2 goals 300 + assist 100 + captain 75 = 525 → 8,400
    expect(total(line({ position: 'ST', goals: 2, assists: 1, captain: true }), 1, 'freelance')).toBe(8400);
    expect(total(line({ position: 'ST', goals: 2, assists: 1, captain: true }), 1, 'fulltime')).toBe(4200);
    expect(total(line({ position: 'ST', goals: 1 }), 5, 'fulltime')).toBe(51); // 50 × 0.25 and 150 × 0.25, each rounded to whole dollars
  });

  it('pays tackle bonuses only past the threshold: 3 for centre-backs and DMs, 2 for full-backs', () => {
    expect(total(line({ position: 'CB', tackles: 2 }), 3, 'fulltime')).toBe(50);
    expect(total(line({ position: 'CB', tackles: 3 }), 3, 'fulltime')).toBe(125);
    expect(total(line({ position: 'DM', tackles: 6 }), 3, 'fulltime')).toBe(50 + 113); // +50% when dominant
    expect(total(line({ position: 'LB', tackles: 2 }), 3, 'fulltime')).toBe(125);
    expect(total(line({ position: 'RWB', tackles: 4 }), 3, 'fulltime')).toBe(50 + 113);
  });

  it('gives each position one bonus category', () => {
    expect(total(line({ position: 'GK', cleanSheet: true }), 3, 'fulltime')).toBe(200);
    expect(total(line({ position: 'CB', goals: 1, cleanSheet: true }), 3, 'fulltime')).toBe(50); // defenders aren't paid for goals or clean sheets
    expect(total(line({ position: 'CM', goals: 1, tackles: 5 }), 3, 'fulltime')).toBe(50); // central midfielders: appearance + captain only
    expect(total(line({ position: 'LW', tackles: 5, assists: 2 }), 3, 'fulltime')).toBe(250);
  });

  it('pays whole dollars', () => {
    for (const tier of [1, 2, 3, 4, 5] as const) {
      const { items } = matchPayout(line({ position: 'DM', tackles: 6, captain: true }), tier, 'fulltime');
      for (const i of items) expect(Number.isInteger(i.amount)).toBe(true);
    }
  });
});

describe('signing bonus', () => {
  it('is a share of the fee, more for a bigger gap, never below the tier floor, zero for prospects', () => {
    const base = { fee: usd(10_000_000), value: usd(9_000_000), tier: 2 as const, ovrGap: 0, mode: 'freelance' as const, prospect: false };
    // A $10M fee counts as $1M + 40% of the next $9M = $4.6M (big fees taper).
    expect(signingBonus(base)).toBe(92_000); // 2% of $4.6M
    expect(signingBonus({ ...base, ovrGap: 3 })).toBe(119_600); // ×1.3
    expect(signingBonus({ ...base, ovrGap: 30 })).toBe(138_000); // capped ×1.5
    expect(signingBonus({ ...base, mode: 'fulltime' })).toBe(46_000); // 1%
    expect(signingBonus({ ...base, fee: usd(800_000), tier: 3 })).toBe(16_000); // small fees: the full 2%
    expect(signingBonus({ ...base, fee: usd(0), value: usd(10_000), tier: 5 })).toBe(1_500); // free agent → floor
    expect(signingBonus({ ...base, prospect: true })).toBe(0);
  });
});

function withPlacement(): { w: GameState; pid: PlayerId; clubId: ClubId } {
  const w = generateWorld(97531);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  advanceDays(w, makeDate(2026, 9, 2) - w.date); // after the summer window, so the AI market can't take him
  const club = Object.values(w.clubs).find((c) => c.tier === 2 && c.countryId === eng)!;
  const p = club.squad.map((id) => w.players[id]!).find((x) => x.naturalPosition === 'ST' && !x.injury)!;
  w.placements.push({
    id: 0,
    dealId: -1,
    playerId: p.id,
    clubId: club.id,
    position: 'ST',
    signedOn: w.date,
    expiresOn: makeDate(2030, 6, 30),
    fee: usd(1_000_000),
    ovrGap: 3,
    prospect: false,
    mode: 'freelance',
    bonus: usd(0),
    bonusPaid: false,
    earnings: emptyEarnings(),
  });
  return { w, pid: p.id, clubId: club.id };
}

describe('payouts in the season', () => {
  it('settles the signing bonus and pays match bonuses into the ledger as he plays', () => {
    const { w, pid } = withPlacement();
    const start = w.scout!.money;
    advanceDays(w, 30);
    const pl = w.placements[0]!;
    expect(pl.bonusPaid).toBe(true);
    expect(pl.bonus).toBeGreaterThanOrEqual(30_000); // tier-2 freelance floor
    expect(w.ledger.some((l) => l.kind === 'signing-bonus')).toBe(true);
    expect(pl.endedOn).toBeUndefined();
    if (w.players[pid]!.stats.apps > 0) {
      expect(pl.earnings.appearance).toBeGreaterThan(0);
      expect(w.ledger.some((l) => l.kind === 'match-bonus')).toBe(true);
    }
    expect(w.scout!.money).toBeGreaterThan(start);
    expect(w.ledgerTotals[2026]!['signing-bonus']).toBe(pl.bonus);
  }, 60_000);

  it('stops paying once he leaves the club', () => {
    const { w, pid } = withPlacement();
    advanceDays(w, 14);
    const rival = Object.values(w.clubs).find((c) => c.tier === 2 && c.id !== w.placements[0]!.clubId)!;
    executeTransfer(w, w.players[pid]!, rival, usd(0), w.players[pid]!.wage, w.date);
    advanceDays(w, 1);
    const pl = w.placements[0]!;
    expect(pl.endedOn).toBeDefined();
    expect(pl.endReason).toMatch(/left/);
    const earned = Object.values(pl.earnings).reduce((a, b) => a + b, 0);
    advanceDays(w, 30);
    expect(Object.values(pl.earnings).reduce((a, b) => a + b, 0)).toBe(earned);
  }, 60_000);
});

describe('bankruptcy', () => {
  it('ends the career after eight straight weeks in debt, and blocks further actions', () => {
    const e = new Engine();
    e.generate(4321);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'hard' });
    const s = (e as unknown as { state: GameState }).state;
    s.scout!.money = usd(-500);
    e.advance(BANKRUPTCY_DAYS - 1);
    expect(s.careerOver).toBeUndefined();
    expect(e.getScout()!.debt!.daysLeft).toBeLessThanOrEqual(2);
    const r = e.advance(2);
    expect(r.careerOver).toBeDefined();
    expect(() => e.advance(1)).toThrow(/career is over/);
  }, 60_000);

  it('resets the clock when you get back above zero', () => {
    const w = generateWorld(4322);
    createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'hard' });
    w.scout!.money = usd(-100);
    advanceDays(w, 30);
    expect(w.scout!.brokeSince).toBeDefined();
    w.scout!.money = usd(100);
    advanceDays(w, 1);
    expect(w.scout!.brokeSince).toBeUndefined();
  }, 60_000);
});

describe('save migration', () => {
  it('upgrades v4 placements and pays their owed signing bonus on the next day', () => {
    const { w } = withPlacement();
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 4;
    for (const k of ['pendingPayouts', 'balanceHistory', 'ledgerTotals']) delete old[k];
    for (const p of old.placements) for (const k of ['bonus', 'bonusPaid', 'earnings']) delete p[k];
    const up = migrate(old);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.placements[0]!.bonusPaid).toBe(false);
    advanceDays(up, 1);
    expect(up.placements[0]!.bonusPaid).toBe(true);
    expect(up.placements[0]!.bonus).toBeGreaterThan(0);
  }, 30_000);
});
