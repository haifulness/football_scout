import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { Rng } from '../../src/engine/core/rng';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Deal } from '../../src/engine/model/deal';
import type { GameState } from '../../src/engine/model/world-state';
import { replaceCoach } from '../../src/engine/systems/coaching';
import { REPITCH_DAYS, formationPositions, gateCheck, pitch, repitchCheck } from '../../src/engine/systems/deals';
import { estimate, fog } from '../../src/engine/systems/knowledge';

const eng = 'eng' as CountryId;

/** A career with a client, a player who'd clear the club's bar, and a coach's "no" on file for him. */
function setup() {
  const e = new Engine();
  e.generate(2468);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'agent-assistant', difficulty: 'easy' });
  const w = (e as unknown as { state: GameState }).state;
  w.scout!.reputation = 100;
  w.scout!.money = usd(1_000_000);
  const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 3)!;
  if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
  w.scout!.location = club.cityId;
  const position = formationPositions(club).find((x) => x !== 'GK')!;
  const p = Object.values(w.players).find((x) => x.clubId && x.clubId !== club.id && x.naturalPosition === position && gateCheck(w, x, club, position).passes && x.value < club.transferBudget / 3)!;
  w.knowledge[p.id] = { level: 50, lastUpdated: w.date };
  const no: Deal = {
    id: w.counters.deal++,
    playerId: p.id,
    clubId: club.id,
    sellingClubId: p.clubId,
    position,
    stage: 'rejected',
    pitchedTo: ['coach'],
    prospect: false,
    openedOn: w.date,
    fee: usd(p.value),
    wage: usd(p.wage),
    rejectedBy: club.headCoachId,
    estimateThen: estimate(fog(w, p).positions[position]),
    reason: "The coach wasn't convinced.",
    log: [],
  };
  w.deals.unshift(no);
  return { e, w, club, p, position, no };
}

describe('pitching a rejected player again', () => {
  it("after a coach's no, waits six months and says what would open it sooner", () => {
    const { e, w, club, p, position, no } = setup();
    const r = repitchCheck(w, no);
    expect(r.ok).toBe(false);
    expect(r.from).toBe(addDays(no.openedOn, REPITCH_DAYS));
    expect(r.conditions).toEqual(expect.arrayContaining(['the coach changes', `they post a ${position} brief`, 'he becomes a free agent']));
    expect(() => pitch(w, { playerId: p.id, clubId: club.id, position, to: 'coach' })).toThrow(/pitch him again from/);
    const preview = e.getPitchPreview(p.id, club.id, position);
    expect(preview.repitch?.ok).toBe(false);
    expect(preview.existing?.stage).toBe('rejected');

    w.date = addDays(no.openedOn, REPITCH_DAYS);
    expect(repitchCheck(w, no)).toMatchObject({ ok: true, because: 'six months have passed' });
    expect(e.getPitchPreview(p.id, club.id, position).existing).toBeUndefined();
    const again = pitch(w, { playerId: p.id, clubId: club.id, position, to: 'coach' });
    expect(again.id).not.toBe(no.id);
    expect(again.log[0]?.text).toMatch(/Trying again/);
  });

  it('opens early with a new coach, a better read on him, or a brief for his position', () => {
    const a = setup();
    replaceCoach(a.w, a.club, Rng.derive(3, 'c'), a.w.date, 'after a poor run');
    expect(repitchCheck(a.w, a.no)).toMatchObject({ ok: true, because: 'the coach who said no has gone' });

    const b = setup();
    b.no.estimateThen = estimate(fog(b.w, b.p).positions[b.position]) - 5;
    expect(repitchCheck(b.w, b.no).ok).toBe(true);

    const c = setup();
    // The brief he was turned down for doesn't count: only a newer one does.
    c.w.missions.push({ id: 998, clubId: c.club.id, position: c.position, status: 'active', postedOn: c.no.openedOn - 1 } as never);
    expect(repitchCheck(c.w, c.no).ok).toBe(false);
    c.w.missions.push({ id: 999, clubId: c.club.id, position: c.position, status: 'offered', postedOn: c.no.openedOn + 1 } as never);
    expect(repitchCheck(c.w, c.no)).toMatchObject({ ok: true, because: `they posted a ${c.position} brief` });
  });

  it("after a club-level no, opens as soon as the club's reasons no longer apply", () => {
    const { w, club, no } = setup();
    no.clubLevelRejection = true;
    no.rejectedBy = undefined;
    const budget = club.transferBudget;
    club.transferBudget = usd(0);
    const blocked = repitchCheck(w, no);
    expect(blocked.ok).toBe(false);
    expect(blocked.conditions).toContain('they can afford him');
    club.transferBudget = budget;
    expect(repitchCheck(w, no)).toMatchObject({ ok: true, because: "the club's reasons no longer apply" });
  });
});
