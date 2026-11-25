import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { learnClub, readLevel, seenAverage, seenNeeds, staleClub, studyResult, tierOf } from '../../src/engine/systems/club-read';
import { clubPositionalAverage } from '../../src/engine/systems/deals';
import { learn } from '../../src/engine/systems/knowledge';
import { executeTransfer } from '../../src/engine/systems/transfers';

const eng = 'eng' as CountryId;

function career() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const s = (e as unknown as { state: GameState }).state;
  const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
  return { e, s, club };
}

describe('your read on a club’s needs', () => {
  it('starts unknown: no needs on the club page, no average in the pitch dialog', () => {
    const { e, s, club } = career();
    expect(tierOf(readLevel(s, club.id))).toBe('unknown');
    expect(seenNeeds(s, club)).toEqual([]);
    const view = e.getClub(club.id);
    expect(view.needs).toEqual([]);
    expect(view.needsRead.tier).toBe('unknown');
    const p = Object.values(s.players).find((x) => x.clubId && x.clubId !== club.id && x.naturalPosition === 'CM')!;
    const pre = e.getPitchPreview(p.id, club.id);
    expect(pre.averageRange).toBeUndefined();
    expect(pre.clearsBar).toBe('unknown');
  });

  it('clubs you work for keep you informed', () => {
    const { s, club } = career();
    if (s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(club.id);
    expect(tierOf(readLevel(s, club.id))).toBe('good');
    expect(seenNeeds(s, club).length).toBeGreaterThan(0);
  });

  it('a rough read shows only the pressing needs, with a wide average; a sure one is exact', () => {
    const { s, club } = career();
    learnClub(s, club.id, 30, s.date);
    const rough = seenNeeds(s, club);
    expect(rough.every((n) => n.severity >= 0.25)).toBe(true);
    const pos = 'CM' as const;
    const truth = clubPositionalAverage(s, club, pos);
    const r = seenAverage(s, club, pos, truth).range!;
    expect(r[0]).toBeLessThanOrEqual(truth);
    expect(r[1]).toBeGreaterThanOrEqual(truth);
    expect(r[1] - r[0]).toBeGreaterThanOrEqual(10);
    learnClub(s, club.id, 90, s.date);
    expect(seenAverage(s, club, pos, truth).range).toEqual([truth, truth]);
  });

  it('studying the squad is worth more the better you know their players', () => {
    const { s, club } = career();
    const cold = studyResult(s, club);
    for (const id of club.squad) learn(s, s.players[id]!, 60, 60, s.date);
    expect(studyResult(s, club)).toBeGreaterThan(cold);
  });

  it('the study command takes days and raises the read', () => {
    const { e, s, club } = career();
    const date = s.date;
    const r = e.studyClub(club.id);
    expect(r.after).toBeGreaterThan(r.before);
    expect(s.date).toBe(date + r.days);
    expect(e.getClub(club.id).needsRead.tier).not.toBe('unknown');
  });

  it('goes out of date when the squad changes', () => {
    const { s, club } = career();
    learnClub(s, club.id, 70, s.date);
    const p = Object.values(s.players).find((x) => x.clubId && x.clubId !== club.id && x.naturalPosition === 'ST')!;
    executeTransfer(s, p, club, usd(0), p.wage, s.date);
    expect(readLevel(s, club.id)).toBeLessThan(70);
    expect(s.clubReads![club.id]!.stale).toMatch(/signed/);
    staleClub(s, club.id, 'A new coach', 30);
    expect(readLevel(s, club.id)).toBeLessThan(50);
  });
});
