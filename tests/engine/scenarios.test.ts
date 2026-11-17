import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { ScenarioId } from '../../src/engine/model/scenario';
import type { GameState } from '../../src/engine/model/world-state';
import { careerSummary } from '../../src/engine/systems/career-end';
import { dropClient } from '../../src/engine/systems/employment';
import { GOLDEN_MAX_AGE, scenarioProgress, scenarioTick } from '../../src/engine/systems/scenarios';
import { createCareer } from '../../src/engine/systems/scouting';
import { advanceDays } from '../../src/engine/tick';
import { ageOn } from '../../src/engine/core/calendar';

const eng = 'eng' as CountryId;

function start(scenario: ScenarioId, seed = 31415): GameState {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy', scenario });
  return w;
}

describe('scenarios', () => {
  it('shoestring: the poorest country, $1,000, hard; $100k wins early with a bonus', () => {
    const w = start('shoestring');
    const poorest = Object.values(w.countries)
      .filter((c) => Object.values(w.clubs).some((k) => k.countryId === c.id))
      .sort((a, b) => a.wealthIndex - b.wealthIndex)[0]!;
    expect(w.scout!.homeCountry).toBe(poorest.id);
    expect(w.scout!.difficulty).toBe('hard');
    expect(w.scout!.money).toBe(1_000);
    expect(scenarioProgress(w)!.fraction).toBeCloseTo(0.01, 3);
    w.scout!.money = usd(100_000);
    scenarioTick(w, addDays(w.date, 30));
    expect(w.scenario!.status).toBe('won');
    expect(w.careerOver?.kind).toBe('scenario');
    const line = careerSummary(w).breakdown.find((l) => l.label === 'Scenario')!;
    expect(line.points).toBeGreaterThan(650); // 400 + most of the 300 for time left
  });

  it('relegation rescue: full-time at the weakest top-flight club, judged when the season ends', () => {
    const w = start('rescue');
    const e = w.scout!.employment;
    expect(e.mode).toBe('fulltime');
    const club = w.clubs[w.scenario!.clubId!]!;
    expect(club.countryId).toBe(eng);
    expect(w.leagues[club.leagueId]!.level).toBe(1);
    advanceDays(w, 400, undefined, { stopAtDeadline: false });
    expect(w.scenario!.status).not.toBe('active');
    expect(w.careerOver?.kind).toBe('scenario');
    expect(w.careerOver!.reason).toMatch(/stay up|go down|lost your job/);
  }, 300_000);

  it('golden generation: three prodigies revealed at 17 or under win it', () => {
    const w = start('golden');
    const young = Object.values(w.players).filter((p) => p.isProdigy && ageOn(p.birthDate, w.date) <= GOLDEN_MAX_AGE);
    expect(young.length).toBeGreaterThanOrEqual(3);
    for (const p of young.slice(0, 2)) w.prodigyFinds.push({ playerId: p.id, date: w.date });
    scenarioTick(w, w.date);
    expect(w.scenario!.status).toBe('active');
    w.prodigyFinds.push({ playerId: young[2]!.id, date: w.date });
    scenarioTick(w, w.date);
    expect(w.scenario!.status).toBe('won');
  });

  it('big-club audition: a tier-1 client from day one; dropping them loses it', () => {
    const w = start('audition');
    const club = w.clubs[w.scenario!.clubId!]!;
    expect(club.tier).toBe(1);
    expect(w.scout!.reputation).toBe(35);
    // The head start doesn't score: only reputation gained does.
    expect(careerSummary(w).breakdown.find((l) => l.label === 'Reputation')!.points).toBe(0);
    expect(w.scout!.employment).toEqual({ mode: 'freelance', clients: [club.id] });
    dropClient(w, club.id);
    scenarioTick(w, w.date);
    expect(w.scenario!.status).toBe('lost');
    expect(careerSummary(w).breakdown.find((l) => l.label === 'Scenario')!.points).toBe(0);
  });

  it('time runs out after the deadline', () => {
    const w = start('golden');
    scenarioTick(w, addDays(w.scenario!.deadline, 1));
    expect(w.scenario!.status).toBe('lost');
    expect(w.careerOver!.reason).toMatch(/Time ran out/);
  });
});
