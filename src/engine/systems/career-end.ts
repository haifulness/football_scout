import { CAREER_START, type GameDate } from '../core/calendar';
import type { PlayerId } from '../core/ids';
import { formatUSD } from '../core/money';
import type { TrophyKind } from '../model/goals';
import type { GameState } from '../model/world-state';
import { ovrAt } from './ratings';
import { trackRecord } from './reports';
import { SCENARIOS, scenarioBonus, scenarioProgress } from './scenarios';
import { ScoutingError } from './scouting';
import { addNews } from './season';

/**
 * Career end (phase 21): retire whenever you like, or go bankrupt. Either way the
 * career gets a summary and a final score, which the host keeps in a hall of fame.
 */

/** A placed or discovered player who became this good counts as a star you found. */
export const STAR_OVR = 80;
const TROPHY_POINTS: Record<TrophyKind, number> = { 'scout-world': 60, 'scout-country': 25, signing: 15, 'clean-sweep': 10 };
const BANKRUPT_FACTOR = 0.75;

export interface ScoreLine {
  label: string;
  points: number;
  detail: string;
}

export interface CareerSummary {
  name: string;
  startedOn: GameDate;
  endedOn: GameDate;
  /** Seasons played, to one decimal. */
  seasons: number;
  kind: 'bankrupt' | 'retired' | 'scenario' | 'active';
  /** For scenario careers: which one, and how it went. */
  scenario?: { id: string; name: string; result: 'won' | 'lost' | 'active'; progress?: string };
  reason?: string;
  earned: number;
  spent: number;
  money: number;
  reputation: number;
  placements: number;
  /** Signing and match bonuses your placements paid you. */
  placementEarnings: number;
  prodigies: number;
  goalsReached: number;
  trophies: Record<TrophyKind, number>;
  accuracy?: number;
  reportsChecked: number;
  agency?: { name: string; brokered: number; earned: number };
  /** Your best find: the placed or discovered player who is (or was, when he retired) the best now. */
  bestFind?: { playerId: PlayerId; name: string; ovr: number; how: 'placed' | 'discovered' };
  stars: { playerId: PlayerId; name: string; ovr: number }[];
  score: number;
  breakdown: ScoreLine[];
}

export function careerSummary(state: GameState): CareerSummary {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  const startedOn = scout.startedOn ?? CAREER_START;
  const endedOn = state.careerOver?.date ?? state.date;
  let earned = 0;
  let spent = 0;
  for (const season of Object.values(state.ledgerTotals))
    for (const [kind, v] of Object.entries(season)) {
      if (kind === 'starting-funds' || !v) continue;
      if (v > 0) earned += v;
      else spent += v;
    }

  // Everyone you placed or were first to reveal, judged on how good they are now.
  const found = new Map<PlayerId, 'placed' | 'discovered'>();
  for (const f of state.prodigyFinds ?? []) found.set(f.playerId, 'discovered');
  for (const pl of state.placements) found.set(pl.playerId, 'placed');
  const judged = [...found.entries()]
    .map(([id, how]) => {
      const p = state.players[id];
      return p ? { playerId: id, name: `${p.firstName} ${p.lastName}`, ovr: ovrAt(p, p.naturalPosition), how } : undefined;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.ovr - a.ovr);
  const stars = judged.filter((x) => x.ovr >= STAR_OVR).map(({ how: _h, ...x }) => x);

  const trophies: Record<TrophyKind, number> = { 'scout-world': 0, 'scout-country': 0, signing: 0, 'clean-sweep': 0 };
  for (const t of state.trophies ?? []) trophies[t.kind]++;
  const record = trackRecord(state);
  const placementEarnings = state.placements.reduce((n, pl) => {
    const e = pl.earnings;
    return n + (pl.bonusPaid ? pl.bonus : 0) + e.appearance + e.goals + e.assists + e.tackles + e.cleanSheets + e.captain;
  }, 0);

  const breakdown: ScoreLine[] = [
    (() => {
      const start = scout.startReputation ?? 5;
      const gained = Math.max(0, scout.reputation - start);
      return { label: 'Reputation', points: gained * 3, detail: `${scout.reputation}, up ${gained} from ${start} × 3` };
    })(),
    { label: 'Earnings', points: Math.round(40 * Math.log2(1 + earned / 10_000)), detail: `${formatUSD(earned)} earned over your career` },
    { label: 'Placements', points: state.placements.length * 5, detail: `${state.placements.length} × 5` },
    { label: 'Stars you found', points: stars.length * 20, detail: `${stars.length} reached ${STAR_OVR}+ × 20` },
    {
      label: 'Trophies',
      points: (Object.keys(trophies) as TrophyKind[]).reduce((n, k) => n + trophies[k] * TROPHY_POINTS[k], 0),
      detail: `${(state.trophies ?? []).length} won`,
    },
    {
      label: 'Report accuracy',
      points: record.accuracy === undefined ? 0 : Math.round(record.accuracy * 50),
      detail: record.accuracy === undefined ? 'not enough checked reports' : `${Math.round(record.accuracy * 100)}% × 50`,
    },
  ];
  const kind = state.careerOver ? (state.careerOver.kind ?? 'bankrupt') : 'active';
  const sc = state.scenario;
  if (sc) {
    const bonus = scenarioBonus(state);
    breakdown.push({
      label: 'Scenario',
      points: bonus,
      detail: sc.status === 'won' ? `${SCENARIOS[sc.id].name} won: 400 + up to 300 for time left` : `${SCENARIOS[sc.id].name}: ${sc.status === 'lost' ? 'lost' : 'still going'}`,
    });
  }
  const raw = breakdown.reduce((n, l) => n + l.points, 0);
  const score = Math.round(kind === 'bankrupt' ? raw * BANKRUPT_FACTOR : raw);
  if (kind === 'bankrupt') breakdown.push({ label: 'Bankrupt', points: score - raw, detail: `× ${BANKRUPT_FACTOR}` });

  return {
    name: scout.name,
    startedOn,
    endedOn,
    seasons: Math.round(((endedOn - startedOn) / 365.25) * 10) / 10,
    kind,
    reason: state.careerOver?.reason,
    scenario: sc && { id: sc.id, name: SCENARIOS[sc.id].name, result: sc.status, progress: scenarioProgress(state)?.label },
    earned,
    spent,
    money: scout.money,
    reputation: scout.reputation,
    placements: state.placements.length,
    placementEarnings,
    prodigies: (state.prodigyFinds ?? []).length,
    goalsReached: (state.objectives ?? []).filter((o) => o.status === 'done').length,
    trophies,
    accuracy: record.accuracy,
    reportsChecked: record.reviewed,
    agency: state.agency && { name: state.agency.name, brokered: state.agency.brokered, earned: state.agency.earned },
    bestFind: judged[0],
    stars,
    score,
    breakdown,
  };
}

/** Hang up the notebook: the career ends today. Nothing more happens in this world. */
export function retire(state: GameState) {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  if (state.careerOver) throw new ScoutingError('Your career is already over.');
  if (state.deadline) throw new ScoutingError('Finish deadline day first.');
  const years = Math.round(((state.date - (scout.startedOn ?? CAREER_START)) / 365.25) * 10) / 10;
  // Walking away from a scenario counts as losing it.
  if (state.scenario?.status === 'active') Object.assign(state.scenario, { status: 'lost', resolvedOn: state.date });
  state.careerOver = { date: state.date, kind: 'retired', reason: `${scout.name} retires after ${years} season${years === 1 ? '' : 's'} in the game.` };
  addNews(state, { date: state.date, kind: 'career', forYou: true, title: `${scout.name} retires`, body: state.careerOver.reason });
}
