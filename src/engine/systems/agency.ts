import { toParts, type GameDate } from '../core/calendar';
import type { CountryId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { HQ, type AgencyDeal, type AgencyLogo, type Office } from '../model/agency';
import type { ClubTier } from '../model/club';
import type { GameState } from '../model/world-state';
import { staffLimit } from './assistants';
import { clientSlots } from './employment';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import type { AiSigning } from './transfers';

/**
 * Your own agency (phase 19): late-game business. Offices replace the client-slot
 * and staff caps, cost rent, and make their country feel like home (no hotels,
 * cheaper and better-connected searches). Assistants placed in an office broker
 * some of the transfers into its country, and the agency keeps a cut.
 */

export const AGENCY_REP = 60;
export const FOUNDING_COST = 40_000;
export const MAX_OFFICES = 4;
const HQ_UPKEEP = 600;
const OFFICE_SETUP = 15_000;
const OFFICE_RENT = 2_500;
/** Clients and staff the agency can carry: per base (headquarters plus offices). */
const CLIENTS_PER_BASE = 2;
const STAFF_PER_BASE = 2;
/** The agency's cut of a brokered fee, with a floor (free transfers still pay) and a cap. */
const CUT_PCT = 0.008;
const CUT_FLOOR: Record<ClubTier, number> = { 1: 12_000, 2: 7_000, 3: 4_000, 4: 2_000, 5: 1_000 };
const CUT_CAP = 20_000;
const KEEP_DEALS = 60;
/** Search bonuses where you have a base. */
export const OFFICE_SEARCH_DISCOUNT = 0.75;
export const OFFICE_REACH = 15;
const OFFICE_MARKET_FLOOR = 50;

const name = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;

export function officeSetupCost(state: GameState, countryId: CountryId): USD {
  return usd(Math.round((OFFICE_SETUP * state.countries[countryId]!.costIndex) / 500) * 500);
}

export function officeRent(state: GameState, countryId: CountryId): USD {
  return usd(Math.round((OFFICE_RENT * state.countries[countryId]!.costIndex) / 100) * 100);
}

export function hqUpkeep(state: GameState): USD {
  return usd(Math.round((HQ_UPKEEP * state.countries[state.scout!.homeCountry]!.costIndex) / 10) * 10);
}

/** Countries where the agency has a base: home (headquarters) and every office. */
export function agencyCountries(state: GameState): Set<CountryId> {
  if (!state.agency || !state.scout) return new Set();
  return new Set([state.scout.homeCountry, ...state.agency.offices.map((o) => o.countryId)]);
}

export function hasBase(state: GameState, countryId: CountryId): boolean {
  return !!state.agency && agencyCountries(state).has(countryId);
}

const bases = (state: GameState) => 1 + (state.agency?.offices.length ?? 0);

/** How many clubs you can work for at once (an agency counts offices, not reputation). */
export function clientCapacity(state: GameState): number {
  const rep = state.scout?.reputation ?? 0;
  return state.agency ? Math.max(clientSlots(rep), CLIENTS_PER_BASE * (bases(state) + 1)) : clientSlots(rep);
}

export function staffCapacity(state: GameState): number {
  const rep = state.scout?.reputation ?? 0;
  return state.agency ? Math.max(staffLimit(rep), 1 + STAFF_PER_BASE * bases(state)) : staffLimit(rep);
}

export function agencyCheck(state: GameState): { ok: boolean; reason?: string } {
  const scout = state.scout;
  if (!scout) return { ok: false, reason: 'Set up your scout first.' };
  if (state.agency) return { ok: false, reason: 'You already run an agency.' };
  if (scout.reputation < AGENCY_REP) return { ok: false, reason: `Clubs and players need to know your name first (reputation ${AGENCY_REP}).` };
  if (scout.employment.mode !== 'freelance') return { ok: false, reason: 'An agency is a freelance business: leave your club job first.' };
  if (scout.money < FOUNDING_COST) return { ok: false, reason: `Founding costs ${formatUSD(FOUNDING_COST)} (lawyers, an office, a website).` };
  return { ok: true };
}

export function foundAgency(state: GameState, args: { name: string; shortName?: string; logo: AgencyLogo }) {
  const check = agencyCheck(state);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const agencyName = args.name.trim().slice(0, 32);
  if (agencyName.length < 2) throw new ScoutingError('Give your agency a name.');
  const initials = agencyName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
  const shortName = (args.shortName?.trim() || initials).slice(0, 4).toUpperCase();
  addLedger(state, { amount: usd(-FOUNDING_COST), kind: 'agency-setup', label: `Founding ${agencyName}` });
  state.agency = { name: agencyName, shortName, logo: args.logo, foundedOn: state.date, offices: [], deals: [], brokered: 0, earned: usd(0) };
  addNews(state, {
    date: state.date,
    kind: 'career',
    forYou: true,
    link: 'agency',
    title: `${agencyName} opens its doors`,
    body: `${state.scout!.name} launches a scouting agency, ${agencyName}. Offices abroad will widen its reach, and staff placed in them broker deals for the agency.`,
  });
}

export function openOffice(state: GameState, countryId: CountryId): Office {
  const agency = state.agency;
  const scout = state.scout;
  if (!agency || !scout) throw new ScoutingError('Found your agency first.');
  const country = state.countries[countryId];
  if (!country) throw new ScoutingError('Unknown country.');
  if (countryId === scout.homeCountry) throw new ScoutingError('Your headquarters is already here.');
  if (agency.offices.some((o) => o.countryId === countryId)) throw new ScoutingError(`You already have an office in ${country.name}.`);
  if (agency.offices.length >= MAX_OFFICES) throw new ScoutingError(`${MAX_OFFICES} offices is as far as one agency can stretch.`);
  if (!Object.values(state.clubs).some((c) => c.countryId === countryId)) throw new ScoutingError(`${country.name} has no professional football to work in.`);
  const setup = officeSetupCost(state, countryId);
  if (scout.money < setup) throw new ScoutingError(`Opening in ${country.name} costs ${formatUSD(setup)}.`);
  addLedger(state, { amount: usd(-setup), kind: 'agency-setup', label: `Office opened: ${country.name}` });
  const cityId = state.regions[country.regionIds[0]!]!.cityIds[0]!;
  const office: Office = { id: agency.offices.reduce((n, o) => Math.max(n, o.id), 0) + 1, countryId, cityId, openedOn: state.date, rent: officeRent(state, countryId) };
  agency.offices.push(office);
  scout.regionKnowledge[countryId] = Math.max(scout.regionKnowledge[countryId] ?? 0, OFFICE_MARKET_FLOOR);
  return office;
}

/** Close an office: no refund. Its staff come back to the headquarters' free pool. */
export function closeOffice(state: GameState, officeId: number) {
  const agency = state.agency;
  if (!agency) return;
  agency.offices = agency.offices.filter((o) => o.id !== officeId);
  for (const a of state.assistants) if (a.officeId === officeId) a.officeId = undefined;
}

/** Put an assistant to work at a base (he stops field tasks), or take him back (null). */
export function placeAssistant(state: GameState, assistantId: number, officeId: number | null) {
  const agency = state.agency;
  if (!agency) throw new ScoutingError('Found your agency first.');
  const a = state.assistants.find((x) => x.id === assistantId);
  if (!a) throw new ScoutingError('No such assistant.');
  if (officeId !== null && officeId !== HQ && !agency.offices.some((o) => o.id === officeId)) throw new ScoutingError('No such office.');
  if (officeId !== null && a.task) throw new ScoutingError(`${name(a)} is out on a task. Recall him first.`);
  if (officeId !== null && a.job) throw new ScoutingError(`${name(a)} is handling one of your briefs. Take it back first.`);
  a.officeId = officeId ?? undefined;
}

export function officeCountry(state: GameState, officeId: number): CountryId | undefined {
  return officeId === HQ ? state.scout?.homeCountry : state.agency?.offices.find((o) => o.id === officeId)?.countryId;
}

/** Mondays: headquarters upkeep. First of the month: office rent. */
export function agencyTick(state: GameState, date: GameDate) {
  const agency = state.agency;
  if (!agency || !state.scout || state.careerOver) return;
  const { day, weekday } = toParts(date);
  if (weekday === 1) addLedger(state, { amount: usd(-hqUpkeep(state)), kind: 'agency', label: `${agency.name}: headquarters upkeep` }, { merge: true });
  if (day === 1)
    for (const o of agency.offices)
      addLedger(state, { amount: usd(-o.rent), kind: 'agency', label: `${agency.name}: office rent in ${state.countries[o.countryId]!.name}` });
}

/**
 * After clubs sign players: staff at a base sometimes brokered a signing into its country.
 * Each staffer at that base has a (1% + 0.5% × skill) chance; the agency banks 0.8% of the fee
 * (floor by tier, capped).
 */
export function agencyOnSignings(state: GameState, signings: AiSigning[], date: GameDate, label: string) {
  const agency = state.agency;
  if (!agency || !state.scout || !signings.length) return;
  const staffBy = new Map<CountryId, typeof state.assistants>();
  for (const a of state.assistants) {
    if (a.officeId === undefined) continue;
    const c = officeCountry(state, a.officeId);
    if (!c) continue;
    staffBy.set(c, [...(staffBy.get(c) ?? []), a]);
  }
  if (!staffBy.size) return;
  const rng = Rng.derive(state.seed, `agency:${label}`);
  const made: AgencyDeal[] = [];
  for (const s of signings) {
    const club = state.clubs[s.clubId];
    const staff = club && staffBy.get(club.countryId);
    if (!club || !staff) continue;
    for (const a of staff) {
      if (!rng.chance(0.01 + 0.005 * a.skill)) continue;
      const cut = usd(Math.round(clamp(s.fee * CUT_PCT, CUT_FLOOR[club.tier], CUT_CAP) / 100) * 100);
      made.push({ date, assistantId: a.id, playerId: s.playerId, clubId: club.id, fee: s.fee, cut });
      break;
    }
  }
  if (!made.length) return;
  for (const d of made) {
    const a = state.assistants.find((x) => x.id === d.assistantId)!;
    const p = state.players[d.playerId];
    addLedger(state, {
      amount: d.cut,
      kind: 'agency-cut',
      label: `${agency.name}: ${name(a)} brokered ${p ? `${p.firstName} ${p.lastName}` : 'a signing'} to ${state.clubs[d.clubId]!.name}`,
    });
    agency.brokered++;
    agency.earned = usd(agency.earned + d.cut);
  }
  agency.deals = [...made.reverse(), ...agency.deals].slice(0, KEEP_DEALS);
  const total = made.reduce((n, d) => n + d.cut, 0);
  addNews(state, {
    date,
    kind: 'career',
    link: 'agency',
    title: `${agency.name}: ${made.length} deal${made.length > 1 ? 's' : ''} brokered (+${formatUSD(total)})`,
    body: made
      .map((d) => {
        const p = state.players[d.playerId];
        const a = state.assistants.find((x) => x.id === d.assistantId)!;
        return `${name(a)}: ${p ? `${p.firstName} ${p.lastName}` : 'a player'} to ${state.clubs[d.clubId]!.name}${d.fee ? ` for ${formatUSD(d.fee)}` : ' on a free'} (cut ${formatUSD(d.cut)}).`;
      })
      .join(' '),
  });
}
