import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { advanceDays } from '../../src/engine/tick';

const eng = 'eng' as CountryId;

function career(): { e: Engine; w: GameState } {
  const e = new Engine();
  e.generate(11223);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  return { e, w: (e as unknown as { state: GameState }).state };
}

describe('home status board', () => {
  it('a new career is told to find clients, sees the calendar ahead, and starts the season at zero', () => {
    const { e } = career();
    const h = e.getHome();
    expect(h.needsYou.some((i) => i.kind === 'clients' && i.link.screen === 'gazette')).toBe(true);
    expect(h.inProgress).toEqual([]);
    expect(h.upcoming.length).toBeGreaterThan(0);
    expect(h.upcoming.every((u, i) => i === 0 || u.date >= h.upcoming[i - 1]!.date)).toBe(true);
    expect(h.upcoming.some((u) => u.label === 'Summer deadline day')).toBe(true);
    expect(h.season.placements).toBe(0);
    expect(h.season.work).toEqual({ mode: 'freelance', clients: 0, slots: expect.any(Number) });
  });

  it("puts a client's new brief under Needs you, and an accepted one under In progress", () => {
    const { e, w } = career();
    const club = Object.values(w.clubs).find((c) => c.tier === 3 && c.countryId === eng)!;
    if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
    for (let i = 0; i < 12 && !w.missions.length; i++) advanceDays(w, 15);
    const m = w.missions[0]!;
    let h = e.getHome();
    const offer = h.needsYou.find((i) => i.key === `offer-m${m.id}`)!;
    expect(offer.link.screen).toBe('missions');
    expect(offer.daysLeft).toBe(m.acceptBy - w.date);

    e.acceptMission(m.id);
    h = e.getHome();
    expect(h.needsYou.some((i) => i.key === `offer-m${m.id}`)).toBe(false);
    const running = [...h.inProgress, ...h.needsYou].find((i) => i.key === `m${m.id}`)!;
    expect(running.progress).toBeGreaterThanOrEqual(0);
    expect(h.upcoming.some((u) => u.key === `md${m.id}`) || running.daysLeft! > 75).toBe(true);
  });
});
