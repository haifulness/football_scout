import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { Player } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import { TRAITS, characterOf, knownTraits, revealTrait } from '../../src/engine/systems/character';
import { personalityScore } from '../../src/engine/systems/deals';
import { developPlayer } from '../../src/engine/systems/development';
import { Rng } from '../../src/engine/core/rng';
import { ageOn } from '../../src/engine/core/calendar';
import { ovrAt } from '../../src/engine/systems/ratings';

const eng = 'eng' as CountryId;

function career(): GameState {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  return (e as unknown as { state: GameState }).state;
}

const w = career();
const players = Object.values(w.players);

describe('character traits', () => {
  it('every player has 0–2 traits, stable for life, and no clashing pairs', () => {
    const counts = [0, 0, 0];
    for (const p of players.slice(0, 5000)) {
      const t = characterOf(p);
      counts[t.length]!++;
      expect(characterOf({ ...p })).toEqual(t); // a copy (as after a save and load) has the same character
      expect(t.includes('homesick') && t.includes('adaptable')).toBe(false);
      expect(t.includes('professional') && t.includes('hothead')).toBe(false);
      expect(t.includes('mercenary') && t.includes('loyal')).toBe(false);
    }
    expect(counts.every((n) => n > 500)).toBe(true);
    // Every trait turns up somewhere.
    const seen = new Set(players.flatMap((p) => characterOf(p)));
    expect([...seen].sort()).toEqual([...TRAITS].sort());
  });

  it('you know none at first; a reveal uncovers one real trait and never a fake one', () => {
    const p = players.find((x) => characterOf(x).length === 2)!;
    expect(knownTraits(w, p)).toEqual([]);
    const t = revealTrait(w, p, 1, 'test-a');
    expect(t).toBeDefined();
    expect(characterOf(p)).toContain(t);
    expect(knownTraits(w, p)).toEqual([t]);
    const t2 = revealTrait(w, p, 1, 'test-b');
    expect(t2).not.toBe(t);
    expect(knownTraits(w, p).length).toBe(2);
    // Nothing left to find.
    expect(revealTrait(w, p, 1, 'test-c')).toBeUndefined();
    // A situation that can't show his traits shows nothing.
    const q = players.find((x) => characterOf(x).length === 1 && characterOf(x)[0] === 'homesick')!;
    expect(revealTrait(w, q, 1, 'match', ['big-game', 'hothead'])).toBeUndefined();
  });

  it('coaches rate a professional above a hothead of the same steadiness', () => {
    const pro = players.find((x) => characterOf(x).includes('professional'))!;
    const hot = players.find((x) => characterOf(x).includes('hothead'))!;
    const same = (p: Player) => ({ ...p, hidden: { ...p.hidden, consistency: 10 } });
    expect(personalityScore(same(pro))).toBeGreaterThan(personalityScore(same(hot)));
  });

  it('a late bloomer keeps growing at 25; others have mostly stopped', () => {
    const at25 = players.filter((p) => ageOn(p.birthDate, w.date) === 25 && p.hidden.potential > ovrAt(p, p.naturalPosition) + 8);
    const late = at25.filter((p) => characterOf(p).includes('late-bloomer')).slice(0, 30);
    const other = at25.filter((p) => !characterOf(p).includes('late-bloomer')).slice(0, 30);
    expect(late.length).toBeGreaterThan(5);
    const growth = (ps: Player[]) => {
      let g = 0;
      for (const p of ps) {
        const copy = structuredClone(p);
        const before = ovrAt(copy, copy.naturalPosition);
        const rng = new Rng(7);
        for (let m = 0; m < 12; m++) developPlayer(copy, rng, w.date);
        g += ovrAt(copy, copy.naturalPosition) - before;
      }
      return g / ps.length;
    };
    expect(growth(late)).toBeGreaterThan(growth(other));
  });
});
