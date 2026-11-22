import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine';
import { bylines, ensurePredictions } from '../../src/engine/systems/newspaper';
import type { GameState } from '../../src/engine/model/world-state';

const eng = 'eng' as CountryId;

function setup(): { w: GameState; e: Engine } {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  return { e, w: (e as unknown as { state: GameState }).state };
}

describe('The Touchline', () => {
  it('the pundit picks once a season, from the home top flight', () => {
    const { w } = setup();
    ensurePredictions(w);
    ensurePredictions(w);
    const picks = w.predictions!.filter((p) => p.season === w.season.year);
    expect(picks.length).toBe(1);
    const league = w.leagues[w.countries[eng]!.leagueIds[0]!]!;
    expect(league.clubIds).toContain(picks[0]!.title);
    expect(picks[0]!.relegated.length).toBeGreaterThanOrEqual(2);
    expect(picks[0]!.relegated).not.toContain(picks[0]!.title);
  });

  it('every desk has its own reporter', () => {
    const b = bylines(12);
    expect(new Set(Object.values(b)).size).toBe(Object.values(b).length);
  });

  it('prints a full paper after a few weeks of football, the same paper twice', () => {
    const { w, e } = setup();
    ensurePredictions(w);
    // Into the season: results, a table and rumours.
    e.advance(70);
    const g = e.getGazette();
    expect(g.front.headline.length).toBeGreaterThan(0);
    expect(g.table.length).toBeGreaterThan(0);
    expect(g.pundit?.title.pos).toBeGreaterThan(0);
    expect(g.links.length).toBeGreaterThan(0);
    for (const r of g.links) expect(w.players[r.player.id]!.clubId).not.toBe(r.club.id);
    // Deterministic within an issue.
    expect(e.getGazette().links).toEqual(g.links);
  });

  it('puts your signing on the front page when he scores', () => {
    const { w, e } = setup();
    const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier <= 3)!;
    const pid = club.squad.find((id) => w.players[id]!.naturalPosition === 'ST') ?? club.squad[0]!;
    w.placements.push({
      id: 1,
      dealId: 1,
      playerId: pid,
      clubId: club.id,
      position: w.players[pid]!.naturalPosition,
      signedOn: w.date,
      expiresOn: (w.date + 700) as typeof w.date,
      fee: 0 as never,
      ovrGap: 2,
      prospect: false,
      mode: 'freelance',
      bonus: 0 as never,
      bonusPaid: true,
      earnings: { appearance: 0, goals: 0, assists: 0, tackles: 0, cleanSheets: 0, captain: 0 },
    });
    const opp = w.leagues[club.leagueId]!.clubIds.find((id) => id !== club.id)!;
    (w.fixtures[club.leagueId] ??= []).push({
      id: 'test',
      leagueId: club.leagueId,
      round: 1,
      date: w.date,
      homeId: club.id,
      awayId: opp,
      result: { homeGoals: 2, awayGoals: 0, attendance: 1000, goals: [{ minute: 10, clubId: club.id, scorerId: pid }, { minute: 80, clubId: club.id, scorerId: pid }] },
    });
    const g = e.getGazette();
    expect(g.front.kind).toBe('yours');
    expect(g.front.player?.id).toBe(pid);
    expect(g.front.headline).toMatch(/double/);
    expect(g.corner[0]!.starred).toBe(true);
  });
});
