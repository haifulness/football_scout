import { describe, expect, it } from 'vitest';
import { makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Rng } from '../../src/engine/core/rng';
import { Engine } from '../../src/engine/index';
import { HQ } from '../../src/engine/model/agency';
import type { Assistant } from '../../src/engine/model/assistant';
import type { Mission } from '../../src/engine/model/mission';
import type { GameState } from '../../src/engine/model/world-state';
import { agencyOnSignings } from '../../src/engine/systems/agency';
import { formationPositions } from '../../src/engine/systems/deals';
import { MAX_LEADS, PICKUP_GRACE_DAYS, officeWeek, pickupBrief, recallJob } from '../../src/engine/systems/delegation';

const eng = 'eng' as CountryId;

function setup(skill = 14) {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const s = (e as unknown as { state: GameState }).state;
  s.scout!.reputation = 65;
  s.scout!.money = usd(200_000);
  e.foundAgency({ name: 'Test Agency', logo: { colors: { primary: '#fff', secondary: '#000' }, crest: 'shield' } as never });
  const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
  if (s.scout!.employment.mode === 'freelance') s.scout!.employment.clients.push(club.id);
  const m: Mission = {
    id: 99,
    clubId: club.id,
    position: formationPositions(club).find((x) => x !== 'GK')!,
    requirements: { minOvr: 50 },
    brief: 'test',
    postedOn: s.date,
    acceptBy: s.date,
    weeks: 8,
    deadline: (s.date + 56) as typeof s.date,
    reward: usd(10_000),
    status: 'active',
  };
  s.missions.push(m);
  const a: Assistant = { id: 7, firstName: 'Sam', lastName: 'Eye', nationality: eng, portraitSeed: 1, age: 40, skill, speciality: eng, wage: usd(800), hiredOn: s.date, xp: 0, reports: 0, officeId: HQ };
  s.assistants.push(a);
  return { s, m, a, club };
}

describe('office staff', () => {
  it('pick up a brief you have left untouched for a week', () => {
    const { s, m, a } = setup();
    expect(pickupBrief(s, a)).toBeUndefined(); // just accepted: yours first
    s.date = (s.date + PICKUP_GRACE_DAYS) as typeof s.date;
    expect(pickupBrief(s, a)?.id).toBe(m.id);
    officeWeek(s, a, s.date, Rng.derive(1, 't'));
    expect(a.job?.missionId).toBe(m.id);
    expect(a.officeId).toBe(HQ);
    expect(s.agency!.log![0]!.text).toMatch(/took over/);
  });

  it('leave it alone when told to, when too junior, or once it has come back to you', () => {
    const junior = setup(11);
    junior.s.date = (junior.s.date + 7) as typeof junior.s.date;
    expect(pickupBrief(junior.s, junior.a)).toBeUndefined();

    const { s, m, a } = setup();
    s.date = (s.date + 7) as typeof s.date;
    a.skipBriefs = true;
    expect(pickupBrief(s, a)).toBeUndefined();
    a.skipBriefs = undefined;
    officeWeek(s, a, s.date, Rng.derive(1, 't'));
    recallJob(s, a.id);
    expect(m.yours).toBe(true);
    expect(pickupBrief(s, a)).toBeUndefined();
  });

  it('line up deals outside the window and spend them closing signings in it', () => {
    const { s, a, m } = setup();
    m.status = 'succeeded';
    const off = makeDate(2026, 10, 5);
    for (let i = 0; i < 30; i++) officeWeek(s, a, (off + i * 7) as typeof off, Rng.derive(i, 'lead'));
    expect(a.leads).toBe(MAX_LEADS);
    expect(s.agency!.log!.some((e) => e.kind === 'lead')).toBe(true);
    // In a window he closes, not lines up.
    a.leads = 0;
    officeWeek(s, a, makeDate(2027, 1, 11), Rng.derive(1, 'w'));
    expect(a.leads).toBe(0);
    // Leads make a brokered deal likelier, and one is used up per deal.
    a.leads = MAX_LEADS;
    const signings = Object.values(s.players)
      .filter((p) => p.clubId && s.clubs[p.clubId]!.countryId === eng)
      .slice(0, 200)
      .map((p) => ({ playerId: p.id, clubId: p.clubId!, fee: usd(100_000) }));
    agencyOnSignings(s, signings as never, s.date, 'test');
    expect(a.leads).toBe(0);
    expect(s.agency!.log!.some((e) => e.kind === 'deal')).toBe(true);
  });
});
