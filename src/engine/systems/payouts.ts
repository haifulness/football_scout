import { addDays, formatDate, toParts, type GameDate } from '../core/calendar';
import { formatUSD, usd, type USD } from '../core/money';
import { clamp } from '../core/rng';
import type { ClubTier } from '../model/club';
import { emptyEarnings, type PayoutEvent, type PayoutKind, type Placement } from '../model/deal';
import type { Position } from '../model/player';
import type { Fixture, PlayerMatchLine } from '../model/season';
import type { GameState } from '../model/world-state';
import { addLedger } from './scouting';
import { addNews } from './season';

/**
 * How the scout gets paid (PLAN §3.9a). All amounts are whole USD and scale
 * with the tier of the club the player plays for. Freelancers earn more per
 * deal than full-time scouts, who get a salary instead (employment, phase 8).
 */

type Mode = Placement['mode'];

export const SIGNING_PCT: Record<Mode, number> = { fulltime: 1, freelance: 2 };
export const SIGNING_FLOOR: Record<Mode, Record<ClubTier, number>> = {
  fulltime: { 5: 600, 4: 1_600, 3: 3_000, 2: 12_000, 1: 50_000 },
  freelance: { 5: 1_500, 4: 4_000, 3: 7_500, 2: 30_000, 1: 125_000 },
};
/** Per-match base values at a tier-3 club for a full-time scout. */
export const MATCH_BASE = { appearance: 50, goal: 150, assist: 100, tackleMatch: 75, cleanSheet: 150, captain: 75 };
export const MATCH_TIER_MULT: Record<ClubTier, number> = { 5: 0.25, 4: 0.5, 3: 1, 2: 3, 1: 8 };
export const MODE_MULT: Record<Mode, number> = { fulltime: 1, freelance: 2 };

const ATTACKING = new Set<Position>(['ST', 'LW', 'RW', 'AM']);
const CENTRAL_DEFENSIVE = new Set<Position>(['CB', 'DM']);
const WIDE_DEFENSIVE = new Set<Position>(['LB', 'RB', 'LWB', 'RWB']);

/** Tackles needed in a match for the tackle bonus (double it for +50%). */
export function tackleThreshold(pos: Position): number | undefined {
  if (CENTRAL_DEFENSIVE.has(pos)) return 3;
  if (WIDE_DEFENSIVE.has(pos)) return 2;
  return undefined;
}

/** What a position earns you beyond appearances and captaincy. */
export function bonusCategory(pos: Position): 'attacking' | 'defensive' | 'goalkeeping' | 'none' {
  if (ATTACKING.has(pos)) return 'attacking';
  if (tackleThreshold(pos)) return 'defensive';
  if (pos === 'GK') return 'goalkeeping';
  return 'none';
}

/** One-off signing bonus: a share of the fee (or market value for free agents), higher the more he beats the average. */
export function signingBonus(p: { fee: USD; value: USD; tier: ClubTier; ovrGap: number; prospect: boolean; mode: Mode }): USD {
  if (p.prospect) return usd(0);
  const basis = p.fee > 0 ? p.fee : p.value;
  const gapFactor = clamp(1 + p.ovrGap / 10, 1, 1.5);
  return usd(Math.max(SIGNING_FLOOR[p.mode][p.tier], (taperedFee(basis) * SIGNING_PCT[p.mode] * gapFactor) / 100));
}

/**
 * Big fees count for less: the full fee up to $1M, 40% of it from $1M to $10M, 12% above.
 * At 2.5% (freelance) that is 2.5% / 1% / 0.3% of each slice, so elite deals still pay a fortune, but not millions each.
 */
export function taperedFee(fee: number): number {
  const a = Math.min(fee, 1_000_000);
  const b = clamp(fee - 1_000_000, 0, 9_000_000);
  const c = Math.max(0, fee - 10_000_000);
  return a + b * 0.4 + c * 0.12;
}

/** Stacked per-match bonuses for one player's match line. */
export function matchPayout(line: PlayerMatchLine, tier: ClubTier, mode: Mode): { items: PayoutEvent['items']; total: USD } {
  const m = MATCH_TIER_MULT[tier] * MODE_MULT[mode];
  const items: PayoutEvent['items'] = [];
  const add = (kind: PayoutKind, label: string, amount: number) => {
    const a = usd(amount * m);
    if (a > 0) items.push({ kind, label, amount: a });
  };
  add('appearance', line.started ? 'Appearance' : 'Appearance (sub)', MATCH_BASE.appearance);
  const cat = bonusCategory(line.position);
  if (cat === 'attacking') {
    if (line.goals) add('goals', line.goals === 1 ? 'Goal' : `${line.goals} goals`, MATCH_BASE.goal * line.goals);
    if (line.assists) add('assists', line.assists === 1 ? 'Assist' : `${line.assists} assists`, MATCH_BASE.assist * line.assists);
  } else if (cat === 'defensive') {
    const t = tackleThreshold(line.position)!;
    if (line.tackles >= t)
      add('tackles', `${line.tackles} tackles${line.tackles >= t * 2 ? ' (dominant)' : ''}`, MATCH_BASE.tackleMatch * (line.tackles >= t * 2 ? 1.5 : 1));
  } else if (cat === 'goalkeeping' && line.cleanSheet) {
    add('cleanSheets', 'Clean sheet', MATCH_BASE.cleanSheet);
  }
  if (line.captain) add('captain', 'Captain', MATCH_BASE.captain);
  return { items, total: usd(items.reduce((s, i) => s + i.amount, 0)) };
}

const isActive = (pl: Placement) => !pl.endedOn;

/** After each match: pay bonuses for any of your active placements who played. */
export function payMatchBonuses(state: GameState, lines: PlayerMatchLine[], fixture: Fixture, date: GameDate) {
  if (!state.scout || state.careerOver) return;
  const active = state.placements.filter((pl) => isActive(pl) && date >= pl.signedOn && date <= pl.expiresOn);
  if (!active.length) return;
  for (const line of lines) {
    const pl = active.find((x) => x.playerId === line.playerId && x.clubId === line.clubId);
    if (!pl) continue;
    const club = state.clubs[pl.clubId]!;
    const { items, total } = matchPayout(line, club.tier, pl.mode);
    if (!total) continue;
    for (const it of items) pl.earnings[it.kind] += it.amount;
    const p = state.players[line.playerId]!;
    const home = fixture.homeId === club.id;
    const opponentId = home ? fixture.awayId : fixture.homeId;
    addLedger(state, { amount: total, kind: 'match-bonus', label: `Bonuses: ${p.firstName} ${p.lastName} v ${state.clubs[opponentId]!.shortName}` });
    state.pendingPayouts.push({
      playerId: p.id,
      clubId: club.id,
      opponentId,
      date,
      home,
      score: [fixture.result!.homeGoals, fixture.result!.awayGoals],
      position: line.position,
      items,
      total,
    });
  }
}

/** Pays any unpaid signing bonus (immediately after a signing, or back pay for older saves). */
export function settleSigningBonuses(state: GameState) {
  if (!state.scout) return;
  for (const pl of state.placements) {
    if (pl.bonusPaid) continue;
    const club = state.clubs[pl.clubId];
    const p = state.players[pl.playerId];
    pl.bonus = signingBonus({ fee: pl.fee, value: p?.value ?? usd(0), tier: club?.tier ?? 5, ovrGap: pl.ovrGap, prospect: pl.prospect, mode: pl.mode });
    pl.bonusPaid = true;
    pl.earnings ??= emptyEarnings();
    if (pl.bonus > 0)
      addLedger(state, {
        amount: pl.bonus,
        kind: 'signing-bonus',
        label: `Signing bonus: ${p ? `${p.firstName} ${p.lastName}` : 'player'} to ${club?.name ?? 'club'}`,
      });
  }
}

/** Daily: bonuses stop when his first contract ends or he leaves the club. */
export function updatePlacements(state: GameState, date: GameDate) {
  for (const pl of state.placements) {
    if (!isActive(pl)) continue;
    const p = state.players[pl.playerId];
    const reason = !p ? 'He retired.' : p.clubId !== pl.clubId ? 'He left the club.' : date > pl.expiresOn ? 'His first contract ended.' : undefined;
    if (reason) {
      pl.endedOn = date;
      pl.endReason = reason;
    }
  }
}

export const BANKRUPTCY_DAYS = 56;

/** Daily: eight weeks in a row below $0 ends the career. */
export function checkSolvency(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  if (scout.money >= 0) {
    scout.brokeSince = undefined;
  } else {
    if (scout.brokeSince === undefined) {
      scout.brokeSince = date;
      addNews(state, {
        date,
        kind: 'finance',
        title: 'You are in debt',
        body: `Your balance is ${formatUSD(scout.money)}. Get back above $0 within ${BANKRUPTCY_DAYS / 7} weeks (by ${formatDate(addDays(date, BANKRUPTCY_DAYS))}) or your career is over.`,
      });
    }
    if (date - scout.brokeSince >= BANKRUPTCY_DAYS) {
      state.careerOver = { date, kind: 'bankrupt', reason: `Bankrupt: ${BANKRUPTCY_DAYS / 7} weeks in debt (${formatUSD(scout.money)}).` };
      addNews(state, { date, kind: 'finance', title: 'Career over: bankrupt', body: state.careerOver.reason });
    }
  }
  if (toParts(date).weekday === 1) {
    state.balanceHistory.push({ date, money: scout.money });
    if (state.balanceHistory.length > 520) state.balanceHistory.shift();
  }
}
