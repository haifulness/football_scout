import { toParts, type GameDate } from '../core/calendar';
import { formatUSD } from '../core/money';
import { Rng } from '../core/rng';
import type { DeadlineFeedItem } from '../model/review';
import type { GameState } from '../model/world-state';
import { resolveDeals } from './deals';
import { aiTransferWeek } from './transfers';

/** Deadline day opens at 09:00 and the window shuts at midnight (hour 24). */
export const DEADLINE_OPENS = 9;
export const DEADLINE_SHUTS = 24;
/** Hours a pitch or a meeting takes on deadline day. */
export const DEADLINE_ACTION_HOURS = 1;
/** Clubs pay more for players brought to them on deadline day… */
export const DEADLINE_FEE_PREMIUM = 1.1;
/** …and are keener to say yes (added to the sign-off logit). */
export const DEADLINE_SIGNOFF_BONUS = 0.4;
/** Each hour, the chance a club with a pressing need makes a late buy. */
const LATE_BUY_CHANCE = 0.012;

/** The last day of each transfer window: 31 August and 31 January. */
export function isDeadlineDay(date: GameDate): boolean {
  const { month, day } = toParts(date);
  return day === 31 && (month === 8 || month === 1);
}

export function startDeadline(state: GameState, date: GameDate) {
  state.deadline = {
    date,
    hour: DEADLINE_OPENS,
    feed: [
      { hour: DEADLINE_OPENS, text: 'Deadline day. The transfer window shuts at midnight, and every open negotiation will be settled by then.', tone: 'info' },
    ],
  };
}

/**
 * Plays deadline-day hours: late signings around the world, and your open negotiations
 * settling one by one (each hour an open deal has a 1-in-hours-left chance of being decided,
 * so all are decided by midnight). Time stands still on the calendar until the day is finished.
 */
export function passDeadlineHours(state: GameState, hours: number) {
  const dl = state.deadline;
  if (!dl) return;
  const yesterday = state.date;
  state.date = dl.date; // news and deal logs carry deadline day's date
  try {
    for (let i = 0; i < hours && dl.hour < DEADLINE_SHUTS; i++) {
      dl.hour++;
      const feed: DeadlineFeedItem[] = [];
      const { signings } = aiTransferWeek(state, dl.date, {
        chance: LATE_BUY_CHANCE,
        label: `deadline:${dl.date}:${dl.hour}`,
        premium: 1.15,
        budgetShare: 0.85,
      });
      for (const s of [...signings].sort((a, b) => b.fee - a.fee).slice(0, 2)) {
        const p = state.players[s.playerId]!;
        const to = state.clubs[s.clubId]!;
        const from = s.fromId ? state.clubs[s.fromId] : undefined;
        feed.push({
          hour: dl.hour,
          tone: 'world',
          text: from
            ? `${p.firstName} ${p.lastName} joins ${to.name} from ${from.name} for ${formatUSD(s.fee)}.`
            : `${to.name} sign free agent ${p.firstName} ${p.lastName}.`,
        });
      }
      if (signings.length > 2)
        feed.push({
          hour: dl.hour,
          tone: 'world',
          text: `${signings.length - 2} more late deal${signings.length > 3 ? 's' : ''} go through around the world.`,
        });

      const rng = Rng.derive(state.seed, `deadline:${dl.date}:${dl.hour}:deals`);
      const hoursLeft = DEADLINE_SHUTS - dl.hour + 1;
      for (const d of state.deals) if (d.stage === 'negotiating' && rng.next() < 1 / hoursLeft) d.resolvesOn = yesterday;
      const before = state.pendingDealEvents.length;
      resolveDeals(state, dl.date);
      for (const e of state.pendingDealEvents.slice(before))
        feed.push({ hour: dl.hour, tone: e.kind === 'completed' || e.kind === 'agreed' ? 'good' : 'bad', text: e.text });
      if (dl.hour === DEADLINE_SHUTS) feed.push({ hour: dl.hour, tone: 'info', text: 'Midnight: the window has shut.' });
      dl.feed.push(...feed);
    }
  } finally {
    state.date = yesterday;
  }
}

/** Plays out the rest of deadline day; the caller then plays the calendar day itself. */
export function closeDeadline(state: GameState) {
  const dl = state.deadline;
  if (!dl) return;
  passDeadlineHours(state, DEADLINE_SHUTS - dl.hour);
  state.lastDeadline = dl.date;
  state.deadline = undefined;
}
