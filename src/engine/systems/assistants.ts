import { analysisWeek } from './club-asks';
import { revealTrait } from './character';
import { addDays, ageOn, toParts, type GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { culture } from '../data/names';
import { POSITIONS } from '../model/player';
import type { Assistant, AssistantBrief, AssistantCandidate } from '../model/assistant';
import type { SearchFilters } from '../model/scout';
import type { GameState } from '../model/world-state';
import { learn } from './knowledge';
import { ovrAt } from './ratings';
import { ScoutingError, addLedger, inLocation } from './scouting';
import { UNLOCKS, isUnlocked } from './unlocks';
import { addNews } from './season';
import { staffCapacity } from './agency';
import { jobWeek, officeWeek } from './delegation';

/**
 * Assistant scouts: staff who scan an area for you and feed
 * players into your pool, with their own (imperfect) rating of each.
 * They cost a weekly wage plus task expenses, and improve with work.
 */

export const MAX_TASK_WEEKS = 8;
const XP_PER_LEVEL = 12;
/** Skill of the junior scout a club gives its full-time scout, by tier. */
const JUNIOR_SKILL: Record<number, number> = { 5: 4, 4: 5, 3: 6, 2: 7, 1: 8 };

/** Staff you pay yourself (they count toward your limit; club staff don't). */
export const ownStaff = (state: GameState) => state.assistants.filter((a) => a.clubPaid === undefined);
/** Can you use the Staff screen: hired staff allowed, or a junior scout from your club. */
export const staffAvailable = (state: GameState) => isUnlocked(state, 'assistants') || state.assistants.some((a) => a.clubPaid !== undefined);

/** Full-time: the club puts a junior scout at your disposal. */
export function assignJuniorScout(state: GameState, clubId: ClubId) {
  if (state.assistants.some((a) => a.clubPaid === clubId)) return;
  const club = state.clubs[clubId]!;
  const country = state.countries[club.countryId]!;
  const rng = Rng.derive(state.seed, `junior:${clubId}:${state.date}`);
  const names = culture(country.culture);
  const skill = JUNIOR_SKILL[club.tier]! + rng.int(0, 1);
  const a: Assistant = {
    id: state.counters.assistant++,
    firstName: rng.pick(names.first),
    lastName: rng.pick(names.last),
    nationality: country.id,
    portraitSeed: rng.seed(),
    age: rng.int(21, 27),
    skill,
    speciality: country.id,
    wage: wageFor(skill),
    hiredOn: state.date,
    xp: 0,
    reports: 0,
    clubPaid: clubId,
  };
  state.assistants.push(a);
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'staff',
    title: `${club.name} give you a junior scout`,
    body: `${a.firstName} ${a.lastName} (skill ${skill}) joins you from the club's staff. The club pays him: send him on tasks or hand him briefs like any assistant. He stays at the club if you leave.`,
    clubIds: [club.id],
    countryId: club.countryId,
  });
}

/** Leaving a club: its junior scout stays behind (his work for you ends). */
export function releaseJuniorScouts(state: GameState) {
  state.assistants = state.assistants.filter((a) => a.clubPaid === undefined);
}
const BASE_EXPENSES = { city: 80, region: 160, country: 320 } as const;

export const staffLimit = (reputation: number) => (reputation >= 40 ? 3 : reputation >= 15 ? 2 : 1);
/** The best assistant your name can attract. */
export const skillCeiling = (reputation: number) => clamp(Math.round(7 + reputation / 8), 7, 19);
export const wageFor = (skill: number) => usd(Math.round((300 + Math.max(0, skill - 4) * 60) / 10) * 10);

const name = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;

function briefCountry(state: GameState, b: AssistantBrief) {
  const l = b.location;
  return l.scope === 'country' ? l.id : l.scope === 'region' ? state.regions[l.id]!.countryId : state.cities[l.id]!.countryId;
}

export function describeArea(state: GameState, b: AssistantBrief): string {
  const l = b.location;
  return l.scope === 'country' ? state.countries[l.id]!.name : l.scope === 'region' ? state.regions[l.id]!.name : state.cities[l.id]!.name;
}

// ── Job market ──────────────────────────────────────────────────────────

/** Monthly: a fresh handful of scouts looking for work, mostly from markets you know. */
export function refreshMarket(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout) return;
  const rng = Rng.derive(state.seed, `assistants:market:${date}`);
  const ceiling = skillCeiling(scout.reputation);
  const markets = [scout.homeCountry, ...Object.keys(scout.regionKnowledge)].filter(
    (id, i, all) => all.indexOf(id) === i && state.countries[id as keyof typeof state.countries],
  );
  const n = rng.int(4, 6);
  state.assistantMarket = Array.from({ length: n }, () => {
    const country = state.countries[(rng.chance(0.55) ? scout.homeCountry : rng.pick(markets)) as keyof typeof state.countries]!;
    const names = culture(country.culture);
    const skill = clamp(Math.round(rng.float(3, ceiling + 1)), 3, ceiling);
    return {
      id: state.counters.assistant++,
      firstName: rng.pick(names.first),
      lastName: rng.pick(names.last),
      nationality: country.id,
      portraitSeed: rng.seed(),
      age: rng.int(22, 58),
      skill,
      speciality: country.id,
      wage: usd(Math.round((wageFor(skill) * rng.float(0.9, 1.15)) / 10) * 10),
    } satisfies AssistantCandidate;
  });
}

export function hireAssistant(state: GameState, candidateId: number): Assistant {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  if (!isUnlocked(state, 'assistants')) throw new ScoutingError(`Assistants want to work for a name they know (reputation ${UNLOCKS[0]!.reputation}).`);
  const c = state.assistantMarket.find((x) => x.id === candidateId);
  if (!c) throw new ScoutingError('That scout has taken another job.');
  const limit = staffCapacity(state);
  if (ownStaff(state).length >= limit)
    throw new ScoutingError(`${state.agency ? 'Your offices have room for' : 'Your reputation supports'} ${limit} assistant${limit > 1 ? 's' : ''} at most.`);
  if (scout.money < c.wage) throw new ScoutingError(`You need at least a week's wage (${formatUSD(c.wage)}) in the bank to hire.`);
  state.assistantMarket = state.assistantMarket.filter((x) => x.id !== c.id);
  const a: Assistant = { ...c, hiredOn: state.date, xp: 0, reports: 0 };
  state.assistants.push(a);
  return a;
}

/** Let him go: one week's wage as notice. */
export function fireAssistant(state: GameState, id: number) {
  const a = state.assistants.find((x) => x.id === id);
  if (!a) return;
  if (a.clubPaid !== undefined) throw new ScoutingError(`${name(a)} works for the club, not for you: he stays while you're there.`);
  addLedger(state, { amount: usd(-a.wage), kind: 'assistant', label: `Notice pay: ${name(a)}` });
  state.assistants = state.assistants.filter((x) => x.id !== id);
}

// ── Tasks ───────────────────────────────────────────────────────────────

export function taskExpenses(state: GameState, a: Assistant, b: AssistantBrief): USD {
  const country = briefCountry(state, b);
  const local = country === a.speciality ? 0.7 : 1;
  return usd(Math.round((BASE_EXPENSES[b.location.scope] * state.countries[country]!.costIndex * local) / 10) * 10);
}

function validateBrief(b: AssistantBrief, weeks: number) {
  if (!['country', 'region', 'city'].includes(b.location.scope)) throw new ScoutingError('Send him to a country, region or city.');
  if (b.positions.length > 3) throw new ScoutingError('Pick at most 3 positions.');
  if (b.positions.some((p) => !POSITIONS.includes(p))) throw new ScoutingError('Unknown position.');
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_TASK_WEEKS) throw new ScoutingError(`A task runs 1–${MAX_TASK_WEEKS} weeks.`);
}

export function assignTask(state: GameState, id: number, brief: AssistantBrief, weeks: number) {
  const a = state.assistants.find((x) => x.id === id);
  if (!a) throw new ScoutingError('No such assistant.');
  if (a.officeId !== undefined) throw new ScoutingError(`${name(a)} works at your agency's office. Take him off office duty first.`);
  if (a.job) throw new ScoutingError(`${name(a)} is handling one of your briefs or sales. Take it back first.`);
  if (a.analysis) throw new ScoutingError(`${name(a)} is studying a club for you.`);
  validateBrief(brief, weeks);
  a.task = {
    ...brief,
    positions: [...brief.positions],
    startedOn: state.date,
    endsOn: addDays(state.date, weeks * 7),
    weeks,
    weeklyExpenses: taskExpenses(state, a, brief),
    found: 0,
  };
}

export function recallAssistant(state: GameState, id: number) {
  const a = state.assistants.find((x) => x.id === id);
  if (a?.task) finishTask(state, a, true);
}

function finishTask(state: GameState, a: Assistant, recalled: boolean) {
  const t = a.task!;
  a.task = undefined;
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'pool-assistants',
    title: `${name(a)} reports back from ${describeArea(state, t)}`,
    body: `${recalled ? 'Recalled early. ' : ''}${t.found ? `${t.found} player${t.found > 1 ? 's' : ''} added to your pool with his ratings. Check them yourself before you pitch: his eye isn't yours.` : 'Nobody worth reporting.'}`,
  });
}

/** One week of scanning: a few players he rates highest, with his (noisy) rating. */
function scanWeek(state: GameState, a: Assistant, rng: Rng) {
  const t = a.task!;
  const local = briefCountry(state, t) === a.speciality;
  const eye = a.skill + (local ? 3 : 0);
  const noise = (23 - eye) / 3; // 6.7 at skill 3, 1.0 at 20 at home
  const f: SearchFilters = {
    location: t.location,
    positions: t.positions,
    age: t.age,
    value: t.maxValue ? [0, t.maxValue] : undefined,
    attributes: [],
    includeFreeAgents: true,
  };
  const seen: { id: PlayerId; rating: number; score: number }[] = [];
  for (const p of Object.values(state.players)) {
    if (state.pool[p.id] || !inLocation(state, p, f)) continue;
    if (t.positions.length && !t.positions.some((pos) => (p.positions[pos] ?? 0) >= 0.75)) continue;
    const age = ageOn(p.birthDate, state.date);
    if (t.age && (age < t.age[0] || age > t.age[1])) continue;
    if (t.maxValue !== undefined && p.value > t.maxValue) continue;
    const pos = t.positions.find((x) => (p.positions[x] ?? 0) >= 0.75) ?? p.naturalPosition;
    const rating = Math.round(clamp(ovrAt(p, pos) + rng.gaussian(0, noise), 1, 99));
    // Young players get a nudge: assistants love a prospect.
    seen.push({ id: p.id, rating, score: rating + (age <= 20 ? 3 : 0) });
  }
  seen.sort((x, y) => y.score - x.score);
  const n = 1 + Math.floor(eye / 6) + (rng.chance(0.5) ? 1 : 0);
  for (const s of seen.slice(0, n)) {
    const p = state.players[s.id]!;
    learn(state, p, 8 + Math.round(a.skill / 2), 20 + a.skill, state.date);
    revealTrait(state, p, 0.1 + a.skill / 80, `assistant:${a.id}`);
    state.pool[p.id] = {
      addedOn: state.date,
      source: 'assistant',
      starred: false,
      report: { assistantId: a.id, by: name(a), rating: s.rating, date: state.date },
    };
    t.found++;
    a.reports++;
  }
}

/** Mondays: wages, task expenses, a week of scanning, growth. */
export function assistantTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  const { day, weekday } = toParts(date);
  if (day === 1 || !state.assistantMarket.length) refreshMarket(state, date);
  if (weekday !== 1 || !state.assistants.length) return;
  const rng = Rng.derive(state.seed, `assistants:${date}`);
  for (const a of state.assistants) {
    if (a.clubPaid === undefined) addLedger(state, { amount: usd(-a.wage), kind: 'assistant', label: `Wage: ${name(a)}` });
    if (a.job) {
      jobWeek(state, a, rng);
      if (a.xp >= XP_PER_LEVEL) levelUp(state, a, date);
      continue;
    }
    if (analysisWeek(state, a, date)) continue;
    if (!a.task) {
      // Office work builds an eye too, more slowly than the field.
      if (a.officeId !== undefined) {
        if (rng.chance(0.5)) a.xp++;
        officeWeek(state, a, date, rng);
      }
      continue;
    }
    addLedger(state, { amount: usd(-a.task.weeklyExpenses), kind: 'assistant-task', label: `Task expenses: ${name(a)} in ${describeArea(state, a.task)}` });
    scanWeek(state, a, rng);
    if (++a.xp >= XP_PER_LEVEL) levelUp(state, a, date);
    if (date >= a.task.endsOn) finishTask(state, a, false);
  }
}

function levelUp(state: GameState, a: Assistant, date: GameDate) {
  if (a.skill >= 20) return;
  a.xp = 0;
  a.skill++;
  // Club staff are on the club's pay scale: no raise to ask you for.
  if (a.clubPaid === undefined) a.wage = usd(Math.round((a.wage * 1.08) / 10) * 10);
  addNews(state, {
    date,
    kind: 'career',
    link: 'staff',
    title: `${name(a)} is improving`,
    body:
      a.clubPaid === undefined
        ? `Weeks in the field have sharpened his eye (skill ${a.skill}). He asks for a raise: now ${formatUSD(a.wage)} a week.`
        : `Weeks in the field have sharpened his eye (skill ${a.skill}).`,
  });
}
