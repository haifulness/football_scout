import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';

const eng = 'eng' as CountryId;

function career(): { e: Engine; w: GameState } {
  const e = new Engine();
  e.generate(11223);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  return { e, w: (e as unknown as { state: GameState }).state };
}

describe('weekly needs magazine', () => {
  it('without clients, it says so and still lists leads at home: urgent, with money, one per club', () => {
    const { e, w } = career();
    const g = e.getGazette();
    expect(g.noClubs).toBe(true);
    expect(g.yourClubs).toEqual([]);
    expect(g.issue).toBe(1);
    expect(g.leads.length).toBeGreaterThan(0);
    expect(g.leads.length).toBeLessThanOrEqual(6);
    for (const n of g.leads) {
      expect(w.clubs[n.club.id]!.countryId).toBe(eng);
      expect(n.severity).toBeGreaterThanOrEqual(0.45);
      expect(n.transferBudget).toBeGreaterThan(0);
    }
    expect(new Set(g.leads.map((n) => n.club.id)).size).toBe(g.leads.length);
    // Demand is sorted by how many clubs want the position.
    for (let i = 1; i < g.demand.length; i++) expect(g.demand[i - 1]!.clubs).toBeGreaterThanOrEqual(g.demand[i]!.clubs);
  });

  it("puts a client's needs on the front page and finds pool players who beat the bar", () => {
    const { e, w } = career();
    const club = Object.values(w.clubs).find((c) => c.tier === 3 && c.countryId === eng)!;
    if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
    let g = e.getGazette();
    expect(g.noClubs).toBe(false);
    expect(g.yourClubs.length).toBeGreaterThan(0);
    expect(g.yourClubs.every((n) => n.club.id === club.id && n.severity >= 0.2)).toBe(true);
    // The client is not also a lead.
    expect(g.leads.some((n) => n.club.id === club.id)).toBe(false);

    // Fill the pool with every player elsewhere at the top need's position.
    const pos = g.yourClubs[0]!.position;
    for (const p of Object.values(w.players)) {
      if (p.naturalPosition === pos && p.clubId !== club.id) w.pool[p.id] = { addedOn: w.date, source: 'manual', starred: false };
    }
    g = e.getGazette();
    expect(g.poolFits.length).toBeGreaterThan(0);
    expect(g.poolFits.length).toBeLessThanOrEqual(8);
    for (const f of g.poolFits) {
      expect(f.club.id).toBe(club.id);
      expect(f.margin).toBeGreaterThanOrEqual(0);
      const need = g.yourClubs.find((n) => n.position === f.position)!;
      expect(f.player.ovr).toBeGreaterThanOrEqual(need.average + 1);
      if (f.player.club) expect(need.transferBudget <= 0 || f.player.value <= need.transferBudget).toBe(true);
    }
  });
});
