import { describe, expect, it } from 'vitest';
import { makeDate } from '../../src/engine/core/calendar';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Engine } from '../../src/engine/index';
import type { Consultation } from '../../src/engine/model/consultation';
import type { Club } from '../../src/engine/model/club';
import type { Player } from '../../src/engine/model/player';
import type { GameState } from '../../src/engine/model/world-state';
import { answerConsultation, consultationFee, consultationTick, wouldStart } from '../../src/engine/systems/consultations';
import { canAfford, offeredWage, transferFee } from '../../src/engine/systems/transfers';

const eng = 'eng' as CountryId;

function career(): GameState {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  return (e as unknown as { state: GameState }).state;
}

/** A player and a club that can afford him, where he would (or wouldn't) start. */
function pair(w: GameState, starts: boolean): { p: Player; club: Club } {
  for (const p of Object.values(w.players)) {
    if (!p.clubId || w.clubs[p.clubId]!.countryId !== eng) continue;
    const from = w.clubs[p.clubId]!;
    const club = Object.values(w.clubs).find(
      (c) => c.id !== from.id && c.countryId === eng && c.tier === from.tier && wouldStart(w, p, c) === starts && canAfford(w, c, transferFee(w, p), offeredWage(w, p, c)).ok,
    );
    if (club) return { p, club };
  }
  throw new Error('no pair');
}

function ask(w: GameState, p: Player, club: Club): Consultation {
  const c: Consultation = {
    id: 1,
    playerId: p.id,
    clubId: club.id,
    fromClubId: p.clubId!,
    position: p.naturalPosition,
    postedOn: w.date,
    answerBy: (w.date + 5) as typeof w.date,
    fee: usd(500),
    read: 'starter',
  };
  w.consultations = [c];
  return c;
}

const later = (w: GameState, days: number) => {
  w.date = (w.date + days) as typeof w.date;
  consultationTick(w, w.date);
};

describe('players ask you about a club', () => {
  it('Go: he signs, you are paid, and good advice builds trust', () => {
    const w = career();
    const { p, club } = pair(w, true);
    w.scout!.rapport[p.id] = 20;
    const c = ask(w, p, club);
    const money = w.scout!.money;
    answerConsultation(w, c.id, 'go');
    expect(p.clubId).toBe(club.id);
    expect(w.scout!.money).toBe(money + 500);
    later(w, 61);
    expect(c.verdict).toBe(wouldStart(w, p, club) ? 'right' : 'wrong');
    if (c.verdict === 'right') expect(w.scout!.rapport[p.id]).toBe(32);
  });

  it('Stay away from a club where he would have walked in is bad advice', () => {
    const w = career();
    const { p, club } = pair(w, true);
    w.scout!.rapport[p.id] = 30;
    const c = ask(w, p, club);
    const from = p.clubId;
    answerConsultation(w, c.id, 'stay');
    expect(p.clubId).toBe(from);
    later(w, 61);
    expect(c.verdict).toBe('wrong');
    expect(w.scout!.rapport[p.id]).toBe(15);
  });

  it('Only if he starts: no promise from a club where he would not play, so he stays', () => {
    const w = career();
    const { p, club } = pair(w, false);
    const c = ask(w, p, club);
    const from = p.clubId;
    answerConsultation(w, c.id, 'if-starts');
    expect(p.clubId).toBe(from);
    expect(c.moved).toBe(false);
  });

  it('the fee grows with how well he knows you; questions come in the window to players who know you', () => {
    const w = career();
    const { p } = pair(w, true);
    w.scout!.rapport[p.id] = 15;
    const low = consultationFee(w, p);
    w.scout!.rapport[p.id] = 90;
    expect(consultationFee(w, p)).toBeGreaterThanOrEqual(low);
    // Every Monday of the summer window.
    let d = makeDate(2026, 7, 6);
    for (let i = 0; i < 8 && !w.consultations?.length; i++, d = (d + 7) as typeof d) consultationTick(w, d);
    expect(w.consultations?.length).toBe(1);
    expect(w.consultations![0]!.playerId).toBe(p.id);
  });
});
