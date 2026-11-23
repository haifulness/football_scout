import { describe, expect, it } from 'vitest';
import { makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { knowledgeLevel } from '../../src/engine/systems/knowledge';
import { fameOf, tournamentFor } from '../../src/engine/systems/tournaments';
import { advanceDays } from '../../src/engine/tick';

const eng = 'eng' as CountryId;

describe('international tournaments', () => {
  it('a European career gets the continental championship in its first summer: squads, groups, knockouts, a winner, and famous stars', () => {
    const e = new Engine();
    e.generate(4242);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const s = (e as unknown as { state: GameState }).state;
    advanceDays(s, 1);
    const t = tournamentFor(s, 2026)!;
    expect(t).toBeDefined();
    expect(t.kind).toBe('continental');
    expect(t.teams.length).toBe(16);
    expect(t.groups.every((g) => g.length === 4)).toBe(true);
    expect(s.events!.some((x) => x.kind === 'international' && x.season === 2026)).toBe(true);

    // Run to the end of the tournament (into the next season).
    advanceDays(s, t.end - s.date + 1);
    expect(t.squads).toBeDefined();
    for (const c of t.teams) expect(t.squads![c]!.length).toBe(23);
    // (Veterans who retire at the July rollover are gone by now.)
    for (const c of t.teams) expect(t.squads![c]!.every((id) => !s.players[id] || s.players[id]!.nationality === c)).toBe(true);
    expect(t.matches.filter((m) => m.round === 'group').length).toBe(24);
    expect(t.matches.filter((m) => m.round === 'qf').length).toBe(4);
    expect(t.matches.filter((m) => m.round === 'sf').length).toBe(2);
    const final = t.matches.find((m) => m.round === 'final')!;
    expect(final.result?.winner).toBeDefined();
    expect(t.winner).toBe(final.result!.winner);

    // Stars are famous: worth more, and known to everyone.
    expect(t.standouts!.length).toBeGreaterThan(0);
    const star = s.players[t.standouts![0]!]!;
    expect(fameOf(star, s.date)).toBeGreaterThan(0.15);
    expect(knowledgeLevel(s, star)).toBeGreaterThanOrEqual(30);
    // The next summer is a World Cup.
    expect(tournamentFor(s, 2027)?.kind).toBe('world');
    expect(tournamentFor(s, 2027)?.teams.length).toBe(32);
    expect(s.date).toBeGreaterThan(makeDate(2027, 7, 1));
  }, 300_000);
});
