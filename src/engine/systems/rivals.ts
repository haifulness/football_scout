import { addDays, ageOn, isTransferWindow, toParts, type GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { culture } from '../data/names';
import type { Club } from '../model/club';
import type { Player } from '../model/player';
import type { RivalScout } from '../model/rival';
import type { Difficulty } from '../model/scout';
import type { GameState } from '../model/world-state';
import { clubPositionalAverage, hijackDeal } from './deals';
import { JOB_GATE } from './employment';
import { ovrAt } from './ratings';
import { addNews } from './season';
import { squadNeeds } from './squad-needs';
import { shieldedPlayers } from './hunts';
import { canAfford, executeTransfer, offeredWage, transferFee } from './transfers';

/**
 * Rival scouts (PLAN §3.15): AI scouts who chase players for their clubs,
 * sometimes the same ones you are working on. The first deal to complete wins.
 * Rumours in the news hint at their chases; they also compete for jobs and clients.
 */

const SETUP: Record<Difficulty, { count: number; skill: number; speed: number }> = {
  easy: { count: 50, skill: -2, speed: 0.8 },
  normal: { count: 80, skill: 0, speed: 1 },
  hard: { count: 110, skill: 2, speed: 1.25 },
};
const OPEN_USER = new Set(['negotiating']);
const RECENT_SIGNING_DAYS = 300;
const WINDOW_LEAD_DAYS = 70;

function daysToWindow(date: GameDate): number {
  for (let d = 0; d <= 200; d++) if (isTransferWindow(addDays(date, d))) return d;
  return Infinity;
}

export const rivalName = (r: RivalScout) => `${r.firstName} ${r.lastName}`;

/** "Northgate's scout Tom Hale" / "freelance scout Tom Hale". */
export function rivalLabel(state: GameState, r: RivalScout): string {
  return r.employment.mode === 'fulltime' ? `${state.clubs[r.employment.clubId]!.name}'s scout ${rivalName(r)}` : `freelance scout ${rivalName(r)}`;
}

// ── Setup ───────────────────────────────────────────────────────────────

/** Creates the rival scouting community once per career (count and strength by difficulty). */
export function seedRivals(state: GameState) {
  if (!state.scout || state.rivals.length) return;
  const setup = SETUP[state.scout.difficulty];
  const rng = Rng.derive(state.seed, 'rivals:seed');
  const clubsByCountry = new Map<string, Club[]>();
  for (const c of Object.values(state.clubs)) {
    const list = clubsByCountry.get(c.countryId) ?? [];
    list.push(c);
    clubsByCountry.set(c.countryId, list);
  }
  const countries = Object.values(state.countries).filter((c) => clubsByCountry.has(c.id));
  const taken = new Set<ClubId>();
  const userClub = state.scout.employment.mode === 'fulltime' ? state.scout.employment.clubId : undefined;
  for (let id = 1; id <= setup.count; id++) {
    // A quarter work in your home country: they are the ones you'll keep running into.
    const home = state.countries[state.scout.homeCountry];
    const country =
      home && clubsByCountry.has(home.id) && id <= setup.count / 4
        ? home
        : rng.weighted(countries, (c) => clubsByCountry.get(c.id)!.length * (0.5 + c.wealthIndex));
    const names = culture(country.culture);
    const skill = clamp(Math.round(rng.gaussian(10 + setup.skill, 3.5)), 3, 19);
    const local = clubsByCountry.get(country.id)!;
    // Better scouts work for bigger clubs.
    const wantTier = clamp(6 - Math.round(skill / 4 + rng.float(-1, 1)), 1, 5);
    const fits = local.filter((c) => !taken.has(c.id) && c.id !== userClub && Math.abs(c.tier - wantTier) <= 1);
    let employment: RivalScout['employment'];
    if (fits.length && rng.chance(0.6)) {
      const club = rng.pick(fits);
      taken.add(club.id);
      employment = { mode: 'fulltime', clubId: club.id };
    } else {
      const n = rng.int(1, 3);
      const pool = local.filter((c) => c.tier >= wantTier);
      const clients = rng
        .shuffle(pool.length ? pool : local)
        .slice(0, n)
        .map((c) => c.id);
      employment = { mode: 'freelance', clients };
    }
    const tierBonus = employment.mode === 'fulltime' ? (6 - state.clubs[employment.clubId]!.tier) * 6 : 0;
    state.rivals.push({
      id,
      firstName: rng.pick(names.first),
      lastName: rng.pick(names.last),
      nationality: country.id,
      portraitSeed: rng.seed(),
      skill,
      reputation: clamp(Math.round(skill * 2 + tierBonus + rng.float(-8, 8)), 5, 90),
      employment,
      // Stagger first chases so they don't all start in week one.
      restUntil: addDays(state.date, rng.int(0, 42)),
      record: { signings: 0, steals: 0, failed: 0 },
    });
  }
}

// ── Choosing a target ───────────────────────────────────────────────────

function rivalClubs(r: RivalScout): ClubId[] {
  return r.employment.mode === 'fulltime' ? [r.employment.clubId] : r.employment.clients;
}

/** Players your open work touches: open deals and your pool. Rivals sometimes land on the same names. */
function userPlayers(state: GameState): Set<PlayerId> {
  const ids = new Set<PlayerId>();
  for (const d of state.deals) if (OPEN_USER.has(d.stage)) ids.add(d.playerId);
  for (const id of Object.keys(state.pool) as PlayerId[]) ids.add(id);
  return ids;
}

/** Is this player a sensible signing for the club at this position, as this rival sees him? */
function fitsClub(state: GameState, r: RivalScout, p: Player, club: Club, pos: Player['naturalPosition'], rng: Rng, date: GameDate): number | undefined {
  if (p.clubId === club.id) return undefined;
  if (p.joinedOn !== undefined && date - p.joinedOn < RECENT_SIGNING_DAYS) return undefined;
  if (p.clubId && state.clubs[p.clubId]!.tier < club.tier) return undefined;
  if (ageOn(p.birthDate, date) > 31) return undefined;
  const avg = clubPositionalAverage(state, club, pos);
  const seen = ovrAt(p, pos) + rng.gaussian(0, (21 - r.skill) / 4); // weaker scouts misjudge more
  if (seen < avg + 1 || seen > avg + 14) return undefined;
  const fee = transferFee(state, p);
  if (fee > club.transferBudget * 0.7 || !canAfford(state, club, fee, offeredWage(state, p, club)).ok) return undefined;
  return seen - avg;
}

/** Sharp rivals hear about the players you are working on: deals first, then your pool. */
function chaseYours(state: GameState, r: RivalScout, clubs: Club[], rng: Rng, chased: Set<PlayerId>, protectedIds: Set<PlayerId>, date: GameDate): boolean {
  if (r.id === state.scout?.mentor?.rivalId) return false; // your mentor works with you, not against you
  // One you walked out on goes looking for your players.
  if (!rng.chance(0.1 + r.skill * 0.015 + (r.grudge ? 0.35 : 0))) return false;
  const deals = state.deals.filter((d) => OPEN_USER.has(d.stage)).map((d) => d.playerId);
  const pool = (Object.keys(state.pool) as PlayerId[]).filter((id) => !deals.includes(id));
  for (const id of [...rng.shuffle(deals), ...rng.shuffle(pool).slice(0, 12)]) {
    const p = state.players[id];
    if (!p || chased.has(id) || protectedIds.has(id)) continue;
    const home = p.clubId ? state.clubs[p.clubId]!.countryId : p.nationality;
    for (const club of clubs) {
      if (club.countryId !== home || !club.formation) continue;
      if (fitsClub(state, r, p, club, p.naturalPosition, rng, date) === undefined) continue;
      r.pursuit = { playerId: id, clubId: club.id, startedOn: date, progress: 0, rumoured: false };
      chased.add(id);
      return true;
    }
  }
  return false;
}

function startPursuit(state: GameState, r: RivalScout, rng: Rng, chased: Set<PlayerId>, protectedIds: Set<PlayerId>, yours: Set<PlayerId>, date: GameDate) {
  const clubs = rivalClubs(r)
    .map((id) => state.clubs[id])
    .filter((c): c is Club => !!c);
  if (!clubs.length) return;
  if (chaseYours(state, r, clubs, rng, chased, protectedIds, date)) return;
  const club = rng.pick(clubs);
  const squad = club.squad.map((id) => state.players[id]!);
  const need = squadNeeds(club.formation, squad).find((n) => n.severity >= 0.2 && (n.position !== 'GK' || rng.chance(0.4)));
  if (!need) return;
  const pos = need.position;

  // Candidates: some clubs in his patch, plus anyone you're working on who plays there.
  const patch = rng.shuffle(Object.values(state.clubs).filter((c) => c.countryId === club.countryId && c.tier >= club.tier && c.id !== club.id)).slice(0, 10);
  const ids = new Set<PlayerId>(patch.flatMap((c) => c.squad));
  for (const id of state.freeAgents) if (state.players[id]?.nationality === club.countryId && rng.chance(0.3)) ids.add(id);
  for (const id of yours) {
    const p = state.players[id];
    if (p && (p.nationality === club.countryId || (p.clubId && state.clubs[p.clubId]!.countryId === club.countryId))) ids.add(id);
  }
  let best: { p: Player; score: number } | undefined;
  for (const id of ids) {
    const p = state.players[id];
    if (!p || p.naturalPosition !== pos || chased.has(id) || protectedIds.has(id)) continue;
    const margin = fitsClub(state, r, p, club, pos, rng, date);
    if (margin === undefined) continue;
    const score = margin + (yours.has(id) ? 2 + r.skill / 5 : 0) + rng.float(0, 2);
    if (!best || score > best.score) best = { p, score };
  }
  if (!best) return;
  r.pursuit = { playerId: best.p.id, clubId: club.id, startedOn: date, progress: 0, rumoured: false };
  chased.add(best.p.id);
}

// ── Pursuit ─────────────────────────────────────────────────────────────

function publishRumour(state: GameState, r: RivalScout, p: Player, buyer: Club, yours: boolean, date: GameDate) {
  const where = p.clubId
    ? `at ${state.clubs[p.clubId]!.name}'s match, watching ${p.firstName} ${p.lastName}`
    : `meeting free agent ${p.firstName} ${p.lastName}`;
  addNews(state, {
    date,
    kind: 'rumour',
    forYou: yours,
    title: yours ? `Rival interest: ${p.firstName} ${p.lastName}` : `Rumour: ${buyer.name} tracking ${p.firstName} ${p.lastName}`,
    body: `${rivalLabel(state, r)} was seen ${where}.${yours ? ` He is working for ${buyer.name}. If they sign him first, your deal is dead.` : ''}`,
    countryId: buyer.countryId,
    clubIds: [buyer.id],
    playerIds: [p.id],
  });
}

function endPursuit(r: RivalScout, date: GameDate, restDays: number, failed: boolean) {
  r.pursuit = undefined;
  r.restUntil = addDays(date, restDays);
  if (failed) {
    r.record.failed++;
    r.reputation = clamp(r.reputation - 1, 0, 100);
  }
}

function close(state: GameState, r: RivalScout, p: Player, buyer: Club, date: GameDate, rng: Rng) {
  const fee = transferFee(state, p);
  const wage = offeredWage(state, p, buyer);
  if (!canAfford(state, buyer, fee, wage).ok) return endPursuit(r, date, 14, true);
  if (!rng.chance(0.5 + r.skill * 0.02)) return endPursuit(r, date, 14, true);
  const from = p.clubId ? state.clubs[p.clubId] : undefined;
  const stolen = state.deals.filter((d) => OPEN_USER.has(d.stage) && d.playerId === p.id);
  executeTransfer(state, p, buyer, fee, wage, date);
  for (const deal of stolen) hijackDeal(state, deal, `${buyer.name} signed him first, through ${rivalLabel(state, r)}.`);
  r.record.signings++;
  if (stolen.length) r.record.steals++;
  r.reputation = clamp(r.reputation + 3 + (stolen.length ? 2 : 0), 0, 100);
  endPursuit(r, date, rng.int(14, 35), false);
  if (stolen.length || state.pool[p.id] || fee >= 2_000_000)
    addNews(state, {
      date,
      kind: 'transfer',
      title: `${p.firstName} ${p.lastName} joins ${buyer.name}`,
      body: `${buyer.name} sign ${p.firstName} ${p.lastName}${from ? ` from ${from.name} for ${formatUSD(fee)}` : ' on a free'}, found by ${rivalLabel(state, r)}.`,
      countryId: buyer.countryId,
      clubIds: from ? [buyer.id, from.id] : [buyer.id],
      playerIds: [p.id],
    });
}

function pursue(state: GameState, r: RivalScout, rng: Rng, yours: Set<PlayerId>, protectedIds: Set<PlayerId>, date: GameDate) {
  const chase = r.pursuit!;
  const p = state.players[chase.playerId];
  const buyer = state.clubs[chase.clubId];
  // Gone, signed elsewhere, or his club dropped him: the chase is over.
  if (
    !p ||
    !buyer ||
    !rivalClubs(r).includes(buyer.id) ||
    p.clubId === buyer.id ||
    (p.joinedOn !== undefined && p.joinedOn > chase.startedOn) ||
    protectedIds.has(p.id)
  )
    return endPursuit(r, date, 7, true);
  const speed = (0.08 + r.skill * 0.012) * SETUP[state.scout!.difficulty].speed;
  chase.progress = Math.min(1, chase.progress + speed * rng.float(0.7, 1.3));
  const isYours = yours.has(p.id);
  // Only rumours that matter to you, or about notable players, reach you (and only then do you know about the chase).
  const notable = isYours || p.isProdigy || p.value >= 3_000_000;
  if (!chase.rumoured && notable && chase.progress >= 0.3 && rng.chance(isYours ? 0.6 : 0.2)) {
    chase.rumoured = true;
    publishRumour(state, r, p, buyer, isYours, date);
  }
  if (chase.progress >= 1 && isTransferWindow(date)) close(state, r, p, buyer, date, rng);
  // Out of a window, a finished chase waits; very old chases are abandoned.
  else if (date - chase.startedOn > 240) endPursuit(r, date, 14, true);
}

// ── Careers ─────────────────────────────────────────────────────────────

/** Monthly: rivals drift toward their level, and good ones move up, sometimes taking a job you were offered. */
function careerMoves(state: GameState, rng: Rng, date: GameDate) {
  const taken = new Set(state.rivals.flatMap((r) => (r.employment.mode === 'fulltime' ? [r.employment.clubId] : [])));
  const userClub = state.scout?.employment.mode === 'fulltime' ? state.scout.employment.clubId : undefined;
  for (const r of state.rivals) {
    r.reputation = clamp(r.reputation + (r.skill * 3 - r.reputation) * 0.02, 0, 100);
    if (!rng.chance(0.03)) continue;
    const tier = r.employment.mode === 'fulltime' ? state.clubs[r.employment.clubId]!.tier : 6;
    const country = r.employment.mode === 'fulltime' ? state.clubs[r.employment.clubId]!.countryId : r.nationality;
    const options = Object.values(state.clubs).filter(
      (c) => c.countryId === country && c.tier < tier && r.reputation >= JOB_GATE[c.tier] && !taken.has(c.id) && c.id !== userClub,
    );
    if (!options.length) continue;
    // Clubs that offered you a job are the ones hiring.
    const offered = new Set(state.offers.filter((o) => o.kind === 'fulltime').map((o) => o.clubId));
    const club = rng.weighted(options, (c) => (offered.has(c.id) ? 4 : 1) * (6 - c.tier));
    if (r.employment.mode === 'fulltime') taken.delete(r.employment.clubId);
    r.employment = { mode: 'fulltime', clubId: club.id };
    taken.add(club.id);
    const lost = state.offers.filter((o) => o.kind === 'fulltime' && o.clubId === club.id);
    state.offers = state.offers.filter((o) => !lost.includes(o));
    addNews(state, {
      date,
      kind: lost.length ? 'career' : 'coaching',
      title: lost.length ? `Job gone: ${club.name} hire ${rivalName(r)}` : `${club.name} appoint scout ${rivalName(r)}`,
      body: lost.length
        ? `${club.name} have filled the scouting job they offered you. Rival scout ${rivalName(r)} (reputation ${Math.round(r.reputation)}) takes it.`
        : `${rivalName(r)} joins ${club.name} as a scout.`,
      countryId: club.countryId,
      clubIds: [club.id],
    });
  }
}

/** Freelance competition: a client club already served by a better-known rival is harder to win. */
export function rivalAtClub(state: GameState, clubId: ClubId): RivalScout | undefined {
  const rep = state.scout?.reputation ?? 0;
  return state.rivals.find(
    (r) => r.reputation > rep && (r.employment.mode === 'fulltime' ? r.employment.clubId === clubId : r.employment.clients.includes(clubId)),
  );
}

// ── Tick ────────────────────────────────────────────────────────────────

/** Thursdays: rivals chase and close; on the 1st: career moves. */
export function rivalTick(state: GameState, date: GameDate) {
  if (!state.scout || state.careerOver) return;
  if (!state.rivals.length) seedRivals(state);
  const { weekday, day } = toParts(date);
  if (day === 1) careerMoves(state, Rng.derive(state.seed, `rivals:career:${date}`), date);
  if (weekday !== 4) return;
  const rng = Rng.derive(state.seed, `rivals:${date}`);
  const yours = userPlayers(state);
  // New chases start when a window is near enough to close them in.
  const hunting = daysToWindow(date) <= WINDOW_LEAD_DAYS;
  // Agreed deals are binding, and AI clubs leave represented players to you.
  // Players you won a hunt for are left to you for a while.
  const protectedIds = new Set<PlayerId>([
    ...state.deals.filter((d) => d.stage === 'agreed').map((d) => d.playerId),
    ...state.scout.represented,
    ...shieldedPlayers(state, date),
  ]);
  const chased = new Set<PlayerId>(state.rivals.flatMap((r) => (r.pursuit ? [r.pursuit.playerId] : [])));
  for (const r of rng.shuffle([...state.rivals])) {
    if (r.pursuit) pursue(state, r, rng, yours, protectedIds, date);
    else if (r.restUntil === undefined || date >= r.restUntil) {
      if (hunting && rng.chance(0.5)) startPursuit(state, r, rng, chased, protectedIds, yours, date);
    }
  }
}

/** Rival chases you know about (rumoured) for this player. */
export function knownInterest(state: GameState, playerId: PlayerId): { rival: RivalScout; club: Club; advanced: boolean }[] {
  return state.rivals.flatMap((r) =>
    r.pursuit && r.pursuit.playerId === playerId && r.pursuit.rumoured
      ? [{ rival: r, club: state.clubs[r.pursuit.clubId]!, advanced: r.pursuit.progress >= 0.7 }]
      : [],
  );
}
