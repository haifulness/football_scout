import { describe, expect, it } from 'vitest';
import { toParts } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { GameState } from '../../src/engine/model/world-state';
import {
  assignTask,
  fireAssistant,
  hireAssistant,
  recallAssistant,
  refreshMarket,
  skillCeiling,
  staffLimit,
  taskExpenses,
} from '../../src/engine/systems/assistants';
import { knowledgeLevel } from '../../src/engine/systems/knowledge';
import { ovrAt } from '../../src/engine/systems/ratings';
import { createCareer } from '../../src/engine/systems/scouting';
import { advanceDays } from '../../src/engine/tick';
import { CURRENT_SCHEMA_VERSION, migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;

function setup(seed = 8080): GameState {
  const w = generateWorld(seed);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  w.scout!.money = usd(1_000_000);
  // Assistants unlock with reputation; these tests start with them open at a starting reputation.
  w.scout!.unlocks = ['assistants'];
  refreshMarket(w, w.date);
  return w;
}

/** Advance to the next Monday (when assistants work and get paid). */
function toMonday(w: GameState) {
  do advanceDays(w, 1);
  while (toParts(w.date).weekday !== 1);
}

describe('hiring', () => {
  it('offers candidates capped by your reputation, and limits staff size', () => {
    const w = setup();
    expect(w.assistantMarket.length).toBeGreaterThanOrEqual(4);
    for (const c of w.assistantMarket) expect(c.skill).toBeLessThanOrEqual(skillCeiling(w.scout!.reputation));
    expect(staffLimit(5)).toBe(1);
    hireAssistant(w, w.assistantMarket[0]!.id);
    expect(w.assistants.length).toBe(1);
    expect(() => hireAssistant(w, w.assistantMarket[0]!.id)).toThrow(/at most/);
  }, 60_000);

  it('pays wages weekly, and a week of notice when you let him go', () => {
    const w = setup();
    const a = hireAssistant(w, w.assistantMarket[0]!.id);
    const money = w.scout!.money;
    toMonday(w);
    const wages = w.ledger.filter((l) => l.kind === 'assistant');
    expect(wages.length).toBe(1);
    expect(wages[0]!.amount).toBe(-a.wage);
    const before = w.scout!.money;
    expect(before).toBeLessThan(money);
    fireAssistant(w, a.id);
    expect(w.assistants.length).toBe(0);
    expect(w.scout!.money).toBe(before - a.wage);
  }, 60_000);
});

describe('tasks', () => {
  it('feed matching players into your pool with his rating and a little knowledge', () => {
    const w = setup();
    const a = hireAssistant(w, w.assistantMarket[0]!.id);
    const brief = { location: { scope: 'country' as const, id: eng }, positions: ['ST' as const], age: [18, 26] as [number, number] };
    assignTask(w, a.id, brief, 2);
    expect(a.task!.weeklyExpenses).toBe(taskExpenses(w, a, brief));
    toMonday(w);
    const found = Object.entries(w.pool).filter(([, e]) => e.source === 'assistant');
    expect(found.length).toBeGreaterThan(0);
    for (const [id, entry] of found) {
      const p = w.players[id as keyof typeof w.players]!;
      expect((p.positions.ST ?? 0) >= 0.75).toBe(true);
      expect(p.clubId ? w.clubs[p.clubId]!.countryId : p.nationality).toBe(eng);
      expect(entry.report!.assistantId).toBe(a.id);
      expect(Math.abs(entry.report!.rating - ovrAt(p, 'ST'))).toBeLessThan(25);
      expect(knowledgeLevel(w, p)).toBeGreaterThan(0);
    }
    expect(w.ledger.some((l) => l.kind === 'assistant-task')).toBe(true);
    expect(a.task!.found).toBe(found.length);
  }, 60_000);

  it('end on schedule with a report, or early when recalled', () => {
    const w = setup();
    const a = hireAssistant(w, w.assistantMarket[0]!.id);
    assignTask(w, a.id, { location: { scope: 'country', id: eng }, positions: [] }, 1);
    advanceDays(w, 15);
    expect(a.task).toBeUndefined();
    expect(w.news.some((n) => n.title.includes('reports back'))).toBe(true);
    assignTask(w, a.id, { location: { scope: 'country', id: eng }, positions: [] }, 4);
    recallAssistant(w, a.id);
    expect(a.task).toBeUndefined();
  }, 60_000);

  it('make him better (and pricier) with experience', () => {
    const w = setup();
    const a = hireAssistant(w, w.assistantMarket[0]!.id);
    a.skill = 10;
    const wage = a.wage;
    for (let i = 0; i < 2; i++) {
      assignTask(w, a.id, { location: { scope: 'country', id: eng }, positions: [] }, 8);
      advanceDays(w, 8 * 7);
    }
    expect(a.skill).toBe(11);
    expect(a.wage).toBeGreaterThan(wage);
  }, 120_000);

  it('rejects bad briefs', () => {
    const w = setup();
    const a = hireAssistant(w, w.assistantMarket[0]!.id);
    expect(() => assignTask(w, a.id, { location: { scope: 'country', id: eng }, positions: [] }, 9)).toThrow();
    expect(() => assignTask(w, a.id, { location: { scope: 'country', id: eng }, positions: ['ST', 'CB', 'CM', 'GK'] }, 2)).toThrow();
  }, 60_000);
});

describe('save migration', () => {
  it('upgrades a v9 save with no staff', () => {
    const old = JSON.parse(JSON.stringify(generateWorld(9)));
    old.schemaVersion = 9;
    delete old.assistants;
    delete old.assistantMarket;
    delete old.counters.assistant;
    const up = migrate(old);
    expect(up.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(up.assistants).toEqual([]);
    expect(up.counters.assistant).toBe(0);
  }, 30_000);
});
