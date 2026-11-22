import { describe, expect, it } from 'vitest';
import { toParts } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Mission } from '../../src/engine/model/mission';
import type { GameState } from '../../src/engine/model/world-state';
import { campaignCheck, campaignCost, campaignTick, inSpotlight, startCampaign, stopCampaign } from '../../src/engine/systems/campaigns';
import { missionTick } from '../../src/engine/systems/missions';

const eng = 'eng' as CountryId;

function career(): GameState {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  const w = (e as unknown as { state: GameState }).state;
  w.scout!.money = usd(100_000);
  return w;
}

/** Run Mondays for n weeks. */
function weeks(w: GameState, n: number) {
  let d = w.date;
  while (toParts(d).weekday !== 1) d++;
  for (let i = 0; i < n; i++) {
    w.date = d;
    campaignTick(w, d);
    d = (d + 7) as typeof d;
  }
}

describe('profile campaigns', () => {
  it('charges every week, brings invitations from the market, then ends', () => {
    const w = career();
    const money = w.scout!.money;
    startCampaign(w, eng, 8);
    expect(inSpotlight(w)).toBe(true);
    for (let i = 0; i < 10 && inSpotlight(w); i++) {
      weeks(w, 1);
      w.date = (w.date + 1) as typeof w.date;
    }
    expect(inSpotlight(w)).toBe(false);
    const c = w.campaign!;
    expect(c.spent).toBe(campaignCost(w, eng) * 8);
    expect(w.scout!.money).toBeLessThan(money);
    expect(w.offers.filter((o) => o.kind === 'client' && w.clubs[o.clubId]!.countryId === eng).length).toBe(c.invites);
  });

  it('one at a time, freelancers only, and you can pull it', () => {
    const w = career();
    startCampaign(w, eng, 4);
    expect(campaignCheck(w, eng, 4).ok).toBe(false);
    stopCampaign(w);
    expect(inSpotlight(w)).toBe(false);
    expect(campaignCheck(w, eng, 2).ok).toBe(false);
  });

  it('in the spotlight a failed brief costs half as much again', () => {
    const fail = (spot: boolean) => {
      const w = career();
      const club = Object.values(w.clubs).find((c) => c.countryId === eng)!;
      if (w.scout!.employment.mode === 'freelance') w.scout!.employment.clients.push(club.id);
      w.scout!.relationships[club.headCoachId] = 50;
      w.scout!.reputation = 20;
      if (spot) startCampaign(w, eng, 4);
      const m: Mission = {
        id: 1,
        clubId: club.id,
        position: 'ST',
        requirements: { minOvr: 99 },
        brief: '',
        postedOn: w.date,
        acceptBy: w.date,
        weeks: 1,
        deadline: (w.date - 1) as typeof w.date,
        reward: usd(1),
        status: 'active',
      };
      w.missions.push(m);
      missionTick(w, w.date);
      expect(m.status).toBe('failed');
      return { rel: w.scout!.relationships[club.headCoachId], rep: w.scout!.reputation };
    };
    expect(fail(false)).toEqual({ rel: 44, rep: 19 });
    expect(fail(true)).toEqual({ rel: 41, rep: 18 });
  });
});
