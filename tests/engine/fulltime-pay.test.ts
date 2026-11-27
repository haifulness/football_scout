import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Club } from '../../src/engine/model/club';
import type { GameState } from '../../src/engine/model/world-state';
import { RELEGATION_COST, SEASON_BONUS, acceptOffer, salaryFor, seasonBonus } from '../../src/engine/systems/employment';
import { createCareer } from '../../src/engine/systems/scouting';
import { seasonWindow } from '../../src/engine/systems/fixtures';

const eng = 'eng' as CountryId;
function setup(): GameState {
  const w = generateWorld(8642);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  w.scout!.money = usd(0);
  return w;
}

function hire(w: GameState, club: Club) {
  w.offers.push({ id: 99, kind: 'fulltime', clubId: club.id, title: 'Scout', salary: salaryFor(club.tier, 50, 1), seasons: 2, createdOn: w.date, expiresOn: (w.date + 21) as never });
  acceptOffer(w, 99);
}

/** Every game of the season played: `club` wins (or loses) all of its own, the rest are draws. */
function playSeason(w: GameState, club: Club, wins: boolean) {
  for (const f of w.fixtures[club.leagueId]!) {
    const mine = f.homeId === club.id ? 'home' : f.awayId === club.id ? 'away' : undefined;
    const [hg, ag] = !mine ? [1, 1] : (mine === 'home') === wins ? [3, 0] : [0, 3];
    f.result = { homeGoals: hg, awayGoals: ag } as never;
  }
}

const topFlight = (w: GameState) => w.leagues[w.countries[eng]!.leagueIds[0]!]!;

describe('full-time season bonus', () => {
  it('pays a share of salary for winning the league, pro rata from the day you joined', () => {
    const w = setup();
    const club = w.clubs[topFlight(w).clubIds[3]!]!;
    hire(w, club);
    playSeason(w, club, true);
    const end = seasonWindow(w.season.year).end;
    seasonBonus(w, end);
    const salary = (w.scout!.employment as { salary: number }).salary;
    expect(w.scout!.money).toBeGreaterThan(salary * SEASON_BONUS.title * 0.85);
    expect(w.scout!.money).toBeLessThanOrEqual(salary * SEASON_BONUS.title);
    expect(w.news.some((n) => n.title.startsWith('Season bonus'))).toBe(true);
  });

  it('pays nothing for a relegation and costs you with the coach', () => {
    const w = setup();
    const club = w.clubs[topFlight(w).clubIds[3]!]!;
    hire(w, club);
    const before = w.scout!.relationships[club.headCoachId]!;
    playSeason(w, club, false);
    seasonBonus(w, seasonWindow(w.season.year).end);
    expect(w.scout!.money).toBe(0);
    expect(w.scout!.relationships[club.headCoachId]).toBe(before - RELEGATION_COST);
  });

  it('pays nothing to a freelancer', () => {
    const w = setup();
    const club = w.clubs[topFlight(w).clubIds[3]!]!;
    playSeason(w, club, true);
    seasonBonus(w, seasonWindow(w.season.year).end);
    expect(w.scout!.money).toBe(0);
  });
});
