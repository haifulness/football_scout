import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { Rng } from '../../src/engine/core/rng';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { announceChange, replaceCoach } from '../../src/engine/systems/coaching';
import { advanceDays } from '../../src/engine/tick';

const eng = 'eng' as CountryId;

function career(): { e: Engine; w: GameState } {
  const e = new Engine();
  e.generate(11223);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  return { e, w: (e as unknown as { state: GameState }).state };
}

describe('coaching carousel', () => {
  it('a sacked coach you know goes out of work, and your relationship follows him to his next club', () => {
    const { w } = career();
    const [a, b] = Object.values(w.clubs).filter((c) => c.countryId === eng && c.tier === 3);
    const known = w.officials[a!.headCoachId]!;
    w.scout!.relationships[known.id] = 40;

    const out = replaceCoach(w, a!, Rng.derive(1, 'x'), w.date, 'after a poor run');
    expect(a!.headCoachId).not.toBe(known.id);
    expect(known.unemployedSince).toBe(w.date);
    expect(w.scout!.relationships[known.id]).toBe(40);
    announceChange(w, out, w.date, true);
    expect(w.news.some((n) => n.forYou && n.kind === 'coaching' && n.body.includes('is out of work'))).toBe(true);

    // Later, another club hires someone from the out-of-work pool: try a few draws until it's him.
    w.date = (w.date + 30) as typeof w.date;
    for (const o of Object.values(w.officials)) if (o.id !== known.id) o.unemployedSince = undefined;
    let hired = false;
    for (let i = 0; i < 30 && !hired; i++) {
      const ch = replaceCoach(w, b!, Rng.derive(i, 'y'), w.date, 'by mutual consent');
      hired = ch.coach.id === known.id;
      if (hired) {
        expect(ch.rehired).toBe(true);
        expect(ch.previousClubId).toBe(a!.id);
        announceChange(w, ch, w.date, true);
      } else {
        // Put the club back as it was for the next try.
        w.officials[ch.old.id]!.unemployedSince = undefined;
        ch.coach.unemployedSince = w.date - 30 as typeof w.date;
      }
    }
    expect(hired).toBe(true);
    expect(b!.headCoachId).toBe(known.id);
    expect(known.unemployedSince).toBeUndefined();
    expect(w.scout!.relationships[known.id]).toBe(40);
    expect(w.news.some((n) => n.forYou && n.body.includes('a door opens'))).toBe(true);
  });

  it("tells you when your client's coach changes, and Home asks you to meet the new one", () => {
    const { e, w } = career();
    const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
    if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
    const ch = replaceCoach(w, club, Rng.derive(7, 'z'), w.date, 'after a poor run');
    announceChange(w, ch, w.date, true);
    expect(w.news.some((n) => n.forYou && n.clubIds?.includes(club.id) && n.body.includes('your standing'))).toBe(true);
    expect(e.getHome().needsYou.some((i) => i.key === `coach-${club.id}`)).toBe(true);
  });

  it('over a season, a modest share of clubs change coach mid-season', () => {
    const { w } = career();
    const clubs = Object.keys(w.clubs).length;
    advanceDays(w, 330);
    const changed = Object.values(w.officials).filter((o) => o.appointedOn !== undefined && o.unemployedSince === undefined).length;
    expect(changed / clubs).toBeGreaterThan(0.04);
    expect(changed / clubs).toBeLessThan(0.3);
    // Every club still has a coach in post.
    expect(Object.values(w.clubs).every((c) => w.officials[c.headCoachId] && w.officials[c.headCoachId]!.unemployedSince === undefined)).toBe(true);
  }, 300_000);
});
