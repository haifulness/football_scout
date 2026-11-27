import { addDays, makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { formatUSD, usd } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { WindowPlan } from '../model/season';
import type { GameState } from '../model/world-state';
import { offerMandate } from './market';
import { postBrief } from './missions';
import { addLedger } from './scouting';
import { addNews } from './season';
import { squadNeeds } from './squad-needs';

/**
 * Full-time: when a transfer window opens, your employer sets out what it wants from it: positions to fill
 * (each one a brief) and a player to sell (a selling mandate). Deliver all of it before the window shuts for a
 * bonus and the coach's thanks.
 */

/** Window bonus, as a share of the year's salary. */
export const WINDOW_BONUS = 0.05;
/** Relationship with the coach for a plan delivered. */
export const WINDOW_STANDING = 4;

/** The window that opens on this date, if one does: summer (July–August) or winter (January). */
function windowOpening(date: GameDate): { opens: GameDate; closes: GameDate; summer: boolean } | undefined {
  const { year, month, day } = toParts(date);
  if (day !== 1 || (month !== 7 && month !== 1)) return undefined;
  return { opens: date, closes: month === 7 ? makeDate(year, 9, 1) : makeDate(year, 2, 1), summer: month === 7 };
}

/** The open window around this date (for a plan made mid-window, when you join a club). */
function currentWindow(date: GameDate): { opens: GameDate; closes: GameDate; summer: boolean } | undefined {
  const { year, month } = toParts(date);
  if (month === 7 || month === 8) return { opens: makeDate(year, 7, 1), closes: makeDate(year, 9, 1), summer: true };
  if (month === 1) return { opens: makeDate(year, 1, 1), closes: makeDate(year, 2, 1), summer: false };
  return undefined;
}

/** The club sets out its plan: up to two positions (one in winter) and one player to sell. */
export function makeWindowPlan(state: GameState, clubId: ClubId, win: { opens: GameDate; closes: GameDate; summer: boolean }): WindowPlan | undefined {
  const club = state.clubs[clubId];
  if (!club) return undefined;
  const rng = Rng.derive(state.seed, `window:${clubId}:${win.opens}`);
  const needs = squadNeeds(club.formation, club.squad.map((id) => state.players[id]!))
    .filter((n) => n.severity >= 0.1 && (n.position !== 'GK' || n.severity >= 0.3))
    .slice(0, win.summer ? 2 : 1);
  const buys = needs.filter((n) => postBrief(state, club, n.position)).map((n) => ({ position: n.position }));
  const forSale = state.mandates.find((m) => m.clubId === clubId && (m.status === 'offered' || m.status === 'active'));
  const sale = forSale ?? offerMandate(state, club, rng, true);
  const sells = sale ? [{ playerId: sale.playerId }] : [];
  if (!buys.length && !sells.length) return undefined;
  const plan: WindowPlan = { clubId, opens: win.opens, closes: win.closes, budget: club.transferBudget, buys, sells };
  state.windowPlan = plan;
  const p = sale && state.players[sale.playerId];
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'career',
    title: `${club.name}'s plan for the window`,
    body: `${buys.length ? `Sign a ${buys.map((b) => b.position).join(' and a ')}` : ''}${buys.length && p ? '; ' : ''}${p ? `sell ${p.firstName} ${p.lastName}` : ''}. Budget ${formatUSD(club.transferBudget)}. Deliver it all by ${toParts(addDays(win.closes, -1)).day} ${win.summer ? 'August' : 'January'} for a bonus of ${Math.round(WINDOW_BONUS * 100)}% of your salary. See Career.`,
    clubIds: [club.id],
    countryId: club.countryId,
  });
  return plan;
}

/** Ticks off what you delivered: a signing of yours at the position, a sale of yours for the player. */
function updateProgress(state: GameState, plan: WindowPlan) {
  const inWindow = (d?: GameDate) => d !== undefined && d >= plan.opens && d < plan.closes;
  for (const b of plan.buys)
    b.done ||= state.deals.some((d) => d.clubId === plan.clubId && d.position === b.position && d.stage === 'completed' && inWindow(d.completedOn));
  for (const s of plan.sells)
    s.done ||= state.deals.some(
      (d) => d.playerId === s.playerId && d.sellingClubId === plan.clubId && (d.mandateId !== undefined || d.forEmployer) && d.stage === 'completed' && inWindow(d.completedOn),
    );
}

/** Daily (full-time): a plan when a window opens (or when you join mid-window), progress, and the verdict when it shuts. */
export function windowPlanTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  const e = scout?.employment;
  if (!scout || state.careerOver) return;
  const plan = state.windowPlan;
  // A plan from a club you've left lapses.
  if (plan && !plan.result && (e?.mode !== 'fulltime' || e.clubId !== plan.clubId)) {
    state.windowPlan = undefined;
    return;
  }
  if (plan && !plan.result) {
    updateProgress(state, plan);
    if (date >= plan.closes) closePlan(state, plan);
  }
  if (e?.mode !== 'fulltime') return;
  const opening = windowOpening(date) ?? (state.windowPlan?.clubId !== e.clubId ? currentWindow(date) : undefined);
  if (opening && (state.windowPlan?.opens !== opening.opens || state.windowPlan.clubId !== e.clubId)) makeWindowPlan(state, e.clubId, opening);
}

function closePlan(state: GameState, plan: WindowPlan) {
  const scout = state.scout!;
  const e = scout.employment;
  const club = state.clubs[plan.clubId]!;
  const items = [...plan.buys, ...plan.sells];
  const got = items.filter((i) => i.done).length;
  plan.result = got === items.length ? 'done' : 'missed';
  if (plan.result === 'done' && e.mode === 'fulltime') {
    const bonus = Math.round((e.salary * WINDOW_BONUS) / 100) * 100;
    addLedger(state, { amount: usd(bonus), kind: 'salary', label: `Window bonus: ${club.name}` });
    scout.relationships[club.headCoachId] = clamp((scout.relationships[club.headCoachId] ?? 0) + WINDOW_STANDING, 0, 100);
    addNews(state, {
      date: state.date,
      kind: 'career',
      link: 'career',
      title: `Window delivered: ${formatUSD(bonus)} bonus`,
      body: `You did everything ${club.name} asked of the window. A bonus of ${formatUSD(bonus)}, and the coach is grateful.`,
      clubIds: [club.id],
      countryId: club.countryId,
    });
  } else
    addNews(state, {
      date: state.date,
      kind: 'career',
      link: 'career',
      title: `Window shut: ${got} of ${items.length} delivered`,
      body: `The window is shut and ${club.name}'s plan is ${got ? 'only partly' : 'not'} done, so there's no window bonus this time.`,
      clubIds: [club.id],
      countryId: club.countryId,
    });
}
