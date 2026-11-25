import { pressLeads } from './systems/club-read';
import { staleClub } from './systems/club-read';
import { academyTick } from './systems/academy';
import { tournamentTick } from './systems/tournaments';
import { reviewClients } from './systems/client-review';
import { overheadsTick, payTax } from './systems/overheads';
import { placementTick, trackPlacements } from './systems/placement-stories';
import { addDays, isTransferWindow, makeDate, toParts, type GameDate } from './core/calendar';
import { Rng } from './core/rng';
import type { NewsItem, PlayerMatchLine } from './model/season';
import type { GameState } from './model/world-state';
import { monthlyUpdate } from './systems/development';
import { decayKnowledge, staleTick } from './systems/knowledge';
import { chargeAccommodation } from './systems/travel';
import { aiTransferWeek } from './systems/transfers';
import { resolveDeals } from './systems/deals';
import { employmentTick } from './systems/employment';
import { missionTick } from './systems/missions';
import { marketTick } from './systems/market';
import { rivalTick } from './systems/rivals';
import { assistantTick } from './systems/assistants';
import { checkSolvency, payMatchBonuses, settleSigningBonuses, updatePlacements } from './systems/payouts';
import { seasonWindow } from './systems/fixtures';
import { simulateMatch } from './systems/match-sim';
import { addNews, endSeason, rolloverSeason } from './systems/season';
import { isDeadlineDay, startDeadline } from './systems/deadline';
import { huntTick } from './systems/hunts';
import { reportTick } from './systems/reports';
import { objectiveTick } from './systems/goals';
import { agencyTick } from './systems/agency';
import { scenarioTick } from './systems/scenarios';
import { coachTick } from './systems/coaching';
import { eventsTick } from './systems/events';
import { ensurePredictions } from './systems/newspaper';
import { boardTick } from './systems/board';
import { mentorTick } from './systems/mentor';
import { consultationTick } from './systems/consultations';
import { campaignTick } from './systems/campaigns';
import { dilemmaTick } from './systems/dilemmas';
import { unlockTick } from './systems/unlocks';
import { isInboxItem } from './model/season';

export interface AdvanceResult {
  from: GameDate;
  to: GameDate;
  matchesPlayed: number;
  news: NewsItem[];
  seasonRolledOver: boolean;
  /** Why an "advance until something happens" stopped. */
  stoppedFor?: string;
}

export interface AdvanceOptions {
  /** Stop on the morning of deadline day so it can be played hour by hour (the main time controls do; searches and trips don't). */
  stopAtDeadline?: boolean;
}

/** Hook for later phases (payouts, missions) that react to every player's match line. */
export type MatchListener = (lines: PlayerMatchLine[], date: GameDate) => void;

/**
 * Plays one calendar day. Randomness is derived from (seed, date, fixture), so the
 * outcome never depends on how a player chunks their time advances.
 */
function playDay(state: GameState, date: GameDate, onMatch?: MatchListener): { matches: number; rolled: boolean } {
  state.date = date;
  const { month, day, year } = toParts(date);
  let rolled = false;

  if (month === 7 && day === 1 && state.season.year < year) {
    rolloverSeason(state, date);
    rolled = true;
    payTax(state, state.season.year - 1, date);
    reviewClients(state, date);
  }
  if (day === 1) {
    monthlyUpdate(state, date);
    decayKnowledge(state, date);
  }

  let matches = 0;
  for (const fixtures of Object.values(state.fixtures)) {
    for (const f of fixtures) {
      if (f.date !== date || f.result) continue;
      const home = state.clubs[f.homeId]!;
      const away = state.clubs[f.awayId]!;
      const sim = simulateMatch(
        Rng.derive(state.seed, `match:${f.id}`),
        { club: home, squad: home.squad.map((id) => state.players[id]!) },
        { club: away, squad: away.squad.map((id) => state.players[id]!) },
        date,
      );
      f.result = sim.result;
      for (const line of sim.lines) {
        const p = state.players[line.playerId]!;
        const s = p.stats;
        s.apps++;
        if (line.started) s.starts++;
        s.minutes += line.minutes;
        s.goals += line.goals;
        s.assists += line.assists;
        s.tackles += line.tackles;
        if (line.cleanSheet) s.cleanSheets++;
        if (line.captain) s.captaincies++;
        s.ratingSum += line.rating;
        if (sim.result.motmId === line.playerId) s.motm++;
        if (line.goals >= 3 && state.leagues[f.leagueId]!.level === 1 && state.countries[home.countryId]!.strength >= 4) {
          const club = state.clubs[line.clubId]!;
          const opponent = line.clubId === home.id ? away : home;
          const country = state.countries[club.countryId]!;
          addNews(state, {
            date,
            kind: 'milestone',
            title: `Hat-trick: ${p.firstName} ${p.lastName}`,
            body: `${p.firstName} ${p.lastName} scored ${line.goals} for ${club.name} against ${opponent.name} (${sim.result.homeGoals}–${sim.result.awayGoals}) in the ${state.leagues[f.leagueId]!.name}. That's ${s.goals} league goals this season.`,
            countryId: country.id,
            clubIds: [club.id],
            playerIds: [p.id],
          });
        }
      }
      for (const { playerId, injury } of sim.injuries) {
        const hurt = state.players[playerId]!;
        hurt.injury = injury;
        // A long injury opens a hole you may not know about.
        if (injury.until - date >= 40 && hurt.clubId) staleClub(state, hurt.clubId, `${hurt.firstName} ${hurt.lastName} is out for months`, 20, hurt.naturalPosition);
      }
      payMatchBonuses(state, sim.lines, f, date);
      trackPlacements(state, sim.lines, f);
      onMatch?.(sim.lines, date);
      matches++;
    }
  }

  if (!state.season.ended && date > seasonWindow(state.season.year).end) endSeason(state, date);
  if (isTransferWindow(date) && toParts(date).weekday === 1) aiTransferWeek(state, date);
  coachTick(state, date);
  if (state.scout) rivalTick(state, date);
  if (state.scout) resolveDeals(state, date);
  if (state.scout) {
    updatePlacements(state, date);
    settleSigningBonuses(state);
    employmentTick(state, date);
    if (toParts(date).weekday === 1) mentorTick(state, date);
    campaignTick(state, date);
    missionTick(state, date);
    marketTick(state, date);
    assistantTick(state, date);
    huntTick(state, date);
    eventsTick(state, date);
    ensurePredictions(state);
    boardTick(state, date);
    dilemmaTick(state, date);
    consultationTick(state, date);
    overheadsTick(state, date);
    tournamentTick(state, date);
    if (toParts(date).weekday === 1) pressLeads(state);
    academyTick(state, date, rolled);
    if (toParts(date).day === 1) placementTick(state, date);
    unlockTick(state, date);
    staleTick(state, date);
    reportTick(state, date);
    objectiveTick(state, date);
    agencyTick(state, date);
    checkSolvency(state, date);
    scenarioTick(state, date);
  }
  chargeAccommodation(state);
  return { matches, rolled };
}

export function advanceDays(state: GameState, days: number, onMatch?: MatchListener, opts: AdvanceOptions = {}): AdvanceResult {
  const from = state.date;
  const newsBefore = state.counters.news;
  let matchesPlayed = 0;
  let seasonRolledOver = false;
  for (let i = 1; i <= days; i++) {
    const day = addDays(from, i);
    if (opts.stopAtDeadline && state.scout && !state.careerOver && isDeadlineDay(day) && state.lastDeadline !== day) {
      startDeadline(state, day);
      break;
    }
    const r = playDay(state, day, onMatch);
    matchesPlayed += r.matches;
    seasonRolledOver ||= r.rolled;
  }
  return { from, to: state.date, matchesPlayed, news: state.news.filter((n) => n.id >= newsBefore), seasonRolledOver };
}

/** The next date (after today) with at least one league match, within the current or next season. */
export function nextMatchDate(state: GameState): GameDate | undefined {
  let next: GameDate | undefined;
  for (const fixtures of Object.values(state.fixtures)) {
    for (const f of fixtures) if (!f.result && f.date > state.date && (next === undefined || f.date < next)) next = f.date;
  }
  return next;
}

/** Advance to (and play) the next matchday. In the off-season this runs through the summer. */
export function advanceToNextMatchday(state: GameState, onMatch?: MatchListener, opts: AdvanceOptions = {}): AdvanceResult {
  const next = nextMatchDate(state);
  if (next !== undefined) return advanceDays(state, next - state.date, onMatch, opts);
  // Off-season: roll into the new season, then on to its first matchday.
  const rollover = makeDate(state.season.year + 1, 7, 1);
  const first = advanceDays(state, Math.max(1, rollover - state.date), onMatch, opts);
  if (state.deadline) return first;
  const second = advanceToNextMatchday(state, onMatch, opts);
  return {
    from: first.from,
    to: second.to,
    matchesPlayed: first.matchesPlayed + second.matchesPlayed,
    news: [...second.news, ...first.news],
    seasonRolledOver: true,
  };
}

/** Longest "advance until something happens" runs before giving up and stopping anyway. */
export const UNTIL_EVENT_MAX_DAYS = 56;

/**
 * Plays day by day and stops at the first thing that needs you: a deal decision, an offer,
 * a new Inbox message, a mission deadline a week away, the transfer window opening or closing,
 * deadline day, or a new season. Stops after `maxDays` regardless.
 */
export function advanceUntilEvent(state: GameState, maxDays = UNTIL_EVENT_MAX_DAYS): AdvanceResult {
  const from = state.date;
  const newsBefore = state.counters.news;
  const offersBefore = new Set(state.offers.map((o) => o.id));
  const eventsBefore = state.pendingDealEvents.length;
  const windowOpen = isTransferWindow(state.date);
  let matchesPlayed = 0;
  let seasonRolledOver = false;
  let stoppedFor: string | undefined;
  for (let i = 0; i < maxDays && !stoppedFor; i++) {
    const r = advanceDays(state, 1, undefined, { stopAtDeadline: true });
    matchesPlayed += r.matchesPlayed;
    seasonRolledOver ||= r.seasonRolledOver;
    const today = state.date;
    if (state.deadline) stoppedFor = 'Deadline day';
    else if (state.careerOver) stoppedFor = 'Career over';
    else if (r.seasonRolledOver) stoppedFor = 'A new season';
    else if (state.pendingDealEvents.length > eventsBefore) stoppedFor = 'News on a deal';
    else if (state.offers.some((o) => !offersBefore.has(o.id))) stoppedFor = 'A new offer';
    else if (state.news.some((n) => n.id >= newsBefore && isInboxItem(n))) stoppedFor = 'A new message';
    else if (isTransferWindow(today) !== windowOpen) stoppedFor = windowOpen ? 'The transfer window closed' : 'The transfer window opened';
    else if ([...state.missions, ...state.mandates].some((m) => m.status === 'active' && m.deadline !== undefined && m.deadline - today === 7))
      stoppedFor = 'A deadline is a week away';
  }
  return {
    from,
    to: state.date,
    matchesPlayed,
    news: state.news.filter((n) => n.id >= newsBefore),
    seasonRolledOver,
    stoppedFor: stoppedFor ?? `${maxDays / 7} quiet weeks`,
  };
}
