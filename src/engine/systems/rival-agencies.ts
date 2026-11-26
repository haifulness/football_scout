import { addDays, formatDate, toParts, type GameDate } from '../core/calendar';
import type { CountryId } from '../core/ids';
import { formatUSD, usd } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { RivalAgency } from '../model/agency';
import type { Assistant } from '../model/assistant';
import type { GameState } from '../model/world-state';
import { ScoutingError } from './scouting';
import { addNews } from './season';

/**
 * Once you run an agency, you're not the only one. Two or three rival agencies work your home market and follow
 * you abroad: where you share a country they beat you to some brokered deals, and now and then they make one of
 * your staff an offer. Match it, or lose him to them.
 */

const SEED_COUNT = 3;
/** Chance a rival agency follows you into a country where you have an office and it doesn't (monthly). */
const FOLLOW_CHANCE = 0.2;
/** Its chance to broker a signing in a country where it has a base (before yours). */
const brokerChance = (a: RivalAgency) => 0.01 + 0.004 * a.strength;
/** Offers to your staff: skill needed, monthly chance, the raise, how long you have to answer, and loyalty after a match. */
const OFFER_SKILL = 10;
const OFFER_DAYS = 14;
const LOYAL_DAYS = 180;
const RAISE = 1.3;
const COLORS = ['#e8505b', '#4fa3f7', '#f2b632', '#9b6bf2', '#2fc4a0', '#f07c3a'];
const KEEP_RECENT = 40;

const staffName = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;

function makeName(state: GameState, rng: Rng, taken: Set<string>): { name: string; shortName: string } {
  const surnames = rng.shuffle(state.rivals.map((r) => r.lastName));
  const forms = [
    (a: string) => `${a} Scouting`,
    (a: string, b: string) => `${a} & ${b}`,
    (a: string) => `${a} Sports Group`,
    (a: string) => `${a} Talent`,
  ];
  for (let i = 0; i < 20; i++) {
    const name = rng.pick(forms)(surnames[i % surnames.length]!, surnames[(i + 1) % surnames.length]!);
    if (taken.has(name)) continue;
    const shortName = name
      .split(/[\s&]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 4)
      .toUpperCase();
    return { name, shortName };
  }
  return { name: `Agency ${taken.size + 1}`, shortName: `A${taken.size + 1}` };
}

/** Countries with the most clubs (the markets agencies want), besides home. */
function bigMarkets(state: GameState, home: CountryId): CountryId[] {
  const n = new Map<CountryId, number>();
  for (const c of Object.values(state.clubs)) n.set(c.countryId, (n.get(c.countryId) ?? 0) + 1);
  return [...n.entries()]
    .filter(([id]) => id !== home)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
}

/** When you found your agency: the competition is already there. */
export function seedRivalAgencies(state: GameState) {
  if (state.rivalAgencies?.length || !state.scout) return;
  const rng = Rng.derive(state.seed, 'rival-agencies');
  const home = state.scout.homeCountry;
  const markets = bigMarkets(state, home);
  const taken = new Set<string>();
  state.rivalAgencies = [];
  for (let i = 0; i < SEED_COUNT; i++) {
    const { name, shortName } = makeName(state, rng, taken);
    taken.add(name);
    const abroad = rng.shuffle(markets).slice(0, rng.int(0, 2));
    state.rivalAgencies.push({
      id: i + 1,
      name,
      shortName,
      color: COLORS[i % COLORS.length]!,
      countries: [home, ...abroad],
      strength: rng.int(6, 12),
      foundedOn: state.date,
      brokered: 0,
      recent: [],
      hired: 0,
    });
  }
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'agency',
    title: `The competition: ${state.rivalAgencies.map((a) => a.name).join(', ')}`,
    body: `You're not the only agency in ${state.countries[home]!.name}. Where you share a country, they'll beat you to some deals, and they'll try to hire your best staff away.`,
  });
}

/** Rival agencies in a country. */
export const agenciesIn = (state: GameState, countryId: CountryId) => (state.rivalAgencies ?? []).filter((a) => a.countries.includes(countryId));

/** Does a rival agency broker this signing before your staff get a look? (called per signing in agencyOnSignings) */
export function rivalBrokers(state: GameState, countryId: CountryId, rng: Rng, date: GameDate): RivalAgency | undefined {
  for (const a of rng.shuffle(agenciesIn(state, countryId))) {
    if (!rng.chance(brokerChance(a))) continue;
    a.brokered++;
    a.recent = [date, ...a.recent].slice(0, KEEP_RECENT);
    return a;
  }
  return undefined;
}

/** Monthly: rivals follow you abroad, grow, and make offers to your staff. Daily: unanswered offers lapse. */
export function rivalAgencyTick(state: GameState, date: GameDate) {
  const agency = state.agency;
  if (!agency || !state.scout || state.careerOver) return;
  if (!state.rivalAgencies?.length) seedRivalAgencies(state);
  const rivals = state.rivalAgencies!;
  // An offer you didn't answer: he takes it.
  for (const a of [...state.assistants]) if (a.offer && date >= a.offer.until) leaveFor(state, a, 'You never answered, so he took their offer.');
  if (toParts(date).day !== 1) return;
  const rng = Rng.derive(state.seed, `rival-agencies:${date}`);
  // They follow you into your markets.
  for (const o of agency.offices) {
    if (agenciesIn(state, o.countryId).length || !rng.chance(FOLLOW_CHANCE)) continue;
    const a = rng.pick(rivals);
    a.countries.push(o.countryId);
    addNews(state, {
      date,
      kind: 'career',
      link: 'agency',
      title: `${a.name} open in ${state.countries[o.countryId]!.name}`,
      body: `Hot on your heels: ${a.name} have opened an office in ${state.countries[o.countryId]!.name}. Your staff there will have to beat them to deals.`,
    });
  }
  for (const a of rivals) a.strength = clamp(a.strength + 0.1, 1, 20);
  // Offers to your best staff.
  for (const s of state.assistants) {
    if (s.offer || s.skill < OFFER_SKILL || (s.loyalUntil !== undefined && date < s.loyalUntil)) continue;
    if (!rng.chance(0.03 + 0.01 * (s.skill - OFFER_SKILL))) continue;
    const by = rng.pick(rivals);
    const wage = usd(Math.round((s.wage * RAISE) / 10) * 10);
    s.offer = { agencyId: by.id, wage, until: addDays(date, OFFER_DAYS) };
    addNews(state, {
      date,
      kind: 'career',
      forYou: true,
      link: 'staff',
      title: `${by.name} want ${staffName(s)}`,
      body: `${by.name} have offered ${staffName(s)} ${formatUSD(wage)} a week (you pay ${formatUSD(s.wage)}). Match it by ${formatDate(s.offer.until)} or he goes to them.`,
    });
  }
}

function leaveFor(state: GameState, a: Assistant, why: string) {
  const by = state.rivalAgencies?.find((x) => x.id === a.offer?.agencyId);
  state.assistants = state.assistants.filter((x) => x.id !== a.id);
  if (by) {
    by.hired++;
    by.strength = clamp(by.strength + 1, 1, 20);
  }
  addNews(state, {
    date: state.date,
    kind: 'career',
    forYou: true,
    link: 'staff',
    title: `${staffName(a)} leaves for ${by?.name ?? 'a rival agency'}`,
    body: `${why} ${by ? `${by.name} are stronger for it.` : ''}`.trim(),
  });
}

/** Match a rival agency's offer: he stays on the new wage, and won't listen to another for a while. */
export function matchOffer(state: GameState, assistantId: number) {
  const a = state.assistants.find((x) => x.id === assistantId);
  if (!a?.offer) throw new ScoutingError('Nobody has made him an offer.');
  a.wage = a.offer.wage;
  a.offer = undefined;
  a.loyalUntil = addDays(state.date, LOYAL_DAYS);
}

/** Let him take the rival agency's offer. */
export function releaseToRival(state: GameState, assistantId: number) {
  const a = state.assistants.find((x) => x.id === assistantId);
  if (!a?.offer) throw new ScoutingError('Nobody has made him an offer.');
  leaveFor(state, a, 'You wished him well.');
}
