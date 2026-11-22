import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Deal } from '../../src/engine/model/deal';
import type { Mandate, Mission } from '../../src/engine/model/mission';
import type { GameState } from '../../src/engine/model/world-state';
import { acceptMandate, marketTick } from '../../src/engine/systems/market';
import { acceptMission, missionDeals, missionTick } from '../../src/engine/systems/missions';

const eng = 'eng' as CountryId;

function career() {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const w = (e as unknown as { state: GameState }).state;
  const club = Object.values(w.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
  if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
  return { e, w, club };
}

function deal(w: GameState, over: Partial<Deal>): Deal {
  const d = {
    id: 900 + w.deals.length,
    playerId: Object.values(w.players).find((p) => p.clubId)!.id,
    clubId: over.clubId!,
    position: 'ST',
    stage: 'negotiating',
    openedOn: w.date,
    fee: usd(0),
    log: [],
    ...over,
  } as unknown as Deal;
  w.deals.push(d);
  return d;
}

function brief(w: GameState, clubId: Mission['clubId']): Mission {
  const m: Mission = {
    id: 77,
    clubId,
    position: 'ST',
    requirements: { minOvr: 99 },
    brief: '',
    postedOn: w.date,
    acceptBy: (w.date + 14) as typeof w.date,
    weeks: 4,
    reward: usd(5000),
    status: 'offered',
  };
  w.missions.push(m);
  return m;
}

describe('briefs and your candidates in talks', () => {
  it('a brief does not fail at its deadline while one of your candidates is still negotiating', () => {
    const { w, club } = career();
    const m = brief(w, club.id);
    acceptMission(w, m.id);
    const d = deal(w, { clubId: club.id });
    const after = (m.deadline! + 1) as typeof w.date;
    w.date = after;
    missionTick(w, after);
    expect(m.status).toBe('active');
    d.stage = 'failed';
    missionTick(w, after);
    expect(m.status).toBe('failed');
  });

  it('a player you put forward before the brief, still in talks, counts as a recommendation', () => {
    const { w, club } = career();
    const m = brief(w, club.id);
    const early = deal(w, { clubId: club.id, openedOn: (w.date - 20) as typeof w.date });
    const dead = deal(w, { clubId: club.id, openedOn: (w.date - 20) as typeof w.date, stage: 'failed' });
    acceptMission(w, m.id);
    const ids = missionDeals(w, m).map((d) => d.id);
    expect(ids).toContain(early.id);
    expect(ids).not.toContain(dead.id);
  });

  it('a selling request picks up talks you had already started for that player', () => {
    const { w, club } = career();
    w.scout!.unlocks = ['mandates'];
    const p = w.players[club.squad[0]!]!;
    const buyer = Object.values(w.clubs).find((c) => c.id !== club.id && c.countryId === eng)!;
    const d = deal(w, { clubId: buyer.id, playerId: p.id, sellingClubId: club.id, openedOn: (w.date - 10) as typeof w.date });
    const mandate = {
      id: 5,
      clubId: club.id,
      playerId: p.id,
      askingFee: usd(100_000),
      commissionPct: 5,
      reason: 'test',
      postedOn: w.date,
      acceptBy: (w.date + 14) as typeof w.date,
      weeks: 4,
      status: 'offered',
    } as unknown as Mandate;
    w.mandates.push(mandate);
    acceptMandate(w, mandate.id);
    expect(d.mandateId).toBe(mandate.id);
    // And it waits for those talks past its deadline.
    const after = (mandate.deadline! + 1) as typeof w.date;
    w.date = after;
    marketTick(w, after);
    expect(mandate.status).toBe('active');
  });
});
