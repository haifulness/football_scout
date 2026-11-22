import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';

const eng = 'eng' as CountryId;

describe('the calendar page', () => {
  it('shows the windows, the season, events and your own deadlines in date order', () => {
    const e = new Engine();
    e.generate(4242);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const s = (e as unknown as { state: GameState }).state;
    const club = Object.values(s.clubs).find((c) => c.countryId === eng)!;
    s.missions.push({
      id: 77,
      clubId: club.id,
      position: 'ST',
      requirements: { minOvr: 60 },
      brief: 'test',
      postedOn: s.date,
      acceptBy: addDays(s.date, 7),
      weeks: 6,
      deadline: addDays(s.date, 42),
      reward: usd(5000),
      status: 'active',
    });

    const cal = e.getCalendar();
    const kinds = new Set(cal.entries.map((x) => x.kind));
    for (const k of ['window', 'deadline-day', 'season', 'event', 'brief'] as const) expect(kinds.has(k)).toBe(true);
    // Today is inside the summer window it lists.
    expect(cal.entries.some((x) => x.kind === 'window' && x.start <= cal.today && x.end! >= cal.today)).toBe(true);
    const brief = cal.entries.find((x) => x.key === 'md77')!;
    expect(brief.start).toBe(addDays(s.date, 42));
    expect(brief.link).toEqual({ screen: 'missions' });
    // Sorted, and nothing far outside the range it covers.
    expect(cal.entries.map((x) => x.start)).toEqual([...cal.entries.map((x) => x.start)].sort((a, b) => a - b));
    expect(cal.entries.every((x) => x.start <= addDays(cal.today, 400) && (x.end ?? x.start) >= addDays(cal.today, -45))).toBe(true);
  });
});
