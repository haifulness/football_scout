import { addDays, formatDate, makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { clamp } from '../core/rng';
import type { Club } from '../model/club';
import type { GameState } from '../model/world-state';
import { clubPositionalAverage } from './deals';
import { dropClient } from './employment';
import { ovrAt } from './ratings';
import { rivalName } from './rivals';
import { nemesisScored } from './nemesis';
import { addNews } from './season';

/**
 * Clients compare. Every quarter (January, April, October: July has the full review) each freelance client sets
 * the players you brought it over the last year against those a rival brought. If a rival's are doing better,
 * they warn you; a second quarter like that and they take him on instead of you.
 */

const LOOKBACK = 365;
/** A club that took you on recently gives you time before comparing. */
const GRACE_DAYS = 120;
/** A rival needs to be ahead by this much to count as doing better. */
const MARGIN = 0.5;
const QUARTER_MONTHS = new Set([1, 4, 10]);

/** What a signing is worth to the club now: a regular (at or above their level where he plays) counts most. */
function impact(state: GameState, playerId: string, club: Club): number {
  const p = state.players[playerId as keyof typeof state.players];
  if (!p || p.clubId !== club.id) return 0.2; // gone already
  return ovrAt(p, p.naturalPosition) >= clubPositionalAverage(state, club, p.naturalPosition) ? 1 : 0.4;
}

export interface ClientRace {
  /** Your signings for them in the last year, by what they're worth now. */
  yours: number;
  /** The rival doing best there, when one has signed players for them. */
  rival?: { id: number; name: string; score: number; signings: number };
  /** They warned you last quarter that the rival is doing better. */
  warned: boolean;
  /** He's doing better than you there right now. */
  behind: boolean;
  /** Their next comparison. */
  nextOn: GameDate;
}

export function nextQuarter(date: GameDate): GameDate {
  const { year, month } = toParts(date);
  const m = [1, 4, 10, 13].find((x) => x > month)!;
  return m === 13 ? makeDate(year + 1, 1, 1) : makeDate(year, m, 1);
}

export function clientRace(state: GameState, clubId: ClubId): ClientRace {
  const club = state.clubs[clubId]!;
  const since = state.date - LOOKBACK;
  const yoursDeals = state.deals.filter((d) => d.clubId === clubId && d.stage === 'completed' && !d.mandateId && !d.forEmployer && (d.completedOn ?? -Infinity) >= since);
  const yours = yoursDeals.reduce((n, d) => n + impact(state, d.playerId, club), 0);
  let rival: ClientRace['rival'];
  for (const r of state.rivals) {
    const signed = (r.signed ?? []).filter((x) => x.clubId === clubId && x.date >= since);
    if (!signed.length) continue;
    const score = signed.reduce((n, x) => n + impact(state, x.playerId, club), 0);
    if (!rival || score > rival.score) rival = { id: r.id, name: rivalName(r), score: Math.round(score * 10) / 10, signings: signed.length };
  }
  const behind = !!rival && rival.score >= 1 && rival.score > yours + MARGIN;
  return { yours: Math.round(yours * 10) / 10, rival, warned: state.scout?.raceWarned?.[clubId] !== undefined, behind, nextOn: nextQuarter(state.date) };
}

/** The 1st of January, April and October: clients compare you with the rivals who brought them players. */
export function compareWithRivals(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver || scout.employment.mode !== 'freelance') return;
  const { day, month } = toParts(date);
  if (day !== 1 || !QUARTER_MONTHS.has(month)) return;
  for (const clubId of [...scout.employment.clients]) {
    const club = state.clubs[clubId];
    if (!club) continue;
    const joined = scout.clientSince?.[clubId];
    if (joined !== undefined && date - joined < GRACE_DAYS) continue;
    const race = clientRace(state, clubId);
    const warnings = { ...(scout.raceWarned ?? {}) };
    if (!race.behind || !race.rival) {
      if (warnings[clubId] !== undefined) {
        delete warnings[clubId];
        scout.raceWarned = warnings;
      }
      continue;
    }
    const coach = club.headCoachId;
    if (warnings[clubId] === undefined) {
      warnings[clubId] = date;
      scout.raceWarned = warnings;
      scout.relationships[coach] = clamp((scout.relationships[coach] ?? 0) - 4, 0, 100);
      addNews(state, {
        date,
        kind: 'career',
        forYou: true,
        link: 'career',
        title: `${club.name} are looking at ${race.rival.name}'s signings`,
        body: `The players ${race.rival.name} brought them this year are doing better than yours. They want to see that change by ${formatDate(nextQuarter(addDays(date, 1)))}, or they'll take him on instead.`,
        clubIds: [club.id],
      });
    } else {
      delete warnings[clubId];
      scout.raceWarned = warnings;
      scout.relationships[coach] = clamp((scout.relationships[coach] ?? 0) - 5, 0, 100);
      dropClient(state, clubId);
      const r = state.rivals.find((x) => x.id === race.rival!.id);
      if (r && r.employment.mode === 'freelance' && !r.employment.clients.includes(clubId)) r.employment.clients.push(clubId);
      if (r) nemesisScored(state, r, 'client');
      addNews(state, {
        date,
        kind: 'career',
        forYou: true,
        link: 'career',
        title: `${club.name} replace you with ${race.rival.name}`,
        body: `Another quarter of his players doing better than yours. ${club.name} end your agreement and take ${race.rival.name} on.`,
        clubIds: [club.id],
      });
    }
  }
}
