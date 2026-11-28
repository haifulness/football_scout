import { makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import type { AcademyState, OwnAcademy } from '../model/academy';
import type { ClubTier } from '../model/club';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { characterOf } from './character';
import { weeklyWage } from './economy';
import { ovrAt } from './ratings';
import { clubTrust } from './employment';
import { learn } from './knowledge';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { isUnlocked } from './unlocks';

/**
 * Academies, the late game's long investment. Sponsor a club's academy (reputation 45): a yearly fee. Its youth
 * intake grows better and comes to you first, already scouted; the club values you more.
 */

export const SPONSOR_REP = 45;
const SPONSOR_TIER: Record<ClubTier, number> = { 1: 4, 2: 2.5, 3: 1.5, 4: 1, 5: 0.6 };
const SPONSOR_BASE = 12_000;
/** Standing you need at a club before its president takes your money. */
export const SPONSOR_TRUST = 30;
const SPONSOR_TRUST_BONUS = 8;


const academyOf = (state: GameState): AcademyState => (state.academy ??= { sponsorships: [] });
const name = (p: Player) => `${p.firstName} ${p.lastName}`;

// ── Sponsorship ─────────────────────────────────────────────────────────

export function sponsorFee(state: GameState, clubId: ClubId): USD {
  const club = state.clubs[clubId]!;
  const wealth = state.countries[club.countryId]!.wealthIndex;
  return usd(Math.round((SPONSOR_BASE * SPONSOR_TIER[club.tier] * wealth) / 500) * 500);
}

export const maxSponsorships = (state: GameState) => (state.agency ? 2 : 1);
export const isSponsor = (state: GameState, clubId: ClubId) => !!state.academy?.sponsorships.some((s) => s.clubId === clubId);

export function sponsorCheck(state: GameState, clubId: ClubId): { ok: boolean; reason?: string; fee: USD } {
  const fee = sponsorFee(state, clubId);
  const scout = state.scout;
  if (!scout) return { ok: false, reason: 'Set up your scout first.', fee };
  if (!isUnlocked(state, 'academy')) return { ok: false, reason: `Clubs take academy money from a known name (reputation ${SPONSOR_REP}).`, fee };
  if (isSponsor(state, clubId)) return { ok: false, reason: 'You already sponsor their academy.', fee };
  if (academyOf(state).sponsorships.length >= maxSponsorships(state))
    return { ok: false, reason: `You can sponsor ${maxSponsorships(state)} academ${maxSponsorships(state) > 1 ? 'ies' : 'y'} at a time${state.agency ? '' : ' (two with an agency)'}.`, fee };
  if (clubTrust(state, clubId) < SPONSOR_TRUST) return { ok: false, reason: `The president doesn't know you well enough yet (standing ${SPONSOR_TRUST}+).`, fee };
  if (scout.money < fee) return { ok: false, reason: `The first year costs ${formatUSD(fee)}.`, fee };
  return { ok: true, fee };
}

export function sponsorAcademy(state: GameState, clubId: ClubId) {
  const check = sponsorCheck(state, clubId);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const club = state.clubs[clubId]!;
  academyOf(state).sponsorships.push({ clubId, since: state.date, fee: check.fee });
  addLedger(state, { amount: usd(-check.fee), kind: 'academy', label: `Academy sponsorship: ${club.name}` });
  addNews(state, {
    date: state.date,
    kind: 'career',
    title: `You sponsor ${club.name}'s academy`,
    body: `Your money buys coaches and pitches. Every summer you'll see their new intake first, already scouted, and the club will remember who paid for it. Renews each July at ${formatUSD(check.fee)}.`,
    clubIds: [club.id],
  });
}

export function stopSponsoring(state: GameState, clubId: ClubId) {
  const a = academyOf(state);
  if (!isSponsor(state, clubId)) throw new ScoutingError('You don’t sponsor that academy.');
  a.sponsorships = a.sponsorships.filter((s) => s.clubId !== clubId);
}

/** Standing a sponsored club gives you (see clubTrust). */
export const sponsorTrust = (state: GameState, clubId: ClubId) => (isSponsor(state, clubId) ? SPONSOR_TRUST_BONUS : 0);

/** Youth intake (season rollover): sponsored academies produce a little more, and better. */
export function intakeBoost(state: GameState, clubId: ClubId): { extra: number; prodigy: number } {
  return isSponsor(state, clubId) ? { extra: 1, prodigy: 2 } : { extra: 0, prodigy: 1 };
}

/** After the youth intake: you know a sponsored club's new kids well, character and all. */
export function scoutSponsoredIntake(state: GameState, clubId: ClubId, kids: PlayerId[], date: GameDate) {
  if (!isSponsor(state, clubId) || !kids.length) return;
  for (const id of kids) {
    const p = state.players[id]!;
    learn(state, p, 65, 65, date);
    (state.knowledge[id] ??= { level: 65, lastUpdated: date }).characterSeen = [...characterOf(p)];
    state.pool[id] ??= { addedOn: date, source: 'manual', starred: false };
  }
  const club = state.clubs[clubId]!;
  const best = kids.map((id) => state.players[id]!).sort((a, b) => b.hidden.potential - a.hidden.potential)[0]!;
  addNews(state, {
    date,
    kind: 'career',
    link: 'academy',
    title: `${club.name}'s new academy intake: ${kids.length} kids, scouted for you`,
    body: `As their sponsor you see them first. They're in your pool, character and all. The coaches rave about ${name(best)} (${best.naturalPosition}).`,
    clubIds: [club.id],
    playerIds: kids,
  });
}

/** The 1st of July: renew sponsorships (or let them lapse when you can't pay). */
function renewSponsorships(state: GameState, date: GameDate) {
  const a = academyOf(state);
  for (const s of [...a.sponsorships]) {
    if (date - s.since < 300) continue;
    const club = state.clubs[s.clubId]!;
    s.fee = sponsorFee(state, s.clubId);
    if (state.scout!.money < s.fee) {
      a.sponsorships = a.sponsorships.filter((x) => x !== s);
      addNews(state, { date, kind: 'career', title: `Your sponsorship of ${club.name}'s academy lapses`, body: `You couldn't pay this year's ${formatUSD(s.fee)}.`, clubIds: [club.id] });
      continue;
    }
    addLedger(state, { amount: usd(-s.fee), kind: 'academy', label: `Academy sponsorship: ${club.name}` });
  }
}

// ── Older saves: an academy of your own ────────────────────────────────

const BUILD_COST = 60_000;
const UPGRADE_COST: Record<2 | 3, number> = { 2: 50_000, 3: 100_000 };
const YOUTH_CONTRACT_YEARS = 3;

/**
 * Running your own academy was removed. An older save that has one winds it up once: each kid joins a club in the
 * academy's country (the smallest squad at the lowest level, its city first) and stays in your pool, and half of
 * what you paid to build and upgrade it comes back. Sell-on shares on graduates you placed still pay out.
 */
export function windUpOwnAcademy(state: GameState, date: GameDate) {
  const own = state.academy?.own as OwnAcademy | undefined;
  if (!own || !state.academy) return;
  const country = state.countries[own.countryId];
  const clubs = Object.values(state.clubs).filter((c) => c.countryId === own.countryId);
  const { year } = toParts(date);
  const placed: PlayerId[] = [];
  for (const id of own.players) {
    const p = state.players[id];
    if (!p || p.clubId) continue;
    p.academyTraining = undefined;
    const club = [...clubs].sort((a, b) => b.tier - a.tier || Number(b.cityId === own.cityId) - Number(a.cityId === own.cityId) || a.squad.length - b.squad.length)[0];
    if (!club) {
      state.freeAgents.push(id);
      continue;
    }
    p.clubId = club.id;
    p.contractUntil = makeDate(year + YOUTH_CONTRACT_YEARS, 6, 30);
    p.wage = weeklyWage(ovrAt(p, p.naturalPosition), club.tier, country?.wealthIndex ?? 1);
    club.squad.push(id);
    placed.push(id);
  }
  const costIndex = country?.costIndex ?? 1;
  const spent = BUILD_COST + (own.level >= 2 ? UPGRADE_COST[2] : 0) + (own.level >= 3 ? UPGRADE_COST[3] : 0);
  const refund = usd(Math.round((spent * costIndex) / 2 / 1000) * 1000);
  state.academy.own = undefined;
  if (state.scout) addLedger(state, { amount: refund, kind: 'academy', label: `${own.name} wound up` });
  addNews(state, {
    date,
    kind: 'career',
    title: `${own.name} closes`,
    body: `You wind up the academy and get ${formatUSD(refund)} back for the grounds. ${placed.length ? `Its ${placed.length} kids join clubs nearby and stay in your pool.` : ''} Sell-on shares on the graduates you placed still pay out.`,
    playerIds: placed,
  });
}

/** When a club sells a player you placed with a sell-on share: you get your cut, once. */
export function paySellOn(state: GameState, p: Player, sellerId: ClubId | undefined, fee: USD) {
  if (!state.scout || !sellerId || fee <= 0) return;
  for (const pl of state.placements) {
    if (pl.playerId !== p.id || pl.clubId !== sellerId || !pl.sellOnPct || pl.sellOnPaid) continue;
    const cut = usd(Math.round((fee * pl.sellOnPct) / 100));
    pl.sellOnPaid = true;
    if (state.academy?.own) state.academy.own.earned = usd(state.academy.own.earned + cut);
    addLedger(state, { amount: cut, kind: 'sell-on', label: `Sell-on: ${name(p)} sold by ${state.clubs[sellerId]!.name}` });
    addNews(state, {
      date: state.date,
      kind: 'career',
      title: `Sell-on paid: ${formatUSD(cut)} for ${name(p)}`,
      body: `${state.clubs[sellerId]!.name} sell him for ${formatUSD(fee)}; your ${pl.sellOnPct}% share comes in.`,
      playerIds: [p.id],
    });
  }
}

/** The 1st of July: sponsorships renew. (An older save's own academy winds up on the first day played.) */
export function academyTick(state: GameState, date: GameDate, rolled: boolean) {
  if (!state.scout || state.careerOver || !state.academy) return;
  if (state.academy.own) windUpOwnAcademy(state, date);
  if (rolled) renewSponsorships(state, date);
}

export const nextIntake = (date: GameDate): GameDate => {
  const d = new Date(date * 86_400_000);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return makeDate(y, 7, 1);
};
