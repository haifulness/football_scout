import { addDays, formatDate, makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { clamp } from '../core/rng';
import type { Club } from '../model/club';
import type { Difficulty, Scout } from '../model/scout';
import type { GameState } from '../model/world-state';
import { clubPositionalAverage } from './deals';
import { dropClient } from './employment';
import { nemesisScored } from './nemesis';
import { ovrAt } from './ratings';
import { rivalName } from './rivals';
import { addNews } from './season';

/**
 * Every quarter (1 January, April, July, October) each club you scout for freelance looks back at its last year
 * with you: players you brought, briefs and sales you delivered or failed, how your signings turned out, and how
 * that compares with the best rival who has brought them players. Below their bar, or behind the rival, and they
 * warn you. Still behind the rival a quarter later, or still below the bar three quarters later, and they end the
 * agreement (a rival who was ahead takes your place).
 */

const BAR: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
/** A club that took you on recently gives you time before judging your work (the old July review came 4–16 months in)... */
const WORK_GRACE_DAYS = 270;
/** ...and a little less before comparing you with a rival. */
const RIVAL_GRACE_DAYS = 120;
const LOOKBACK = 365;
/** After a warning about thin work they give you three more quarters, as the old July review gave you a year. */
const WORK_WARNING_DAYS = 270;
/** When it's a rival doing better, one more quarter. */
const RIVAL_WARNING_DAYS = 90;
/** A signing is worth 2 in your score, so a rival's impact-weighted signings count double. */
const RIVAL_WEIGHT = 2;
/** The rival needs to be ahead by more than this to count as doing better. */
const MARGIN = 1;
const DELIGHTED_LIFT = 2;
const WARNED_DROP = 4;
const DROPPED_DROP = 5;
const REVIEW_MONTHS = [1, 4, 7, 10];

export type Outlook = 'delighted' | 'satisfied' | 'at-risk' | 'leaving';

export interface ClientReview {
  signings: number;
  sales: number;
  briefsDone: number;
  briefsFailed: number;
  hits: number;
  flops: number;
  score: number;
  bar: number;
  /** The rival doing best there, when one has brought them players this year. */
  rival?: { id: number; name: string; score: number; signings: number };
  /** The rival is doing better than you there. */
  behind: boolean;
  outlook: Outlook;
  /** When they warned you, if they have. */
  warnedOn?: GameDate;
  /** Too new to be judged at the next review. */
  grace: boolean;
  reviewOn: GameDate;
}

/** The next quarterly review after today. */
export function nextReview(date: GameDate): GameDate {
  const { year, month } = toParts(date);
  const m = REVIEW_MONTHS.find((x) => x > month);
  return m === undefined ? makeDate(year + 1, 1, 1) : makeDate(year, m, 1);
}

/** When this client warned you. Older saves kept July warnings as a list and rival warnings separately. */
export function warnedOn(state: GameState, clubId: ClubId): GameDate | undefined {
  const scout = state.scout!;
  const w = scout.clientWarnings?.[clubId] ?? scout.raceWarned?.[clubId];
  if (w !== undefined) return w;
  // Old July warnings carry no date: they were given on the last 1st of July.
  if (Array.isArray(scout.clientWarned) && scout.clientWarned.includes(clubId)) {
    const { year, month } = toParts(state.date);
    return makeDate(month >= 7 ? year : year - 1, 7, 1);
  }
  return undefined;
}

function setWarning(scout: Scout, clubId: ClubId, date: GameDate | undefined) {
  const next = { ...(scout.clientWarnings ?? {}) };
  if (date === undefined) delete next[clubId];
  else next[clubId] = date;
  scout.clientWarnings = next;
  if (scout.raceWarned?.[clubId] !== undefined) {
    const r = { ...scout.raceWarned };
    delete r[clubId];
    scout.raceWarned = r;
  }
  if (scout.clientWarned?.includes(clubId)) scout.clientWarned = scout.clientWarned.filter((c) => c !== clubId);
}

/** What a signing is worth to the club now: a regular (at or above their level where he plays) counts most. */
function impact(state: GameState, playerId: string, club: Club): number {
  const p = state.players[playerId as keyof typeof state.players];
  if (!p || p.clubId !== club.id) return 0.2; // gone already
  return ovrAt(p, p.naturalPosition) >= clubPositionalAverage(state, club, p.naturalPosition) ? 1 : 0.4;
}

/** How the year is going with this client, as of a date (today by default: the review reads the same numbers). */
/** `reviewOn` is the review being forecast: the next one by default, or `asOf` itself when that is a review day being run. */
export function clientReview(state: GameState, clubId: ClubId, asOf: GameDate = state.date, reviewOn: GameDate = asOf === state.date ? nextReview(asOf) : asOf): ClientReview {
  const scout = state.scout!;
  const club = state.clubs[clubId]!;
  const since = Math.max(addDays(asOf, -LOOKBACK), scout.clientSince?.[clubId] ?? -Infinity) as GameDate;
  const inYear = (d?: GameDate) => d !== undefined && d >= since && d <= asOf;
  const signings = state.deals.filter((d) => d.clubId === clubId && d.stage === 'completed' && !d.mandateId && !d.forEmployer && inYear(d.completedOn)).length;
  const sales = state.mandates.filter((m) => m.clubId === clubId && m.status === 'succeeded' && inYear(m.resolvedOn)).length;
  const briefsDone = state.missions.filter((m) => m.clubId === clubId && m.status === 'succeeded' && inYear(m.resolvedOn)).length;
  const briefsFailed =
    state.missions.filter((m) => m.clubId === clubId && m.status === 'failed' && inYear(m.resolvedOn)).length +
    state.mandates.filter((m) => m.clubId === clubId && m.status === 'failed' && inYear(m.resolvedOn)).length;
  const verdicts = state.placements.filter((p) => p.clubId === clubId).flatMap((p) => (p.verdicts ?? []).filter((v) => inYear(v.date)));
  const hits = verdicts.filter((v) => v.verdict === 'hit').length;
  const flops = verdicts.filter((v) => v.verdict === 'flop').length;
  const score = 2 * signings + 2 * sales + 2 * briefsDone - 2 * briefsFailed + hits - 2 * flops;
  const bar = BAR[scout.difficulty];

  let rival: ClientReview['rival'];
  const rivalSince = addDays(asOf, -LOOKBACK);
  for (const r of state.rivals) {
    const signed = (r.signed ?? []).filter((x) => x.clubId === clubId && x.date >= rivalSince && x.date <= asOf);
    if (!signed.length) continue;
    const s = RIVAL_WEIGHT * signed.reduce((n, x) => n + impact(state, x.playerId, club), 0);
    if (!rival || s > rival.score) rival = { id: r.id, name: rivalName(r), score: Math.round(s * 10) / 10, signings: signed.length };
  }
  const behind = !!rival && rival.score >= RIVAL_WEIGHT && rival.score > score + MARGIN;

  const warned = warnedOn(state, clubId);
  const failing = score < bar || behind;
  const outlook: Outlook = !failing
    ? score >= bar + 2
      ? 'delighted'
      : 'satisfied'
    : warned !== undefined && reviewOn - warned >= (behind ? RIVAL_WARNING_DAYS : WORK_WARNING_DAYS)
      ? 'leaving'
      : 'at-risk';
  const joined = scout.clientSince?.[clubId];
  const grace = joined !== undefined && reviewOn - joined < (behind ? RIVAL_GRACE_DAYS : WORK_GRACE_DAYS);
  return { signings, sales, briefsDone, briefsFailed, hits, flops, score, bar, rival, behind, outlook, warnedOn: warned, grace, reviewOn };
}

function tallyOf(y: ClientReview): string {
  const deals = y.signings + y.sales;
  return `${deals} deal${deals === 1 ? '' : 's'}, ${y.briefsDone} brief${y.briefsDone === 1 ? '' : 's'} delivered${y.briefsFailed ? `, ${y.briefsFailed} failed` : ''}${y.hits ? `, ${y.hits} hit${y.hits === 1 ? '' : 's'}` : ''}${y.flops ? `, ${y.flops} flop${y.flops === 1 ? '' : 's'}` : ''}`;
}

/** Why they're unhappy, in one sentence. */
function reasonOf(y: ClientReview): string {
  if (y.behind && y.rival) return `${y.rival.name} brought them ${y.rival.signings} player${y.rival.signings === 1 ? '' : 's'} this year, doing better than yours.`;
  return 'They expected more.';
}

/** The 1st of January, April, July and October: every freelance client reviews its year with you. */
export function reviewClients(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver || scout.employment.mode !== 'freelance') return;
  const { day, month } = toParts(date);
  if (day !== 1 || !REVIEW_MONTHS.includes(month)) return;
  for (const clubId of [...scout.employment.clients]) {
    const club = state.clubs[clubId];
    if (!club) continue;
    const y = clientReview(state, clubId, date, date);
    if (y.grace) continue;
    const coach = club.headCoachId;
    const rel = (d: number) => (scout.relationships[coach] = clamp((scout.relationships[coach] ?? 0) + d, 0, 100));
    const tally = tallyOf(y);
    if (y.outlook === 'delighted' || y.outlook === 'satisfied') {
      const wasWarned = y.warnedOn !== undefined;
      if (wasWarned) setWarning(scout, clubId, undefined);
      if (y.outlook === 'delighted') rel(DELIGHTED_LIFT);
      if (wasWarned)
        addNews(state, {
          date,
          kind: 'career',
          link: 'career',
          title: `${club.name} are happy again`,
          body: `Their review of your year: ${tally}. The warning is lifted.`,
          clubIds: [club.id],
        });
    } else if (y.outlook === 'at-risk') {
      if (y.warnedOn !== undefined) continue; // already warned: they wait for the deadline
      rel(-WARNED_DROP);
      setWarning(scout, clubId, date);
      addNews(state, {
        date,
        kind: 'career',
        forYou: true,
        link: 'career',
        title: `${club.name} warn you`,
        body: `Their review of your year: ${tally}. ${reasonOf(y)} Put it right by ${formatDate(nextReview(addDays(date, (y.behind ? RIVAL_WARNING_DAYS : WORK_WARNING_DAYS) - 1)))} or they will end the agreement.`,
        clubIds: [club.id],
      });
    } else {
      setWarning(scout, clubId, undefined);
      rel(-DROPPED_DROP);
      dropClient(state, clubId);
      const r = y.behind && y.rival ? state.rivals.find((x) => x.id === y.rival!.id) : undefined;
      if (r && r.employment.mode === 'freelance' && !r.employment.clients.includes(clubId)) r.employment.clients.push(clubId);
      if (r) nemesisScored(state, r, 'client');
      addNews(state, {
        date,
        kind: 'career',
        forYou: true,
        link: 'career',
        title: r ? `${club.name} replace you with ${y.rival!.name}` : `${club.name} end your agreement`,
        body: `Their review of your year: ${tally}. After their warning, it was not enough${r ? `, and they take ${y.rival!.name} on instead` : ''}.`,
        clubIds: [club.id],
      });
    }
  }
}
