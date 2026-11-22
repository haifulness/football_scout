import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import { emptyEarnings, type Placement } from '../../src/engine/model/deal';
import type { GameState } from '../../src/engine/model/world-state';
import { characterOf } from '../../src/engine/systems/character';
import { clubTrust } from '../../src/engine/systems/employment';
import { VISIT_LIFT, latestVerdict, moodOf, placementTick, trackPlacements, visitPlacement } from '../../src/engine/systems/placement-stories';

const eng = 'eng' as CountryId;

function setup(opts: { games: number; minutes: number; rating: number; daysAgo: number; client?: boolean }) {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const s = (e as unknown as { state: GameState }).state;
  const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
  // A plain, ambitious, settled senior player: no traits to soften or sharpen it.
  const p = club.squad
    .map((id) => s.players[id]!)
    .find((x) => characterOf(x).length === 0 && x.hidden.ambition >= 15 && x.id !== club.captainId && !x.settling && 2026 - Number(new Date(x.birthDate * 86400000).getUTCFullYear()) > 22)!;
  if (opts.client && s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(club.id);
  const pl: Placement = {
    id: 1,
    dealId: 1,
    playerId: p.id,
    clubId: club.id,
    position: p.naturalPosition,
    signedOn: addDays(s.date, -opts.daysAgo),
    expiresOn: addDays(s.date, 900),
    fee: usd(200_000),
    ovrGap: 1,
    prospect: false,
    age: 26,
    mode: 'freelance',
    bonus: usd(0),
    bonusPaid: true,
    earnings: emptyEarnings(),
    track: { games: opts.games, minutes: opts.minutes, apps: opts.minutes ? Math.ceil(opts.minutes / 90) : 0, ratingSum: (opts.minutes ? Math.ceil(opts.minutes / 90) : 0) * opts.rating },
  };
  s.placements.push(pl);
  return { s, club, p, pl };
}

describe('stories for the players you place', () => {
  it('counts his club’s games and his minutes after every match', () => {
    const { s, club, p, pl } = setup({ games: 0, minutes: 0, rating: 0, daysAgo: 10 });
    const other = Object.values(s.clubs).find((c) => c.leagueId === club.leagueId && c.id !== club.id)!;
    const fixture = { id: 'x', date: s.date, homeId: club.id, awayId: other.id } as never;
    trackPlacements(s, [{ playerId: p.id, clubId: club.id, minutes: 90, rating: 7.2 } as never], fixture);
    trackPlacements(s, [], fixture);
    expect(pl.track).toEqual({ games: 2, minutes: 90, apps: 1, ratingSum: 7.2 });
  });

  it('a benched ambitious player turns restless, then wants out; at a client the club asks you to sell him, once', () => {
    const { s, pl, p } = setup({ games: 12, minutes: 0, rating: 0, daysAgo: 90, client: true });
    const moods: string[] = [];
    for (let m = 0; m < 6; m++) {
      placementTick(s, addDays(s.date, m * 30));
      moods.push(moodOf(pl.morale!));
    }
    expect(moods).toContain('restless');
    expect(moods[moods.length - 1]).toBe('wants-out');
    expect(s.mandates.filter((x) => x.playerId === p.id).length).toBe(1);
  });

  it('a visit lifts his morale, at most once a month', () => {
    const { s, pl, p } = setup({ games: 12, minutes: 0, rating: 0, daysAgo: 90 });
    pl.morale = 40;
    expect(visitPlacement(s, p)).toBe('happy');
    expect(pl.morale).toBe(40 + VISIT_LIFT);
    expect(visitPlacement(s, p)).toBeUndefined();
    expect(pl.morale).toBe(40 + VISIT_LIFT);
  });

  it('six months in: a regular starter with good ratings is a hit, and the club trusts you more', () => {
    const { s, pl, club } = setup({ games: 20, minutes: 20 * 85, rating: 7.1, daysAgo: 200 });
    const before = clubTrust(s, club.id);
    placementTick(s, s.date);
    expect(latestVerdict(pl)).toBe('hit');
    expect(clubTrust(s, club.id)).toBeGreaterThan(before);
  });

  it('six months in: a player who barely plays is a flop, and it costs you there', () => {
    const { s, pl, club } = setup({ games: 20, minutes: 150, rating: 6.4, daysAgo: 200 });
    // Some standing to lose.
    s.scout!.relationships[club.headCoachId] = 50;
    const before = clubTrust(s, club.id);
    placementTick(s, s.date);
    expect(latestVerdict(pl)).toBe('flop');
    expect(clubTrust(s, club.id)).toBeLessThan(before);
    // Not judged twice for the same stretch.
    placementTick(s, addDays(s.date, 30));
    expect(pl.verdicts!.length).toBe(1);
  });
});
