import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine';
import { emptyEarnings, type Placement } from '../../src/engine/model/deal';
import type { SeasonReview } from '../../src/engine/model/review';
import type { GameState } from '../../src/engine/model/world-state';
import { seasonHonours } from '../../src/engine/systems/goals';
import { snapshotReviewBaseline } from '../../src/engine/systems/review';

const eng = 'eng' as CountryId;
const stateOf = (e: Engine) => (e as unknown as { state: GameState }).state;

function setup() {
  const e = new Engine();
  e.generate(8642);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'normal' });
  return { e, s: stateOf(e) };
}

function place(s: GameState, playerId: string, clubId: string, extra: Partial<Placement> = {}) {
  s.placements.push({
    id: s.placements.length,
    dealId: 500 + s.placements.length,
    playerId: playerId as Placement['playerId'],
    clubId: clubId as Placement['clubId'],
    position: 'CM',
    signedOn: s.date,
    expiresOn: addDays(s.date, 700),
    fee: usd(0),
    ovrGap: 1,
    prospect: false,
    mode: 'freelance',
    bonus: usd(0),
    bonusPaid: true,
    earnings: emptyEarnings(),
    ...extra,
  });
}

describe('legacy: map pins, club wall, trophy reveals', () => {
  it('pins each city once, coloured by how its players are doing; the wall lists clubs by placements', () => {
    const { e, s } = setup();
    const players = Object.values(s.players).filter((p) => p.clubId && s.clubs[p.clubId]!.countryId === eng);
    const a = players[0]!;
    const b = players.find((p) => s.clubs[p.clubId!]!.cityId !== s.clubs[a.clubId!]!.cityId)!;
    // Two players at the same club (one pin, two players), one who has since left.
    const twin = players.find((p) => p.clubId === a.clubId && p.id !== a.id)!;
    a.stats = { ...a.stats, apps: 10, ratingSum: 75 }; // 7.5: starring
    twin.stats = { ...twin.stats, apps: 1, ratingSum: 6 }; // barely playing
    place(s, a.id, a.clubId!);
    place(s, twin.id, twin.clubId!);
    place(s, b.id, b.clubId!, { endedOn: s.date });
    const view = e.getLegacy();
    const pin = view.pins.find((p) => p.players.some((x) => x.playerId === a.id))!;
    expect(pin.players).toHaveLength(2);
    expect(pin.form).toBe('star');
    expect(view.pins.find((p) => p.players.some((x) => x.playerId === b.id))!.form).toBe('gone');
    expect(view.wall[0]!.club.id).toBe(a.clubId);
    expect(view.wall[0]!.placements).toBe(2);
    expect(view.wall[0]!.roles).toContain('placed');
  });

  it('hands each trophy to the reveal once', () => {
    const { e, s } = setup();
    snapshotReviewBaseline(s);
    const players = Object.values(s.players).filter((p) => p.clubId);
    for (let i = 0; i < 20; i++) place(s, players[i]!.id, players[i]!.clubId!);
    s.scout!.reputation = 80;
    seasonHonours(s, s.season.year, s.date, { reputation: { end: 80 } } as SeasonReview);
    const won = e.takeTrophies();
    expect(won.length).toBeGreaterThanOrEqual(2);
    expect(won.map((t) => t.kind)).toContain('scout-world');
    expect(e.takeTrophies()).toEqual([]);
  });
});
