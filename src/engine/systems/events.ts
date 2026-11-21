import { addDays, ageOn, formatDate, makeDate, type GameDate } from '../core/calendar';
import type { CityId, PlayerId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng } from '../core/rng';
import type { ScoutingEvent, ScoutingEventKind } from '../model/event';
import type { Country } from '../model/geography';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { knowledgeLevel, learn } from './knowledge';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';

/**
 * The scouting calendar: tournaments, trial days and a showcase where many players can be seen at once.
 * Be in the city while it's on, pay for a ticket, spend the days, and you know all of them better.
 */

const KIND: Record<ScoutingEventKind, { days: number; ticket: number; size: number; label: string }> = {
  'youth-tournament': { days: 3, ticket: 150, size: 16, label: 'Youth tournament' },
  'u20-championship': { days: 4, ticket: 400, size: 20, label: 'U20 championship' },
  'trial-day': { days: 1, ticket: 60, size: 12, label: 'Trial day' },
  showcase: { days: 2, ticket: 100, size: 20, label: 'Showcase for released players' },
};
/** What a day watching at an event teaches you about each player there. */
const EVENT_GAIN = 16;
const EVENT_CAP = 70;
const REMIND_DAYS = 14;

export const eventEnd = (e: ScoutingEvent): GameDate => addDays(e.start, e.days - 1);
export const eventLabel = (k: ScoutingEventKind) => KIND[k].label;

/** The biggest club's city in a country: where events are held. */
function hostCity(state: GameState, country: Country, rng: Rng, lowerLeague = false): CityId {
  const clubs = Object.values(state.clubs).filter((c) => c.countryId === country.id && (!lowerLeague || state.leagues[c.leagueId]!.level >= 3));
  const pool = clubs.length ? clubs : Object.values(state.clubs).filter((c) => c.countryId === country.id);
  return rng.weighted(pool, (c) => (lowerLeague ? 1 : c.reputation)).cityId;
}

/** Draw the season's events once (also for older saves, the first day this runs). */
export function ensureSeasonEvents(state: GameState) {
  const year = state.season.year;
  if (state.events?.some((e) => e.season === year)) return;
  const scout = state.scout;
  if (!scout) return;
  const rng = Rng.derive(state.seed, `events:${year}`);
  const home = state.countries[scout.homeCountry]!;
  const countries = Object.values(state.countries);
  const continent = countries.filter((c) => c.continentId === home.continentId);
  const strong = (cs: Country[]) => (c: Country) => cs.includes(c) ? Math.pow(c.strength, 1.5) : 0;
  const events: ScoutingEvent[] = [];
  const add = (kind: ScoutingEventKind, country: Country, start: GameDate, name: string, lowerLeague = false) => {
    events.push({
      id: year * 100 + events.length,
      kind,
      name,
      season: year,
      cityId: hostCity(state, country, rng, lowerLeague),
      countryId: country.id,
      start,
      days: KIND[kind].days,
      ticket: usd(KIND[kind].ticket),
      size: KIND[kind].size,
    });
  };
  // A month from the season's middle, a day in it.
  const date = (month: number) => makeDate(month >= 7 ? year : year + 1, month, rng.int(3, 24));
  const youthMonths = [9, 11, 2];
  for (const m of youthMonths) {
    const c = rng.chance(0.5) ? home : rng.weighted(continent, strong(continent));
    add('youth-tournament', c, date(m), `${c.name} U19 Cup`);
  }
  const host = rng.weighted(continent, strong(continent));
  add('u20-championship', host, date(rng.pick([10, 3])), `${host.name === home.name ? '' : `${host.name} `}U20 Championship`.trim());
  for (const m of [8, 1, 4]) {
    const c = rng.chance(0.65) ? home : rng.weighted(continent, strong(continent));
    add('trial-day', c, date(m), `${c.name} open trial day`, true);
  }
  add('showcase', home, makeDate(year + 1, 6, rng.int(5, 20)), `${home.name} free-agent showcase`);
  events.sort((a, b) => a.start - b.start);
  // Keep only the current season's (the old ones are history).
  state.events = [...(state.events ?? []).filter((e) => e.season === year - 1 && e.seen), ...events];
}

/** Who you'll see there: picked when you attend, so released players and new academy graduates count. */
function participants(state: GameState, e: ScoutingEvent): PlayerId[] {
  const rng = Rng.derive(state.seed, `event-players:${e.id}`);
  const country = state.countries[e.countryId]!;
  const inCountry = (p: Player) => (p.clubId ? state.clubs[p.clubId]!.countryId === e.countryId : p.nationality === e.countryId);
  const inContinent = (p: Player) => {
    const cid = p.clubId ? state.clubs[p.clubId]!.countryId : p.nationality;
    return state.countries[cid]?.continentId === country.continentId;
  };
  const age = (p: Player) => ageOn(p.birthDate, state.date);
  let pool: Player[];
  let weight: (p: Player) => number;
  switch (e.kind) {
    case 'youth-tournament':
      pool = Object.values(state.players).filter((p) => p.clubId && inCountry(p) && age(p) >= 16 && age(p) <= 19);
      weight = (p) => Math.pow(p.hidden.potential / 50, 3);
      break;
    case 'u20-championship':
      pool = Object.values(state.players).filter((p) => p.clubId && inContinent(p) && age(p) <= 20);
      weight = (p) => Math.pow(p.hidden.potential / 50, 5);
      break;
    case 'trial-day':
      pool = Object.values(state.players).filter(
        (p) => inCountry(p) && age(p) >= 18 && age(p) <= 28 && (!p.clubId || (state.leagues[state.clubs[p.clubId]!.leagueId]!.level >= 3 && p.stats.apps <= 3)),
      );
      weight = (p) => (p.clubId ? 1 : 2);
      break;
    case 'showcase':
      pool = state.freeAgents.map((id) => state.players[id]!).filter((p) => p && inCountry(p) && age(p) <= 32);
      weight = () => 1;
      break;
  }
  const picked: PlayerId[] = [];
  const left = [...pool];
  while (picked.length < e.size && left.length) {
    const p = rng.weighted(left, weight);
    picked.push(p.id);
    left.splice(left.indexOf(p), 1);
  }
  return picked;
}

export interface EventCheck {
  ok: boolean;
  reason?: string;
}

export function eventStatus(state: GameState, e: ScoutingEvent): 'upcoming' | 'on' | 'over' {
  return state.date < e.start ? 'upcoming' : state.date <= eventEnd(e) ? 'on' : 'over';
}

export function attendCheck(state: GameState, e: ScoutingEvent): EventCheck {
  const scout = state.scout;
  if (!scout) return { ok: false, reason: 'Set up your scout first.' };
  if (e.seen) return { ok: false, reason: 'You were there.' };
  const status = eventStatus(state, e);
  if (status === 'upcoming') return { ok: false, reason: `Starts ${formatDate(e.start)}.` };
  if (status === 'over') return { ok: false, reason: 'It is over.' };
  if (scout.location !== e.cityId) return { ok: false, reason: `You need to be in ${state.cities[e.cityId]!.name}.` };
  if (scout.money < e.ticket) return { ok: false, reason: `A ticket costs ${formatUSD(e.ticket)} but you only have ${formatUSD(scout.money)}.` };
  return { ok: true };
}

/** Attend for the rest of the event: pay, learn about everyone there. Returns the days it takes. */
export function attendEvent(state: GameState, id: number): { event: ScoutingEvent; days: number; seen: PlayerId[] } {
  const e = state.events?.find((x) => x.id === id);
  if (!e) throw new ScoutingError('That event is not on the calendar.');
  const check = attendCheck(state, e);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const scout = state.scout!;
  addLedger(state, { amount: usd(-e.ticket) as USD, kind: 'ticket', label: `${e.name}, ${state.cities[e.cityId]!.name}` });
  const seen = participants(state, e);
  const gain = EVENT_GAIN + Math.round(scout.skills.judgingAbility * 0.5);
  for (const pid of seen) learn(state, state.players[pid]!, gain, EVENT_CAP, state.date);
  e.seen = seen;
  e.attendedOn = state.date;
  return { event: e, days: Math.max(1, eventEnd(e) - state.date + 1), seen };
}

/** Daily: draw the season's events; remind you a fortnight before the ones worth the trip. */
export function eventsTick(state: GameState, date: GameDate) {
  if (!state.scout) return;
  ensureSeasonEvents(state);
  for (const e of state.events ?? []) {
    if (e.reminded || e.season !== state.season.year || e.start - date !== REMIND_DAYS) continue;
    e.reminded = true;
    const city = state.cities[e.cityId]!;
    addNews(state, {
      date,
      kind: 'career',
      title: `Coming up: ${e.name}`,
      body: `${eventLabel(e.kind)} in ${city.name}, ${formatDate(e.start)}${e.days > 1 ? ` for ${e.days} days` : ''}. About ${e.size} players to watch in one place; a ticket is ${formatUSD(e.ticket)}. Be in ${city.name} while it's on.`,
      countryId: e.countryId,
    });
  }
}

export function eventKnowledge(state: GameState, e: ScoutingEvent): { id: PlayerId; level: number }[] {
  return (e.seen ?? []).flatMap((id) => {
    const p = state.players[id];
    return p ? [{ id, level: knowledgeLevel(state, p) }] : [];
  });
}
