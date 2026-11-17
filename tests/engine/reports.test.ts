import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { Player } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import { signOffProbability } from '../../src/engine/systems/deals';
import { clubTrust } from '../../src/engine/systems/employment';
import { knowledgeLevel } from '../../src/engine/systems/knowledge';
import { ovrAt } from '../../src/engine/systems/ratings';
import { accuracyTrust, REVIEW_DAYS, reportBonus, reportTick, trackRecord, writeReport } from '../../src/engine/systems/reports';
import { createCareer } from '../../src/engine/systems/scouting';
import { migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;
let shared: GameState | undefined;

function setup(): GameState {
  // One world for the whole file (generation is the slow part); each test works on its own players.
  if (!shared) {
    shared = generateWorld(97531);
    createCareer(shared, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'normal' });
  }
  return shared;
}

let next = 0;
/** A different senior outfield player each call, known well enough to report on. */
function knownPlayer(w: GameState, level = 60): Player {
  const players = Object.values(w.players).filter((p) => p.clubId && p.naturalPosition !== 'GK' && !w.reports.some((r) => r.playerId === p.id));
  const p = players[next++ * 7]!;
  w.knowledge[p.id] = { level, lastUpdated: w.date };
  return p;
}

const write = (w: GameState, p: Player, rating = ovrAt(p, p.naturalPosition)) =>
  writeReport(w, { playerId: p.id, role: p.naturalPosition, rating, potential: 'C', verdict: 'ready' });

describe('scouting reports', () => {
  it('need you to know the player, and a rewrite before the review replaces the first one', () => {
    const w = setup();
    // A lower-league player: nothing much is public about him.
    const p = Object.values(w.players).find((x) => x.clubId && w.clubs[x.clubId]!.tier === 5 && knowledgeLevel(w, x) < 40 && x.naturalPosition !== 'GK')!;
    expect(() => write(w, p)).toThrow(/knowledge 40/);
    w.knowledge[p.id] = { level: 55, lastUpdated: w.date };
    const first = write(w, p, 60);
    const again = write(w, p, 64);
    expect(again.id).toBe(first.id);
    expect(w.reports.filter((r) => r.playerId === p.id)).toHaveLength(1);
    expect(w.reports.find((r) => r.playerId === p.id)!.rating).toBe(64);
  });

  it('back a pitch: the coach is keener with your report, and half as keen if you pitch him in another role', () => {
    const w = setup();
    const p = knownPlayer(w, 90);
    const club = Object.values(w.clubs).find((c) => c.id !== p.clubId && c.countryId === eng)!;
    const coach = w.officials[club.headCoachId]!;
    const without = signOffProbability(w, coach, p, club, p.naturalPosition, p.value);
    write(w, p);
    expect(signOffProbability(w, coach, p, club, p.naturalPosition, p.value)).toBeGreaterThan(without);
    const other = p.naturalPosition === 'CB' ? 'ST' : 'CB';
    expect(reportBonus(w, p.id, other)).toBeCloseTo(reportBonus(w, p.id, p.naturalPosition) / 2, 5);
  });

  it('are checked a year later: close calls score well, overselling a player costs reputation', () => {
    const w = setup();
    w.reports = []; // only this test's reports are checked here
    const good = knownPlayer(w);
    const bad = knownPlayer(w);
    write(w, good);
    write(w, bad, Math.min(99, ovrAt(bad, bad.naturalPosition) + 25));
    const rep = w.scout!.reputation = 30;
    reportTick(w, addDays(w.date, REVIEW_DAYS));
    const g = w.reports.find((r) => r.playerId === good.id)!.outcome!;
    const b = w.reports.find((r) => r.playerId === bad.id)!.outcome!;
    expect(g.grade).toBe('spot on');
    expect(b.grade).toBe('way off');
    expect(b.overrated).toBe(true);
    expect(w.scout!.reputation).toBe(rep - 1);
    expect(w.news.some((n) => n.title.startsWith('Report checked') && n.forYou)).toBe(true);
  });

  it('build a track record once three are checked, and an accurate one makes clubs trust you more', () => {
    const w = setup();
    w.reports = [];
    expect(trackRecord(w).accuracy).toBeUndefined();
    const club = Object.values(w.clubs).find((c) => c.countryId === eng)!;
    const before = clubTrust(w, club.id);
    for (let i = 0; i < 4; i++) write(w, knownPlayer(w));
    reportTick(w, addDays(w.date, REVIEW_DAYS));
    const record = trackRecord(w);
    expect(record.reviewed).toBe(4);
    expect(record.accuracy).toBe(1);
    expect(accuracyTrust(w)).toBe(8);
    expect(clubTrust(w, club.id)).toBe(Math.min(100, before + 8));
  });

  it('are voided if he retires before the review', () => {
    const w = setup();
    const p = knownPlayer(w);
    write(w, p);
    delete w.players[p.id];
    reportTick(w, addDays(w.date, REVIEW_DAYS));
    expect(w.reports.find((r) => r.playerId === p.id)!.voided).toBe(true);
  });

  it('upgrade a v13 save with none', () => {
    const w = setup();
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 13;
    delete old.reports;
    delete old.counters.report;
    const s = migrate(old) as GameState;
    expect(s.reports).toEqual([]);
    expect(s.counters.report).toBe(0);
  });
});
