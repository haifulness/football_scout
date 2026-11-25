import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { defaultPitchPosition, formationPositions } from '../../src/engine/systems/deals';

const eng = 'eng' as CountryId;

describe('the position a pitch is for', () => {
  it('is the player’s own position when the club plays it, even if another of his positions comes first in their formation', () => {
    const e = new Engine();
    e.generate(4242);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const s = (e as unknown as { state: GameState }).state;
    // A club whose formation lists AM before ST, and a striker who can also play AM.
    const club = Object.values(s.clubs).find((c) => {
      const ps = formationPositions(c);
      return ps.includes('AM') && ps.includes('ST') && ps.indexOf('AM') < ps.indexOf('ST');
    })!;
    expect(club).toBeDefined();
    const striker = Object.values(s.players).find((p) => p.naturalPosition === 'ST' && (p.positions.AM ?? 0) >= 0.75 && p.clubId !== club.id)!;
    expect(striker).toBeDefined();
    expect(defaultPitchPosition(striker, club)).toBe('ST');
    expect(e.getPitchPreview(striker.id, club.id).position).toBe('ST');
    // Choosing another position still works.
    expect(e.getPitchPreview(striker.id, club.id, 'AM').position).toBe('AM');
  });
});
