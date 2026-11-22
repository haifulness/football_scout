import { revealTrait } from './character';
import { addDays, ageOn, type GameDate } from '../core/calendar';
import type { PlayerId } from '../core/ids';
import { clamp } from '../core/rng';
import type { Position } from '../model/player';
import { VERDICT_LABEL, type PotentialGrade, type ReportGrade, type ScoutReport, type Verdict } from '../model/report';
import type { GameState } from '../model/world-state';
import { estimate, fog, knowledgeLevel } from './knowledge';
import { ovrAt } from './ratings';
import { addNews } from './season';
import { ScoutingError } from './scouting';

/** You need to know a player this well before your report means anything. */
export const REPORT_MIN_KNOWLEDGE = 40;
/** Reports are checked against how he turned out this long after. */
export const REVIEW_DAYS = 365;
/** Your accuracy counts once this many reports have been checked. */
export const RECORD_MIN_REVIEWED = 3;
const RECENT = 10;

const GRADE_SCORE: Record<ReportGrade, number> = { 'spot on': 1, close: 0.75, off: 0.35, 'way off': 0 };

export function potentialGrade(potential: number): PotentialGrade {
  return potential >= 85 ? 'A' : potential >= 75 ? 'B' : potential >= 65 ? 'C' : 'D';
}

function gradeFor(error: number): ReportGrade {
  return error <= 2 ? 'spot on' : error <= 5 ? 'close' : error <= 9 ? 'off' : 'way off';
}

export interface ReportArgs {
  playerId: PlayerId;
  role: Position;
  rating: number;
  potential: PotentialGrade;
  verdict: Verdict;
}

/** Your report on this player still waiting for its review, if any. */
export function openReport(state: GameState, playerId: PlayerId): ScoutReport | undefined {
  return (state.reports ?? []).find((r) => r.playerId === playerId && !r.outcome && !r.voided);
}

/** Write (or rewrite, before its review) a report. Takes no time and costs nothing. */
export function writeReport(state: GameState, args: ReportArgs): ScoutReport {
  if (!state.scout) throw new ScoutingError('Set up your scout first.');
  const p = state.players[args.playerId];
  if (!p) throw new ScoutingError('That player has retired.');
  const known = knowledgeLevel(state, p);
  if (known < REPORT_MIN_KNOWLEDGE)
    throw new ScoutingError(`You don't know him well enough to put your name to a report yet (knowledge ${REPORT_MIN_KNOWLEDGE} needed).`);
  if (!(args.verdict in VERDICT_LABEL)) throw new ScoutingError('Pick a verdict.');
  const rating = Math.round(clamp(args.rating, 1, 99));
  const existing = openReport(state, p.id);
  const report: ScoutReport = {
    id: existing?.id ?? state.counters.report++,
    playerId: p.id,
    date: state.date,
    role: args.role,
    rating,
    potential: args.potential,
    verdict: args.verdict,
    knowledge: known,
    truthThen: ovrAt(p, args.role),
    reviewOn: addDays(state.date, REVIEW_DAYS),
  };
  if (existing) state.reports[state.reports.indexOf(existing)] = report;
  else {
    state.reports.unshift(report);
    // Putting it all down on paper makes you think about the man as well as the player.
    if (known >= 70) revealTrait(state, p, 0.6, 'report');
  }
  return report;
}

/** What your read of him says: rating at a role, potential grade, verdict (from your current estimate). */
export function reportFromEstimate(state: GameState, playerId: PlayerId, role?: Position): ReportArgs | undefined {
  const p = state.players[playerId];
  if (!p) return undefined;
  const f = fog(state, p);
  const as = role ?? p.naturalPosition;
  const rating = estimate(f.positions[as] ?? f.positions[p.naturalPosition]);
  const age = ageOn(p.birthDate, state.date);
  const pot = f.potential ? estimate(f.potential) : rating + Math.max(0, 24 - age) * 2;
  return { playerId, role: as, rating, potential: potentialGrade(pot), verdict: pot >= 85 && age <= 21 ? 'star' : age <= 20 ? 'future' : 'ready' };
}

/**
 * A pitch puts your name to a player: if you know him well enough and have no report waiting for review,
 * one is filed from your estimate. It backs your later pitches of him and is checked a year on.
 */
export function fileReportOnPitch(state: GameState, playerId: PlayerId, role: Position): ScoutReport | undefined {
  const p = state.players[playerId];
  if (!p || openReport(state, playerId) || knowledgeLevel(state, p) < REPORT_MIN_KNOWLEDGE) return undefined;
  const args = reportFromEstimate(state, playerId, role);
  return args && writeReport(state, args);
}

export interface TrackRecord {
  written: number;
  reviewed: number;
  pending: number;
  /** 0–1 over your last ten checked reports; undefined until three are checked. */
  accuracy?: number;
  overrated: number;
  potentialRight: number;
}

export function trackRecord(state: GameState): TrackRecord {
  const all = (state.reports ?? []).filter((r) => !r.voided);
  const reviewed = all.filter((r) => r.outcome);
  const recent = reviewed.slice(0, RECENT);
  const score = recent.reduce((n, r) => n + GRADE_SCORE[r.outcome!.grade] - (r.outcome!.overrated ? 0.15 : 0), 0);
  return {
    written: all.length,
    reviewed: reviewed.length,
    pending: all.length - reviewed.length,
    accuracy: reviewed.length >= RECORD_MIN_REVIEWED ? clamp(score / recent.length, 0, 1) : undefined,
    overrated: reviewed.filter((r) => r.outcome!.overrated).length,
    potentialRight: reviewed.filter((r) => r.outcome!.potentialRight).length,
  };
}

/**
 * How much a written report helps a pitch (added to the sign-off logit): more the better you
 * knew him when you wrote it, more again with a good track record, less with a poor one.
 * Half as much when you pitch him in a different role from the one you rated.
 */
export function reportBonus(state: GameState, playerId: PlayerId, pos: Position): number {
  const r = openReport(state, playerId);
  if (!r) return 0;
  const depth = 0.15 + 0.35 * clamp((r.knowledge - REPORT_MIN_KNOWLEDGE) / (100 - REPORT_MIN_KNOWLEDGE), 0, 1);
  const acc = trackRecord(state).accuracy;
  const record = acc === undefined ? 0 : (acc - 0.5) * 0.8;
  return clamp((depth + record) * (r.role === pos ? 1 : 0.5), -0.4, 0.9);
}

/** Clubs trust scouts whose reports hold up (added to club trust, ±8). */
export function accuracyTrust(state: GameState): number {
  const acc = trackRecord(state).accuracy;
  return acc === undefined ? 0 : Math.round((acc - 0.5) * 16);
}

/** Daily: check reports whose year is up. */
export function reportTick(state: GameState, date: GameDate) {
  for (const r of state.reports ?? []) {
    if (r.outcome || r.voided || date < r.reviewOn) continue;
    const p = state.players[r.playerId];
    if (!p) {
      r.voided = true;
      continue;
    }
    const truthNow = ovrAt(p, r.role);
    const error = Math.min(Math.abs(r.rating - r.truthThen), Math.abs(r.rating - truthNow));
    const grade = gradeFor(error);
    const overrated = r.rating > Math.max(r.truthThen, truthNow) + 3;
    const potentialRight = potentialGrade(p.hidden.potential) === r.potential;
    r.outcome = { date, truthNow, error, grade, overrated, potentialRight };
    if (grade === 'way off' && overrated && state.scout) state.scout.reputation = clamp(state.scout.reputation - 1, 0, 100);
    addNews(state, {
      date,
      kind: 'career',
      forYou: true,
      link: 'career',
      title: `Report checked: ${p.firstName} ${p.lastName} (${grade})`,
      body: `A year ago you rated him ${r.rating} as a ${r.role}. He was really ${r.truthThen} then and is ${truthNow} now. ${
        grade === 'spot on'
          ? 'Clubs notice calls like that.'
          : overrated && grade === 'way off'
            ? 'You oversold him, and people remember (reputation −1).'
            : overrated
              ? 'You rated him a little high.'
              : grade === 'close'
                ? 'Close enough to trust.'
                : 'Not your best call.'
      }${potentialRight ? ' Your potential grade was right.' : ''}`,
      playerIds: [p.id],
    });
  }
}
