import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { hireAssistant, refreshMarket } from '../../src/engine/systems/assistants';
import { UNLOCKS, isUnlocked, unlockTick } from '../../src/engine/systems/unlocks';

const eng = 'eng' as CountryId;

function career(): { e: Engine; w: GameState } {
  const e = new Engine();
  e.generate(11223);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const w = (e as unknown as { state: GameState }).state;
  w.scout!.money = usd(100_000);
  return { e, w };
}

describe('unlocks', () => {
  it('a new career starts with the later systems closed, and the next one named', () => {
    const { e, w } = career();
    const sc = e.getScout()!;
    expect(sc.unlocked).toEqual({ assistants: false, mandates: false, representation: false, agency: false });
    expect(sc.nextUnlock).toEqual({ label: UNLOCKS[0]!.label, reputation: UNLOCKS[0]!.reputation });
    refreshMarket(w, w.date);
    expect(() => hireAssistant(w, w.assistantMarket[0]!.id)).toThrow(/reputation 12/);
  });

  it('opens each system once at its reputation, with one inbox note, and never closes it again', () => {
    const { e, w } = career();
    w.scout!.reputation = 21;
    unlockTick(w, w.date);
    unlockTick(w, w.date);
    expect(isUnlocked(w, 'assistants')).toBe(true);
    expect(isUnlocked(w, 'mandates')).toBe(true);
    expect(isUnlocked(w, 'representation')).toBe(false);
    expect(w.news.filter((n) => n.title === 'Unlocked: Assistant scouts').length).toBe(1);
    w.scout!.reputation = 5;
    expect(isUnlocked(w, 'mandates')).toBe(true);
    expect(e.getScout()!.nextUnlock?.label).toBe('Representing free agents');
  });

  it('keeps open whatever an older save already uses', () => {
    const { w } = career();
    w.agency = { name: 'X' } as never;
    expect(isUnlocked(w, 'agency')).toBe(true);
  });
});
