import { addDays, ageOn, toParts, type GameDate } from '../core/calendar';
import type { CityId, ClubId, PlayerId } from '../core/ids';
import { formatUSD, usd } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { ClubTier } from '../model/club';
import type { Hunt, HuntClue } from '../model/hunt';
import type { Player } from '../model/player';
import type { RivalScout } from '../model/rival';
import type { GameState } from '../model/world-state';
import { learn, prodigyVisible } from './knowledge';
import { addNews } from './season';
import { addLedger, ScoutingError } from './scouting';

/** How long a whisper stays warm. */
export const HUNT_DAYS = 42;
/** Each Monday, the chance a new whisper reaches you (about three a season). */
const WEEKLY_CHANCE = 0.08;
/** Players you found keep rival scouts off for this long. */
const SHIELD_DAYS = 120;
const KEEP_ENDED = 12;

export type HuntMethod = 'calls' | 'visit';

const TIER_WORDS: Record<ClubTier, string> = {
  1: "in a big club's youth set-up",
  2: 'at an established club',
  3: 'at a mid-sized club',
  4: 'at a lower-league club',
  5: 'at a small non-league side',
};

const CONTACTS = [
  'A youth coach you know',
  'An old teammate',
  'A local journalist',
  'A taxi driver who never misses a game',
  'A kit man you met years ago',
  'An agent friend',
];

/** "a 16-year-old", "an 18-year-old". */
export const aYearOld = (age: number) => `${age === 8 || age === 11 || age === 18 ? 'an' : 'a'} ${age}-year-old`;

function rivalClubs(r: RivalScout): ClubId[] {
  return r.employment.mode === 'fulltime' ? [r.employment.clubId] : r.employment.clients;
}

function clue(hunt: Hunt, date: GameDate, text: string, tone: HuntClue['tone'] = 'clue') {
  hunt.clues.push({ date, text, tone });
}

/** Where he plays: the club's city, region and country. */
export function huntPlace(state: GameState, hunt: Hunt) {
  const p = state.players[hunt.playerId];
  const club = p?.clubId ? state.clubs[p.clubId] : undefined;
  if (!p || !club) return undefined;
  const city = state.cities[club.cityId]!;
  return { player: p, club, cityId: city.id, regionId: city.regionId, countryId: club.countryId };
}

/** Is the scout standing in the area the trail currently points to? */
export function inHuntArea(state: GameState, hunt: Hunt): boolean {
  const place = huntPlace(state, hunt);
  const here = state.cities[state.scout!.location]!;
  if (!place) return false;
  if (hunt.stage === 0) return here.countryId === place.countryId;
  if (hunt.stage === 1) return here.regionId === place.regionId;
  return here.id === place.cityId;
}

/** A city to travel to for the next step: his own city once you know it, else the main football city of the area. */
export function huntDestination(state: GameState, hunt: Hunt): CityId | undefined {
  const place = huntPlace(state, hunt);
  if (!place) return undefined;
  if (hunt.stage >= 2) return place.cityId;
  const clubs = Object.values(state.clubs).filter((c) =>
    hunt.stage === 0 ? c.countryId === place.countryId : state.cities[c.cityId]!.regionId === place.regionId,
  );
  return clubs.sort((a, b) => b.reputation - a.reputation)[0]?.cityId;
}

/** What working the trail costs and how likely it is to turn something up. */
export function huntOptions(state: GameState, hunt: Hunt) {
  const scout = state.scout!;
  const place = huntPlace(state, hunt);
  const costIndex = place ? state.countries[place.countryId]!.costIndex : 1;
  const market = place ? (scout.regionKnowledge[place.countryId] ?? 0) : 0;
  const calls = {
    cost: usd(Math.round(((120 + 60 * hunt.stage) * costIndex) / 10) * 10),
    days: 2,
    chance: clamp(0.3 + scout.skills.network * 0.02 + market / 250 - hunt.stage * 0.05, 0.15, 0.85),
  };
  const visit = {
    cost: usd(Math.round(((150 + 50 * hunt.stage) * costIndex) / 10) * 10),
    days: 1,
    chance: clamp(0.75 + scout.skills.network * 0.01, 0.75, 0.95),
    inArea: inHuntArea(state, hunt),
    destination: huntDestination(state, hunt),
  };
  return { calls, visit };
}

/** Players whose hunt you won recently: rival scouts leave them to you for a while. */
export function shieldedPlayers(state: GameState, date: GameDate): PlayerId[] {
  return (state.hunts ?? []).filter((h) => h.status === 'found' && h.endedOn !== undefined && date - h.endedOn < SHIELD_DAYS).map((h) => h.playerId);
}

function pickTarget(state: GameState, rng: Rng, date: GameDate): Player | undefined {
  const scout = state.scout!;
  const rep = scout.reputation;
  const homeContinent = state.countries[scout.homeCountry]!.continentId;
  const taken = new Set<PlayerId>([...state.hunts.map((h) => h.playerId), ...state.rivals.flatMap((r) => (r.pursuit ? [r.pursuit.playerId] : []))]);
  // Bigger names hear about rarer talents, further away.
  const minTier: ClubTier = rep >= 50 ? 1 : rep >= 20 ? 2 : 3;
  const candidates = Object.values(state.players).filter((p) => {
    if (!p.isProdigy || !p.clubId || taken.has(p.id) || state.pool[p.id] || prodigyVisible(state, p)) return false;
    const club = state.clubs[p.clubId]!;
    if (club.tier < minTier || ageOn(p.birthDate, date) > 19) return false;
    return rep >= 20 || state.countries[club.countryId]!.continentId === homeContinent;
  });
  if (!candidates.length) return undefined;
  // Prefer the higher ceilings as your standing grows.
  return rng.weighted(candidates, (p) => Math.pow(p.hidden.potential / 70, 1 + rep / 25));
}

export function spawnHunt(state: GameState, date: GameDate, rng: Rng): Hunt | undefined {
  const scout = state.scout!;
  const p = pickTarget(state, rng, date);
  if (!p) return undefined;
  const club = state.clubs[p.clubId!]!;
  const country = state.countries[club.countryId]!;
  const free = state.rivals.filter((r) => !state.hunts.some((h) => h.status === 'active' && h.rivals.some((x) => x.rivalId === r.id)));
  const count = Math.min(free.length, scout.reputation >= 30 ? 2 : 1);
  const chosen: RivalScout[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng.weighted(
      free.filter((x) => !chosen.includes(x)),
      (x) => x.skill + (x.nationality === club.countryId ? 8 : 0),
    );
    chosen.push(r);
  }
  const age = ageOn(p.birthDate, date);
  const hunt: Hunt = {
    id: state.counters.hunt++,
    playerId: p.id,
    position: p.naturalPosition,
    age,
    startedOn: date,
    expiresOn: addDays(date, HUNT_DAYS),
    stage: 0,
    clues: [],
    rivals: chosen.map((r) => ({ rivalId: r.id, progress: rng.float(0, 0.1) })),
    status: 'active',
  };
  const who = rng.pick(CONTACTS);
  clue(
    hunt,
    date,
    `${who}: "There's ${aYearOld(age)} ${p.naturalPosition} in ${country.name}, ${TIER_WORDS[club.tier]}. Nobody has looked at him properly yet."`,
  );
  state.hunts.unshift(hunt);
  addNews(state, {
    date,
    kind: 'career',
    forYou: true,
    link: 'hunts',
    title: `Whisper: ${aYearOld(age)} ${p.naturalPosition} in ${country.name}`,
    body: `${who} tells you about a hidden talent somewhere in ${country.name}. ${chosen.length ? `${chosen.length === 1 ? 'Another scout has' : `${chosen.length} other scouts have`} heard the same story.` : ''} The trail goes cold in six weeks.`,
    countryId: country.id,
  });
  return hunt;
}

function finish(state: GameState, hunt: Hunt, date: GameDate, how: string) {
  const place = huntPlace(state, hunt)!;
  const p = place.player;
  hunt.stage = 3;
  hunt.status = 'found';
  hunt.endedOn = date;
  clue(hunt, date, `${how} It's ${p.firstName} ${p.lastName} at ${place.club.name}.`, 'end');
  if (!state.pool[p.id]) state.pool[p.id] = { addedOn: date, source: 'manual', starred: true };
  else state.pool[p.id]!.starred = true;
  learn(state, p, 80, 80, date); // you've seen him properly: the prodigy reveal follows
  state.scout!.reputation = clamp(state.scout!.reputation + 1, 0, 100);
  addNews(state, {
    date,
    kind: 'career',
    forYou: true,
    link: 'hunts',
    title: `You found him: ${p.firstName} ${p.lastName}`,
    body: `${how} ${p.firstName} ${p.lastName} (${hunt.age}, ${p.naturalPosition}) plays for ${place.club.name}. The other scouts drop the chase, and rival scouts leave him to you for the next four months.`,
    playerIds: [p.id],
    clubIds: [place.club.id],
  });
}

/** Work the trail: phone your contacts (from anywhere) or ask around in person (in the area). Returns days spent. */
export function huntAction(state: GameState, huntId: number, method: HuntMethod): { success: boolean; text: string; days: number } {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  const hunt = state.hunts.find((h) => h.id === huntId);
  if (!hunt || hunt.status !== 'active') throw new ScoutingError('That trail is no longer open.');
  const place = huntPlace(state, hunt);
  if (!place) {
    endHunt(hunt, state.date, 'cold', 'The whisper dried up: nobody has heard of him any more.');
    throw new ScoutingError('That trail has gone cold.');
  }
  const opt = huntOptions(state, hunt)[method];
  if (method === 'visit' && !huntOptions(state, hunt).visit.inArea)
    throw new ScoutingError(
      `You need to be in ${hunt.stage === 0 ? state.countries[place.countryId]!.name : hunt.stage === 1 ? `the ${state.regions[place.regionId]!.name} area` : state.cities[place.cityId]!.name} to ask around in person.`,
    );
  if (scout.money < opt.cost) throw new ScoutingError(`That costs ${formatUSD(opt.cost)} but you only have ${formatUSD(scout.money)}.`);
  addLedger(state, { amount: usd(-opt.cost), kind: 'meeting', label: `Following a whisper (${method === 'calls' ? 'calls' : 'asking around'})` });
  const rng = Rng.derive(state.seed, `hunt:${hunt.id}:${state.date}:${method}:${hunt.clues.length}`);
  if (!rng.chance(opt.chance)) {
    const text =
      method === 'calls'
        ? rng.pick([
            'Your calls go nowhere: nobody picks up, or nobody knows.',
            'A contact promises to ask around, then goes quiet.',
            'Two leads, both dead ends.',
          ])
        : rng.pick([
            'A wasted day: the ground you tried was the wrong one.',
            'You ask in three bars and a club shop. Nobody knows the kid.',
            'Wrong age group, wrong player. Close, but no.',
          ]);
    clue(hunt, state.date, text, 'miss');
    return { success: false, text, days: opt.days };
  }
  return { success: true, text: advance(state, hunt, method === 'calls' ? 'A contact comes through.' : 'Asking around pays off.'), days: opt.days };
}

/** One step closer: region, then city, then the name. */
function advance(state: GameState, hunt: Hunt, lead: string): string {
  const place = huntPlace(state, hunt)!;
  if (hunt.stage === 0) {
    hunt.stage = 1;
    const text = `${lead} He plays somewhere in the ${state.regions[place.regionId]!.name} area.`;
    clue(hunt, state.date, text);
    return text;
  }
  if (hunt.stage === 1) {
    hunt.stage = 2;
    const text = `${lead} It's a club in ${state.cities[place.cityId]!.name}.`;
    clue(hunt, state.date, text);
    return text;
  }
  finish(state, hunt, state.date, lead);
  return hunt.clues[hunt.clues.length - 1]!.text;
}

/** A search that turns him up ends the hunt in your favour. */
export function onSearchResults(state: GameState, ids: PlayerId[]) {
  for (const hunt of state.hunts) if (hunt.status === 'active' && ids.includes(hunt.playerId)) finish(state, hunt, state.date, 'Your search turns him up.');
}

function endHunt(hunt: Hunt, date: GameDate, status: 'lost' | 'cold', text: string) {
  hunt.status = status;
  hunt.endedOn = date;
  clue(hunt, date, text, 'end');
}

/** Daily: rivals close in, the trail cools; on Mondays a new whisper may arrive. */
export function huntTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  const rng = Rng.derive(state.seed, `hunts:${date}`);
  for (const hunt of state.hunts) {
    if (hunt.status !== 'active') continue;
    const place = huntPlace(state, hunt);
    if (!place || ageOn(place.player.birthDate, date) > 20) {
      endHunt(hunt, date, 'cold', 'The whisper dried up: he has moved on and nobody knows where.');
      continue;
    }
    for (const hr of hunt.rivals) {
      const r = state.rivals.find((x) => x.id === hr.rivalId);
      if (!r) continue;
      hr.progress = Math.min(1, hr.progress + (0.018 + r.skill * 0.0015) * rng.float(0.6, 1.4));
      // Half-way there, his trail shows: a free clue if it tells you something new.
      if (!hr.spotted && hr.progress >= 0.5) {
        hr.spotted = true;
        const area =
          hunt.stage === 0 ? `in the ${state.regions[place.regionId]!.name} area` : hunt.stage === 1 ? `in ${state.cities[place.cityId]!.name}` : undefined;
        clue(hunt, date, `${r.firstName} ${r.lastName} was seen ${area ?? 'nearby'}, asking questions. He is getting close.`, 'rival');
        if (area) hunt.stage = (hunt.stage + 1) as Hunt['stage'];
      }
      if (hr.progress >= 1 && hunt.status === 'active') {
        endHunt(hunt, date, 'lost', `${r.firstName} ${r.lastName} got there first: ${place.player.firstName} ${place.player.lastName} at ${place.club.name}.`);
        hunt.winnerId = r.id;
        // He now works the player for one of his clubs, like any chase (it can close in the next window).
        const clubs = rivalClubs(r).filter((id) => id !== place.club.id);
        if (clubs.length) r.pursuit = { playerId: place.player.id, clubId: clubs[0]!, startedOn: date, progress: 1, rumoured: true };
        addNews(state, {
          date,
          kind: 'career',
          forYou: true,
          link: 'hunts',
          title: `Beaten to it: ${place.player.firstName} ${place.player.lastName}`,
          body: `${r.firstName} ${r.lastName} found the ${hunt.age}-year-old first: ${place.player.firstName} ${place.player.lastName} at ${place.club.name}. You can still try to sign him, but you are now behind.`,
          playerIds: [place.player.id],
        });
      }
    }
    if (hunt.status === 'active' && date >= hunt.expiresOn) endHunt(hunt, date, 'cold', 'The trail has gone cold. Maybe the next whisper.');
  }
  // Keep the list short: open hunts and the last few that ended.
  const ended = state.hunts.filter((h) => h.status !== 'active');
  if (ended.length > KEEP_ENDED) {
    const drop = new Set(ended.slice(KEEP_ENDED).map((h) => h.id));
    state.hunts = state.hunts.filter((h) => !drop.has(h.id));
  }
  if (toParts(date).weekday === 1) {
    const open = state.hunts.filter((h) => h.status === 'active').length;
    if (open < (scout.reputation >= 40 ? 2 : 1) && rng.chance(WEEKLY_CHANCE)) spawnHunt(state, date, rng);
  }
}
