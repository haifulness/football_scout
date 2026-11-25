import { formatDate, makeDate, toParts, type GameDate } from '../core/calendar';
import { formatUSD, usd, type USD } from '../core/money';
import type { Difficulty, LedgerKind } from '../model/scout';
import type { GameState } from '../model/world-state';
import { addLedger } from './scouting';
import { addNews } from './season';

/**
 * What it costs to be a scout, beyond the work itself. Living costs rise with your name: a known scout lives like
 * one (a better flat, a car, a phone that never stops). And every July the taxman takes a share of the season's
 * profit, so a good year needs money put aside.
 */

export const TAX_RATE: Record<Difficulty, number> = { easy: 0.15, normal: 0.25, hard: 0.35 };
const LIVING_SCALE: Record<Difficulty, number> = { easy: 0.7, normal: 1, hard: 1.3 };

/** What counts as earnings, and which costs of the job are deductible. */
const TAXABLE = new Set<LedgerKind>(['signing-bonus', 'match-bonus', 'salary', 'mission-reward', 'sale-commission', 'award', 'agency-cut', 'consultation', 'mentor-cut', 'training-fee', 'sell-on']);
const DEDUCTIBLE = new Set<LedgerKind>(['search', 'video', 'travel', 'accommodation', 'ticket', 'meeting', 'assistant', 'assistant-task', 'agency', 'agency-setup', 'campaign', 'academy']);

/** Weekly living costs at this reputation (before your home city's cost of living and difficulty). */
export const livingBase = (reputation: number) => 35 + reputation * reputation * 0.35;

export function weeklyLiving(state: GameState): USD {
  const scout = state.scout!;
  const costIndex = state.countries[scout.homeCountry]!.costIndex;
  return usd(Math.round((livingBase(scout.reputation) * costIndex * LIVING_SCALE[scout.difficulty]) / 10) * 10);
}

/** The season's taxable profit and the bill on it, from the season's books so far. */
export function taxFor(state: GameState, season: number): { profit: number; rate: number; bill: USD } {
  const totals = state.ledgerTotals[season] ?? {};
  let profit = 0;
  for (const [k, v] of Object.entries(totals) as [LedgerKind, number][]) if (TAXABLE.has(k) || DEDUCTIBLE.has(k)) profit += v ?? 0;
  const rate = TAX_RATE[state.scout?.difficulty ?? 'normal'];
  return { profit, rate, bill: usd(Math.max(0, Math.round((profit * rate) / 10) * 10)) };
}

/** Tax day: the 1st of July, for the season that just ended. */
export const taxDay = (season: number): GameDate => makeDate(season + 1, 7, 1);

/** Mondays: living costs. The 1st of June: the tax estimate. */
export function overheadsTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  const { weekday, month, day } = toParts(date);
  if (weekday === 1) addLedger(state, { amount: usd(-weeklyLiving(state)), kind: 'living', label: 'Living costs' }, { merge: true });
  if (month === 6 && day === 1) {
    const { bill, rate } = taxFor(state, state.season.year);
    if (bill > 0)
      addNews(state, {
        date,
        kind: 'career',
        link: 'finances',
        title: `Tax bill coming: about ${formatUSD(bill)}`,
        body: `${Math.round(rate * 100)}% of this season's profit is due on ${formatDate(taxDay(state.season.year))}. Keep the money aside: running out of cash still counts towards bankruptcy.`,
      });
  }
}

/** On the new season's first day: pay the tax on the season that just ended. */
export function payTax(state: GameState, season: number, date: GameDate) {
  if (!state.scout || state.careerOver) return;
  const { bill, profit, rate } = taxFor(state, season);
  if (bill <= 0) return;
  addLedger(state, { amount: usd(-bill), kind: 'tax', label: `Tax on the ${season}/${String(season + 1).slice(2)} season` });
  addNews(state, {
    date,
    kind: 'career',
    link: 'finances',
    title: `Tax paid: ${formatUSD(bill)}`,
    body: `${Math.round(rate * 100)}% of your ${formatUSD(profit)} profit last season.`,
  });
}
