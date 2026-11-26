import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Deal } from '../../src/engine/model/deal';
import type { GameState } from '../../src/engine/model/world-state';

const eng = 'eng' as CountryId;

describe('who you can still pitch to a club', () => {
  it('leaves out its own players, open deals there, and fresh refusals there', () => {
    const e = new Engine();
    e.generate(4242);
    e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
    const s = (e as unknown as { state: GameState }).state;
    const club = Object.values(s.clubs).find((c) => c.countryId === eng && c.tier === 4)!;
    const others = Object.values(s.players).filter((p) => p.clubId && p.clubId !== club.id).slice(0, 3);
    const deal = (playerId: string, stage: Deal['stage'], extra: Partial<Deal> = {}): Deal =>
      ({ id: s.counters.deal++, playerId, clubId: club.id, position: 'CM', stage, pitchedTo: ['coach'], prospect: false, openedOn: s.date, fee: usd(0), wage: usd(0), log: [], ...extra }) as Deal;
    s.deals.unshift(deal(others[0]!.id, 'negotiating'), deal(others[1]!.id, 'rejected', { rejectedBy: club.headCoachId, estimateThen: 99 }), deal(others[2]!.id, 'completed'));
    const blocks = e.getPitchBlocks(club.id);
    expect(blocks[club.squad[0]!]?.why).toBe('here');
    expect(blocks[others[0]!.id]?.why).toBe('open');
    expect(blocks[others[1]!.id]?.why).toBe('rejected');
    expect(blocks[others[2]!.id]).toBeUndefined();
  });
});
