import { describe, expect, it } from 'vitest';
import { addDays, makeDate } from '../../src/engine/core/calendar';
import type { ClubId, CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { Deal } from '../../src/engine/model/deal';
import type { GameState } from '../../src/engine/model/world-state';
import { clientReview, nextReview, reviewClients } from '../../src/engine/systems/client-review';
import { clubPositionalAverage } from '../../src/engine/systems/deals';
import { ovrAt } from '../../src/engine/systems/ratings';
import { seedRivals } from '../../src/engine/systems/rivals';

const eng = 'eng' as CountryId;

function withClient() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
  const s = (e as unknown as { state: GameState }).state;
  if (!s.rivals.length) seedRivals(s);
  const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
  if (s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(club.id);
  s.scout!.clientSince = { [club.id]: makeDate(2026, 1, 1) };
  s.scout!.relationships[club.headCoachId] = 50;
  return { e, s, club };
}
const clients = (s: GameState) => (s.scout!.employment as { clients: ClubId[] }).clients;
const signing = (s: GameState, clubId: ClubId, n: number, on = makeDate(2026, 11, 10)): Deal =>
  ({ id: 1000 + n, playerId: s.clubs[clubId]!.squad[n]!, clubId, stage: 'completed', completedOn: on, log: [] }) as unknown as Deal;
/** Three regulars a rival brought the club. */
function rivalAhead(s: GameState, clubId: ClubId, on: number) {
  const club = s.clubs[clubId]!;
  const r = s.rivals.find((x) => x.employment.mode === 'freelance')!;
  const regulars = club.squad.map((id) => s.players[id]!).filter((p) => ovrAt(p, p.naturalPosition) >= clubPositionalAverage(s, club, p.naturalPosition)).slice(0, 3);
  r.signed = regulars.map((p) => ({ playerId: p.id, clubId, date: on as never }));
  return r;
}

describe('one quarterly client review', () => {
  it('runs on the 1st of January, April, July and October only', () => {
    expect(nextReview(makeDate(2026, 8, 15))).toBe(makeDate(2026, 10, 1));
    expect(nextReview(makeDate(2026, 11, 2))).toBe(makeDate(2027, 1, 1));
    const { s, club } = withClient();
    reviewClients(s, makeDate(2027, 2, 1));
    expect(s.scout!.clientWarnings?.[club.id]).toBeUndefined();
  });

  it('a quiet year earns a warning; still quiet three quarters later and they drop you', () => {
    const { s, club } = withClient();
    const q1 = makeDate(2027, 1, 1);
    expect(clientReview(s, club.id, q1).outlook).toBe('at-risk');
    reviewClients(s, q1);
    expect(s.scout!.clientWarnings?.[club.id]).toBe(q1);
    expect(s.scout!.relationships[club.headCoachId]).toBe(46);
    reviewClients(s, makeDate(2027, 4, 1)); // they wait
    reviewClients(s, makeDate(2027, 7, 1));
    expect(clients(s)).toContain(club.id);
    expect(s.scout!.relationships[club.headCoachId]).toBe(46);
    reviewClients(s, makeDate(2027, 10, 1));
    expect(clients(s)).not.toContain(club.id);
    expect(s.scout!.clientWarnings?.[club.id]).toBeUndefined();
  });

  it('a busy year delights them and lifts the warning', () => {
    const { s, club } = withClient();
    s.scout!.clientWarnings = { [club.id]: makeDate(2026, 10, 1) };
    s.deals.push(signing(s, club.id, 1), signing(s, club.id, 2), signing(s, club.id, 3));
    const q = makeDate(2027, 1, 1);
    expect(clientReview(s, club.id, q).outlook).toBe('delighted');
    reviewClients(s, q);
    expect(s.scout!.clientWarnings?.[club.id]).toBeUndefined();
    expect(s.scout!.relationships[club.headCoachId]).toBe(52);
  });

  it('a rival doing better warns you even above the bar, then takes the client', () => {
    const { s, club } = withClient();
    s.deals.push(signing(s, club.id, 5), signing(s, club.id, 6)); // score 4, bar 2
    const r = rivalAhead(s, club.id, makeDate(2026, 11, 1));
    const q1 = makeDate(2027, 1, 1);
    const y = clientReview(s, club.id, q1);
    expect(y.score).toBeGreaterThanOrEqual(y.bar);
    expect(y.behind).toBe(true);
    reviewClients(s, q1);
    expect(s.news[0]!.title).toMatch(/warn you/);
    expect(s.news[0]!.body).toContain(y.rival!.name);
    reviewClients(s, makeDate(2027, 4, 1));
    expect(clients(s)).not.toContain(club.id);
    expect(r.employment.mode === 'freelance' && r.employment.clients.includes(club.id)).toBe(true);
    expect(s.news[0]!.title).toMatch(/replace you/);
  });

  it('a new client waits 270 days before judging your work, 120 before comparing you with a rival', () => {
    const { s, club } = withClient();
    const q = makeDate(2027, 1, 1);
    s.scout!.clientSince = { [club.id]: addDays(q, -200) };
    reviewClients(s, q);
    expect(s.scout!.clientWarnings?.[club.id]).toBeUndefined();
    rivalAhead(s, club.id, addDays(q, -60));
    reviewClients(s, q);
    expect(s.scout!.clientWarnings?.[club.id]).toBe(q);
  });

  it('on a review day it judges that day, not the next review', () => {
    const { s, club } = withClient();
    s.scout!.clientWarnings = { [club.id]: makeDate(2026, 10, 1) };
    s.date = makeDate(2027, 4, 1);
    reviewClients(s, s.date);
    expect(clients(s)).toContain(club.id);
  });

  it('reads warnings from older saves', () => {
    const { s, club } = withClient();
    s.date = makeDate(2026, 12, 1);
    s.scout!.clientWarned = [club.id];
    expect(clientReview(s, club.id).warnedOn).toBe(makeDate(2026, 7, 1));
    expect(clientReview(s, club.id).outlook).toBe('at-risk');
    expect(clientReview(s, club.id, makeDate(2027, 4, 1)).outlook).toBe('leaving');
    s.scout!.clientWarned = [];
    s.scout!.raceWarned = { [club.id]: makeDate(2026, 10, 1) };
    expect(clientReview(s, club.id).warnedOn).toBe(makeDate(2026, 10, 1));
    reviewClients(s, makeDate(2027, 7, 1));
    expect(clients(s)).not.toContain(club.id);
    expect(s.scout!.raceWarned?.[club.id]).toBeUndefined();
  });
});
