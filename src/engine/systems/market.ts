import { addDays, ageOn, formatDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD, roundPrice, usd } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { Club } from '../model/club';
import type { Deal } from '../model/deal';
import type { Mandate } from '../model/mission';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { canWorkWith, clubRecord } from './employment';
import { meetingInfo } from './fieldwork';
import { OFFER_REMINDER_DAYS } from './missions';
import { ovrAt } from './ratings';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { positionalAverage } from './squad-needs';

/**
 * The freelance market (PLAN §3.10, §3.16):
 * - Selling mandates: a client wants a player sold. You may pitch him to any
 *   club; the buyer's normal gate and sign-off apply; you earn a commission.
 * - Representation: you act for a free agent. You may pitch him to any club,
 *   and AI clubs leave him to you while you represent him.
 */

const OFFER_DAYS = 10;
const MAX_ACTIVE_MANDATES = 2;
export const MAX_REPRESENTED = 3;
export const REPRESENT_RAPPORT = 25;
const RECENT_SIGNING_DAYS = 300;

const isFreelance = (state: GameState) => state.scout?.employment.mode === 'freelance';

// ── Pitch rights ────────────────────────────────────────────────────────

export interface PitchRights {
  ok: boolean;
  reason?: string;
  /** Pitching on behalf of a selling client. */
  mandate?: Mandate;
  /** Pitching a free agent you represent. */
  represented?: boolean;
  /** A freelancer pitching to a club that isn't a client yet: allowed, but it pays less. */
  open?: boolean;
}

/**
 * May you pitch this player to this club? Full-time scouts pitch only to their employer. Freelancers may pitch
 * to any club: clients as usual, mandate players and represented free agents anywhere, and anyone else as an
 * open pitch (no agreement: in person only, half the signing bonus, no match bonuses).
 */
export function pitchRights(state: GameState, p: Player, club: Club): PitchRights {
  const scout = state.scout;
  if (!scout) return { ok: false, reason: 'Set up your scout first.' };
  if (isFreelance(state)) {
    const mandate = state.mandates.find((m) => m.status === 'active' && m.playerId === p.id && m.clubId !== club.id);
    if (mandate) return { ok: true, mandate };
    if (!p.clubId && scout.represented.includes(p.id)) return { ok: true, represented: true };
    if (!canWorkWith(state, club.id).ok) return { ok: true, open: true };
  }
  return canWorkWith(state, club.id);
}

// ── Selling mandates ────────────────────────────────────────────────────

/** Who a club would like to move on: unused, overpaid, or surplus at his position. */
function surplusCandidate(state: GameState, club: Club, rng: Rng): { p: Player; reason: string } | undefined {
  const squad = club.squad.map((id) => state.players[id]!);
  const scored = squad
    .filter(
      (p) => p.id !== club.captainId && ageOn(p.birthDate, state.date) >= 20 && (p.joinedOn === undefined || state.date - p.joinedOn >= RECENT_SIGNING_DAYS),
    )
    .map((p) => {
      const ovr = ovrAt(p, p.naturalPosition);
      const { average, count } = positionalAverage(squad, p.naturalPosition);
      const benched = p.stats.apps <= 2 ? 2 : 0;
      const overpaid = p.wage > 0 && ovr < average - 2 ? 1.5 : 0;
      const crowded = count >= 4 ? 1 : 0;
      const score = benched + overpaid + crowded + rng.float(0, 1);
      const reason = overpaid
        ? 'His wages are too high for what he gives us.'
        : crowded
          ? `We have too many ${p.naturalPosition}s.`
          : benched
            ? "He isn't getting minutes here."
            : 'We need to raise funds.';
      return { p, score, reason };
    })
    .sort((a, b) => b.score - a.score);
  const pick = scored[0];
  return pick && pick.score >= 1.2 ? { p: pick.p, reason: pick.reason } : undefined;
}

export function acceptMandate(state: GameState, id: number): Mandate {
  if (!isFreelance(state)) throw new ScoutingError('Selling mandates are for freelancers.');
  const m = state.mandates.find((x) => x.id === id);
  if (!m || m.status !== 'offered') throw new ScoutingError('That mandate is no longer on offer.');
  if (state.mandates.filter((x) => x.status === 'active').length >= MAX_ACTIVE_MANDATES)
    throw new ScoutingError(`You can handle at most ${MAX_ACTIVE_MANDATES} sales at once.`);
  m.status = 'active';
  m.deadline = addDays(state.date, m.weeks * 7);
  return m;
}

export function declineMandate(state: GameState, id: number) {
  const m = state.mandates.find((x) => x.id === id);
  if (m && m.status === 'offered') m.status = 'declined';
}

function sellerRelations(state: GameState, clubId: ClubId, delta: number) {
  const scout = state.scout!;
  const club = state.clubs[clubId]!;
  scout.relationships[club.headCoachId] = clamp((scout.relationships[club.headCoachId] ?? 0) + delta, 0, 100);
}

/** When a mandate deal is agreed/completed: the sale counts. Commission is paid when the fee actually moves (on completion). */
export function onMandateSecured(state: GameState, deal: Deal) {
  const m = state.mandates.find((x) => x.id === deal.mandateId);
  if (!m || m.status !== 'active') return;
  m.status = 'succeeded';
  m.dealId = deal.id;
  m.resolvedOn = state.date;
  const r = clubRecord(state.scout!, m.clubId);
  state.scout!.clubRecord[m.clubId] = { ...r, missionsDone: (r.missionsDone ?? 0) + 1 };
  sellerRelations(state, m.clubId, 5);
}

export function payCommission(state: GameState, deal: Deal) {
  const m = state.mandates.find((x) => x.id === deal.mandateId);
  if (!m) return;
  const seller = state.clubs[m.clubId]!;
  const commission = usd(Math.round((deal.fee * m.commissionPct) / 100));
  const p = state.players[deal.playerId]!;
  addLedger(state, {
    amount: commission,
    kind: 'sale-commission',
    label: `Sale commission: ${p.firstName} ${p.lastName} (${seller.name}, ${m.commissionPct}%)`,
  });
  state.scout!.reputation = clamp(state.scout!.reputation + 1, 0, 100);
  deal.log.push({ date: state.date, text: `Commission for ${seller.name}: ${formatUSD(commission)}.`, tone: 'good' });
}

// ── Representation ──────────────────────────────────────────────────────

export interface RepresentCheck {
  ok: boolean;
  reason?: string;
}

export function representCheck(state: GameState, p: Player): RepresentCheck {
  const scout = state.scout;
  if (!scout) return { ok: false, reason: 'Set up your scout first.' };
  if (!isFreelance(state)) return { ok: false, reason: 'Only freelancers represent players.' };
  if (p.clubId) return { ok: false, reason: 'Only free agents can be represented.' };
  if (scout.represented.includes(p.id)) return { ok: false, reason: 'You already represent him.' };
  if (scout.represented.length >= MAX_REPRESENTED) return { ok: false, reason: `You represent ${MAX_REPRESENTED} players already.` };
  if ((scout.rapport[p.id] ?? 0) < REPRESENT_RAPPORT)
    return { ok: false, reason: `He needs to know you better first (rapport ${REPRESENT_RAPPORT}+; meet him).` };
  if (!meetingInfo(state, { kind: 'player', id: p.id }).inPlace)
    return { ok: false, reason: `Be in ${state.countries[p.nationality]!.name} to sign the paperwork.` };
  return { ok: true };
}

export function represent(state: GameState, playerId: PlayerId) {
  const p = state.players[playerId];
  if (!p) throw new ScoutingError('That player has retired.');
  const check = representCheck(state, p);
  if (!check.ok) throw new ScoutingError(check.reason);
  state.scout!.represented.push(p.id);
  if (!state.pool[p.id]) state.pool[p.id] = { addedOn: state.date, source: 'manual', starred: true };
}

export function stopRepresenting(state: GameState, playerId: PlayerId) {
  const scout = state.scout!;
  scout.represented = scout.represented.filter((id) => id !== playerId);
}

/** Taking a full-time job: freelance-only work ends. */
export function endFreelanceWork(state: GameState, why: string) {
  for (const m of state.mandates)
    if (m.status === 'active' || m.status === 'offered') {
      m.status = 'expired';
      m.resolvedOn = state.date;
      m.note = why;
    }
  if (state.scout) state.scout.represented = [];
}

// ── Daily tick ──────────────────────────────────────────────────────────

export function marketTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  const clients = scout.employment.mode === 'freelance' ? scout.employment.clients : [];

  for (const m of state.mandates) {
    if (m.status !== 'offered' && m.status !== 'active') continue;
    const p = state.players[m.playerId];
    if (!p || p.clubId !== m.clubId) {
      m.status = 'expired';
      m.resolvedOn = date;
      m.note = !p ? 'He retired.' : 'The club sold or released him without you.';
    } else if (m.status === 'offered' && (date > m.acceptBy || !clients.includes(m.clubId))) {
      m.status = 'expired';
      m.resolvedOn = date;
      if (clients.includes(m.clubId)) {
        const club = state.clubs[m.clubId]!;
        addNews(state, {
          date,
          kind: 'career',
          link: 'missions',
          title: `Mandate lapsed: ${club.name}`,
          body: `You didn't answer in time, so ${club.name} will sell ${p.firstName} ${p.lastName} without you.`,
          clubIds: [club.id],
          countryId: club.countryId,
        });
      }
    } else if (m.status === 'offered' && m.acceptBy - date === OFFER_REMINDER_DAYS) {
      const club = state.clubs[m.clubId]!;
      addNews(state, {
        date,
        kind: 'career',
        link: 'missions',
        title: `Reply soon: ${club.name} want you to sell ${p.firstName} ${p.lastName}`,
        body: `The mandate offer lapses in ${OFFER_REMINDER_DAYS} days. Accept or decline it in Missions.`,
        clubIds: [club.id],
        countryId: club.countryId,
      });
    } else if (m.status === 'active' && m.deadline !== undefined && date > m.deadline) {
      m.status = 'failed';
      m.resolvedOn = date;
      const r = clubRecord(scout, m.clubId);
      scout.clubRecord[m.clubId] = { ...r, missionsFailed: (r.missionsFailed ?? 0) + 1 };
      sellerRelations(state, m.clubId, -5);
      const club = state.clubs[m.clubId]!;
      addNews(state, {
        date,
        kind: 'career',
        link: 'missions',
        title: `Sale failed: ${p.firstName} ${p.lastName}`,
        body: `You didn't find a buyer in time. ${club.name} trust you a little less.`,
        clubIds: [club.id],
        countryId: club.countryId,
      });
    }
  }

  // Representation ends when your player signs somewhere without you.
  for (const id of [...scout.represented]) {
    const p = state.players[id];
    if (!p || p.clubId) {
      stopRepresenting(state, id);
      if (p && !state.deals.some((d) => d.playerId === id && d.stage === 'completed' && d.completedOn === date))
        addNews(state, {
          date,
          kind: 'career',
          title: `${p.firstName} ${p.lastName} signs elsewhere`,
          body: `${p.firstName} ${p.lastName} has joined ${state.clubs[p.clubId!]!.name}. You no longer represent him.`,
          playerIds: [p.id],
        });
    }
  }

  if (state.mandates.length > 60)
    state.mandates = state.mandates.filter((m) => m.status === 'offered' || m.status === 'active' || (m.resolvedOn !== undefined && date - m.resolvedOn < 365));

  const { day } = toParts(date);
  if (day !== 8 && day !== 22) return;
  const rng = Rng.derive(state.seed, `mandates:${date}`);
  for (const clubId of clients) {
    const club = state.clubs[clubId];
    if (!club || state.mandates.some((m) => m.clubId === clubId && (m.status === 'offered' || m.status === 'active'))) continue;
    const last = Math.max(-Infinity, ...state.mandates.filter((m) => m.clubId === clubId).map((m) => m.postedOn));
    const quiet = Number.isFinite(last) ? date - last : 60;
    if (!rng.chance(clamp(0.15 + quiet / 200, 0, 0.9))) continue;
    const pick = surplusCandidate(state, club, rng);
    if (!pick) continue;
    const mandate: Mandate = {
      id: state.counters.mandate++,
      clubId,
      playerId: pick.p.id,
      askingFee: roundPrice(Math.max(pick.p.value * rng.float(0.85, 1.1), 1000)),
      commissionPct: rng.int(3, 5),
      reason: pick.reason,
      postedOn: date,
      acceptBy: addDays(date, OFFER_DAYS),
      weeks: rng.int(6, 10),
      status: 'offered',
    };
    state.mandates.push(mandate);
    addNews(state, {
      date,
      kind: 'career',
      link: 'missions',
      title: `Selling mandate: ${club.name} want ${pick.p.firstName} ${pick.p.lastName} sold`,
      body: `"${pick.reason}" Asking ${formatUSD(mandate.askingFee)}, your commission ${mandate.commissionPct}%. Accept by ${formatDate(mandate.acceptBy)} in Missions.`,
      clubIds: [club.id],
      countryId: club.countryId,
      playerIds: [pick.p.id],
    });
  }
}
