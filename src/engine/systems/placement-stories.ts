import { addDays, ageOn, formatDate, type GameDate } from '../core/calendar';
import { formatUSD, roundPrice } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { Placement } from '../model/deal';
import type { Mandate } from '../model/mission';
import type { Player } from '../model/player';
import type { Fixture, PlayerMatchLine } from '../model/season';
import type { GameState } from '../model/world-state';
import { hasTrait } from './character';
import { clubRecord } from './employment';
import { addNews } from './season';
import { isSettling } from './settling';

/**
 * What happens to the players you place. Each month a placed player's morale moves with his minutes against what he
 * expected (an ambitious man or a big fee expects to start; a prospect is patient), his character and whether he is
 * still settling. A restless player calls you; one who wants out becomes a sale for his club, or leaves. After six
 * months, and again after his first season, he is judged a hit or a flop, and the club remembers who brought him.
 */

export type Mood = 'happy' | 'restless' | 'wants-out';
export type Verdict = 'hit' | 'solid' | 'flop';

export const START_MORALE = 70;
const RESTLESS_BELOW = 50;
const WANTS_OUT_BELOW = 25;
/** A visit lifts his morale this much, at most once in this many days. */
export const VISIT_LIFT = 15;
export const VISIT_EVERY = 28;
/** He needs this many of his club's matches behind him before anyone judges him. */
const MIN_GAMES = 8;
export const VERDICT_DAYS = 182;
/** What the club makes of a hit or a flop, in standing (see clubTrust), per verdict. */
export const HIT_TRUST = 4;
export const FLOP_TRUST = 5;
/** A fee this big makes the verdict count double. */
const BIG_FEE = 5_000_000;

export const moodOf = (morale: number): Mood => (morale < WANTS_OUT_BELOW ? 'wants-out' : morale < RESTLESS_BELOW ? 'restless' : 'happy');

const active = (state: GameState, pl: Placement) => !pl.endedOn && state.players[pl.playerId]?.clubId === pl.clubId;
const name = (p: Player) => `${p.firstName} ${p.lastName}`;

/** After every match: count his club's games, his minutes and his ratings (the verdict reads these). */
export function trackPlacements(state: GameState, lines: PlayerMatchLine[], fixture: Fixture) {
  if (!state.scout) return;
  for (const pl of state.placements) {
    if (pl.endedOn || (pl.clubId !== fixture.homeId && pl.clubId !== fixture.awayId) || fixture.date < pl.signedOn) continue;
    const t = (pl.track ??= { games: 0, minutes: 0, apps: 0, ratingSum: 0 });
    t.games++;
    const line = lines.find((l) => l.playerId === pl.playerId && l.clubId === pl.clubId);
    if (line && line.minutes > 0) {
      t.minutes += line.minutes;
      t.apps++;
      t.ratingSum += line.rating;
    }
  }
}

/** Share of his club's minutes he has played since he signed (0–1), and his average rating. */
export function placementForm(pl: Placement): { share: number; rating?: number; games: number } {
  const t = pl.track;
  if (!t || !t.games) return { share: 0, games: 0 };
  return { share: clamp(t.minutes / (t.games * 90), 0, 1), rating: t.apps ? t.ratingSum / t.apps : undefined, games: t.games };
}

/** How much of the time he expects to play. */
function expectation(state: GameState, pl: Placement, p: Player): number {
  let e = 0.5;
  if (p.hidden.ambition >= 15) e += 0.15;
  if (pl.ovrGap > 2) e += 0.1;
  if (pl.fee >= BIG_FEE) e += 0.1;
  if (pl.prospect || ageOn(p.birthDate, state.date) <= 20) e -= 0.25;
  // A new arrival still finding his feet knows he has to wait.
  if (isSettling(p, state.date)) e -= 0.15;
  return clamp(e, 0.15, 0.85);
}

/** Monthly (the 1st): morale moves, stories happen, verdicts fall due. */
export function placementTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  for (const pl of state.placements) {
    if (!active(state, pl)) continue;
    const p = state.players[pl.playerId]!;
    pl.morale ??= START_MORALE;
    const before = moodOf(pl.morale);
    const form = placementForm(pl);
    // Pre-season, or barely arrived: nothing to judge yet.
    if (form.games >= 3) {
      let delta = (form.share - expectation(state, pl, p)) * 40;
      if (form.rating !== undefined && form.rating >= 7) delta += 3;
      if (hasTrait(p, 'loyal')) delta = delta < 0 ? delta * 0.6 : delta;
      if (hasTrait(p, 'hothead') || hasTrait(p, 'mercenary')) delta = delta < 0 ? delta * 1.4 : delta;
      if (hasTrait(p, 'homesick') && isSettling(p, date)) delta -= 5;
      // Content players drift back towards happy.
      if (delta > -2 && pl.morale < START_MORALE) delta += 3;
      pl.morale = Math.round(clamp(pl.morale + clamp(delta, -15, 12), 0, 100));
    }
    const after = moodOf(pl.morale);
    if (after !== before) moodChanged(state, pl, p, before, after, date);
    verdictCheck(state, pl, p, date);
  }
}

function moodChanged(state: GameState, pl: Placement, p: Player, before: Mood, after: Mood, date: GameDate) {
  const club = state.clubs[pl.clubId]!;
  const { share } = placementForm(pl);
  const minutes = `${Math.round(share * 100)}% of the minutes since he joined`;
  if (after === 'restless' && before === 'happy') {
    addNews(state, {
      date,
      kind: 'career',
      title: `${name(p)} is restless at ${club.shortName}`,
      body: `He calls you: ${minutes}, and he expected more. A visit would steady him before it turns into a transfer request.`,
      playerIds: [p.id],
      clubIds: [club.id],
    });
  } else if (after === 'wants-out') {
    wantsOut(state, pl, p, date);
  } else if (after === 'happy') {
    addNews(state, {
      date,
      kind: 'career',
      title: `${name(p)} is happy again at ${club.shortName}`,
      body: 'He is playing, and he is settled. One less thing to worry about.',
      playerIds: [p.id],
      clubIds: [club.id],
    });
  }
}

/** He wants a move: a client club asks you to sell him; anywhere else the club will listen to offers. */
function wantsOut(state: GameState, pl: Placement, p: Player, date: GameDate) {
  const scout = state.scout!;
  const club = state.clubs[pl.clubId]!;
  const clients = scout.employment.mode === 'freelance' ? scout.employment.clients : [];
  const open = state.mandates.some((m) => m.playerId === p.id && (m.status === 'offered' || m.status === 'active'));
  if (clients.includes(club.id) && !open) {
    const rng = Rng.derive(state.seed, `wants-out:${p.id}:${date}`);
    const mandate: Mandate = {
      id: state.counters.mandate++,
      clubId: club.id,
      playerId: p.id,
      askingFee: roundPrice(Math.max(p.value * rng.float(0.8, 0.95), 1000)),
      commissionPct: rng.int(3, 5),
      reason: 'He has asked to leave, and we will not keep an unhappy player.',
      postedOn: date,
      acceptBy: addDays(date, 14),
      weeks: rng.int(6, 10),
      status: 'offered',
    };
    state.mandates.push(mandate);
    addNews(state, {
      date,
      kind: 'career',
      link: 'missions',
      title: `${name(p)} wants out: ${club.name} ask you to sell him`,
      body: `He has handed in a transfer request. You brought him here, so the club turns to you: asking ${formatUSD(mandate.askingFee)}, your commission ${mandate.commissionPct}%. Answer by ${formatDate(mandate.acceptBy)} in Missions.`,
      playerIds: [p.id],
      clubIds: [club.id],
    });
  } else if (!open) {
    addNews(state, {
      date,
      kind: 'career',
      title: `${name(p)} wants out of ${club.shortName}`,
      body: 'He has handed in a transfer request, and the club will listen to offers. If he goes, your bonuses from him stop. A visit might still talk him round.',
      playerIds: [p.id],
      clubIds: [club.id],
    });
  }
}

/** Six months in, and after his first full season: hit, solid or flop. */
function verdictCheck(state: GameState, pl: Placement, p: Player, date: GameDate) {
  const due = (pl.verdicts?.length ?? 0) === 0 ? addDays(pl.signedOn, VERDICT_DAYS) : addDays(pl.signedOn, 2 * VERDICT_DAYS + 30);
  if ((pl.verdicts?.length ?? 0) >= 2 || date < due) return;
  const form = placementForm(pl);
  if (form.games < MIN_GAMES) return;
  const young = pl.prospect || (pl.age ?? 25) <= 20;
  const rating = form.rating ?? 6;
  const verdict: Verdict =
    form.share >= (young ? 0.4 : 0.6) && rating >= 6.85 ? 'hit' : form.share < (young ? 0.1 : 0.25) || (form.rating !== undefined && rating < 6.2) ? 'flop' : 'solid';
  (pl.verdicts ??= []).push({ date, verdict });
  if (verdict === 'solid') return;

  const scout = state.scout!;
  const club = state.clubs[pl.clubId]!;
  const weight = pl.fee >= BIG_FEE ? 2 : 1;
  const r = clubRecord(scout, club.id);
  if (verdict === 'hit') {
    scout.clubRecord[club.id] = { ...r, hits: (r.hits ?? 0) + weight };
    scout.reputation = clamp(scout.reputation + weight, 0, 100);
  } else {
    scout.clubRecord[club.id] = { ...r, flops: (r.flops ?? 0) + weight };
  }
  const minutes = `${Math.round(form.share * 100)}% of the minutes, averaging ${rating.toFixed(1)}`;
  addNews(state, {
    date,
    kind: 'career',
    title: verdict === 'hit' ? `Your find shines: ${name(p)} at ${club.shortName}` : `A flop: ${name(p)} at ${club.shortName}`,
    body:
      verdict === 'hit'
        ? `${minutes}. ${club.name} know who found him, and your name goes up a notch.`
        : `${p.firstName} ${p.lastName} has played ${minutes}. At ${club.name} you are now the scout who brought him, and they will be slower to trust your next pitch.`,
    playerIds: [p.id],
    clubIds: [club.id],
  });
}

/** You placed him and he is still at the club: a visit can lift his morale. */
export function visitCheck(state: GameState, p: Player): { ok: boolean; placement?: Placement; reason?: string } {
  const pl = state.placements.find((x) => x.playerId === p.id && x.clubId === p.clubId && !x.endedOn);
  if (!pl) return { ok: false };
  if (pl.visitedOn !== undefined && state.date - pl.visitedOn < VISIT_EVERY) return { ok: false, placement: pl, reason: 'You saw him recently.' };
  return { ok: true, placement: pl };
}

/** A visit from the scout who brought him. Returns his new mood if it lifted him. */
export function visitPlacement(state: GameState, p: Player): Mood | undefined {
  const check = visitCheck(state, p);
  if (!check.ok) return undefined;
  const pl = check.placement!;
  pl.morale ??= START_MORALE;
  if (pl.morale >= 90) {
    pl.visitedOn = state.date;
    return undefined;
  }
  pl.morale = Math.min(100, pl.morale + VISIT_LIFT);
  pl.visitedOn = state.date;
  return moodOf(pl.morale);
}

/** His verdict so far: the latest one. */
export const latestVerdict = (pl: Placement): Verdict | undefined => pl.verdicts?.[pl.verdicts.length - 1]?.verdict;
