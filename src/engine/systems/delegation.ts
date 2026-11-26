import { ageOn } from '../core/calendar';
import { usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { Assistant } from '../model/assistant';
import type { Deal } from '../model/deal';
import type { Mandate, Mission } from '../model/mission';
import type { Club } from '../model/club';
import type { Position } from '../model/player';
import type { CountryId } from '../core/ids';
import { FORMATIONS } from '../data/formations';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { clubPositionalAverage, formationPositions, pitch } from './deals';
import { ovrAt } from './ratings';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { canAfford, offeredWage, transferFee } from './transfers';
import { agencyLog } from './agency-log';
import { isTransferWindow, type GameDate } from '../core/calendar';
import { HQ } from '../model/agency';

/**
 * Staff take a brief off your hands: a senior assistant shortlists players for one of your active missions and
 * pitches them to the club under your name. His eye decides who he picks; a weak pitch costs your standing,
 * not his. He keeps a share of what the brief earns.
 */

/** Skill an assistant needs before you trust him with a client. */
export const DELEGATE_SKILL = 12;
/** His share of the mission reward and the signing bonus. */
export const STAFF_CUT = 0.25;
/** Names he puts forward before he gives the brief back. */
export const MAX_DELEGATE_PITCHES = 3;
const JOB_EXPENSES = 250;

const name = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;
const OPEN_DEAL = new Set<Deal['stage']>(['negotiating', 'agreed']);

function readyCheck(a: Assistant): { ok: boolean; reason?: string } {
  if (a.skill < DELEGATE_SKILL) return { ok: false, reason: `${name(a)} needs skill ${DELEGATE_SKILL} before you trust him with a client.` };
  if (a.task || a.job || a.analysis) return { ok: false, reason: `${name(a)} is busy.` };
  return { ok: true };
}

const expensesFor = (state: GameState, a: Assistant, countryId: CountryId) =>
  usd(Math.round((JOB_EXPENSES * state.countries[countryId]!.costIndex * (countryId === a.speciality ? 0.7 : 1)) / 10) * 10);

export function delegateCheck(state: GameState, a: Assistant, m: Mission): { ok: boolean; reason?: string } {
  const ready = readyCheck(a);
  if (!ready.ok) return ready;
  if (m.status !== 'active') return { ok: false, reason: 'Accept the brief first.' };
  if (state.assistants.some((x) => x.job?.missionId === m.id)) return { ok: false, reason: 'Someone is already on it.' };
  return { ok: true };
}

export function delegateMission(state: GameState, assistantId: number, missionId: number) {
  const a = state.assistants.find((x) => x.id === assistantId);
  const m = state.missions.find((x) => x.id === missionId);
  if (!a || !m) throw new ScoutingError('That assistant or brief no longer exists.');
  const check = delegateCheck(state, a, m);
  if (!check.ok) throw new ScoutingError(check.reason!);
  a.job = { missionId, startedOn: state.date, tried: [], weeklyExpenses: expensesFor(state, a, state.clubs[m.clubId]!.countryId) };
}

/** Can he take this selling request off your hands? */
export function delegateSaleCheck(state: GameState, a: Assistant, md: Mandate): { ok: boolean; reason?: string } {
  const ready = readyCheck(a);
  if (!ready.ok) return ready;
  if (md.status !== 'active') return { ok: false, reason: 'Accept the selling request first.' };
  if (state.assistants.some((x) => x.job?.mandateId === md.id)) return { ok: false, reason: 'Someone is already on it.' };
  return { ok: true };
}

/** A senior assistant finds buyers for a player you were asked to sell, and pitches him under your name. */
export function delegateMandate(state: GameState, assistantId: number, mandateId: number) {
  const a = state.assistants.find((x) => x.id === assistantId);
  const md = state.mandates.find((x) => x.id === mandateId);
  if (!a || !md) throw new ScoutingError('That assistant or selling request no longer exists.');
  const check = delegateSaleCheck(state, a, md);
  if (!check.ok) throw new ScoutingError(check.reason!);
  a.job = { mandateId, startedOn: state.date, tried: [], triedClubs: [], weeklyExpenses: expensesFor(state, a, state.clubs[md.clubId]!.countryId) };
}

export function recallJob(state: GameState, assistantId: number) {
  const a = state.assistants.find((x) => x.id === assistantId);
  if (a?.job) endJob(state, a, 'You took the brief back.');
}

function endJob(state: GameState, a: Assistant, why: string) {
  const job = a.job!;
  const m = job.missionId !== undefined ? state.missions.find((x) => x.id === job.missionId) : undefined;
  const md = job.mandateId !== undefined ? state.mandates.find((x) => x.id === job.mandateId) : undefined;
  const club = m ? state.clubs[m.clubId] : md ? state.clubs[md.clubId] : undefined;
  const p = md && state.players[md.playerId];
  a.job = undefined;
  if (m) m.yours = true;
  if (a.officeId !== undefined) agencyLog(state, { kind: 'brief', assistantId: a.id, text: `${name(a)} is back at the office: ${why}` });
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'missions',
    title: md
      ? `${name(a)} hands back the sale of ${p ? `${p.firstName} ${p.lastName}` : 'the player'}`
      : `${name(a)} hands back the ${m?.position ?? ''} brief${club ? ` for ${club.name}` : ''}`,
    body: why,
    clubIds: club ? [club.id] : undefined,
  });
}

/** His shortlist: players who fit the brief as far as he can tell, best (to his eye) first. */
function shortlist(state: GameState, a: Assistant, m: Mission, rng: Rng): { p: Player; rating: number; fee: USD }[] {
  const club = state.clubs[m.clubId]!;
  const r = m.requirements;
  const eye = a.skill + (club.countryId === a.speciality ? 3 : 0);
  const noise = (23 - eye) / 3;
  const busy = new Set(state.deals.filter((d) => OPEN_DEAL.has(d.stage)).map((d) => d.playerId));
  const where = new Set([club.countryId, a.speciality]);
  const out: { p: Player; rating: number; fee: USD }[] = [];
  for (const p of Object.values(state.players)) {
    if (p.clubId === club.id || busy.has(p.id) || a.job!.tried.includes(p.id)) continue;
    const home = p.clubId ? state.clubs[p.clubId]!.countryId : p.nationality;
    if (!where.has(home)) continue;
    if ((p.positions[m.position] ?? 0) < 0.75) continue;
    const age = ageOn(p.birthDate, state.date);
    if ((r.maxAge !== undefined && age > r.maxAge) || (r.minAge !== undefined && age < r.minAge)) continue;
    if (r.foot && p.foot !== r.foot && p.foot !== 'Both') continue;
    if (r.nationality && p.nationality !== r.nationality) continue;
    const fee = p.clubId ? transferFee(state, p) : usd(0);
    if (r.maxFee !== undefined && fee > r.maxFee) continue;
    const truth = ovrAt(p, m.position);
    // Cheap first pass on the truth (he never wastes time on players far off), then his own eye.
    if (truth < r.minOvr - 8 || truth > r.minOvr + 15) continue;
    const rating = Math.round(clamp(truth + rng.gaussian(0, noise), 1, 99));
    if (rating < r.minOvr) continue;
    out.push({ p, rating, fee });
  }
  // He likes a sure thing at a fair price: rating first, cheaper breaks ties.
  return out.sort((x, y) => y.rating - x.rating || x.fee - y.fee);
}

/** One week on the job (Mondays, from the assistant tick). */
export function jobWeek(state: GameState, a: Assistant, rng: Rng) {
  const job = a.job!;
  if (job.mandateId !== undefined) return saleWeek(state, a, rng);
  const m = state.missions.find((x) => x.id === job.missionId);
  if (!m || m.status !== 'active') {
    const done = m?.status === 'succeeded';
    return endJob(state, a, done ? 'The brief is done.' : 'The brief is closed.');
  }
  addLedger(state, { amount: usd(-job.weeklyExpenses), kind: 'assistant-task', label: `Brief expenses: ${name(a)} for ${state.clubs[m.clubId]!.name}` });
  a.xp++;
  if (job.dealId !== undefined) {
    const deal = state.deals.find((d) => d.id === job.dealId);
    if (deal && (OPEN_DEAL.has(deal.stage) || deal.stage === 'completed')) return; // waiting on the deal (or the brief to close)
    job.dealId = undefined;
  }
  if (job.tried.length >= MAX_DELEGATE_PITCHES) return endJob(state, a, `He put ${job.tried.length} names forward and none came off. The brief is yours again.`);

  const club = state.clubs[m.clubId]!;
  const pick = shortlist(state, a, m, rng).find((c) => canAfford(state, club, c.fee, c.p.wage).ok);
  if (!pick) {
    // Nobody yet: he keeps looking, but not forever.
    if (state.date - job.startedOn >= 28 && !job.tried.length) endJob(state, a, 'After four weeks he has found nobody who fits. The brief is yours again.');
    return;
  }
  job.tried.push(pick.p.id);
  let deal: Deal;
  try {
    deal = pitch(state, { playerId: pick.p.id, clubId: club.id, position: m.position, to: 'coach', delegate: a.id });
  } catch {
    return; // the pitch wasn't possible this week (he'll try someone else next week)
  }
  const p = pick.p;
  const ok = deal.stage === 'negotiating';
  if (ok) job.dealId = deal.id;
  if (a.officeId !== undefined)
    agencyLog(state, { kind: 'pitch', assistantId: a.id, text: `${name(a)} pitched ${p.firstName} ${p.lastName} to ${club.name} (${m.position}): ${ok ? 'signed off' : 'turned down'}.` });
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'missions',
    title: ok ? `${name(a)} lands a yes at ${club.name}` : `${club.name} turn down ${name(a)}'s pick`,
    body: `${name(a)} pitched ${p.firstName} ${p.lastName} (${m.position}, he rates him ${pick.rating}) for the ${club.name} brief. ${
      ok ? `Signed off: negotiations are under way.` : `${deal.reason ?? 'The coach said no.'}${deal.clubLevelRejection && !deal.boardBlocked ? ' A weak pitch: it cost you standing.' : ''}`
    }`,
    clubIds: [club.id],
    playerIds: [p.id],
  });
}

/** Buyers as he sees them: clubs the player would improve (to his eye) that can pay the asking price. */
function buyers(state: GameState, a: Assistant, md: Mandate, p: Player, rng: Rng): { club: Club; position: Position; gain: number }[] {
  const seller = state.clubs[md.clubId]!;
  const where = new Set([seller.countryId, a.speciality]);
  const tried = new Set(a.job!.triedClubs ?? []);
  const busy = new Set(state.deals.filter((d) => d.playerId === p.id && OPEN_DEAL.has(d.stage)).map((d) => d.clubId));
  const eye = a.skill + (seller.countryId === a.speciality ? 3 : 0);
  const noise = (23 - eye) / 3;
  const out: { club: Club; position: Position; gain: number }[] = [];
  for (const club of Object.values(state.clubs)) {
    if (club.id === seller.id || tried.has(club.id) || busy.has(club.id) || !where.has(club.countryId) || !FORMATIONS[club.formation]) continue;
    if (!canAfford(state, club, md.askingFee, offeredWage(state, p, club)).ok) continue;
    // The position he'd fill there: his own if they use it, else the one he plays best that they do use.
    const slots = formationPositions(club).filter((x) => (p.positions[x] ?? 0) >= 0.75);
    if (!slots.length) continue;
    const position = slots.includes(p.naturalPosition) ? p.naturalPosition : slots.sort((x, y) => ovrAt(p, y) - ovrAt(p, x))[0]!;
    const gain = Math.round(ovrAt(p, position) + rng.gaussian(0, noise)) - clubPositionalAverage(state, club, position);
    // He'd improve them, but not so much that they're out of his league.
    if (gain >= 1 && gain <= 14) out.push({ club, position, gain });
  }
  // A clear upgrade at a club that can afford it: best fit first.
  return out.sort((x, y) => y.gain - x.gain);
}

/** One week on a sale (Mondays, from the assistant tick). */
function saleWeek(state: GameState, a: Assistant, rng: Rng) {
  const job = a.job!;
  const md = state.mandates.find((x) => x.id === job.mandateId);
  const p = md && state.players[md.playerId];
  if (!md || md.status !== 'active' || !p) return endJob(state, a, md?.status === 'succeeded' ? 'The sale is done.' : 'The selling request is closed.');
  const seller = state.clubs[md.clubId]!;
  addLedger(state, { amount: usd(-job.weeklyExpenses), kind: 'assistant-task', label: `Sale expenses: ${name(a)} for ${seller.name}` });
  a.xp++;
  if (job.dealId !== undefined) {
    const deal = state.deals.find((d) => d.id === job.dealId);
    if (deal && (OPEN_DEAL.has(deal.stage) || deal.stage === 'completed')) return; // waiting on the deal
    job.dealId = undefined;
  }
  const tried = job.triedClubs ?? (job.triedClubs = []);
  if (tried.length >= MAX_DELEGATE_PITCHES) return endJob(state, a, `He offered him to ${tried.length} clubs and none bit. The sale is yours again.`);
  const pick = buyers(state, a, md, p, rng)[0];
  if (!pick) {
    if (state.date - job.startedOn >= 28 && !tried.length) endJob(state, a, 'After four weeks he has found no club that wants him at the asking price. The sale is yours again.');
    return;
  }
  tried.push(pick.club.id);
  let deal: Deal;
  try {
    deal = pitch(state, { playerId: p.id, clubId: pick.club.id, position: pick.position, to: 'coach', delegate: a.id });
  } catch {
    return; // not possible this week: he'll try another club
  }
  const ok = deal.stage === 'negotiating';
  if (ok) job.dealId = deal.id;
  if (a.officeId !== undefined)
    agencyLog(state, { kind: 'pitch', assistantId: a.id, text: `${name(a)} offered ${p.firstName} ${p.lastName} to ${pick.club.name}: ${ok ? 'they want him' : 'they passed'}.` });
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'missions',
    title: ok ? `${name(a)} finds a buyer for ${p.firstName} ${p.lastName}` : `${pick.club.name} pass on ${p.firstName} ${p.lastName}`,
    body: `${name(a)} offered ${p.firstName} ${p.lastName} (${seller.name}) to ${pick.club.name} as a ${pick.position}. ${
      ok ? 'They want him: negotiations are under way.' : `${deal.reason ?? 'The coach said no.'}${deal.clubLevelRejection && !deal.boardBlocked ? ' A weak pitch: it cost you standing.' : ''}`
    }`,
    clubIds: [pick.club.id, seller.id],
    playerIds: [p.id],
  });
}

/** His cut of what a brief he handled earns you. */
export function chargeStaffCut(state: GameState, deal: Deal | undefined, amount: USD, what: string) {
  if (!deal || deal.delegatedTo === undefined || amount <= 0) return;
  const a = state.assistants.find((x) => x.id === deal.delegatedTo);
  if (!a) return; // he has left: nobody to pay
  const who = name(a);
  const cut = usd(Math.round(amount * STAFF_CUT));
  addLedger(state, { amount: usd(-cut), kind: 'assistant', label: `${who}'s ${Math.round(STAFF_CUT * 100)}% of the ${what}` });
}


/** Office staff leave your briefs to you for this long after you accept them. */
export const PICKUP_GRACE_DAYS = 7;
/** Deals an office staffer can have lined up for the next window. */
export const MAX_LEADS = 3;

const baseCountry = (state: GameState, a: Assistant): CountryId | undefined =>
  a.officeId === undefined ? undefined : a.officeId === HQ ? state.scout?.homeCountry : state.agency?.offices.find((o) => o.id === a.officeId)?.countryId;

/** A brief an office staffer would take on his own: in his base's country (or his speciality), untouched by you for a week. */
export function pickupBrief(state: GameState, a: Assistant): Mission | undefined {
  if (!state.agency || a.skipBriefs || a.officeId === undefined || !readyCheck(a).ok) return undefined;
  const where = new Set([baseCountry(state, a), a.speciality]);
  return state.missions
    .filter((m) => {
      if (m.status !== 'active' || !m.deadline || m.yours) return false;
      const club = state.clubs[m.clubId];
      if (!club || !where.has(club.countryId)) return false;
      if (state.date - (m.deadline - m.weeks * 7) < PICKUP_GRACE_DAYS) return false;
      if (state.assistants.some((x) => x.job?.missionId === m.id)) return false;
      // You're already working it: a deal of yours for that club and position is in progress.
      return !state.deals.some((d) => d.clubId === m.clubId && d.position === m.position && d.delegatedTo === undefined && OPEN_DEAL.has(d.stage));
    })
    .sort((x, y) => x.deadline! - y.deadline!)[0];
}

/**
 * A week at the office (Mondays, office staff with nothing else on): pick up an untouched brief if there is one;
 * otherwise, outside the window, line up deals that close when it opens.
 */
export function officeWeek(state: GameState, a: Assistant, date: GameDate, rng: Rng) {
  const m = pickupBrief(state, a);
  if (m) {
    const club = state.clubs[m.clubId]!;
    a.job = { missionId: m.id, startedOn: state.date, tried: [], weeklyExpenses: expensesFor(state, a, club.countryId) };
    agencyLog(state, { kind: 'brief', assistantId: a.id, text: `${name(a)} took over the ${m.position} brief for ${club.name}.` });
    addNews(state, {
      date,
      kind: 'career',
      link: 'missions',
      title: `${name(a)} takes the ${m.position} brief for ${club.name}`,
      body: `Nobody had started on it, so ${name(a)} picked it up from the office. He shortlists and pitches under your name, for ${Math.round(STAFF_CUT * 100)}% of what it earns. Take it back from the Staff screen if you'd rather do it yourself.`,
      clubIds: [club.id],
    });
    return;
  }
  if (isTransferWindow(date) || (a.leads ?? 0) >= MAX_LEADS) return;
  if (!rng.chance(0.2 + 0.015 * a.skill)) return;
  a.leads = (a.leads ?? 0) + 1;
  const c = baseCountry(state, a);
  agencyLog(state, {
    kind: 'lead',
    assistantId: a.id,
    text: `${name(a)} lined up a deal${c ? ` in ${state.countries[c]!.name}` : ''} for the window (${a.leads} ready).`,
  });
}
