import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import { emptyEarnings, type Placement } from '../../src/engine/model/deal';
import type { Player } from '../../src/engine/model/player';
import type { SeasonReview } from '../../src/engine/model/review';
import type { GameState } from '../../src/engine/model/world-state';
import { signOffProbability } from '../../src/engine/systems/deals';
import {
  objectiveProgress,
  objectiveTick,
  seasonHonours,
  setSeasonObjectives,
  specialties,
  specialtyBonus,
} from '../../src/engine/systems/goals';
import { snapshotReviewBaseline } from '../../src/engine/systems/review';
import { createCareer } from '../../src/engine/systems/scouting';
import { migrate } from '../../src/persistence/save-format';

const eng = 'eng' as CountryId;
let shared: GameState | undefined;

function setup(): GameState {
  if (!shared) {
    shared = generateWorld(24680);
    createCareer(shared, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'normal' });
  }
  return shared;
}

function place(w: GameState, p: Player, clubId = p.clubId!, extra: Partial<Placement> = {}): Placement {
  const pl: Placement = {
    id: w.placements.length,
    dealId: 9000 + w.placements.length,
    playerId: p.id,
    clubId,
    position: p.naturalPosition,
    signedOn: w.date,
    expiresOn: addDays(w.date, 700),
    fee: usd(0),
    ovrGap: 2,
    prospect: false,
    nationality: p.nationality,
    age: 25,
    free: false,
    mode: 'freelance',
    bonus: usd(0),
    bonusPaid: true,
    earnings: emptyEarnings(),
    ...extra,
  };
  w.placements.push(pl);
  return pl;
}

const homeContinent = (w: GameState) => w.countries[eng]!.continentId;
const foreigners = (w: GameState) => Object.values(w.players).filter((p) => p.clubId && w.countries[p.nationality]!.continentId !== homeContinent(w));

describe('season goals', () => {
  it('a new career gets three different goals for its first season', () => {
    const w = setup();
    const mine = w.objectives.filter((o) => o.season === w.season.year);
    expect(mine).toHaveLength(3);
    expect(new Set(mine.map((o) => o.kind)).size).toBe(3);
    setSeasonObjectives(w); // idempotent
    expect(w.objectives.filter((o) => o.season === w.season.year)).toHaveLength(3);
  });

  it('pay out the day you reach them', () => {
    const w = setup();
    w.objectives = [];
    w.objectives.push({
      id: 99,
      season: w.season.year,
      kind: 'placements',
      title: 'Place 2 players',
      target: 2,
      from: w.date,
      reward: { money: usd(2000), reputation: 1 },
      status: 'active',
    });
    const o = w.objectives[0]!;
    const players = Object.values(w.players).filter((p) => p.clubId);
    place(w, players[0]!);
    objectiveTick(w, w.date);
    expect(o.status).toBe('active');
    expect(objectiveProgress(w, o)).toBe(1);
    const money = w.scout!.money;
    const rep = w.scout!.reputation;
    place(w, players[1]!);
    objectiveTick(w, w.date);
    expect(o.status).toBe('done');
    expect(w.scout!.money).toBe(money + 2000);
    expect(w.scout!.reputation).toBe(rep + 1);
    expect(w.ledgerTotals[w.season.year]!.award).toBe(2000);
  });
});

describe('awards', () => {
  it('a season full of signings wins Scout of the Year, the goals close, and the review records it', () => {
    const w = setup();
    snapshotReviewBaseline(w);
    w.objectives = [
      {
        id: 100,
        season: w.season.year,
        kind: 'profit',
        title: 'Make a profit of $1,000,000',
        target: 1_000_000,
        from: w.date,
        reward: { money: usd(5000), reputation: 2 },
        status: 'active',
      },
    ];
    const players = Object.values(w.players).filter((p) => p.clubId);
    for (let i = 10; i < 30; i++) place(w, players[i]!);
    const rep = (w.scout!.reputation = 40);
    const before = w.trophies.length;
    const review = { reputation: { end: rep } } as SeasonReview;
    seasonHonours(w, w.season.year, w.date, review);
    expect(w.objectives[0]!.status).toBe('missed');
    const world = review.awards!.find((a) => a.kind === 'scout-world')!;
    expect(world.you).toBe(true);
    expect(world.table![0]!.you).toBe(true);
    expect(w.trophies.length).toBeGreaterThanOrEqual(before + 2); // country and world
    expect(w.scout!.reputation).toBeGreaterThanOrEqual(rep + 5);
    expect(review.reputation.end).toBe(w.scout!.reputation);
    expect(review.objectives).toEqual([{ title: 'Make a profit of $1,000,000', status: 'missed' }]);
  });
});

describe('specialties', () => {
  it('placements abroad earn a continent specialty that helps pitches there and only there', () => {
    const w = setup();
    w.placements = [];
    const away = foreigners(w);
    const continent = w.countries[away[0]!.nationality]!.continentId;
    const same = away.filter((p) => w.countries[p.nationality]!.continentId === continent);
    for (const p of same.slice(0, 3)) place(w, p, p.clubId!, { position: 'CB', age: 27 });
    const spec = specialties(w).find((s) => s.kind === 'continent');
    expect(spec?.continentId).toBe(continent);
    expect(spec?.level).toBe(1);
    expect(spec?.label).toMatch(/specialist$/);

    const target = same[5]!;
    const local = Object.values(w.players).find((p) => p.clubId && p.nationality === eng && p.naturalPosition === 'ST' && p.birthDate < addDays(w.date, -365 * 25))!;
    expect(specialtyBonus(w, target, 'ST')).toBeGreaterThan(0);
    expect(specialtyBonus(w, local, 'ST')).toBe(0);

    const club = Object.values(w.clubs).find((c) => c.id !== target.clubId && c.countryId === eng)!;
    const coach = w.officials[club.headCoachId]!;
    const withSpec = signOffProbability(w, coach, target, club, target.naturalPosition, target.value);
    w.placements = [];
    expect(signOffProbability(w, coach, target, club, target.naturalPosition, target.value)).toBeLessThan(withSpec);
  });

  it('need the niche to be a real share of your work', () => {
    const w = setup();
    w.placements = [];
    const away = foreigners(w);
    for (const p of away.slice(0, 3)) place(w, p, p.clubId!, { position: 'GK' });
    expect(specialties(w).some((s) => s.key === 'position:GK')).toBe(true);
    const locals = Object.values(w.players).filter((p) => p.clubId && p.nationality === eng);
    for (const p of locals.slice(0, 8)) place(w, p, p.clubId!, { position: 'ST' });
    expect(specialties(w).some((s) => s.key === 'position:GK')).toBe(false); // 3 of 11 is under 30%
    expect(specialties(w).find((s) => s.key === 'position:ATT')?.level).toBe(2);
  });
});

describe('saves', () => {
  it('upgrade a v14 save: empty cabinet, placements learn who signed', () => {
    const w = setup();
    const old = JSON.parse(JSON.stringify(w));
    old.schemaVersion = 14;
    delete old.objectives;
    delete old.trophies;
    delete old.prodigyFinds;
    delete old.counters.objective;
    delete old.counters.trophy;
    for (const pl of old.placements) {
      delete pl.nationality;
      delete pl.age;
      delete pl.free;
    }
    const s = migrate(old) as GameState;
    expect(s.objectives).toEqual([]);
    expect(s.trophies).toEqual([]);
    expect(s.counters.trophy).toBe(0);
    const first = s.placements[0]!;
    expect(first.nationality).toBe(s.players[first.playerId]!.nationality);
    expect(typeof first.age).toBe('number');
  });
});
