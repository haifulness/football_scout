import { isAcademyPlayer, placeCheck } from './academy';
import { addDays, ageOn, formatDate, toParts, type GameDate } from '../core/calendar';
import { chargeStaffCut } from './delegation';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD, roundPrice, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { Club, ClubTier } from '../model/club';
import type { Deal } from '../model/deal';
import type { Mandate } from '../model/mission';
import { ATTRIBUTE_LABEL, type AttributeKey, type Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { canWorkWith, clubRecord, clubTrust } from './employment';
import { learn } from './knowledge';
import { potentialGrade } from './reports';
import { meetingInfo } from './fieldwork';
import { OFFER_REMINDER_DAYS } from './missions';
import { UNLOCKS, isUnlocked } from './unlocks';
import { ovrAt } from './ratings';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { positionalAverage } from './squad-needs';

/**
 * The freelance market:
 * - Selling mandates: a client (or, full-time, your employer) wants a player sold. You may pitch him to any
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
/** Your employer, if you work full-time. */
const employerOf = (state: GameState): ClubId | undefined => {
  const e = state.scout?.employment;
  return e?.mode === 'fulltime' ? e.clubId : undefined;
};
/** Full-time: up to this many sales for your employer at once (a client asks for one at a time). */
export const EMPLOYER_MANDATES = 2;
/** Full-time: the least a sale for your employer pays, by its tier (small clubs sell for small fees). */
export const EMPLOYER_SALE_FLOOR: Record<ClubTier, number> = { 5: 500, 4: 1_400, 3: 1_750, 2: 3_500, 1: 8_750 };

/** Your commission on a sale at this fee. */
export function mandateCommission(state: GameState, m: Mandate, fee: number): USD {
  const pct = Math.round((fee * m.commissionPct) / 100);
  return usd(m.employer ? Math.max(pct, EMPLOYER_SALE_FLOOR[state.clubs[m.clubId]!.tier]) : pct);
}

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
  /** Full-time: selling one of your employer's players to another club. */
  forEmployer?: boolean;
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
    // Your academy's kids are yours to place, from a certain age.
    if (isAcademyPlayer(state, p.id)) {
      const age = placeCheck(state, p);
      return age.ok ? { ok: true, represented: true } : { ok: false, reason: age.reason };
    }
    if (!canWorkWith(state, club.id).ok) return { ok: true, open: true };
  }
  // Full-time: your club's players are yours to sell, to anyone.
  const employer = employerOf(state);
  if (employer && p.clubId === employer) {
    const mandate = state.mandates.find((m) => m.status === 'active' && m.playerId === p.id && m.clubId === employer);
    return mandate ? { ok: true, mandate } : { ok: true, forEmployer: true };
  }
  return canWorkWith(state, club.id);
}

// ── Selling mandates ────────────────────────────────────────────────────

/** How far off a club's own rating can be, by tier: big clubs have analysts. */
export const CLUB_REPORT_SPREAD: Record<ClubTier, number> = { 1: 2, 2: 3, 3: 4, 4: 6, 5: 8 };
/** A selling club talks its player up, by up to this much, less the better it knows you. */
export const CLUB_REPORT_FLATTERY = 6;
/** Standing at which a club gives you a straight report. */
export const STRAIGHT_STANDING = 70;
/** How well you know him once you have his club's file, by tier. */
const FILE_KNOWLEDGE_CAP: Record<ClubTier, number> = { 1: 65, 2: 60, 3: 55, 4: 50, 5: 45 };

/** The selling club's report: its rating (precise at big clubs, flattering when it barely knows you), potential, strengths. */
export function clubReport(state: GameState, club: Club, p: Player, rng: Rng): NonNullable<Mandate['report']> {
  const truth = ovrAt(p, p.naturalPosition);
  const standing = clubTrust(state, club.id);
  const flattery = Math.round(CLUB_REPORT_FLATTERY * Math.max(0, 1 - standing / STRAIGHT_STANDING));
  const spread = CLUB_REPORT_SPREAD[club.tier];
  const rating = Math.round(clamp(truth + flattery + rng.int(-spread, spread), 1, 99));
  const grades = ['D', 'C', 'B', 'A'] as const;
  const real = potentialGrade(p.hidden.potential);
  // Flattery reaches the potential grade too, sometimes.
  const bump = flattery >= 3 && rng.chance(0.5) ? 1 : 0;
  const potential = grades[Math.min(3, grades.indexOf(real) + bump)]!;
  const strengths = (Object.entries(p.attributes) as [AttributeKey, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => ATTRIBUTE_LABEL[k].toLowerCase());
  return { rating, potential, strengths };
}

/** Who a club would like to move on: unused, overpaid, or surplus at his position. */
function surplusCandidate(state: GameState, club: Club, rng: Rng, skip?: Set<PlayerId>): { p: Player; reason: string } | undefined {
  const squad = club.squad.map((id) => state.players[id]!);
  const scored = squad
    .filter(
      (p) => !skip?.has(p.id) && p.id !== club.captainId && ageOn(p.birthDate, state.date) >= 20 && (p.joinedOn === undefined || state.date - p.joinedOn >= RECENT_SIGNING_DAYS),
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
  const m = state.mandates.find((x) => x.id === id);
  if (!m || m.status !== 'offered') throw new ScoutingError('That mandate is no longer on offer.');
  const employer = employerOf(state);
  if (employer && m.clubId !== employer) throw new ScoutingError(`You work full-time for ${state.clubs[employer]!.name}: you only sell for them.`);
  if (state.mandates.filter((x) => x.status === 'active').length >= MAX_ACTIVE_MANDATES)
    throw new ScoutingError(`You can handle at most ${MAX_ACTIVE_MANDATES} sales at once.`);
  m.status = 'active';
  m.deadline = addDays(state.date, m.weeks * 7);
  // You get his file: you know him better, and his club's rating sits in your pool.
  const p = state.players[m.playerId];
  const club = state.clubs[m.clubId]!;
  if (p) {
    learn(state, p, 30, FILE_KNOWLEDGE_CAP[club.tier], state.date);
    const entry = (state.pool[p.id] ??= { addedOn: state.date, source: 'manual', starred: false });
    if (m.report) entry.report = { by: `${club.shortName} (selling)`, rating: m.report.rating, date: state.date };
  }
  // You had already put him to a club and the talks are still going: that deal is part of the sale now.
  for (const d of state.deals)
    if (d.playerId === m.playerId && d.clubId !== m.clubId && d.mandateId === undefined && (d.stage === 'negotiating' || d.stage === 'agreed')) {
      d.mandateId = m.id;
      d.forEmployer = undefined;
      d.log.push({ date: state.date, text: `${club.name} asked you to sell him: this deal now counts for the sale.`, tone: 'good' });
      if (d.stage === 'agreed') onMandateSecured(state, d);
    }
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
  const commission = mandateCommission(state, m, deal.fee);
  const p = state.players[deal.playerId]!;
  addLedger(state, {
    amount: commission,
    kind: 'sale-commission',
    label: `Sale commission: ${p.firstName} ${p.lastName} (${seller.name}, ${m.commissionPct}%)`,
  });
  chargeStaffCut(state, deal, commission, 'sale commission');
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
  if (!isUnlocked(state, 'representation'))
    return { ok: false, reason: `Free agents want an established scout (reputation ${UNLOCKS.find((u) => u.key === 'representation')!.reputation}).` };
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
export function endFreelanceWork(state: GameState, why: string, keepClub?: ClubId) {
  for (const m of state.mandates)
    if ((m.status === 'active' || m.status === 'offered') && m.clubId !== keepClub) {
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
  // The clubs that can ask you to sell: your clients, or your employer.
  const clients = scout.employment.mode === 'freelance' ? scout.employment.clients : [scout.employment.clubId];
  const employer = employerOf(state);

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
    } else if (
      m.status === 'active' &&
      m.deadline !== undefined &&
      date > m.deadline &&
      // Still in talks with a buyer: the club waits for the outcome.
      !state.deals.some((d) => d.mandateId === m.id && d.stage === 'negotiating')
    ) {
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
        body: `You didn't find a buyer in time. Your standing at ${club.name} drops.`,
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
  // Your employer trusts its own scout with sales from day one; clients wait until you have a name.
  if (!employer && !isUnlocked(state, 'mandates')) return;
  const rng = Rng.derive(state.seed, `mandates:${date}`);
  for (const clubId of clients) {
    const club = state.clubs[clubId];
    const open = state.mandates.filter((m) => m.clubId === clubId && (m.status === 'offered' || m.status === 'active'));
    if (!club || open.length >= (clubId === employer ? EMPLOYER_MANDATES : 1)) continue;
    const last = Math.max(-Infinity, ...state.mandates.filter((m) => m.clubId === clubId).map((m) => m.postedOn));
    const quiet = Number.isFinite(last) ? date - last : 60;
    if (!rng.chance(clamp(clubId === employer ? 0.25 + quiet / 150 : 0.15 + quiet / 200, 0, 0.9))) continue;
    offerMandate(state, club, rng, clubId === employer);
  }
}

/** A club asks you to sell one of its surplus players (not one you brought in, nor one already up for sale). */
export function offerMandate(state: GameState, club: Club, rng: Rng, forEmployer: boolean): Mandate | undefined {
  const date = state.date;
  const clubId = club.id;
  const employer = forEmployer ? clubId : undefined;
  const open = state.mandates.filter((m) => m.clubId === clubId && (m.status === 'offered' || m.status === 'active'));
  const mine = new Set(state.placements.filter((pl) => pl.clubId === clubId && date - pl.signedOn < RECENT_SIGNING_DAYS).map((pl) => pl.playerId));
  for (const m of open) mine.add(m.playerId);
  const pick = surplusCandidate(state, club, rng, mine);
  if (!pick) return undefined;
  const mandate: Mandate = {
    report: clubReport(state, club, pick.p, rng),
    id: state.counters.mandate++,
    clubId,
    playerId: pick.p.id,
    askingFee: roundPrice(Math.max(pick.p.value * rng.float(0.85, 1.1), 1000)),
    commissionPct: clubId === employer ? rng.int(2, 3) : rng.int(3, 5),
    employer: clubId === employer || undefined,
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
    body: `"${pick.reason}" Asking ${formatUSD(mandate.askingFee)}, your commission ${formatUSD(mandateCommission(state, mandate, mandate.askingFee))} (${mandate.commissionPct}%)${clubId === employer ? ' on top of your salary. You can pitch him to any club' : ''}. Accept by ${formatDate(mandate.acceptBy)} in Missions.`,
    clubIds: [club.id],
    countryId: club.countryId,
    playerIds: [pick.p.id],
  });
  return mandate;
}
