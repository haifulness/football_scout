import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Rng } from '../../src/engine/core/rng';
import { Engine } from '../../src/engine/index';
import type { Club } from '../../src/engine/model/club';
import type { Player } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import { characterOf } from '../../src/engine/systems/character';
import { pickTeam } from '../../src/engine/systems/match-sim';
import { aftercare, aftercareCheck, settleForecast, settlePenalty } from '../../src/engine/systems/settling';
import { executeTransfer } from '../../src/engine/systems/transfers';

const eng = 'eng' as CountryId;

function career(): GameState {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  return (e as unknown as { state: GameState }).state;
}

const w = career();
const england = w.countries[eng]!;
const buyer = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 2)!;
const playersFrom = (pred: (c: GameState['countries'][CountryId]) => boolean, traits: (p: Player) => boolean = () => true) =>
  Object.values(w.players).filter((p) => p.clubId && p.nationality === w.clubs[p.clubId]!.countryId && pred(w.countries[p.nationality]!) && traits(p));
const plain = (p: Player) => characterOf(p).length === 0;

describe('settling in after a move', () => {
  it('a move at home needs no settling; further away takes longer', () => {
    const home = playersFrom((c) => c.id === eng, plain)[0]!;
    const sameLang = playersFrom((c) => c.id !== eng && c.culture === england.culture, plain)[0]!;
    const europe = playersFrom((c) => c.culture !== england.culture && c.continentId === england.continentId, plain)[0]!;
    const far = playersFrom((c) => c.culture !== england.culture && c.continentId !== england.continentId, plain)[0]!;
    const d = (p: Player) => settleForecast(w, p, buyer, w.date).days;
    expect(d(home)).toBe(0);
    expect(d(sameLang)).toBeGreaterThan(0);
    expect(d(europe)).toBeGreaterThan(d(sameLang));
    expect(d(far)).toBeGreaterThan(d(europe));
  });

  it('homesick takes longest, adaptable shortest', () => {
    const far = (c: GameState['countries'][CountryId]) => c.culture !== england.culture && c.continentId !== england.continentId;
    const homesick = playersFrom(far, (p) => characterOf(p).includes('homesick'))[0]!;
    const adaptable = playersFrom(far, (p) => characterOf(p).includes('adaptable'))[0]!;
    expect(settleForecast(w, homesick, buyer, w.date).days).toBeGreaterThan(settleForecast(w, adaptable, buyer, w.date).days * 2);
  });

  it('the penalty fades to nothing, and a visit from the scout who placed him shortens it once a month', () => {
    const s = structuredClone(w);
    const club = s.clubs[buyer.id]!;
    const p = Object.values(s.players).find(
      (x) => x.clubId && s.countries[s.clubs[x.clubId]!.countryId]!.continentId !== england.continentId && characterOf(x).length === 0,
    )!;
    executeTransfer(s, p, club, usd(0), p.wage, s.date);
    expect(p.settling).toBeDefined();
    const start = settlePenalty(p, s.date);
    expect(start).toBeGreaterThan(0);
    expect(settlePenalty(p, addDays(s.date, 30))).toBeLessThan(start);
    expect(settlePenalty(p, p.settling!.until)).toBe(0);

    // Not your player: a visit changes nothing.
    expect(aftercareCheck(s, p).ok).toBe(false);
    s.placements.push({ id: 999, dealId: 999, playerId: p.id, clubId: club.id, position: p.naturalPosition, signedOn: s.date, expiresOn: addDays(s.date, 999), fee: usd(0), ovrGap: 0, prospect: false, mode: 'freelance', bonus: usd(0), bonusPaid: true, earnings: {} } as never);
    const until = p.settling!.until;
    const saved = aftercare(s, p);
    expect(saved).toBeGreaterThan(0);
    expect(p.settling!.until).toBe(addDays(until, -saved));
    // Today's penalty is unchanged (it just runs out sooner); a second visit the same month does nothing.
    expect(settlePenalty(p, s.date)).toBeCloseTo(start, 5);
    expect(aftercare(s, p)).toBe(0);
  });

  it('a settling player starts less often than the same player settled', () => {
    const s = structuredClone(w);
    const club: Club = s.clubs[buyer.id]!;
    const squad = () => club.squad.map((id) => s.players[id]!);
    const star = squad().sort((a, b) => b.value - a.value).find((p) => p.id !== club.captainId)!;
    const starts = () => {
      let n = 0;
      const rng = new Rng(11);
      for (let i = 0; i < 200; i++) if (pickTeam(club, squad(), s.date, rng).xi.some((x) => x.player.id === star.id)) n++;
      return n;
    };
    const settled = starts();
    star.settling = { since: s.date, until: addDays(s.date, 150), start: 0.12 };
    expect(starts()).toBeLessThan(settled);
  });
});
