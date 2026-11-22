import { ageOn } from '../core/calendar';
import { usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { Assistant } from '../model/assistant';
import type { Deal } from '../model/deal';
import type { Mission } from '../model/mission';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { pitch } from './deals';
import { ovrAt } from './ratings';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { canAfford, transferFee } from './transfers';

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

export function delegateCheck(state: GameState, a: Assistant, m: Mission): { ok: boolean; reason?: string } {
  if (a.skill < DELEGATE_SKILL) return { ok: false, reason: `${name(a)} needs skill ${DELEGATE_SKILL} before you trust him with a client.` };
  if (a.task || a.job || a.officeId !== undefined) return { ok: false, reason: `${name(a)} is busy.` };
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
  const club = state.clubs[m.clubId]!;
  const local = club.countryId === a.speciality ? 0.7 : 1;
  a.job = {
    missionId,
    startedOn: state.date,
    tried: [],
    weeklyExpenses: usd(Math.round((JOB_EXPENSES * state.countries[club.countryId]!.costIndex * local) / 10) * 10),
  };
}

export function recallJob(state: GameState, assistantId: number) {
  const a = state.assistants.find((x) => x.id === assistantId);
  if (a?.job) endJob(state, a, 'You took the brief back.');
}

function endJob(state: GameState, a: Assistant, why: string) {
  const job = a.job!;
  const m = state.missions.find((x) => x.id === job.missionId);
  const club = m && state.clubs[m.clubId];
  a.job = undefined;
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'missions',
    title: `${name(a)} hands back the ${m?.position ?? ''} brief${club ? ` for ${club.name}` : ''}`,
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

/** His cut of what a brief he handled earns you. */
export function chargeStaffCut(state: GameState, deal: Deal | undefined, amount: USD, what: string) {
  if (!deal || deal.delegatedTo === undefined || amount <= 0) return;
  const a = state.assistants.find((x) => x.id === deal.delegatedTo);
  if (!a) return; // he has left: nobody to pay
  const who = name(a);
  const cut = usd(Math.round(amount * STAFF_CUT));
  addLedger(state, { amount: usd(-cut), kind: 'assistant', label: `${who}'s ${Math.round(STAFF_CUT * 100)}% of the ${what}` });
}

