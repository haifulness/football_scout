import { addDays, formatDate, makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { Rng, clamp } from '../core/rng';
import type { RivalScout } from '../model/rival';
import type { GameState } from '../model/world-state';
import { addNews } from './season';

/**
 * One rival makes it personal. Early in your career a scout of about your standing notices you; from then on he
 * rises with you, works the same clubs, chases your players and pitches to your clients. Each season ends with a
 * head-to-head: win it and your name grows, lose it and his does. He and other rivals with a reason also play
 * dirty, spreading word at clubs that you pushed a flop on them.
 */

/** He appears once you have been at it this long, or have some name. */
const NOTICE_DAYS = 45;
const NOTICE_REP = 10;
/** He stays this far ahead of you when he can. */
const LEAD = 4;
const WIN_REP = 3;
const LOSE_REP = 2;
/** Standing a rumour costs at a club, how much meeting the coach wins back, and how long it lasts. */
export const SMEAR_STANDING = 10;
export const SMEAR_CLEARED = 5;
export const SMEAR_DAYS = 180;

const name = (r: RivalScout) => `${r.firstName} ${r.lastName}`;

export function nemesisOf(state: GameState): RivalScout | undefined {
  const id = state.scout?.nemesis?.rivalId;
  return id === undefined ? undefined : state.rivals.find((r) => r.id === id);
}

export const isNemesis = (state: GameState, r: RivalScout) => state.scout?.nemesis?.rivalId === r.id;

/** A freelancer from home of about your standing (a little ahead), never your mentor. */
function pickNemesis(state: GameState): RivalScout | undefined {
  const scout = state.scout!;
  const target = scout.reputation + LEAD;
  return state.rivals
    .filter((r) => r.employment.mode === 'freelance' && r.nationality === scout.homeCountry && r.id !== scout.mentor?.rivalId && !r.grudge)
    .sort((a, b) => Math.abs(a.reputation - target) - Math.abs(b.reputation - target))[0];
}

/** This season's head-to-head: signings each, and what he's taken off you. */
export function headToHead(state: GameState, asOf: GameDate = state.date) {
  const scout = state.scout!;
  const r = nemesisOf(state);
  const n = scout.nemesis;
  if (!r || !n) return undefined;
  const { year, month } = toParts(asOf);
  const since = makeDate(month >= 7 ? year : year - 1, 7, 1);
  const you = state.deals.filter((d) => d.stage === 'completed' && !d.mandateId && !d.forEmployer && (d.completedOn ?? -Infinity) >= since && (d.completedOn ?? Infinity) <= asOf).length;
  const him = (r.signed ?? []).filter((x) => x.date >= since && x.date <= asOf).length;
  return { you, him, steals: n.steals, clientsTaken: n.clientsTaken, yourRep: Math.round(scout.reputation), hisRep: Math.round(r.reputation), since };
}

/** Called when a rival takes a deal or a client from you. */
export function nemesisScored(state: GameState, r: RivalScout, what: 'steal' | 'client') {
  const n = state.scout?.nemesis;
  if (!n || n.rivalId !== r.id) return;
  if (what === 'steal') n.steals++;
  else n.clientsTaken++;
}

/** The 1st of July: who won the season. */
export function nemesisSeason(state: GameState, date: GameDate) {
  const scout = state.scout;
  const r = nemesisOf(state);
  const n = scout?.nemesis;
  if (!scout || !r || !n || state.careerOver) return;
  const h = headToHead(state, addDays(date, -1))!;
  // A season he only just started watching you doesn't count.
  if (n.since > addDays(date, -120)) {
    n.steals = 0;
    n.clientsTaken = 0;
    return;
  }
  const won = h.you > h.him || (h.you === h.him && scout.reputation >= r.reputation);
  const year = toParts(date).year - 1;
  n.history = [{ year, you: h.you, him: h.him, won }, ...n.history].slice(0, 10);
  if (won) {
    n.won++;
    scout.reputation = clamp(scout.reputation + WIN_REP, 0, 100);
    r.reputation = clamp(r.reputation - 1, 0, 100);
  } else {
    n.lost++;
    scout.reputation = clamp(scout.reputation - LOSE_REP, 0, 100);
    r.reputation = clamp(r.reputation + 2, 0, 100);
  }
  addNews(state, {
    date,
    kind: 'career',
    forYou: true,
    link: 'rivals',
    title: won ? `You beat ${name(r)} this season` : `${name(r)} had the better season`,
    body: `Signings: you ${h.you}, ${name(r)} ${h.him}.${n.steals ? ` He took ${n.steals} deal${n.steals > 1 ? 's' : ''} off you.` : ''}${n.clientsTaken ? ` He took ${n.clientsTaken} client${n.clientsTaken > 1 ? 's' : ''} from you.` : ''} ${won ? `The circuit notices (+${WIN_REP} reputation).` : `People talk about him, not you (−${LOSE_REP} reputation).`}`,
  });
  n.steals = 0;
  n.clientsTaken = 0;
  // He keeps up.
  r.skill = Math.min(18, r.skill + 1);
}

// ── Dirty tricks ────────────────────────────────────────────────────────

/** Standing a rumour is costing you at a club right now. */
/** At your employer a rumour fades faster: they know you. */
export const SMEAR_DAYS_EMPLOYER = 60;
function smearDays(state: GameState, clubId: ClubId): number {
  const e = state.scout?.employment;
  return e?.mode === 'fulltime' && e.clubId === clubId ? SMEAR_DAYS_EMPLOYER : SMEAR_DAYS;
}

export function smearPenalty(state: GameState, clubId: ClubId): number {
  const s = state.scout?.smears?.[clubId];
  return s && state.date - s.date < smearDays(state, clubId) ? s.amount : 0;
}

export function activeSmear(state: GameState, clubId: ClubId) {
  const s = state.scout?.smears?.[clubId];
  const days = smearDays(state, clubId);
  return s && state.date - s.date < days ? { ...s, until: addDays(s.date, days) } : undefined;
}

/** Meeting the coach: you set the record straight and win back part of what the rumour cost. */
export function clearSmear(state: GameState, clubId: ClubId): boolean {
  const s = state.scout?.smears?.[clubId];
  if (!s || s.cleared || state.date - s.date >= smearDays(state, clubId)) return false;
  s.cleared = true;
  s.amount = SMEAR_CLEARED;
  const club = state.clubs[clubId]!;
  addNews(state, {
    date: state.date,
    kind: 'career',
    title: `You set the record straight at ${club.name}`,
    body: `Over coffee you walk the coach through what really happened. He believes you, mostly: the rumour costs you less now, and it will fade.`,
    clubIds: [clubId],
  });
  return true;
}

/** Clubs where a rumour would hurt: yours first, then any where the coach knows you. */
function smearTargets(state: GameState): ClubId[] {
  const scout = state.scout!;
  const e = scout.employment;
  const mine = e.mode === 'freelance' ? e.clients : [e.clubId];
  const known = Object.values(state.clubs)
    .filter((c) => (scout.relationships[c.headCoachId] ?? 0) >= 15)
    .map((c) => c.id);
  return [...new Set([...mine, ...known])].filter((id) => !activeSmear(state, id));
}

function spreadRumour(state: GameState, r: RivalScout, rng: Rng, date: GameDate) {
  const scout = state.scout!;
  const targets = smearTargets(state);
  if (!targets.length) return;
  const sticks = 0.45;
  const clubId = targets[0] && rng.chance(0.7) ? targets[0] : rng.pick(targets);
  const club = state.clubs[clubId]!;
  if (!rng.chance(sticks)) return;
  scout.smears = { ...(scout.smears ?? {}), [clubId]: { rivalId: r.id, date, amount: SMEAR_STANDING } };
  r.styleKnown = true;
  addNews(state, {
    date,
    kind: 'career',
    forYou: true,
    link: 'rivals',
    title: `Word at ${club.name}: you pushed a flop on them`,
    body: `${name(r)} has been telling people at ${club.name} that your players don't last. The coach is cooler with you (−${SMEAR_STANDING} standing). Meet him to set the record straight before ${formatDate(addDays(date, SMEAR_DAYS))}, when it fades on its own.`,
    clubIds: [clubId],
  });
}

/** Monthly: the nemesis appears, keeps pace with you, and (with others who hold a grudge) plays dirty. */
export function nemesisTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  const { day } = toParts(date);
  if (day === 1) {
    if (!scout.nemesis) {
      const started = scout.startedOn ?? date;
      if (date - started < NOTICE_DAYS && scout.reputation < NOTICE_REP) return;
      const r = pickNemesis(state);
      if (!r) return;
      scout.nemesis = { rivalId: r.id, since: date, steals: 0, clientsTaken: 0, won: 0, lost: 0, history: [] };
      r.styleKnown = true;
      r.reputation = Math.max(r.reputation, scout.reputation + 1);
      addNews(state, {
        date,
        kind: 'career',
        forYou: true,
        link: 'rivals',
        title: `${name(r)} has noticed you`,
        body: `${name(r)}, a freelance scout of about your standing, has started turning up where you work. Expect him at your clubs, after your players, and in your clients' offices. Each season, the circuit will compare you.`,
      });
      return;
    }
    // He keeps a step ahead of you.
    const r = nemesisOf(state);
    if (r) r.reputation = clamp(r.reputation + (scout.reputation + LEAD - r.reputation) * 0.25, 0, 100);
  }
  if (day === 15) {
    const rng = Rng.derive(state.seed, `smears:${date}`);
    const nemesis = nemesisOf(state);
    if (nemesis && rng.chance(0.2)) spreadRumour(state, nemesis, rng, date);
    for (const r of state.rivals) if (r.grudge && r !== nemesis && rng.chance(0.2)) spreadRumour(state, r, rng, date);
  }
}
