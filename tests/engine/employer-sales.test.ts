import { describe, expect, it } from 'vitest';
import { isTransferWindow } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Club } from '../../src/engine/model/club';
import type { GameState } from '../../src/engine/model/world-state';
import { formationPositions, pitch, resolveDeals } from '../../src/engine/systems/deals';
import { acceptOffer, clubRecord, clubTrust, salaryFor } from '../../src/engine/systems/employment';
import { EMPLOYER_SALE_FLOOR, acceptMandate, mandateCommission, marketTick, pitchRights } from '../../src/engine/systems/market';
import { createCareer } from '../../src/engine/systems/scouting';
import { addDays } from '../../src/engine/core/calendar';

const eng = 'eng' as CountryId;
function setup(): GameState {
  const w = generateWorld(8642);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  w.scout!.money = usd(200_000);
  return w;
}
const englishClubs = (w: GameState, tier: number) => Object.values(w.clubs).filter((c) => c.tier === tier && c.countryId === eng);

function hire(w: GameState, club: Club) {
  w.offers.push({ id: 99, kind: 'fulltime', clubId: club.id, title: 'Scout', salary: salaryFor(club.tier, 20, 1), seasons: 2, createdOn: w.date, expiresOn: (w.date + 21) as never });
  acceptOffer(w, 99);
}

describe('selling for your employer', () => {
  it("lets a full-time scout pitch his club's players to any club, but not other players", () => {
    const w = setup();
    const [employer, other] = englishClubs(w, 4);
    hire(w, employer!);
    const own = w.players[employer!.squad[5]!]!;
    const stranger = w.players[other!.squad[5]!]!;
    const buyer = englishClubs(w, 3)[0]!;
    expect(pitchRights(w, own, buyer)).toMatchObject({ ok: true, forEmployer: true });
    expect(pitchRights(w, stranger, buyer).ok).toBe(false);
    expect(pitchRights(w, stranger, employer!).ok).toBe(true);
  });

  it('gives a full-time scout selling briefs from his employer, from day one, at a smaller commission', () => {
    const w = setup();
    const employer = englishClubs(w, 4)[0]!;
    hire(w, employer);
    let date = w.date;
    for (let i = 0; i < 200 && !w.mandates.length; i++) {
      date = addDays(date, 1);
      w.date = date;
      marketTick(w, date);
    }
    const m = w.mandates[0]!;
    expect(m.clubId).toBe(employer.id);
    expect(m.commissionPct).toBeGreaterThanOrEqual(2);
    expect(m.commissionPct).toBeLessThanOrEqual(3);
    // A small club's small fee still pays a minimum.
    expect(m.employer).toBe(true);
    expect(mandateCommission(w, m, 1_000)).toBe(EMPLOYER_SALE_FLOOR[employer.tier]);
    acceptMandate(w, m.id);
    expect(m.status).toBe('active');
  });

  it('a sale without a brief pays no commission or placement, but your club remembers it', () => {
    const w = setup();
    const employer = englishClubs(w, 4)[0]!;
    hire(w, employer);
    expect(isTransferWindow(w.date)).toBe(true);
    const buyer = englishClubs(w, 2).find((c) => c.transferBudget > 2_000_000)!;
    w.scout!.location = buyer.cityId;
    w.scout!.reputation = 60;
    const pos = formationPositions(buyer).find((x) => x !== 'GK')!;
    const own = employer.squad.map((id) => w.players[id]!).find((p) => p.naturalPosition === pos) ?? w.players[employer.squad[3]!]!;
    const deal = pitch(w, { playerId: own.id, clubId: buyer.id, position: pos, to: 'coach' });
    expect(deal.forEmployer).toBe(true);
    // Skip the talks: everyone agrees.
    deal.stage = 'agreed';
    deal.fee = usd(10_000);
    const before = { money: w.scout!.money, trust: clubTrust(w, employer.id), placements: w.placements.length };
    resolveDeals(w, w.date);
    expect(deal.stage).toBe('completed');
    expect(w.players[own.id]!.clubId).toBe(buyer.id);
    expect(w.placements.length).toBe(before.placements);
    expect(w.scout!.money).toBe(before.money);
    expect(clubRecord(w.scout!, employer.id).sales).toBe(1);
    expect(clubTrust(w, employer.id)).toBeGreaterThan(before.trust);
  });
});
