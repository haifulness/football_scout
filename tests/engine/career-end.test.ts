import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import { usd } from '../../src/engine/core/money';
import { emptyEarnings } from '../../src/engine/model/deal';
import type { GameState } from '../../src/engine/model/world-state';
import { STAR_OVR, careerSummary } from '../../src/engine/systems/career-end';
import { ovrAt } from '../../src/engine/systems/ratings';
import { GameHost } from '../../src/worker/game-host';

const stateOf = (h: GameHost) => (h as unknown as { state: GameState }).state;

async function career(name: string) {
  const host = new GameHost();
  await host.newGame(97531, { name, nationality: 'eng' as never, homeCountry: 'eng' as never, background: 'analyst', difficulty: 'normal' });
  return { host, s: stateOf(host) };
}

describe('career end', () => {
  it('retiring ends the career; the summary adds up and names your best find', async () => {
    const { host, s } = await career('Retiree');
    const players = Object.values(s.players).filter((p) => p.clubId);
    const star = players.find((p) => ovrAt(p, p.naturalPosition) >= STAR_OVR)!;
    const plain = players.find((p) => ovrAt(p, p.naturalPosition) < 65)!;
    for (const p of [star, plain])
      s.placements.push({
        id: s.placements.length,
        dealId: 900 + s.placements.length,
        playerId: p.id,
        clubId: p.clubId!,
        position: p.naturalPosition,
        signedOn: s.date,
        expiresOn: addDays(s.date, 700),
        fee: usd(0),
        ovrGap: 1,
        prospect: false,
        mode: 'freelance',
        bonus: usd(1000),
        bonusPaid: true,
        earnings: emptyEarnings(),
      });
    host.advance(30);
    const live = host.getCareerSummary();
    expect(live.kind).toBe('active');
    const done = host.retire();
    expect(done.kind).toBe('retired');
    expect(s.careerOver?.kind).toBe('retired');
    expect(done.bestFind?.playerId).toBe(star.id);
    expect(done.stars.map((x) => x.playerId)).toContain(star.id);
    expect(done.placementEarnings).toBe(2000);
    expect(done.score).toBe(done.breakdown.reduce((n, l) => n + l.points, 0));
    expect(done.seasons).toBeGreaterThan(0);
    expect(() => host.advance(1)).toThrow(/career is over/);
    expect(() => host.retire()).toThrow(/already over/);
  }, 120_000);

  it('bankruptcy costs a quarter of the score', async () => {
    const { s } = await career('Broke');
    s.scout!.reputation = 40;
    const active = careerSummary(s).score;
    s.careerOver = { date: s.date, kind: 'bankrupt', reason: 'Bankrupt' };
    const broke = careerSummary(s);
    expect(broke.score).toBe(Math.round(active * 0.75));
    expect(broke.breakdown.at(-1)!.label).toBe('Bankrupt');
  }, 120_000);

  it('writes one hall-of-fame entry per career, ranked by score', async () => {
    const a = await career('Alpha');
    a.s.scout!.reputation = 70;
    a.host.retire();
    const first = await a.host.endOfCareer();
    const again = await a.host.endOfCareer(); // idempotent: same career, same entry
    expect(again.entries).toBe(first.entries);

    const b = await career('Beta');
    b.s.scout!.reputation = 5;
    b.host.retire();
    const second = await b.host.endOfCareer();
    expect(second.entries).toBe(first.entries + 1);
    const hall = await b.host.getHallOfFame();
    const names = hall.map((e) => e.name);
    expect(names.indexOf('Alpha')).toBeLessThan(names.indexOf('Beta'));
    expect(hall.find((e) => e.name === 'Alpha')!.kind).toBe('retired');
  }, 240_000);
});
