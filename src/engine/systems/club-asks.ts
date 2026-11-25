import { addNews } from './season';
import type { GameDate } from '../core/calendar';
import type { ClubId, PlayerId, StaffId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { clamp, hashString } from '../core/rng';
import type { ClubTier } from '../model/club';
import { POSITION_GROUP, type Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { learnClub } from './club-read';
import { formationPositions } from './deals';
import { meetingInfo } from './fieldwork';
import { placedByYou } from './settling';
import { ScoutingError, addLedger } from './scouting';

/**
 * Finding out a club's needs from people: the head coach himself (exact, but he decides whether you're worth
 * telling, and remembers if he said no), the players you know there (their own part of the pitch, for a phone call),
 * and rival scouts (an even swap, except that he then knows what you're after).
 */

/** Reputation a coach at a club of this tier expects before he opens up. */
const ASK_REPUTATION: Record<ClubTier, number> = { 1: 50, 2: 35, 3: 20, 4: 10, 5: 5 };
const COACH_READ = 92;
/** After a refusal he won't be asked again, and is warier of your pitches, for this long. */
export const REFUSAL_DAYS = 120;
/** How much warier (sign-off log-odds, about 7 points at even odds). */
export const REFUSAL_SIGNOFF = 0.3;
const REFUSAL_COST = 8;

const PLAYER_RAPPORT = 40;
const PLAYER_READ = 75;
const PLAYER_EVERY = 30;

const RIVAL_READ = 80;
const RIVAL_EVERY = 60;
/** He knows what you're after: he goes after your players this much more often, for this long. */
export const RIVAL_TIP_DAYS = 90;

const roll = (state: GameState, key: string) => hashString(`${state.seed}:${key}:${state.date}`) / 4294967296;

// ── The head coach ──────────────────────────────────────────────────────

/** He turned you down lately: until when. */
export function refusedUntil(state: GameState, coachId: StaffId): GameDate | undefined {
  const on = state.scout?.coachRefused?.[coachId];
  return on !== undefined && state.date - on < REFUSAL_DAYS ? ((on + REFUSAL_DAYS) as GameDate) : undefined;
}

export function askCoachCheck(state: GameState, clubId: ClubId): { ok: boolean; reason?: string; chance: number; cost: USD } {
  const scout = state.scout!;
  const club = state.clubs[clubId]!;
  const coach = state.officials[club.headCoachId]!;
  const info = meetingInfo(state, { kind: 'official', id: coach.id });
  const rel = scout.relationships[coach.id] ?? 0;
  const chance = clamp(0.15 + rel / 80 + (scout.reputation - ASK_REPUTATION[club.tier]) / 50, 0.05, 0.95);
  const until = refusedUntil(state, coach.id);
  if (until !== undefined) return { ok: false, reason: `He told you no; he won't discuss it again for a while.`, chance, cost: info.cost };
  if (!info.allowed) return { ok: false, reason: `He won't meet a scout of your standing yet (reputation ${info.requiredReputation}).`, chance, cost: info.cost };
  if (!info.inPlace) return { ok: false, reason: `Ask him in person: be in ${state.cities[club.cityId]!.name}.`, chance, cost: info.cost };
  if (scout.money < info.cost) return { ok: false, reason: `The meeting costs ${formatUSD(info.cost)}.`, chance, cost: info.cost };
  return { ok: true, chance, cost: info.cost };
}

/** Sit down with the coach and ask what he needs. Takes a day (the caller advances time). */
export function askCoach(state: GameState, clubId: ClubId): { told: boolean; message: string } {
  const check = askCoachCheck(state, clubId);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const scout = state.scout!;
  const club = state.clubs[clubId]!;
  const coach = state.officials[club.headCoachId]!;
  addLedger(state, { amount: usd(-check.cost), kind: 'meeting', label: `Meeting: ${coach.firstName} ${coach.lastName} (Head Coach)` });
  scout.lastMet[coach.id] = state.date;
  if (roll(state, `ask-coach:${clubId}`) < check.chance) {
    learnClub(state, clubId, COACH_READ, state.date);
    scout.relationships[coach.id] = clamp((scout.relationships[coach.id] ?? 0) + 2, 0, 100);
    return { told: true, message: `${coach.lastName} walks you through his squad and where he wants to strengthen. You know exactly what ${club.name} need.` };
  }
  scout.relationships[coach.id] = clamp((scout.relationships[coach.id] ?? 0) - REFUSAL_COST, 0, 100);
  scout.coachRefused = { ...scout.coachRefused, [coach.id]: state.date };
  return {
    told: false,
    message: `${coach.lastName} doesn't discuss his squad with scouts he barely knows. He won't forget you asked: for a few months he's warier of your pitches.`,
  };
}

// ── Players you know ────────────────────────────────────────────────────

/** Players at this club who would tell you: the ones you placed there, or know well. */
export function insidePlayers(state: GameState, clubId: ClubId): Player[] {
  const scout = state.scout!;
  return state.clubs[clubId]!.squad.map((id) => state.players[id]!).filter((p) => p && (placedByYou(state, p) || (scout.rapport[p.id] ?? 0) >= PLAYER_RAPPORT));
}

export function askPlayerCheck(state: GameState, playerId: PlayerId): { ok: boolean; reason?: string } {
  const p = state.players[playerId];
  if (!p?.clubId) return { ok: false, reason: 'He has no club.' };
  if (!insidePlayers(state, p.clubId).some((x) => x.id === p.id)) return { ok: false, reason: 'He doesn’t know you well enough to talk about his club.' };
  const last = state.scout!.playerTips?.[playerId];
  if (last !== undefined && state.date - last < PLAYER_EVERY) return { ok: false, reason: 'You called him recently.' };
  return { ok: true };
}

/** A phone call: he tells you how things stand in his part of the pitch. Free, no time. */
export function askPlayer(state: GameState, playerId: PlayerId): string {
  const check = askPlayerCheck(state, playerId);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const p = state.players[playerId]!;
  const club = state.clubs[p.clubId!]!;
  const group = POSITION_GROUP[p.naturalPosition];
  const lines = formationPositions(club).filter((x) => POSITION_GROUP[x] === group);
  for (const pos of lines) learnClub(state, club.id, PLAYER_READ, state.date, pos);
  state.scout!.playerTips = { ...state.scout!.playerTips, [playerId]: state.date };
  const area = group === 'GK' ? 'the goalkeepers' : group === 'DEF' ? 'the defence' : group === 'MID' ? 'midfield' : 'the attack';
  return `${p.firstName} ${p.lastName} tells you how things stand in ${area} at ${club.name}.`;
}

// ── Rival scouts ────────────────────────────────────────────────────────

/** Rivals who work for this club and would trade what they know. */
export function swapRivals(state: GameState, clubId: ClubId) {
  return state.rivals.filter((r) => (r.employment.mode === 'fulltime' ? r.employment.clubId === clubId : r.employment.clients.includes(clubId)));
}

export function swapCheck(state: GameState, clubId: ClubId, rivalId: number): { ok: boolean; reason?: string } {
  const scout = state.scout!;
  const r = state.rivals.find((x) => x.id === rivalId);
  if (!r || !swapRivals(state, clubId).includes(r)) return { ok: false, reason: 'He doesn’t work for this club.' };
  const e = scout.employment;
  if ((e.mode === 'fulltime' ? 1 : e.clients.length) === 0) return { ok: false, reason: 'You have nothing to trade: no club of your own.' };
  const last = scout.rivalSwaps?.[rivalId];
  if (last !== undefined && state.date - last < RIVAL_EVERY) return { ok: false, reason: 'You traded with him recently.' };
  return { ok: true };
}

/** Trade reads with a rival: you learn this club's needs; he learns one of yours, and goes after your players more. */
export function swapWithRival(state: GameState, clubId: ClubId, rivalId: number): string {
  const check = swapCheck(state, clubId, rivalId);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const scout = state.scout!;
  const r = state.rivals.find((x) => x.id === rivalId)!;
  learnClub(state, clubId, RIVAL_READ, state.date);
  scout.rivalSwaps = { ...scout.rivalSwaps, [rivalId]: state.date };
  r.tippedUntil = (state.date + RIVAL_TIP_DAYS) as GameDate;
  return `${r.firstName} ${r.lastName} tells you what ${state.clubs[clubId]!.name} are after. In return you tell him about one of your clubs, and now he knows what you're chasing.`;
}

// ── Insiders ────────────────────────────────────────────────────────────

/** What a tip costs, by club tier (scaled by the country's wealth). */
const INSIDER_COST: Record<ClubTier, number> = { 1: 3_000, 2: 1_800, 3: 1_000, 4: 600, 5: 350 };
const INSIDER_READ = 65;
/** Share of tips that get one line wrong. */
export const INSIDER_WRONG = 0.4;
/** Chance a club finds out you paid one of its staff. */
const INSIDER_CAUGHT = 0.15;

export const insiderCost = (state: GameState, clubId: ClubId) => {
  const club = state.clubs[clubId]!;
  return usd(Math.round((INSIDER_COST[club.tier] * state.countries[club.countryId]!.wealthIndex) / 50) * 50);
};

export function insiderCheck(state: GameState, clubId: ClubId): { ok: boolean; reason?: string; cost: USD } {
  const cost = insiderCost(state, clubId);
  if (state.scout!.money < cost) return { ok: false, reason: `A tip costs ${formatUSD(cost)}.`, cost };
  const last = state.scout!.insiderTips?.[clubId];
  if (last !== undefined && state.date - last < 30) return { ok: false, reason: 'Your contact has nothing new yet.', cost };
  return { ok: true, cost };
}

/**
 * Pay someone at the club (a kit man, an analyst) for what he hears. No reputation needed, but it costs money, it
 * often gets one line wrong, and if the club finds out it costs you there, and your name for straight dealing.
 */
export function buyInsider(state: GameState, clubId: ClubId): string {
  const check = insiderCheck(state, clubId);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const scout = state.scout!;
  const club = state.clubs[clubId]!;
  addLedger(state, { amount: usd(-check.cost), kind: 'meeting', label: `A tip from inside ${club.name}` });
  scout.insiderTips = { ...scout.insiderTips, [clubId]: state.date };
  learnClub(state, clubId, INSIDER_READ, state.date);
  // Sometimes he has one line wrong: a need that isn't there, or one he missed.
  if (roll(state, `insider-wrong:${clubId}`) < INSIDER_WRONG) {
    const lines = formationPositions(club).filter((p) => p !== 'GK');
    const pos = lines[Math.floor(roll(state, `insider-pos:${clubId}`) * lines.length)]!;
    const r = state.clubReads![clubId]!;
    r.misread = { pos, severity: roll(state, `insider-sev:${clubId}`) < 0.5 ? 0.7 : 0 };
  }
  if (roll(state, `insider-caught:${clubId}`) < INSIDER_CAUGHT) {
    scout.integrity = clamp((scout.integrity ?? 50) - 4, 0, 100);
    scout.relationships[club.headCoachId] = clamp((scout.relationships[club.headCoachId] ?? 0) - 6, 0, 100);
    return `You get your tip, but ${club.name} find out who's been paying their staff. The coach is not pleased, and word gets around.`;
  }
  return `Your contact at ${club.name} tells you what he hears around the training ground. Usually he's right.`;
}

// ── Assistants ──────────────────────────────────────────────────────────

const ANALYSIS_WEEKS = 2;
const ANALYSIS_EXPENSES = 150;

export function analysisCheck(state: GameState, assistantId: number): { ok: boolean; reason?: string } {
  const a = state.assistants.find((x) => x.id === assistantId);
  if (!a) return { ok: false, reason: 'No such assistant.' };
  if (a.task || a.job || a.analysis || a.officeId !== undefined) return { ok: false, reason: `${a.firstName} ${a.lastName} is busy.` };
  return { ok: true };
}

/** Send an assistant to study a club for two weeks: his eye decides how good the read is. */
export function sendAnalyst(state: GameState, clubId: ClubId, assistantId: number) {
  const check = analysisCheck(state, assistantId);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const a = state.assistants.find((x) => x.id === assistantId)!;
  a.analysis = { clubId, until: (state.date + ANALYSIS_WEEKS * 7) as GameDate };
}

/** Mondays (from the assistants' tick): expenses, and the report when it's done. Returns true when he's busy with one. */
export function analysisWeek(state: GameState, a: GameState['assistants'][number], date: GameDate): boolean {
  if (!a.analysis) return false;
  const club = state.clubs[a.analysis.clubId];
  addLedger(state, { amount: usd(-ANALYSIS_EXPENSES), kind: 'assistant-task', label: `Club analysis: ${a.firstName} ${a.lastName}` });
  if (date >= a.analysis.until) {
    a.analysis = undefined;
    if (club) {
      learnClub(state, club.id, clamp(35 + a.skill * 2, 35, 75), date);
      a.xp++;
      addNews(state, {
        date,
        kind: 'career',
        title: `${a.firstName} ${a.lastName} reports on ${club.name}`,
        body: `Two weeks with their games and their people: his read on what they need is on the club page. A sharper eye gives a sharper read.`,
        clubIds: [club.id],
      });
      return true;
    }
  }
  return true;
}

// ── Data subscription ───────────────────────────────────────────────────

const DATA_BASE = 1_200;
/** A data service gives a rough read on every club in the country, never better. */
export const DATA_READ = 35;

export const dataCost = (state: GameState, countryId: GameState['countries'][keyof GameState['countries']]['id']) =>
  usd(Math.round((DATA_BASE * state.countries[countryId]!.wealthIndex) / 50) * 50);

export function toggleData(state: GameState, countryId: GameState['countries'][keyof GameState['countries']]['id'], on: boolean) {
  const scout = state.scout!;
  const subs = new Set(scout.dataSubs ?? []);
  if (on) {
    const cost = dataCost(state, countryId);
    if (scout.money < cost) throw new ScoutingError(`The first month costs ${formatUSD(cost)}.`);
    if (!subs.has(countryId)) {
      subs.add(countryId);
      addLedger(state, { amount: usd(-cost), kind: 'search', label: `Data service: ${state.countries[countryId]!.name}` });
      dataRefresh(state, countryId);
    }
  } else subs.delete(countryId);
  scout.dataSubs = [...subs];
}

function dataRefresh(state: GameState, countryId: string) {
  for (const c of Object.values(state.clubs)) if (c.countryId === countryId) learnClub(state, c.id, DATA_READ, state.date);
}

/** The 1st of each month: pay for the services you keep, and get their refreshed numbers. */
export function dataTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout?.dataSubs?.length || new Date(date * 86_400_000).getUTCDate() !== 1) return;
  for (const id of [...scout.dataSubs]) {
    const cost = dataCost(state, id as never);
    addLedger(state, { amount: usd(-cost), kind: 'search', label: `Data service: ${state.countries[id as never]!.name}` });
    dataRefresh(state, id);
  }
}
