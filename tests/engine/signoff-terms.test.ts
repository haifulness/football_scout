import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { GameState } from '../../src/engine/model/world-state';
import { signOffProbability } from '../../src/engine/systems/deals';
import { clubTrust, recordStanding } from '../../src/engine/systems/employment';
import { createCareer } from '../../src/engine/systems/scouting';

const eng = 'eng' as CountryId;
function setup(): GameState {
  const w = generateWorld(8642);
  createCareer(w, { name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  return w;
}
const logit = (p: number) => Math.log(p / (1 - p));

describe("the coach's yes", () => {
  it('counts your relationship with the coach once', () => {
    const w = setup();
    const club = Object.values(w.clubs).find((c) => c.tier === 4 && c.countryId === eng)!;
    const coach = w.officials[club.headCoachId]! as Parameters<typeof signOffProbability>[1];
    const player = Object.values(w.players).find((p) => p.clubId && p.clubId !== club.id && p.naturalPosition === 'CM')!;
    const chance = (rel: number) => {
      w.scout!.relationships[coach.id] = rel;
      return signOffProbability(w, coach, player, club, 'CM', usd(0));
    };
    const [before, after] = [chance(30), chance(40)];
    // Standing still moves with the coach, but the sign-off only sees the relationship term.
    expect(logit(after) - logit(before)).toBeCloseTo(10 / 22, 6);
  });

  it("keeps the coach's share out of the record standing the sign-off uses", () => {
    const w = setup();
    const club = Object.values(w.clubs).find((c) => c.tier === 4 && c.countryId === eng)!;
    w.scout!.relationships[club.headCoachId] = 10;
    const [trust, record] = [clubTrust(w, club.id), recordStanding(w, club.id)];
    w.scout!.relationships[club.headCoachId] = 60;
    expect(clubTrust(w, club.id)).toBeGreaterThan(trust);
    expect(recordStanding(w, club.id)).toBe(record);
  });
});
