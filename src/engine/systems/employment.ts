import { addDays, makeDate, toParts, type GameDate } from '../core/calendar';
import { accuracyTrust } from './reports';
import type { ClubId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { Club, ClubTier } from '../model/club';
import type { ClubRecord, Employment, JobOffer, Scout } from '../model/scout';
import type { GameState } from '../model/world-state';
import { meetingInfo, metToday, COLLEAGUE_START } from './fieldwork';
import { EXPENSE_COVER, ScoutingError, addLedger } from './scouting';

export { EXPENSE_COVER };
import { addNews } from './season';
import { endFreelanceWork } from './market';
import { rivalAtClub, rivalName } from './rivals';
import { specialties, specialtyAppeal } from './goals';
import { clientCapacity, hasBase } from './agency';

/**
 * Careers (PLAN §3.10, §3.12). Freelancers pitch only to their client clubs and
 * earn bigger cuts; full-time scouts pitch only to their employer, draw a salary
 * and have most expenses covered. Trust with each club decides who wants you.
 */

// ── Trust ───────────────────────────────────────────────────────────────

export function clubRecord(scout: Scout, clubId: ClubId): ClubRecord {
  return scout.clubRecord[clubId] ?? { signings: 0, weakPitches: 0 };
}

/** 0–100: your relationship with the Head Coach, plus your track record there. */
export function clubTrust(state: GameState, clubId: ClubId): number {
  const scout = state.scout;
  const club = state.clubs[clubId];
  if (!scout || !club) return 0;
  const rel = scout.relationships[club.headCoachId] ?? 0;
  const r = clubRecord(scout, clubId);
  const employer = scout.employment.mode === 'fulltime' && scout.employment.clubId === clubId ? 10 : 0;
  const missions = Math.min(20, (r.missionsDone ?? 0) * 6) - Math.min(20, (r.missionsFailed ?? 0) * 8);
  return Math.round(clamp(rel * 0.7 + Math.min(40, r.signings * 8) - Math.min(15, r.weakPitches * 3) + missions + employer + accuracyTrust(state), 0, 100));
}

export function recordSigning(state: GameState, clubId: ClubId) {
  const scout = state.scout!;
  scout.clubRecord[clubId] = { ...clubRecord(scout, clubId), signings: clubRecord(scout, clubId).signings + 1 };
}

export function recordWeakPitch(state: GameState, clubId: ClubId) {
  const scout = state.scout!;
  scout.clubRecord[clubId] = { ...clubRecord(scout, clubId), weakPitches: clubRecord(scout, clubId).weakPitches + 1 };
}

// ── Freelance clients ───────────────────────────────────────────────────

/** How many clubs a freelancer can work for at once. */
export function clientSlots(reputation: number): number {
  return reputation >= 70 ? 5 : reputation >= 50 ? 4 : reputation >= 30 ? 3 : 2;
}

/** Reputation a club of each tier expects before taking you on (as client or employee). */
export const AGREEMENT_GATE: Record<ClubTier, number> = { 1: 75, 2: 50, 3: 20, 4: 0, 5: 0 };
export const JOB_GATE: Record<ClubTier, number> = { 1: 70, 2: 50, 3: 30, 4: 15, 5: 5 };
export const SALARY: Record<ClubTier, number> = { 1: 220_000, 2: 110_000, 3: 55_000, 4: 30_000, 5: 18_000 };
const NOTICE_DAYS = 28;
const OFFER_DAYS = 21;

/** Can you recommend players to this club right now? */
export function canWorkWith(state: GameState, clubId: ClubId): { ok: boolean; reason?: string } {
  const scout = state.scout;
  if (!scout) return { ok: false, reason: 'Set up your scout first.' };
  const e = scout.employment;
  if (e.mode === 'fulltime') {
    return e.clubId === clubId ? { ok: true } : { ok: false, reason: `You work full-time for ${state.clubs[e.clubId]!.name}: you can only recommend to them.` };
  }
  return e.clients.includes(clubId)
    ? { ok: true }
    : { ok: false, reason: `${state.clubs[clubId]!.name} isn't one of your clients. Propose a scouting agreement first.` };
}

export interface AgreementCheck {
  ok: boolean;
  reason?: string;
  freeSlots: number;
}

export function agreementCheck(state: GameState, clubId: ClubId): AgreementCheck {
  const scout = state.scout!;
  const e = scout.employment;
  const club = state.clubs[clubId]!;
  if (e.mode === 'fulltime') return { ok: false, reason: 'Full-time scouts work only for their employer.', freeSlots: 0 };
  const free = clientCapacity(state) - e.clients.length;
  if (e.clients.includes(clubId)) return { ok: false, reason: 'Already a client.', freeSlots: free };
  if (free <= 0)
    return { ok: false, reason: `All ${clientCapacity(state)} client slots are taken. Drop a client or build reputation.`, freeSlots: free };
  if (scout.reputation < AGREEMENT_GATE[club.tier])
    return { ok: false, reason: `${club.name} want an established scout (reputation ${AGREEMENT_GATE[club.tier]}).`, freeSlots: free };
  return { ok: true, freeSlots: free };
}

/** In person, with the Head Coach: ask to scout for the club. Needs some existing relationship. */
export function proposeAgreement(state: GameState, clubId: ClubId): { accepted: boolean; reason: string } {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  const club = state.clubs[clubId]!;
  const check = agreementCheck(state, clubId);
  if (!check.ok) throw new ScoutingError(check.reason);
  const officialId = club.headCoachId;
  const info = meetingInfo(state, { kind: 'official', id: officialId });
  if (!info.allowed) throw new ScoutingError(`The Head Coach won't see you yet (needs reputation ${info.requiredReputation}).`);
  if (!info.inPlace) throw new ScoutingError(`You need to be in ${state.cities[club.cityId]!.name}.`);
  // Raising it at a meeting you already had today costs nothing extra.
  if (!metToday(state, officialId)) {
    if (scout.money < info.cost) throw new ScoutingError(`The meeting costs ${formatUSD(info.cost)} but you only have ${formatUSD(scout.money)}.`);
    addLedger(state, { amount: usd(-info.cost), kind: 'meeting', label: `Agreement talks: ${club.name}` });
  }
  scout.lastMet[officialId] = state.date;
  const rel = info.level;
  if (rel < 10) return { accepted: false, reason: "They don't know you well enough yet. Meet them a few times first." };
  const rival = rivalAtClub(state, clubId);
  const chance =
    1 / (1 + Math.exp(-((rel - 20) / 8 + (scout.reputation - AGREEMENT_GATE[club.tier]) / 15 + (clubTrust(state, clubId) - 20) / 25 - (rival ? 0.7 : 0))));
  const rng = Rng.derive(state.seed, `agreement:${clubId}:${state.date}`);
  if (rng.next() >= chance)
    return {
      accepted: false,
      reason: rival
        ? `They already use ${rivalName(rival)}, a better-known scout. Build the relationship (or your name) and try again.`
        : 'They thanked you, but said not yet. Build the relationship and try again.',
    };
  addClient(state, clubId);
  return { accepted: true, reason: `${club.name} take you on as a freelance scout.` };
}

function addClient(state: GameState, clubId: ClubId) {
  const e = state.scout!.employment;
  if (e.mode === 'freelance' && !e.clients.includes(clubId)) e.clients.push(clubId);
}

export function dropClient(state: GameState, clubId: ClubId) {
  const e = state.scout!.employment;
  if (e.mode !== 'freelance') return;
  e.clients = e.clients.filter((c) => c !== clubId);
  // Open deals with that club are no longer yours to finish.
  for (const d of state.deals)
    if (d.clubId === clubId && d.stage === 'negotiating') {
      d.stage = 'collapsed';
      d.reason = 'You stopped working with the club.';
      d.log.push({ date: state.date, text: 'Deal off: you ended the scouting agreement.', tone: 'bad' });
    }
}

/** After a freelance signing, the club is glad to keep you on (if you have room). */
export function onSigningCompleted(state: GameState, clubId: ClubId) {
  recordSigning(state, clubId);
  const scout = state.scout!;
  if (scout.employment.mode === 'freelance' && agreementCheck(state, clubId).ok) addClient(state, clubId);
}

// ── Jobs ────────────────────────────────────────────────────────────────

export function jobTitle(tier: ClubTier, reputation: number): string {
  if (tier === 1 && reputation >= 85) return 'Head of Recruitment';
  if (tier <= 2) return 'Chief Scout';
  if (tier === 3) return 'Senior Scout';
  return 'Scout';
}

export function salaryFor(tier: ClubTier, reputation: number, wealthIndex: number): USD {
  const base = SALARY[tier] * (tier === 1 && reputation >= 85 ? 1.85 : 1);
  return usd(Math.round((base * Math.sqrt(wealthIndex)) / 1000) * 1000);
}

export function acceptOffer(state: GameState, offerId: number): Employment {
  const scout = state.scout!;
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new ScoutingError('That offer is no longer on the table.');
  if (state.date > offer.expiresOn) throw new ScoutingError('That offer has expired.');
  const club = state.clubs[offer.clubId]!;
  if (offer.kind === 'fulltime' && state.agency) throw new ScoutingError(`You run ${state.agency.name}: a club job would mean walking away from it.`);
  if (offer.kind === 'client') {
    const check = agreementCheck(state, club.id);
    if (!check.ok) throw new ScoutingError(check.reason);
    addClient(state, club.id);
  } else {
    // Leaving freelance (or another job) for this one: open deals elsewhere end.
    for (const d of state.deals)
      if (d.clubId !== club.id && (d.stage === 'negotiating' || d.stage === 'agreed')) {
        d.stage = 'collapsed';
        d.reason = `You took a job at ${club.name}.`;
        d.log.push({ date: state.date, text: `Deal off: you joined ${club.name}.`, tone: 'bad' });
      }
    endFreelanceWork(state, `You joined ${club.name} full-time.`);
    // New colleagues: a working relationship from day one (more is up to you).
    scout.relationships[club.headCoachId] = Math.max(scout.relationships[club.headCoachId] ?? 0, COLLEAGUE_START);
    const { year, month } = toParts(state.date);
    scout.employment = {
      mode: 'fulltime',
      clubId: club.id,
      title: offer.title!,
      salary: offer.salary!,
      since: state.date,
      until: makeDate(year + (offer.seasons ?? 2) + (month >= 7 ? 0 : -1), 6, 30),
    };
    addNews(state, {
      date: state.date,
      kind: 'career',
      title: `${scout.name} joins ${club.name}`,
      body: `${club.name} appoint ${scout.name} as ${offer.title} on ${formatUSD(offer.salary!)} a year.`,
      clubIds: [club.id],
      countryId: club.countryId,
    });
  }
  state.offers = state.offers.filter((o) => o.id !== offerId);
  return scout.employment;
}

export function declineOffer(state: GameState, offerId: number) {
  const offer = state.offers.find((o) => o.id === offerId);
  state.offers = state.offers.filter((o) => o.id !== offerId);
  // Turning down a new contract at your own club means leaving it.
  const e = state.scout?.employment;
  if (offer?.renewal && e?.mode === 'fulltime' && e.clubId === offer.clubId)
    goFreelance(state, `${state.scout!.name} turns down a new contract at ${state.clubs[offer.clubId]!.name} and returns to freelance work.`);
}

export function resign(state: GameState) {
  const e = state.scout!.employment;
  if (e.mode !== 'fulltime') throw new ScoutingError("You're freelance: there's nothing to resign from.");
  if (e.leavingOn) throw new ScoutingError('You have already handed in your notice.');
  e.leavingOn = addDays(state.date, NOTICE_DAYS);
}

function goFreelance(state: GameState, why: string) {
  const scout = state.scout!;
  const e = scout.employment;
  if (e.mode !== 'fulltime') return;
  const club = state.clubs[e.clubId]!;
  scout.employment = { mode: 'freelance', clients: [] };
  addNews(state, { date: state.date, kind: 'career', title: `${scout.name} leaves ${club.name}`, body: why, clubIds: [club.id], countryId: club.countryId });
}

/** Share of an expense your employer pays (0 as a freelancer). */
export function expenseCover(state: GameState): number {
  const e = state.scout?.employment;
  return e?.mode === 'fulltime' ? EXPENSE_COVER[state.clubs[e.clubId]!.tier] : 0;
}

/** A club whose staff scout is clearly better known than you won't replace him. */
function happyWithTheirScout(state: GameState, clubId: ClubId): boolean {
  const rep = state.scout!.reputation;
  return state.rivals.some((r) => r.employment.mode === 'fulltime' && r.employment.clubId === clubId && r.reputation > rep + 10);
}

function makeOffer(state: GameState, o: Omit<JobOffer, 'id' | 'createdOn' | 'expiresOn'>) {
  const offer: JobOffer = { ...o, id: state.counters.offer++, createdOn: state.date, expiresOn: addDays(state.date, OFFER_DAYS) };
  state.offers.push(offer);
  const club = state.clubs[o.clubId]!;
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'career',
    title:
      o.kind === 'client'
        ? `${club.name} want you to scout for them`
        : o.renewal
          ? `${club.name} offer you a new contract`
          : `Job offer: ${o.title} at ${club.name}`,
    body:
      o.kind === 'client'
        ? `${club.name} would like to take you on as a freelance scout. Answer in your Career screen within three weeks.`
        : `${club.name} offer you the role of ${o.title}: ${formatUSD(o.salary!)} a year for ${o.seasons} seasons, with ${Math.round(EXPENSE_COVER[club.tier] * 100)}% of expenses covered.`,
    clubIds: [club.id],
    countryId: club.countryId,
  });
}

/** Weekly: salary. Daily: notice periods, contract ends, expired offers. Monthly: offers and sackings. */
export function employmentTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  const { day, weekday } = toParts(date);
  state.offers = state.offers.filter((o) => o.expiresOn >= date);
  const e = scout.employment;

  if (e.mode === 'fulltime') {
    const club = state.clubs[e.clubId]!;
    // Colleagues never fall below a working relationship (also brings older saves up to date).
    if ((scout.relationships[club.headCoachId] ?? 0) < COLLEAGUE_START) scout.relationships[club.headCoachId] = COLLEAGUE_START;
    if (weekday === 1) addLedger(state, { amount: usd(Math.round(e.salary / 52)), kind: 'salary', label: `Salary: ${club.name}` }, { merge: true });
    if (e.leavingOn && date >= e.leavingOn) goFreelance(state, `${scout.name} has left ${club.name} after serving notice and returns to freelance work.`);
    else if (date >= e.until) {
      const trust = clubTrust(state, club.id);
      // One renewal offer per contract, and none once you've handed in your notice.
      if (trust >= 45 && !e.leavingOn && !e.renewalOffered) {
        makeOffer(state, {
          kind: 'fulltime',
          clubId: club.id,
          title: jobTitle(club.tier, scout.reputation),
          salary: usd(Math.round(e.salary * 1.1)),
          seasons: 2,
          renewal: true,
        });
        e.until = addDays(e.until, OFFER_DAYS); // stay on while you decide
        e.renewalOffered = true;
      } else if (!state.offers.some((o) => o.renewal && o.clubId === club.id)) {
        goFreelance(state, `${club.name} let ${scout.name}'s contract run out.`);
      }
    } else if (day === 1 && clubTrust(state, club.id) < 12 && date - e.since > 90) {
      goFreelance(state, `${club.name} dismiss ${scout.name}: the coach no longer trusts their judgement.`);
    }
  }

  if (day === 1) monthlyOffers(state, date);
}

function monthlyOffers(state: GameState, date: GameDate) {
  const scout = state.scout!;
  const rng = Rng.derive(state.seed, `offers:${date}`);
  const e = scout.employment;
  const pending = new Set(state.offers.map((o) => o.clubId));
  const known = (c: Club) => clubTrust(state, c.id);
  const homeContinent = state.countries[scout.homeCountry]!.continentId;
  // Your specialties make clubs in that niche seek you out, even far from home.
  const specs = specialties(state);
  const appeal = (c: Club) => specialtyAppeal(state, c, specs);
  const near = (c: Club) =>
    state.countries[c.countryId]!.continentId === homeContinent || (scout.regionKnowledge[c.countryId] ?? 0) >= 30 || appeal(c) > 1.5 || hasBase(state, c.countryId);

  // Full-time jobs: clubs that trust you, or that your reputation reaches.
  const currentTier = e.mode === 'fulltime' ? state.clubs[e.clubId]!.tier : 6;
  const jobs = Object.values(state.clubs).filter(
    (c) =>
      !pending.has(c.id) &&
      c.tier < currentTier + (e.mode === 'fulltime' ? 0 : 1) &&
      scout.reputation >= JOB_GATE[c.tier] &&
      (known(c) >= 25 || scout.reputation >= JOB_GATE[c.tier] + 15) &&
      near(c) &&
      !happyWithTheirScout(state, c.id),
  );
  if (!state.agency && jobs.length && rng.chance(e.mode === 'fulltime' ? 0.15 : 0.45)) {
    const club = rng.weighted(jobs, (c) => (1 + known(c) / 10 + (6 - c.tier)) * appeal(c));
    makeOffer(state, {
      kind: 'fulltime',
      clubId: club.id,
      title: jobTitle(club.tier, scout.reputation),
      salary: salaryFor(club.tier, scout.reputation, state.countries[club.countryId]!.wealthIndex),
      seasons: rng.int(1, 3),
    });
  }

  // Freelance invitations, while you have room.
  if (e.mode === 'freelance' && clientCapacity(state) > e.clients.length) {
    const invites = Object.values(state.clubs).filter(
      (c) => !pending.has(c.id) && !e.clients.includes(c.id) && scout.reputation >= AGREEMENT_GATE[c.tier] && known(c) >= 8 && near(c),
    );
    const niche = specs.some((s) => s.kind === 'continent') ? 0.15 : 0;
    if (invites.length && rng.chance(0.4 + niche)) makeOffer(state, { kind: 'client', clubId: rng.weighted(invites, (c) => (1 + known(c)) * appeal(c)).id });
  }
}
