import { describe, expect, it } from 'vitest';
import { addDays, toParts } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { pressLeads } from '../../src/engine/systems/club-read';
import { RIVAL_STYLES, rivalStyle, rivalsReadPaper, seedRivals } from '../../src/engine/systems/rivals';

const eng = 'eng' as CountryId;

function career() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
  const s = (e as unknown as { state: GameState }).state;
  if (!s.rivals.length) seedRivals(s);
  return { e, s };
}

describe('rival styles', () => {
  it('every rival has a fixed style, all four appear, and you only see it once you know him', () => {
    const { e, s } = career();
    const styles = new Set(s.rivals.map((r) => rivalStyle(s, r)));
    expect(styles.size).toBe(RIVAL_STYLES.length);
    expect(rivalStyle(s, s.rivals[0]!)).toBe(rivalStyle(s, s.rivals[0]!));
    const r = s.rivals[0]!;
    expect(e.getRivals().rivals.find((x) => x.id === r.id)!.style).toBeUndefined();
    r.styleKnown = true;
    expect(e.getRivals().rivals.find((x) => x.id === r.id)!.style?.label).toMatch(/The /);
  });

  it('grinders get to the paper’s leads first', () => {
    const { s } = career();
    while (toParts(s.date).weekday !== 1) s.date = addDays(s.date, 1);
    pressLeads(s);
    rivalsReadPaper(s);
    const byId = new Map(s.rivals.map((r) => [r.id, r]));
    // A quarter of rivals are grinders, but they take far more than a quarter of the first spots.
    const first = s.press!.items.flatMap((i) => (i.rivals?.length ? [rivalStyle(s, byId.get(i.rivals[0]!)!)] : []));
    expect(first.filter((x) => x === 'grinder').length / first.length).toBeGreaterThan(0.4);
  });
});
