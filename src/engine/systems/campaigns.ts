import { addDays, toParts, type GameDate } from '../core/calendar';
import type { CountryId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng } from '../core/rng';
import type { GameState } from '../model/world-state';
import { AGREEMENT_GATE, makeOffer } from './employment';
import { clientCapacity } from './agency';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';

/**
 * Profile campaigns: pay weekly to get your name around one market. Clubs there invite you to scout for them
 * (even ones that have never met you), your clients ask for more briefs, and players ask your advice more often.
 * While it runs you are in the spotlight: a failed brief or a lapsed offer costs you half as much again.
 */

export const CAMPAIGN_WEEKS: [number, number] = [4, 12];
/** How much harder a flop lands while you're in the spotlight. */
export const SPOTLIGHT = 1.5;
/** Weekly chance a club in the market invites you. */
const INVITE_CHANCE = 0.35;
/** How much likelier briefs and player questions are. */
export const CAMPAIGN_BOOST = 1.4;

/** Weekly cost in a market: dearer where football is rich and life is expensive. */
export function campaignCost(state: GameState, countryId: CountryId): USD {
  const c = state.countries[countryId]!;
  return usd(Math.round((500 * c.costIndex * (0.5 + c.wealthIndex)) / 50) * 50);
}

export function activeCampaign(state: GameState) {
  const c = state.campaign;
  return c && c.endedOn === undefined ? c : undefined;
}

/** In the spotlight: a campaign is running. */
export const inSpotlight = (state: GameState) => !!activeCampaign(state);

export function campaignCheck(state: GameState, countryId: CountryId, weeks: number): { ok: boolean; reason?: string } {
  const sc = state.scout;
  if (!sc) return { ok: false, reason: 'Set up your scout first.' };
  if (sc.employment.mode !== 'freelance') return { ok: false, reason: 'Your club does your publicity: campaigns are for freelancers.' };
  if (activeCampaign(state)) return { ok: false, reason: 'A campaign is already running.' };
  if (!state.countries[countryId] || !Object.values(state.clubs).some((c) => c.countryId === countryId)) return { ok: false, reason: 'No clubs to reach there.' };
  if (weeks < CAMPAIGN_WEEKS[0] || weeks > CAMPAIGN_WEEKS[1]) return { ok: false, reason: `A campaign runs ${CAMPAIGN_WEEKS[0]} to ${CAMPAIGN_WEEKS[1]} weeks.` };
  if (sc.money < campaignCost(state, countryId) * 2) return { ok: false, reason: 'You can’t afford the first weeks.' };
  return { ok: true };
}

export function startCampaign(state: GameState, countryId: CountryId, weeks: number) {
  const check = campaignCheck(state, countryId, Math.round(weeks));
  if (!check.ok) throw new ScoutingError(check.reason!);
  const weeklyCost = campaignCost(state, countryId);
  state.campaign = { countryId, startedOn: state.date, endsOn: addDays(state.date, Math.round(weeks) * 7), weeklyCost, spent: usd(0), invites: 0 };
  charge(state);
}

export function stopCampaign(state: GameState) {
  if (activeCampaign(state)) finish(state, 'You pulled the campaign early.');
}

function charge(state: GameState) {
  const c = state.campaign!;
  const country = state.countries[c.countryId]!;
  addLedger(state, { amount: usd(-c.weeklyCost), kind: 'campaign', label: `Profile campaign: ${country.name}` }, { merge: true });
  c.spent = usd(c.spent + c.weeklyCost);
}

function finish(state: GameState, why: string) {
  const c = state.campaign!;
  c.endedOn = state.date;
  const country = state.countries[c.countryId]!;
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'career',
    title: `Campaign over: ${country.name}`,
    body: `${why} It cost ${formatUSD(c.spent)} and brought ${c.invites} invitation${c.invites === 1 ? '' : 's'} from clubs there. You're out of the spotlight.`,
    countryId: c.countryId,
  });
}

/** Mondays: pay for the week, and maybe a club in the market gets in touch. */
export function campaignTick(state: GameState, date: GameDate) {
  const c = activeCampaign(state);
  const sc = state.scout;
  if (!c || !sc || state.careerOver || toParts(date).weekday !== 1 || date === c.startedOn) return;
  if (sc.employment.mode !== 'freelance') return finish(state, 'You took a club job.');
  if (date >= c.endsOn) return finish(state, 'The campaign has run its course.');
  // Paid by the week, from the day it started: never more weeks than you booked.
  if (c.spent < c.weeklyCost * Math.round((c.endsOn - c.startedOn) / 7)) charge(state);
  const e = sc.employment;
  if (clientCapacity(state) <= e.clients.length) return;
  const rng = Rng.derive(state.seed, `campaign:${date}`);
  if (!rng.chance(INVITE_CHANCE)) return;
  const pending = new Set(state.offers.map((o) => o.clubId));
  const clubs = Object.values(state.clubs).filter(
    (x) => x.countryId === c.countryId && !pending.has(x.id) && !e.clients.includes(x.id) && sc.reputation >= AGREEMENT_GATE[x.tier],
  );
  if (!clubs.length) return;
  // Smaller clubs answer adverts; big ones need a bigger name.
  makeOffer(state, { kind: 'client', clubId: rng.weighted(clubs, (x) => x.tier).id });
  c.invites++;
}
