import { describe, expect, it } from 'vitest';
import type { CountryId } from '../../src/engine/core/ids';
import { usd } from '../../src/engine/core/money';
import { Rng } from '../../src/engine/core/rng';
import { Engine } from '../../src/engine/index';
import type { Club } from '../../src/engine/model/club';
import type { GameState } from '../../src/engine/model/world-state';
import { answerBoardAsk, boardOdds, boardTick, ensurePresidents, needsBoard, presidentOf, sackOrAsk } from '../../src/engine/systems/board';
import { missionFit } from '../../src/engine/systems/missions';
import { ageOn } from '../../src/engine/core/calendar';

const eng = 'eng' as CountryId;

function career(): { e: Engine; w: GameState } {
  const e = new Engine();
  e.generate(4242);
  e.createCareer({ name: 'Jo', nationality: eng, homeCountry: eng, background: 'analyst', difficulty: 'easy' });
  return { e, w: (e as unknown as { state: GameState }).state };
}

const someClub = (w: GameState, pred: (c: Club) => boolean = () => true) => Object.values(w.clubs).find((c) => c.countryId === eng && c.transferBudget > 0 && pred(c))!;

describe('presidents', () => {
  it('every club has one, once', () => {
    const { w } = career();
    for (const c of Object.values(w.clubs)) expect(presidentOf(w, c)).toBeDefined();
    const n = Object.keys(w.presidents!).length;
    ensurePresidents(w);
    expect(Object.keys(w.presidents!).length).toBe(n);
  });

  it('only big money goes to the board', () => {
    const { w } = career();
    const club = someClub(w);
    expect(needsBoard(w, club, usd(0), usd(1))).toBe(false);
    expect(needsBoard(w, club, usd(Math.round(club.transferBudget * 0.9)), usd(1))).toBe(true);
  });

  it('judges money and direction: a youth board likes young players and balks at old ones', () => {
    const { w } = career();
    const club = someClub(w);
    presidentOf(w, club)!.policy = 'youth';
    const players = Object.values(w.players).filter((p) => p.clubId && p.clubId !== club.id);
    const young = players.find((p) => ageOn(p.birthDate, w.date) <= 21)!;
    const old = players.find((p) => ageOn(p.birthDate, w.date) >= 31)!;
    const fee = usd(Math.round(club.transferBudget * 0.9));
    expect(boardOdds(w, young, club, fee, false).chance).toBeGreaterThan(boardOdds(w, old, club, fee, false).chance);
  });

  it('a homegrown board asks for one of its own in briefs', () => {
    const { w } = career();
    const club = someClub(w);
    const p = Object.values(w.players).find((x) => x.nationality !== eng && x.clubId && x.clubId !== club.id)!;
    const m = { id: 1, clubId: club.id, position: p.naturalPosition, requirements: { minOvr: 1, nationality: eng }, brief: '', postedOn: w.date, acceptBy: w.date, weeks: 4, reward: usd(1), status: 'active' as const };
    expect(missionFit(w, m, p, usd(0)).failed).toContain('not from the club’s country');
  });
});

describe('the next coach', () => {
  function withKnownCoach() {
    const { e, w } = career();
    const club = someClub(w);
    const pres = presidentOf(w, club)!;
    w.scout!.relationships[pres.id] = 70; // 49 in the boardroom: rapport counts 70%, as with the coach
    // A coach out of work whom you know.
    const other = someClub(w, (c) => c.id !== club.id);
    const known = w.officials[other.headCoachId]!;
    known.unemployedSince = (w.date - 30) as typeof w.date;
    w.scout!.relationships[known.id] = 30;
    return { e, w, club, known };
  }

  it('a president you stand well with asks first, and takes your advice', () => {
    const { w, club, known } = withKnownCoach();
    const old = club.headCoachId;
    const ch = sackOrAsk(w, club, Rng.derive(1, 't'), w.date, 'after a poor run', true);
    expect(ch).toBeUndefined();
    expect(club.headCoachId).toBe(old); // waits for your answer
    const ask = w.boardAsks![0]!;
    expect(ask.candidates).toContain(known.id);
    const msg = answerBoardAsk(w, ask.id, known.id);
    expect(msg).toMatch(/takes your advice/);
    expect(club.headCoachId).toBe(known.id);
    expect(w.scout!.relationships[known.id]).toBe(45);
    expect(w.boardAsks).toEqual([]);
  });

  it('without an answer the board picks on its own', () => {
    const { w, club, known } = withKnownCoach();
    const old = club.headCoachId;
    sackOrAsk(w, club, Rng.derive(1, 't'), w.date, 'after a poor run', true);
    boardTick(w, (w.date + 10) as typeof w.date);
    expect(club.headCoachId).not.toBe(old);
    expect(w.boardAsks).toEqual([]);
    void known;
  });

  it('a stranger gets no say: the coach goes at once', () => {
    const { w } = career();
    const club = someClub(w);
    const old = club.headCoachId;
    const ch = sackOrAsk(w, club, Rng.derive(1, 't'), w.date, 'after a poor run', true);
    expect(ch).toBeDefined();
    expect(club.headCoachId).not.toBe(old);
  });
});
