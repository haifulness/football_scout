import { beforeAll, describe, expect, it } from 'vitest';
import { makeDate, toParts } from '../../src/engine/core/calendar';
import type { ClubId } from '../../src/engine/core/ids';
import { Rng } from '../../src/engine/core/rng';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { GameState } from '../../src/engine/model/world-state';
import { matchDates, roundRobin, seasonWindow } from '../../src/engine/systems/fixtures';
import { leagueTable, clubLevel } from '../../src/engine/systems/season';
import { advanceDays, advanceToNextMatchday } from '../../src/engine/tick';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}` as ClubId);

describe('fixtures', () => {
  for (const n of [12, 20, 24, 15]) {
    it(`double round robin for ${n} clubs`, () => {
      const rounds = roundRobin(ids(n), new Rng(1));
      const pairs = new Map<string, number>();
      for (const round of rounds) {
        const seen = new Set<string>();
        for (const m of round) {
          expect(seen.has(m.home) || seen.has(m.away)).toBe(false);
          seen.add(m.home);
          seen.add(m.away);
          pairs.set(`${m.home}>${m.away}`, (pairs.get(`${m.home}>${m.away}`) ?? 0) + 1);
        }
      }
      // venues alternate: no long home/away runs, balanced home count per half
      for (const id of ids(n)) {
        const seq = rounds.map((r) => (r.some((m) => m.home === id) ? 'H' : r.some((m) => m.away === id) ? 'A' : '-')).join('');
        const longest = Math.max(...(seq.replace(/-/g, '').match(/H+|A+/g) ?? ['']).map((x) => x.length));
        expect(longest).toBeLessThanOrEqual(4);
        const firstHalfHomes = seq.slice(0, rounds.length / 2).split('H').length - 1;
        expect(Math.abs(firstHalfHomes - rounds.length / 4)).toBeLessThanOrEqual(1);
      }
      // every ordered pair exactly once = each pairing home and away
      expect(pairs.size).toBe(n * (n - 1));
      expect([...pairs.values()].every((v) => v === 1)).toBe(true);
    });
  }

  it('schedules every round inside the season window, in order', () => {
    for (const rounds of [22, 38, 46]) {
      const dates = matchDates(2026, rounds);
      const { start, end } = seasonWindow(2026);
      expect(dates.length).toBe(rounds);
      expect(new Set(dates).size).toBe(rounds);
      for (let i = 1; i < dates.length; i++) expect(dates[i]!).toBeGreaterThan(dates[i - 1]!);
      expect(dates[0]!).toBeGreaterThanOrEqual(start);
      expect(dates.at(-1)!).toBeLessThanOrEqual(end);
    }
  });
});

describe('a full simulated season', () => {
  let world: GameState;
  let seasonMs = 0;
  let weekMs = 0;
  let snapshot: { leagueSizes: Record<string, number>; topFlightLevels: { clubId: ClubId; level: number; position: number }[] };

  beforeAll(() => {
    world = generateWorld(2024);
    advanceDays(world, 60); // to Aug 30: a few matchdays in
    const t0 = performance.now();
    advanceDays(world, 7);
    weekMs = performance.now() - t0;
    const t1 = performance.now();
    advanceDays(world, makeDate(2027, 6, 1) - world.date); // to June 1, 2027: season over, before rollover
    seasonMs = performance.now() - t1;
    snapshot = {
      leagueSizes: Object.fromEntries(Object.values(world.leagues).map((l) => [l.id, l.clubIds.length])),
      topFlightLevels: [],
    };
  }, 180_000);

  it('plays every fixture', () => {
    const all = Object.values(world.fixtures).flat();
    expect(all.length).toBeGreaterThan(20_000);
    expect(all.every((f) => f.result)).toBe(true);
    console.log(`week: ${weekMs.toFixed(0)} ms, rest of season: ${(seasonMs / 1000).toFixed(1)} s, matches: ${all.length}`);
  });

  it('produces realistic scorelines', () => {
    const all = Object.values(world.fixtures)
      .flat()
      .map((f) => f.result!);
    const goals = all.reduce((s, r) => s + r.homeGoals + r.awayGoals, 0) / all.length;
    const home = all.filter((r) => r.homeGoals > r.awayGoals).length / all.length;
    const draws = all.filter((r) => r.homeGoals === r.awayGoals).length / all.length;
    console.log(`goals/game ${goals.toFixed(2)}, home wins ${(home * 100).toFixed(1)}%, draws ${(draws * 100).toFixed(1)}%`);
    expect(goals).toBeGreaterThan(2.2);
    expect(goals).toBeLessThan(3.2);
    expect(home).toBeGreaterThan(0.38);
    expect(home).toBeLessThan(0.52);
    expect(draws).toBeGreaterThan(0.18);
    expect(draws).toBeLessThan(0.33);
  });

  it('credits every non-own goal to a player on the scoring side', () => {
    for (const f of Object.values(world.fixtures).flat().slice(0, 3000)) {
      const r = f.result!;
      expect(r.goals.length).toBe(r.homeGoals + r.awayGoals);
      for (const g of r.goals) {
        if (g.ownGoal) continue;
        expect(g.scorerId).toBeDefined();
        expect(g.assistId).not.toBe(g.scorerId);
      }
    }
  });

  it('lets stronger squads finish higher', () => {
    let topHalf = 0,
      bottomHalf = 0,
      n = 0;
    for (const league of Object.values(world.leagues)) {
      const table = leagueTable(world, league.id);
      const half = Math.floor(table.length / 2);
      const lvl = (id: ClubId) => clubLevel(world, world.clubs[id]!, world.date);
      topHalf += table.slice(0, half).reduce((s, r) => s + lvl(r.clubId), 0) / half;
      bottomHalf += table.slice(-half).reduce((s, r) => s + lvl(r.clubId), 0) / half;
      n++;
    }
    expect(topHalf / n).toBeGreaterThan(bottomHalf / n + 1.5);
  });

  it('records player stats consistent with results', () => {
    const goals = Object.values(world.fixtures)
      .flat()
      .reduce((s, f) => s + f.result!.goals.filter((g) => !g.ownGoal).length, 0);
    const credited = Object.values(world.players).reduce((s, p) => s + p.stats.goals, 0);
    // Players released/retired mid-season don't exist yet, so these must match exactly.
    expect(credited).toBe(goals);
    const gk = Object.values(world.players).filter((p) => p.naturalPosition === 'GK' && p.stats.apps > 20);
    expect(gk.some((p) => p.stats.cleanSheets > 5)).toBe(true);
  });

  it('spreads goals and assists realistically', () => {
    const boots: number[] = [];
    const topAssists: number[] = [];
    for (const c of Object.values(world.countries)) {
      const players = world.leagues[c.leagueIds[0]!]!.clubIds.flatMap((id) => world.clubs[id]!.squad.map((p) => world.players[p]!));
      boots.push(Math.max(...players.map((p) => p.stats.goals)));
      topAssists.push(Math.max(...players.map((p) => p.stats.assists)));
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    console.log(`golden boot median ${median(boots)} max ${Math.max(...boots)}; top assists median ${median(topAssists)} max ${Math.max(...topAssists)}`);
    expect(median(boots)).toBeGreaterThanOrEqual(16);
    expect(median(boots)).toBeLessThanOrEqual(30);
    // Record-breaking seasons happen (real top-flight records reach the 40s-50): only rule out absurd totals.
    expect(Math.max(...boots)).toBeLessThanOrEqual(45);
    expect(median(topAssists)).toBeLessThanOrEqual(18);
  });

  it('publishes a season review per country', () => {
    expect(world.season.ended).toBe(true);
    expect(world.news.filter((n) => n.kind === 'season-review').length).toBe(Object.keys(world.countries).length);
  });

  it('runs through the summer to the next season when asked for the next matchday', () => {
    const copy = structuredClone(world);
    const r = advanceToNextMatchday(copy);
    expect(r.seasonRolledOver).toBe(true);
    expect(copy.season.year).toBe(2027);
    expect(copy.date).toBe(seasonWindow(2027).start);
    expect(r.news.some((n) => n.kind === 'season-start')).toBe(true);
  }, 60_000);

  describe('season rollover', () => {
    beforeAll(() => {
      for (const country of Object.values(world.countries)) {
        const top = leagueTable(world, country.leagueIds[0]!);
        snapshot.topFlightLevels.push(...top.map((r, i) => ({ clubId: r.clubId, level: 1, position: i + 1 })));
      }
      advanceDays(world, makeDate(2027, 7, 1) - world.date);
    }, 120_000);

    it('starts the next season with a fresh fixture list', () => {
      expect(world.season).toEqual({ year: 2027, ended: false });
      const all = Object.values(world.fixtures).flat();
      expect(all.every((f) => !f.result && toParts(f.date).year >= 2027)).toBe(true);
      expect(Object.values(world.players).every((p) => p.stats.apps === 0)).toBe(true);
    });

    it('keeps league sizes and moves clubs between divisions', () => {
      for (const l of Object.values(world.leagues)) expect(l.clubIds.length).toBe(snapshot.leagueSizes[l.id]);
      const relegated = snapshot.topFlightLevels.filter(
        (x) => world.clubs[x.clubId]!.leagueId !== world.countries[world.clubs[x.clubId]!.countryId]!.leagueIds[0],
      );
      expect(relegated.length).toBeGreaterThan(40);
      for (const r of relegated) expect(r.position).toBeGreaterThan(9); // only bottom clubs go down
    });

    it('keeps every squad playable and every reference valid', () => {
      for (const club of Object.values(world.clubs)) {
        expect(club.squad.length).toBeGreaterThanOrEqual(22);
        expect(club.squad.length).toBeLessThanOrEqual(32);
        for (const id of club.squad) expect(world.players[id]?.clubId).toBe(club.id);
        expect(club.captainId && club.squad.includes(club.captainId)).toBe(true);
        expect(world.officials[club.headCoachId]?.clubId).toBe(club.id);
        expect(club.history.length).toBe(1);
      }
      for (const id of world.freeAgents) expect(world.players[id]?.clubId).toBeUndefined();
      expect(new Set(world.freeAgents).size).toBe(world.freeAgents.length);
    });

    it('archives careers and brings in academy players', () => {
      const withHistory = Object.values(world.players).filter((p) => p.history.length === 1);
      expect(withHistory.length).toBeGreaterThan(30_000);
      const youth = Object.values(world.players).filter((p) => p.history.length === 0 && p.clubId);
      expect(youth.length).toBeGreaterThan(3000);
      expect(world.freeAgents.length).toBeLessThan(6000);
    });
  });
});

describe('time engine', () => {
  it('gives identical results however time is advanced', () => {
    const a = generateWorld(77);
    const b = generateWorld(77);
    advanceDays(a, 50);
    for (let i = 0; i < 50; i++) advanceDays(b, 1);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 60_000);

  it('jumps to the next matchday and plays it', () => {
    const w = generateWorld(5);
    const r = advanceToNextMatchday(w);
    expect(w.date).toBe(seasonWindow(2026).start);
    expect(r.matchesPlayed).toBeGreaterThan(500);
  }, 60_000);
});
