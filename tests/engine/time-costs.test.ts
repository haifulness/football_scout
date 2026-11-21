import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Club } from '../../src/engine/model/club';
import type { GameState } from '../../src/engine/model/world-state';
import { formationPositions, REMOTE_PITCH_TRUST } from '../../src/engine/systems/deals';
import { OFFER_REMINDER_DAYS } from '../../src/engine/systems/missions';
import { advanceDays } from '../../src/engine/tick';

const eng = 'eng' as CountryId;

function career(): { e: Engine; w: GameState; club: Club } {
  const e = new Engine();
  e.generate(2468);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  const w = (e as unknown as { state: GameState }).state;
  w.scout!.reputation = 100;
  w.scout!.money = usd(1_000_000);
  const club = Object.values(w.clubs).find((c) => c.tier === 3 && c.countryId === eng)!;
  if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
  w.scout!.location = club.cityId;
  return { e, w, club };
}

/** Players elsewhere at a position the club uses. */
function candidates(w: GameState, club: Club, n: number) {
  const position = formationPositions(club).find((p) => p !== 'GK')!;
  const players = Object.values(w.players)
    .filter((p) => p.clubId && p.clubId !== club.id && p.naturalPosition === position)
    .slice(0, n);
  return { position, players };
}

describe('what costs time', () => {
  it('the first in-person pitch takes a day and a fee; pitching more players right after takes neither', () => {
    const { e, w, club } = career();
    const { position, players } = candidates(w, club, 3);
    const fees = () => w.ledger.filter((l) => l.kind === 'meeting').length;
    const day0 = w.date;
    e.pitch({ playerId: players[0]!.id, clubId: club.id, position, to: 'coach' });
    expect(w.date).toBe(day0 + 1);
    expect(fees()).toBe(1);
    // Still in the room: the next name costs nothing.
    e.pitch({ playerId: players[1]!.id, clubId: club.id, position, to: 'coach' });
    expect(w.date).toBe(day0 + 1);
    expect(fees()).toBe(1);
    // Once time moves on, it's a new meeting.
    advanceDays(w, 1);
    e.pitch({ playerId: players[2]!.id, clubId: club.id, position, to: 'coach' });
    expect(w.date).toBe(day0 + 3);
    expect(fees()).toBe(2);
  });

  it('a phone pitch takes no time', () => {
    const { e, w, club } = career();
    w.scout!.relationships[club.headCoachId] = 100;
    const { position, players } = candidates(w, club, 1);
    w.scout!.location = Object.values(w.cities).find((c) => c.id !== club.cityId)!.id;
    expect(e.getPitchPreview(players[0]!.id, club.id, position).coach.remote.trust).toBeGreaterThanOrEqual(REMOTE_PITCH_TRUST);
    const day = w.date;
    e.pitch({ playerId: players[0]!.id, clubId: club.id, position, to: 'coach', remote: true });
    expect(w.date).toBe(day);
  });

  it("warns before a brief offer lapses, and says so when it does", () => {
    const { w, club } = career();
    for (let i = 0; i < 24 && !w.missions.some((m) => m.status === 'offered'); i++) advanceDays(w, 15);
    const m = w.missions.find((x) => x.status === 'offered' && x.clubId === club.id)!;
    advanceDays(w, m.acceptBy - w.date - OFFER_REMINDER_DAYS);
    expect(w.news.some((n) => n.title.startsWith('Reply soon') && n.clubIds?.includes(club.id))).toBe(true);
    advanceDays(w, OFFER_REMINDER_DAYS + 1);
    expect(m.status).toBe('expired');
    expect(w.news.some((n) => n.title === `Brief lapsed: ${club.name}`)).toBe(true);
  }, 180_000);
});
