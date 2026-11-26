import { describe, expect, it } from 'vitest';
import { addDays, makeDate, toParts } from '../../src/engine/core/calendar';
import type { ClubId, CountryId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { GameState } from '../../src/engine/model/world-state';
import { pressLeads } from '../../src/engine/systems/club-read';
import { clientRace, compareWithRivals } from '../../src/engine/systems/client-race';
import { clubPositionalAverage } from '../../src/engine/systems/deals';
import { ovrAt } from '../../src/engine/systems/ratings';
import { RIVAL_STYLES, rivalStyle, rivalsReadPaper, seedRivals } from '../../src/engine/systems/rivals';

const eng = 'eng' as CountryId;

function career() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'normal' });
  const s = (e as unknown as { state: GameState }).state;
  if (!s.rivals.length) seedRivals(s);
  return { e, s };
}

describe('rival styles', () => {
  it('every rival has a fixed style, all four appear, and you only see it once you know him', () => {
    const { e, s } = career();
    const styles = new Set(s.rivals.map((r) => rivalStyle(s, r)));
    expect(styles.size).toBe(RIVAL_STYLES.length);
    expect(rivalStyle(s, s.rivals[0]!)).toBe(rivalStyle(s, s.rivals[0]!));
    const r = s.rivals[0]!;
    expect(e.getRivals().rivals.find((x) => x.id === r.id)!.style).toBeUndefined();
    r.styleKnown = true;
    expect(e.getRivals().rivals.find((x) => x.id === r.id)!.style?.label).toMatch(/The /);
  });

  it('grinders get to the paper’s leads first', () => {
    const { s } = career();
    while (toParts(s.date).weekday !== 1) s.date = addDays(s.date, 1);
    pressLeads(s);
    rivalsReadPaper(s);
    const byId = new Map(s.rivals.map((r) => [r.id, r]));
    // A quarter of rivals are grinders, but they take far more than a quarter of the first spots.
    const first = s.press!.items.flatMap((i) => (i.rivals?.length ? [rivalStyle(s, byId.get(i.rivals[0]!)!)] : []));
    expect(first.filter((x) => x === 'grinder').length / first.length).toBeGreaterThan(0.4);
  });
});

describe('clients compare you with rivals', () => {
  function setup() {
    const { e, s } = career();
    const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
    if (s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(club.id);
    s.scout!.clientSince = { [club.id]: s.date };
    const r = s.rivals.find((x) => x.employment.mode === 'freelance')!;
    // Three regulars he brought them.
    const regulars = club.squad.map((id) => s.players[id]!).filter((p) => ovrAt(p, p.naturalPosition) >= clubPositionalAverage(s, club, p.naturalPosition)).slice(0, 3);
    return { e, s, club, r, regulars };
  }

  it('a rival doing better earns you a warning, then a second quarter costs you the client', () => {
    const { s, club, r, regulars } = setup();
    s.date = makeDate(2027, 1, 1);
    r.signed = regulars.map((p) => ({ playerId: p.id, clubId: club.id as ClubId, date: addDays(s.date, -60) }));
    expect(clientRace(s, club.id).behind).toBe(true);
    compareWithRivals(s, s.date);
    expect(s.scout!.raceWarned?.[club.id]).toBe(s.date);
    expect(s.news[0]!.title).toMatch(/looking at/);
    s.date = makeDate(2027, 4, 1);
    compareWithRivals(s, s.date);
    const e = s.scout!.employment as { mode: 'freelance'; clients: ClubId[] };
    expect(e.clients).not.toContain(club.id);
    expect(r.employment.mode === 'freelance' && r.employment.clients.includes(club.id)).toBe(true);
  });

  it('no comparison for a new client, and catching up clears the warning', () => {
    const { s, club, r, regulars } = setup();
    s.date = addDays(s.date, 30);
    r.signed = regulars.map((p) => ({ playerId: p.id, clubId: club.id as ClubId, date: s.date }));
    s.date = makeDate(2026, 10, 1);
    s.scout!.clientSince = { [club.id]: addDays(s.date, -30) };
    compareWithRivals(s, s.date);
    expect(s.scout!.raceWarned?.[club.id]).toBeUndefined();
    s.scout!.clientSince = { [club.id]: addDays(s.date, -400) };
    s.date = makeDate(2027, 1, 1);
    compareWithRivals(s, s.date);
    expect(s.scout!.raceWarned?.[club.id]).toBeDefined();
    r.signed = [];
    s.date = makeDate(2027, 4, 1);
    compareWithRivals(s, s.date);
    expect(s.scout!.raceWarned?.[club.id]).toBeUndefined();
  });
});
