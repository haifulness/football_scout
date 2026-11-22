import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Rng } from '../../src/engine/core/rng';
import { Engine } from '../../src/engine/index';
import type { Assistant } from '../../src/engine/model/assistant';
import type { Mission } from '../../src/engine/model/mission';
import type { GameState } from '../../src/engine/model/world-state';
import { clubPositionalAverage, formationPositions } from '../../src/engine/systems/deals';
import { DELEGATE_SKILL, STAFF_CUT, chargeStaffCut, delegateCheck, delegateMission, jobWeek, recallJob } from '../../src/engine/systems/delegation';

const eng = 'eng' as CountryId;

function setup(skill = 15) {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const w = (e as unknown as { state: GameState }).state;
  w.scout!.money = usd(100_000);
  w.scout!.unlocks = ['assistants'];
  const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 4 && c.transferBudget > 50_000)!;
  if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
  const pos = formationPositions(club).find((x) => x !== 'GK')!;
  const avg = clubPositionalAverage(w, club, pos);
  const m: Mission = {
    id: 99,
    clubId: club.id,
    position: pos,
    requirements: { minOvr: avg + 1 },
    brief: 'test',
    postedOn: w.date,
    acceptBy: w.date,
    weeks: 8,
    deadline: (w.date + 56) as typeof w.date,
    reward: usd(10_000),
    status: 'active',
  };
  w.missions.push(m);
  const a: Assistant = {
    id: 7,
    firstName: 'Sam',
    lastName: 'Eye',
    nationality: eng,
    portraitSeed: 1,
    age: 40,
    skill,
    speciality: eng,
    wage: usd(800),
    hiredOn: w.date,
    xp: 0,
    reports: 0,
  };
  w.assistants.push(a);
  return { e, w, club, m, a };
}

describe('staff take a brief', () => {
  it('only a senior, free assistant can take an active brief', () => {
    const junior = setup(DELEGATE_SKILL - 1);
    expect(delegateCheck(junior.w, junior.a, junior.m).ok).toBe(false);
    const { w, a, m } = setup();
    expect(delegateCheck(w, a, m).ok).toBe(true);
    m.status = 'offered';
    expect(delegateCheck(w, a, m).reason).toMatch(/Accept/);
  });

  it('he pitches under your name, with no trip or meeting fee for you', () => {
    const { w, a, m, club } = setup();
    delegateMission(w, a.id, m.id);
    const meetings = w.ledger.filter((l) => l.kind === 'meeting').length;
    const location = w.scout!.location;
    for (let i = 0; i < 4 && !a.job?.tried.length; i++) jobWeek(w, a, Rng.derive(i, 'job'));
    expect(a.job?.tried.length ?? 0).toBeGreaterThan(0);
    const deal = w.deals.find((d) => d.clubId === club.id && d.delegatedTo === a.id)!;
    expect(deal).toBeDefined();
    expect(deal.log[0]!.text).toMatch(/Your assistant Sam Eye pitched/);
    expect(w.ledger.filter((l) => l.kind === 'meeting').length).toBe(meetings);
    expect(w.scout!.location).toBe(location);
    expect(w.ledger.some((l) => l.kind === 'assistant-task' && l.label.includes('Brief expenses'))).toBe(true);
  });

  it('he keeps his share of what the brief earns, and you can take it back', () => {
    const { w, a, m } = setup();
    delegateMission(w, a.id, m.id);
    const money = w.scout!.money;
    chargeStaffCut(w, { delegatedTo: a.id } as never, usd(10_000), 'mission reward');
    expect(w.scout!.money).toBe(money - 10_000 * STAFF_CUT);
    chargeStaffCut(w, { } as never, usd(10_000), 'mission reward');
    expect(w.scout!.money).toBe(money - 10_000 * STAFF_CUT);
    recallJob(w, a.id);
    expect(a.job).toBeUndefined();
  });
});
