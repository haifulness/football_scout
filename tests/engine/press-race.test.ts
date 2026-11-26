import { describe, expect, it } from 'vitest';
import { addDays, toParts } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { pressLeads, readLevel } from '../../src/engine/systems/club-read';
import { clubPositionalAverage, competition, gateCheck } from '../../src/engine/systems/deals';
import { ovrAt } from '../../src/engine/systems/ratings';
import { circlingRivals, rivalTick, rivalsReadPaper } from '../../src/engine/systems/rivals';
import { squadNeeds } from '../../src/engine/systems/squad-needs';
import { executeTransfer } from '../../src/engine/systems/transfers';

const eng = 'eng' as CountryId;

function career() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
  const s = (e as unknown as { state: GameState }).state;
  while (toParts(s.date).weekday !== 1) s.date = addDays(s.date, 1);
  return { e, s };
}

const needAt = (s: GameState, clubId: string, pos: string) => {
  const club = s.clubs[clubId as keyof typeof s.clubs]!;
  return squadNeeds(club.formation, club.squad.map((id) => s.players[id]!)).find((n) => n.position === pos)?.severity ?? 0;
};

describe('the Wanted column', () => {
  it('is half confirmed, half gossip; confirmed is right, some gossip is wrong, and only confirmed counts as a read', () => {
    const { s } = career();
    let confirmed = 0;
    let rumours = 0;
    let wrong = 0;
    for (let w = 0; w < 8; w++) {
      s.press = undefined;
      s.clubReads = {};
      for (const i of pressLeads(s)) {
        if (!i.rumour) {
          confirmed++;
          expect(needAt(s, i.clubId, i.pos)).toBeGreaterThanOrEqual(0.45);
          expect(readLevel(s, i.clubId, i.pos)).toBeGreaterThan(0);
        } else {
          rumours++;
          expect(readLevel(s, i.clubId, i.pos)).toBe(0);
          if (i.wrong) {
            wrong++;
            expect(needAt(s, i.clubId, i.pos)).toBeLessThan(0.2);
          }
        }
      }
      s.date = addDays(s.date, 7);
    }
    expect(confirmed).toBeGreaterThan(5);
    expect(rumours).toBeGreaterThan(5);
    expect(wrong).toBeGreaterThan(0);
    expect(wrong).toBeLessThan(rumours);
  });

  it('draws rivals who chase the need, and each one raises the bar at that position', () => {
    const { s } = career();
    pressLeads(s);
    rivalsReadPaper(s);
    const items = s.press!.items;
    expect(items.every((i) => (i.rivals?.length ?? 0) >= 1)).toBe(true);
    const chased = items.find((i) => circlingRivals(s, i.clubId, i.pos).length > 0)!;
    expect(chased).toBeDefined();
    const club = s.clubs[chased.clubId]!;
    const n = competition(s, club.id, chased.pos);
    const avg = clubPositionalAverage(s, club, chased.pos);
    // A player just above the average, too old for the prospect route.
    const p = Object.values(s.players).find((x) => x.clubId !== club.id && ovrAt(x, chased.pos) === avg + 1 && x.birthDate < s.date - 25 * 365)!;
    expect(gateCheck(s, p, club, chased.pos).passes).toBe(false);
    expect(gateCheck(s, p, club, chased.pos).reason).toMatch(/Other scouts/);
    for (const r of circlingRivals(s, club.id, chased.pos)) r.pursuit = undefined;
    expect(gateCheck(s, p, club, chased.pos).passes).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  it('a chase ends once the club signs someone for that position', () => {
    const { s } = career();
    pressLeads(s);
    rivalsReadPaper(s);
    const i = s.press!.items.find((x) => circlingRivals(s, x.clubId, x.pos).length > 0)!;
    const club = s.clubs[i.clubId]!;
    const chasing = circlingRivals(s, club.id, i.pos);
    const taken = new Set(chasing.map((r) => r.pursuit!.playerId));
    const signing = Object.values(s.players).find((p) => p.clubId && p.clubId !== club.id && p.naturalPosition === i.pos && !taken.has(p.id))!;
    s.date = addDays(s.date, 1);
    executeTransfer(s, signing, club, usd(0), usd(1000), s.date);
    while (toParts(s.date).weekday !== 4) s.date = addDays(s.date, 1);
    rivalTick(s, s.date);
    expect(circlingRivals(s, club.id, i.pos).length).toBe(0);
  });
});
