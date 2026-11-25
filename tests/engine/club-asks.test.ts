import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { askCoach, askCoachCheck, askPlayer, askPlayerCheck, insidePlayers, refusedUntil, swapCheck, swapRivals, swapWithRival } from '../../src/engine/systems/club-asks';
import { readLevel, tierOf } from '../../src/engine/systems/club-read';
import { signOffProbability } from '../../src/engine/systems/deals';

const eng = 'eng' as CountryId;

function career() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const s = (e as unknown as { state: GameState }).state;
  const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
  s.scout!.location = club.cityId;
  return { e, s, club };
}

describe('asking people about a club’s needs', () => {
  it('a coach who knows you tells you exactly', () => {
    const { s, club } = career();
    s.scout!.relationships[club.headCoachId] = 80;
    s.scout!.reputation = 40;
    expect(askCoachCheck(s, club.id).chance).toBeGreaterThan(0.9);
    const r = askCoach(s, club.id);
    expect(r.told).toBe(true);
    expect(tierOf(readLevel(s, club.id))).toBe('sure');
  });

  it('a coach who doesn’t says no, and holds it against you for months', () => {
    const { s, club } = career();
    s.scout!.relationships[club.headCoachId] = 20;
    s.scout!.reputation = 0;
    const coach = s.officials[club.headCoachId]!;
    const p = Object.values(s.players).find((x) => x.clubId && x.clubId !== club.id && x.naturalPosition === 'CM')!;
    const before = signOffProbability(s, coach, p, club, 'CM', usd(0));
    // Try until he refuses (each day gives a fresh roll).
    let told = true;
    for (let i = 0; i < 20 && told; i++) {
      if (!askCoachCheck(s, club.id).ok) break;
      told = askCoach(s, club.id).told;
      s.date = addDays(s.date, 1);
    }
    expect(told).toBe(false);
    expect(refusedUntil(s, coach.id)).toBeDefined();
    expect(askCoachCheck(s, club.id).ok).toBe(false);
    expect(s.scout!.relationships[coach.id]).toBeLessThan(20);
    expect(signOffProbability(s, coach, p, club, 'CM', usd(0))).toBeLessThan(before);
  });

  it('a player you know there tells you about his part of the pitch, once a month', () => {
    const { s, club } = career();
    const p = s.players[club.squad.find((id) => s.players[id]!.naturalPosition === 'CB')!]!;
    expect(askPlayerCheck(s, p.id).ok).toBe(false);
    s.scout!.rapport[p.id] = 50;
    expect(insidePlayers(s, club.id).map((x) => x.id)).toContain(p.id);
    askPlayer(s, p.id);
    expect(readLevel(s, club.id, 'CB')).toBeGreaterThanOrEqual(75);
    expect(readLevel(s, club.id)).toBeLessThan(25);
    expect(askPlayerCheck(s, p.id).ok).toBe(false);
  });

  it('a rival who works for the club trades what he knows, and then goes after your players', () => {
    const { s } = career();
    const target = Object.values(s.clubs).find((c) => swapRivals(s, c.id).length > 0)!;
    const r = swapRivals(s, target.id)[0]!;
    expect(swapCheck(s, target.id, r.id).ok).toBe(false); // nothing to trade yet
    const mine = Object.values(s.clubs).find((c) => c.id !== target.id && c.countryId === eng)!;
    if (s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(mine.id);
    swapWithRival(s, target.id, r.id);
    expect(readLevel(s, target.id)).toBeGreaterThanOrEqual(80);
    expect(r.tippedUntil).toBeGreaterThan(s.date);
    expect(swapCheck(s, target.id, r.id).ok).toBe(false);
  });
});
