import { describe, expect, it } from 'vitest';
import type { CountryId, PlayerId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Deal } from '../../src/engine/model/deal';
import type { GameState } from '../../src/engine/model/world-state';
import { formationPositions, pitch, signOffProbability } from '../../src/engine/systems/deals';
import { COLD_DAYS, afterNo, coachNoes, coldUntil, hitBriefFactor, hitFactor, hitRate, positionFatigue } from '../../src/engine/systems/pitch-pressure';

const eng = 'eng' as CountryId;

function setup() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
  const s = (e as unknown as { state: GameState }).state;
  const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
  if (s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(club.id);
  const pos = formationPositions(club).find((x) => x !== 'GK')!;
  const others = Object.values(s.players).filter((p) => p.clubId && p.clubId !== club.id);
  let n = 0;
  const add = (kind: 'no' | 'weak' | 'yes', at = pos, daysAgo = 1) => {
    const d = {
      id: s.counters.deal++,
      playerId: others[n++]!.id as PlayerId,
      clubId: club.id,
      position: at,
      stage: kind === 'yes' ? 'completed' : 'rejected',
      pitchedTo: ['coach'],
      prospect: false,
      openedOn: s.date - daysAgo,
      fee: usd(0),
      wage: usd(0),
      log: [],
      ...(kind === 'no' ? { rejectedBy: club.headCoachId } : kind === 'weak' ? { clubLevelRejection: true } : { signOff: { by: 'coach', date: s.date - daysAgo } }),
    } as unknown as Deal;
    s.deals.unshift(d);
  };
  return { s, club, pos, others, add };
}

describe('pitching has a cost', () => {
  it('three noes in a month and the coach stops taking your pitches', () => {
    const { s, club, pos, others, add } = setup();
    add('no', pos, 20);
    add('weak', pos, 10);
    expect(coachNoes(s, club.id)).toBe(2);
    expect(afterNo(s, club.id, club.headCoachId)).toBeUndefined();
    add('no', pos, 1);
    expect(afterNo(s, club.id, club.headCoachId)).toBe(s.date + COLD_DAYS);
    expect(coldUntil(s, club.headCoachId)).toBeDefined();
    s.scout!.location = club.cityId;
    expect(() => pitch(s, { playerId: others[50]!.id, clubId: club.id, position: pos, to: 'coach' })).toThrow(/stopped taking your pitches/);
  });

  it('a yes resets the count, and old noes fall away', () => {
    const { s, club, pos, add } = setup();
    add('no', pos, 40);
    add('no', pos, 5);
    add('yes', pos, 3);
    add('no', pos, 1);
    expect(coachNoes(s, club.id)).toBe(1);
  });

  it('each recent no at a position takes 5% off the next name there, up to 20%', () => {
    const { s, club, pos, others, add } = setup();
    const coach = s.officials[club.headCoachId]!;
    const p = others[80]!;
    const fresh = signOffProbability(s, coach, p, club, pos, usd(0));
    add('no', pos);
    add('no', pos);
    expect(positionFatigue(s, club.id, pos).cut).toBeCloseTo(0.1);
    expect(signOffProbability(s, coach, p, club, pos, usd(0))).toBeCloseTo(fresh * 0.9, 5);
    for (let i = 0; i < 6; i++) add('no', pos);
    expect(positionFatigue(s, club.id, pos).cut).toBeCloseTo(0.2);
    // Another position is fresh.
    const other = formationPositions(club).find((x) => x !== pos && x !== 'GK')!;
    expect(positionFatigue(s, club.id, other).cut).toBe(0);
  });

  it('a poor hit rate makes a club harder to convince and slower to send briefs; a good one helps', () => {
    const { s, club, pos, add } = setup();
    for (let i = 0; i < 4; i++) add('no', pos, 60 + i);
    expect(hitRate(s, club.id)).toBeUndefined(); // too few to judge
    add('weak', pos, 70);
    expect(hitRate(s, club.id)?.label).toBe('wall');
    expect(hitFactor(s, club.id)).toBeLessThan(1);
    expect(hitBriefFactor(s, club.id)).toBeLessThan(1);
    for (let i = 0; i < 7; i++) add('yes', pos, 50 - i);
    expect(hitRate(s, club.id)?.label).toBe('trusted');
    expect(hitFactor(s, club.id)).toBeGreaterThan(1);
  });
});
