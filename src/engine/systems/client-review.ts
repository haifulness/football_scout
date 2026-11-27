import { addDays, formatDate, makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { clamp } from '../core/rng';
import type { Difficulty } from '../model/scout';
import type { GameState } from '../model/world-state';
import { dropClient } from './employment';
import { rivalAtClub } from './rivals';
import { addNews } from './season';

/**
 * Every July each club you scout for freelance looks back at its year with you: players you brought, briefs and
 * sales you delivered or failed, and how your signings turned out. A good year brings you closer; a thin one earns a
 * warning; a second thin year, or a bad one, and they find someone else. A better-known rival at the club raises the
 * bar, and so does Hard.
 */

const BAR: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };
/** A club that took you on recently gives you a year before judging you. */
const GRACE_DAYS = 120;
const DELIGHTED_LIFT = 6;
const DISAPPOINTED_DROP = 8;

export type Outlook = 'delighted' | 'satisfied' | 'at-risk' | 'leaving';

export interface ClientYear {
  signings: number;
  sales: number;
  briefsDone: number;
  briefsFailed: number;
  hits: number;
  flops: number;
  score: number;
  bar: number;
  outlook: Outlook;
  warned: boolean;
  /** Too new to be judged at the next review. */
  grace: boolean;
  reviewOn: GameDate;
}

/** The next review date: the 1st of July after today. */
export function nextReview(date: GameDate): GameDate {
  const { year, month } = toParts(date);
  return makeDate(month >= 7 ? year + 1 : year, 7, 1);
}

/** How the year is going with this client, as of today (the review reads the same numbers on its day). */
export function clientYear(state: GameState, clubId: ClubId, asOf: GameDate = state.date): ClientYear {
  const scout = state.scout!;
  const reviewOn = asOf === state.date ? nextReview(asOf) : asOf;
  const since = Math.max(addDays(reviewOn, -365), scout.clientSince?.[clubId] ?? -Infinity) as GameDate;
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
  const bar = BAR[scout.difficulty] + (rivalAtClub(state, clubId) ? 1 : 0);
  const warned = !!scout.clientWarned?.includes(clubId);
  const outlook: Outlook = score >= bar + 2 ? 'delighted' : score >= bar ? 'satisfied' : warned || score < 0 ? 'leaving' : 'at-risk';
  const joined = scout.clientSince?.[clubId];
  const grace = joined !== undefined && reviewOn - joined < GRACE_DAYS;
  return { signings, sales, briefsDone, briefsFailed, hits, flops, score, bar, outlook, warned, grace, reviewOn };
}

/** The 1st of July: every freelance client reviews its year. */
export function reviewClients(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver || scout.employment.mode !== 'freelance') return;
  for (const clubId of [...scout.employment.clients]) {
    const club = state.clubs[clubId];
    if (!club) continue;
    const y = clientYear(state, clubId, date);
    if (y.grace) continue;
    const coach = club.headCoachId;
    const rel = (d: number) => (scout.relationships[coach] = clamp((scout.relationships[coach] ?? 0) + d, 0, 100));
    const tally = `${y.signings + y.sales} deal${y.signings + y.sales === 1 ? '' : 's'}, ${y.briefsDone} brief${y.briefsDone === 1 ? '' : 's'} delivered${y.briefsFailed ? `, ${y.briefsFailed} failed` : ''}${y.hits ? `, ${y.hits} hit${y.hits === 1 ? '' : 's'}` : ''}${y.flops ? `, ${y.flops} flop${y.flops === 1 ? '' : 's'}` : ''}`;
    const unwarn = () => (scout.clientWarned = (scout.clientWarned ?? []).filter((c) => c !== clubId));
    if (y.outlook === 'delighted' || y.outlook === 'satisfied') {
      unwarn();
      if (y.outlook === 'delighted') rel(DELIGHTED_LIFT);
      addNews(state, {
        date,
        kind: 'career',
        link: 'career',
        title: y.outlook === 'delighted' ? `${club.name} are delighted with your year` : `${club.name} keep you on`,
        body: `Their review of the season: ${tally}. ${y.outlook === 'delighted' ? 'The coach wants more of the same.' : 'Solid work; they expect at least as much next year.'}`,
        clubIds: [club.id],
      });
    } else if (y.outlook === 'at-risk') {
      rel(-DISAPPOINTED_DROP);
      scout.clientWarned = [...(scout.clientWarned ?? []).filter((c) => c !== clubId), clubId];
      addNews(state, {
        date,
        kind: 'career',
        link: 'career',
        title: `${club.name} are disappointed`,
        body: `Their review of the season: ${tally}. They expected more${rivalAtClub(state, clubId) ? ', and a better-known scout is offering it' : ''}. Deliver this season or they will end the agreement on ${formatDate(nextReview(addDays(date, 1)))}.`,
        clubIds: [club.id],
      });
    } else {
      unwarn();
      rel(-5);
      dropClient(state, clubId);
      addNews(state, {
        date,
        kind: 'career',
        link: 'career',
        title: `${club.name} end your agreement`,
        body: `Their review of the season: ${tally}. ${y.warned ? 'After last year’s warning, it was not enough.' : 'It was a bad year, and they have found someone else.'}`,
        clubIds: [club.id],
      });
    }
  }
}
