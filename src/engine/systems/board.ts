import { addDays, ageOn, formatDate, makeDate, type GameDate } from '../core/calendar';
import type { ClubId, StaffId } from '../core/ids';
import type { USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { culture } from '../data/names';
import { newStaffId } from '../generation/world-generator';
import type { Club } from '../model/club';
import type { Deal } from '../model/deal';
import type { Player } from '../model/player';
import type { BoardAsk, BoardPolicy, President } from '../model/president';
import type { GameState } from '../model/world-state';
import { announceChange, replaceCoach, type CoachChange } from './coaching';
import { clubRecord } from './employment';
import { addNews } from './season';

/**
 * The boardroom. The Head Coach decides whether a player fits his team; the president decides whether the
 * club should spend the money, and who coaches the team. He never answers an ordinary pitch.
 */

/** A fee above this share of the transfer budget (or a wage well above the squad's) goes to the board. */
export const BOARD_FEE_SHARE = 0.7;
const BOARD_WAGE_FACTOR = 3;
/** Board standing at which a president asks your advice on the next coach. */
export const ADVICE_STANDING = 45;
const ADVICE_DAYS = 5;

export const POLICY_LABEL: Record<BoardPolicy, string> = {
  youth: 'Youth and resale',
  'win-now': 'Win now',
  homegrown: 'Homegrown first',
  sell: 'Sell to survive',
};
export const POLICY_LINE: Record<BoardPolicy, string> = {
  youth: 'buys young players who can be sold on, and balks at big fees for players past 28',
  'win-now': 'pays for players who make the team better today',
  homegrown: 'prefers players from its own country',
  sell: 'needs to bring money in: it pays big fees only for a bargain',
};

const presidentOf = (state: GameState, club: Club) => (club.presidentId ? state.presidents?.[club.presidentId] : undefined);
export { presidentOf };

/** A policy that fits the club: relegation-threatened or poor clubs sell, rich ones win now. */
function policyFor(state: GameState, club: Club, rng: Rng): BoardPolicy {
  const poor = club.transferBudget <= 0 || club.wageBudget < club.squad.reduce((n, id) => n + (state.players[id]?.wage ?? 0), 0);
  const w: [BoardPolicy, number][] = [
    ['youth', 1.2 + (club.tier >= 3 ? 0.6 : 0)],
    ['win-now', 0.8 + (club.tier <= 2 ? 1 : 0)],
    ['homegrown', 0.6],
    ['sell', poor ? 1.6 : 0.3],
  ];
  return rng.weighted(w, ([, x]) => x)[0];
}

/** Every club gets a president (worlds from before they came back get theirs the first time this runs). */
export function ensurePresidents(state: GameState) {
  const missing = Object.values(state.clubs).filter((c) => !c.presidentId || !state.presidents?.[c.presidentId]);
  if (!missing.length) return;
  state.presidents ??= {};
  for (const club of missing) {
    const rng = Rng.derive(state.seed, `president:${club.id}`);
    const country = state.countries[club.countryId]!;
    const names = culture(country.culture);
    const id = newStaffId(state);
    const p: President = {
      id,
      firstName: rng.pick(names.first),
      lastName: rng.pick(names.last),
      nationality: country.id,
      age: rng.int(42, 76),
      clubId: club.id,
      policy: policyFor(state, club, rng),
      stubbornness: rng.int(10, 90),
      portraitSeed: rng.seed(),
    };
    state.presidents[id] = p;
    club.presidentId = id;
  }
}

/** Your standing in the boardroom: your relationship with the president, your track record at the club, your name. */
export function boardStanding(state: GameState, clubId: ClubId): number {
  const scout = state.scout;
  const club = state.clubs[clubId];
  const pres = club && presidentOf(state, club);
  if (!scout || !club || !pres) return 0;
  const rel = scout.relationships[pres.id] ?? 0;
  const r = clubRecord(scout, clubId);
  const integrity = ((scout.integrity ?? 50) - 50) / 6.25;
  const employer = scout.employment.mode === 'fulltime' && scout.employment.clubId === clubId ? 10 : 0;
  return Math.round(clamp(rel + Math.min(20, r.signings * 4) + integrity + employer, 0, 100));
}

export function relateToBoard(state: GameState, clubId: ClubId, delta: number) {
  const club = state.clubs[clubId];
  const pres = club && presidentOf(state, club);
  if (!state.scout || !pres) return;
  state.scout.relationships[pres.id] = clamp((state.scout.relationships[pres.id] ?? 0) + delta, 0, 100);
}

const medianWage = (state: GameState, club: Club) => {
  const w = club.squad.map((id) => state.players[id]!.wage).sort((a, b) => a - b);
  return w.length ? w[Math.floor(w.length / 2)]! : 0;
};

/** Is this signing big enough for the board to have its say? */
export function needsBoard(state: GameState, club: Club, fee: USD, wage: USD): boolean {
  if (!presidentOf(state, club)) return false;
  const budget = Math.max(club.transferBudget, 1);
  return fee > budget * BOARD_FEE_SHARE || wage > medianWage(state, club) * BOARD_WAGE_FACTOR;
}

export interface BoardView {
  chance: number;
  /** What sways him, for and against. */
  reasons: { text: string; good: boolean }[];
}

/** How likely the board is to back a big signing, and why. Judged on money and direction, not fit. */
export function boardOdds(state: GameState, p: Player, club: Club, fee: USD, prospect: boolean): BoardView {
  const pres = presidentOf(state, club)!;
  const age = ageOn(p.birthDate, state.date);
  const reasons: BoardView['reasons'] = [];
  let x = 0.75;
  const add = (d: number, text: string) => {
    x += d;
    reasons.push({ text, good: d > 0 });
  };
  switch (pres.policy) {
    case 'youth':
      if (age <= 23) add(0.2, `young enough to sell on (${age})`);
      else if (age >= 29) add(-0.3, `too old for the board's money (${age})`);
      break;
    case 'win-now':
      if (prospect) add(-0.25, 'the board wants players for today, not prospects');
      else add(0.15, 'he improves the team now');
      break;
    case 'homegrown':
      if (p.nationality === club.countryId) add(0.2, 'one of their own');
      else add(-0.15, 'not from the club’s country');
      break;
    case 'sell':
      if (fee <= 0) add(0.2, 'free: no fee to find');
      else add(-0.25, 'money is tight this year');
      break;
  }
  if (fee > 0 && p.value > 0 && fee > p.value * 1.3) add(-0.15, 'the fee is above what he is worth');
  else if (fee > 0 && fee < p.value * 0.85) add(0.1, 'a fair price for him');
  const standing = boardStanding(state, club.id);
  if (standing >= 25) add(Math.min(0.25, standing / 300), `the board trusts you (${standing})`);
  x -= (pres.stubbornness - 50) / 500;
  return { chance: clamp(x, 0.1, 0.95), reasons };
}

/** After the coach's yes on a big signing: does the board back it? Mutates the deal and relationships. */
export function boardDecides(state: GameState, deal: Deal, p: Player, club: Club): { backed: boolean; text: string } {
  const pres = presidentOf(state, club)!;
  const odds = boardOdds(state, p, club, deal.fee, deal.prospect);
  const rng = Rng.derive(state.seed, `board:${deal.id}`);
  const name = `${pres.firstName} ${pres.lastName}`;
  deal.boardChecked = true;
  if (rng.next() < odds.chance) {
    relateToBoard(state, club.id, 2);
    const why = odds.reasons.find((r) => r.good)?.text;
    return { backed: true, text: `The board backs it: president ${name} signs off the money${why ? ` (${why})` : ''}.` };
  }
  relateToBoard(state, club.id, -2);
  const why = odds.reasons.find((r) => !r.good)?.text ?? 'not the right use of the money';
  return { backed: false, text: `The board blocked it: president ${name} won't sanction the money (${why}).` };
}

// ── The next coach ────────────────────────────────────────────────────────

/** Out-of-work coaches you know, who could credibly take the job. */
function adviceCandidates(state: GameState, outgoing: StaffId): StaffId[] {
  const scout = state.scout!;
  return Object.values(state.officials)
    .filter((o) => o.unemployedSince !== undefined && o.id !== outgoing && o.age < 67 && (scout.relationships[o.id] ?? 0) >= 10)
    .sort((a, b) => (scout.relationships[b.id] ?? 0) - (scout.relationships[a.id] ?? 0))
    .slice(0, 3)
    .map((o) => o.id);
}

/**
 * The board has lost patience with its coach. If you stand well with the president and know someone out of
 * work, he asks you first (the change waits for your answer); otherwise the coach goes at once.
 */
export function sackOrAsk(state: GameState, club: Club, rng: Rng, date: GameDate, reason: string, midSeason: boolean): CoachChange | undefined {
  const pres = presidentOf(state, club);
  if (state.scout && pres && !state.boardAsks?.some((a) => a.clubId === club.id) && boardStanding(state, club.id) >= ADVICE_STANDING) {
    const candidates = adviceCandidates(state, club.headCoachId);
    if (candidates.length) {
      const old = state.officials[club.headCoachId]!;
      const ask: BoardAsk = {
        id: Math.max(0, ...(state.boardAsks ?? []).map((a) => a.id)) + 1,
        clubId: club.id,
        presidentId: pres.id,
        outgoingId: old.id,
        reason,
        midSeason,
        postedOn: date,
        answerBy: addDays(date, ADVICE_DAYS),
        candidates,
      };
      state.boardAsks = [...(state.boardAsks ?? []), ask];
      addNews(state, {
        date,
        kind: 'career',
        title: `${club.name}: the president wants your advice`,
        body: `${pres.firstName} ${pres.lastName} is ready to part with ${old.firstName} ${old.lastName} ${reason}, and asks who you would bring in. Answer by ${formatDate(ask.answerBy)}, or the board picks on its own.`,
        clubIds: [club.id],
      });
      return undefined;
    }
  }
  const ch = replaceCoach(state, club, rng, date, reason);
  announceChange(state, ch, date, midSeason);
  return ch;
}

export function answerBoardAsk(state: GameState, askId: number, coachId: StaffId | null): string {
  const ask = state.boardAsks?.find((a) => a.id === askId);
  if (!ask) throw new Error('That request is no longer open.');
  const club = state.clubs[ask.clubId]!;
  const pres = state.presidents![ask.presidentId]!;
  state.boardAsks = state.boardAsks!.filter((a) => a.id !== askId);
  const rng = Rng.derive(state.seed, `board-ask:${ask.id}:${club.id}`);
  // The outgoing coach may already have gone some other way (or the club has moved on).
  if (club.headCoachId !== ask.outgoingId) return `${club.name} have already moved on.`;
  const pick = coachId ? state.officials[coachId] : undefined;
  const usable = pick && pick.unemployedSince !== undefined && ask.candidates.includes(pick.id);
  const ch = replaceCoach(state, club, rng, state.date, ask.reason, usable ? pick : undefined);
  announceChange(state, ch, state.date, ask.midSeason);
  if (usable) {
    // The board listened, and the new man owes you.
    relateToBoard(state, club.id, 6);
    state.scout!.relationships[pick.id] = clamp((state.scout!.relationships[pick.id] ?? 0) + 15, 0, 100);
    return `${pres.firstName} ${pres.lastName} takes your advice: ${pick.firstName} ${pick.lastName} is the new Head Coach of ${club.name}. He knows who put his name forward.`;
  }
  return `The board makes its own choice: ${ch.coach.firstName} ${ch.coach.lastName} takes over at ${club.name}.`;
}

/** Daily: unanswered requests lapse, and the board picks on its own (a small slight). */
export function boardTick(state: GameState, date: GameDate) {
  for (const ask of state.boardAsks ?? []) {
    if (date < ask.answerBy) continue;
    relateToBoard(state, ask.clubId, -2);
    answerBoardAsk(state, ask.id, null);
  }
}

// ── A new season in the boardroom ──────────────────────────────────────────

/**
 * Summer: relegated clubs tighten the purse, promoted ones go for it, and now and then a board simply changes its
 * mind. The presidents of your clubs review your season with them.
 */
export function boardNewSeason(state: GameState, date: GameDate) {
  const rng = Rng.derive(state.seed, `board-season:${state.season.year}`);
  const home = state.scout?.homeCountry;
  const changes: string[] = [];
  const changedClubs: ClubId[] = [];
  for (const club of Object.values(state.clubs)) {
    const pres = presidentOf(state, club);
    if (!pres) continue;
    const last = club.history[club.history.length - 1];
    const levelOf = (h?: { leagueId: string }) => (h ? state.leagues[h.leagueId as never]?.level : undefined);
    const now = state.leagues[club.leagueId]!.level;
    const was = levelOf(last);
    let next: BoardPolicy | undefined;
    if (was !== undefined && now > was && rng.chance(0.6)) next = 'sell';
    else if (was !== undefined && now < was && rng.chance(0.5)) next = 'win-now';
    else if (rng.chance(0.06)) next = policyFor(state, club, rng);
    if (!next || next === pres.policy) continue;
    pres.policy = next;
    pres.policySince = date;
    if (club.countryId === home && state.leagues[club.leagueId]!.level <= 2) {
      changes.push(`${club.name}: ${POLICY_LABEL[next].toLowerCase()}.`);
      changedClubs.push(club.id);
    }
  }
  if (changes.length && home)
    addNews(state, {
      date,
      kind: 'board',
      title: `${state.countries[home]!.name}: new orders from the boardroom`,
      body: `${changes.length} board${changes.length > 1 ? 's' : ''} set a new direction for the season. ${changes.slice(0, 8).join(' ')}`,
      countryId: home,
      clubIds: changedClubs.slice(0, 8),
    });

  // The review: presidents of your clubs look at what you brought them last season.
  const sc = state.scout;
  if (!sc) return;
  const e = sc.employment;
  const mine = e.mode === 'fulltime' ? [e.clubId] : e.clients;
  const year = state.season.year - 1;
  const lines: string[] = [];
  for (const id of mine) {
    const club = state.clubs[id]!;
    const pres = presidentOf(state, club);
    if (!pres) continue;
    const placed = state.placements.filter((pl) => pl.clubId === id && pl.signedOn >= seasonStart(year) && pl.signedOn < seasonStart(year + 1));
    const delta = placed.length ? Math.min(12, placed.length * 4) : -3;
    relateToBoard(state, id, delta);
    lines.push(
      placed.length
        ? `${pres.firstName} ${pres.lastName} (${club.name}) is pleased with your ${placed.length} signing${placed.length > 1 ? 's' : ''}.`
        : `${pres.firstName} ${pres.lastName} (${club.name}) wonders what he is paying you for: no signings last season.`,
    );
  }
  if (lines.length)
    addNews(state, {
      date,
      kind: 'career',
      title: 'End-of-season review with the board',
      body: lines.join(' '),
      clubIds: mine,
    });
}

const seasonStart = (year: number) => makeDate(year, 7, 1);

/** For the UI: a president, his policy and where you stand. */
export function presidentView(state: GameState, club: Club) {
  const pres = presidentOf(state, club);
  if (!pres) return undefined;
  return {
    id: pres.id,
    name: `${pres.firstName} ${pres.lastName}`,
    age: pres.age,
    nationality: state.countries[pres.nationality]?.name ?? '',
    portraitSeed: pres.portraitSeed,
    policy: pres.policy,
    policyLabel: POLICY_LABEL[pres.policy],
    policyLine: `The board ${POLICY_LINE[pres.policy]}.`,
    standing: state.scout ? boardStanding(state, club.id) : 0,
    feeThreshold: Math.round(Math.max(club.transferBudget, 0) * BOARD_FEE_SHARE) as USD,
  };
}

