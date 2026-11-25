import { ageOn, makeDate, type GameDate } from '../core/calendar';
import type { ClubId, CountryId, PlayerId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { FORMATIONS } from '../data/formations';
import { generatePlayer } from '../generation/player-generator';
import { newPlayerId } from '../generation/world-generator';
import type { AcademyState, OwnAcademy } from '../model/academy';
import type { ClubTier } from '../model/club';
import type { Placement } from '../model/deal';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { agencyCountries } from './agency';
import { characterOf } from './character';
import { clubTrust } from './employment';
import { learn } from './knowledge';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { isUnlocked } from './unlocks';

/**
 * Academies, the late game's long investment.
 *
 * Sponsor a club's academy (reputation 45): a yearly fee. Its youth intake grows better and comes to you first,
 * already scouted; the club values you more.
 *
 * Open your own (with an agency, in a country where you have a base): build it, pay its upkeep, and each summer it
 * recruits 15–16-year-olds. They train (faster at a better academy) and belong to you: no club can sign them except
 * through you. Place them from 17: the club pays a training fee, and you keep a share of their next transfer.
 * Unplaced at 19, they leave as free agents.
 */

export const SPONSOR_REP = 45;
const SPONSOR_TIER: Record<ClubTier, number> = { 1: 4, 2: 2.5, 3: 1.5, 4: 1, 5: 0.6 };
const SPONSOR_BASE = 12_000;
/** Standing you need at a club before its president takes your money. */
export const SPONSOR_TRUST = 30;
const SPONSOR_TRUST_BONUS = 8;

const BUILD_COST = 60_000;
const UPGRADE_COST: Record<2 | 3, number> = { 2: 50_000, 3: 100_000 };
const UPKEEP_WEEKLY: Record<1 | 2 | 3, number> = { 1: 600, 2: 1_000, 3: 1_600 };
export const CAPACITY: Record<1 | 2 | 3, number> = { 1: 10, 2: 16, 3: 24 };
const INTAKE: Record<1 | 2 | 3, number> = { 1: 4, 2: 6, 3: 8 };
/** How fast they grow without first-team football (a club youngster on the bench is 0.6–1.4). */
export const TRAINING: Record<1 | 2 | 3, number> = { 1: 0.75, 2: 0.95, 3: 1.15 };
const PRODIGY: Record<1 | 2 | 3, number> = { 1: 0.03, 2: 0.05, 3: 0.08 };
export const PLACE_AGE = 17;
const LEAVE_AGE = 19;
/** Paid by the club on signing a graduate, by its tier. */
const TRAINING_FEE: Record<ClubTier, number> = { 1: 60_000, 2: 30_000, 3: 15_000, 4: 8_000, 5: 4_000 };
export const SELL_ON_PCT = 15;

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

// ── Your own academy ────────────────────────────────────────────────────

export const buildCost = (state: GameState, countryId: CountryId) => usd(Math.round((BUILD_COST * state.countries[countryId]!.costIndex) / 1000) * 1000);
export const upgradeCost = (state: GameState, level: 2 | 3) => usd(Math.round((UPGRADE_COST[level] * state.countries[state.academy!.own!.countryId]!.costIndex) / 1000) * 1000);
export const upkeep = (state: GameState, own: OwnAcademy) => usd(Math.round((UPKEEP_WEEKLY[own.level] * state.countries[own.countryId]!.costIndex) / 10) * 10);

export function openCheck(state: GameState, countryId: CountryId): { ok: boolean; reason?: string; cost: USD } {
  const cost = buildCost(state, countryId);
  if (!state.agency) return { ok: false, reason: 'Your own academy needs an agency behind it.', cost };
  if (state.academy?.own) return { ok: false, reason: 'You already run an academy.', cost };
  if (!agencyCountries(state).has(countryId)) return { ok: false, reason: 'Build it where your agency has a base.', cost };
  if (state.scout!.money < cost) return { ok: false, reason: `Building it costs ${formatUSD(cost)}.`, cost };
  return { ok: true, cost };
}

export function openAcademy(state: GameState, countryId: CountryId): OwnAcademy {
  const check = openCheck(state, countryId);
  if (!check.ok) throw new ScoutingError(check.reason!);
  const country = state.countries[countryId]!;
  const city = Object.values(state.clubs)
    .filter((c) => c.countryId === countryId)
    .sort((a, b) => b.reputation - a.reputation)[0]!.cityId;
  const own: OwnAcademy = { name: `${state.agency!.name} Academy`, countryId, cityId: city, openedOn: state.date, level: 1, players: [], graduates: [], earned: usd(0) };
  academyOf(state).own = own;
  addLedger(state, { amount: usd(-check.cost), kind: 'academy', label: `${own.name} built in ${state.cities[city]!.name}` });
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'academy',
    title: `${own.name} opens in ${state.cities[city]!.name}`,
    body: `Pitches, coaches, a dormitory. The first kids arrive in July: you train them, and from ${PLACE_AGE} you place them. Every club that signs one pays a training fee, and you keep ${SELL_ON_PCT}% of his next transfer.`,
    countryId: country.id,
  });
  // A first intake straight away, so there is something to see.
  recruit(state, own, state.date);
  return own;
}

export function upgradeAcademy(state: GameState) {
  const own = state.academy?.own;
  if (!own) throw new ScoutingError('You have no academy.');
  if (own.level >= 3) throw new ScoutingError('It is as good as it gets.');
  const next = (own.level + 1) as 2 | 3;
  const cost = upgradeCost(state, next);
  if (state.scout!.money < cost) throw new ScoutingError(`The upgrade costs ${formatUSD(cost)}.`);
  own.level = next;
  addLedger(state, { amount: usd(-cost), kind: 'academy', label: `${own.name}: level ${next}` });
  for (const id of own.players) if (state.players[id]) state.players[id]!.academyTraining = TRAINING[next];
}

export const isAcademyPlayer = (state: GameState, id: PlayerId) => !!state.academy?.own?.players.includes(id);

/** Each summer: new kids from the academy's country (and, at a better academy, from nearby). */
function recruit(state: GameState, own: OwnAcademy, date: GameDate) {
  const rng = Rng.derive(state.seed, `academy-intake:${date}`);
  const room = CAPACITY[own.level] - own.players.length;
  const n = Math.min(room, INTAKE[own.level]);
  if (n <= 0) return;
  const home = state.countries[own.countryId]!;
  const near = Object.values(state.countries).filter((c) => c.continentId === home.continentId && c.id !== home.id);
  const positions = FORMATIONS['4-3-3']!.map((s) => s.position);
  const kids: PlayerId[] = [];
  for (let i = 0; i < n; i++) {
    const nat = own.level >= 2 && near.length && rng.chance(0.3) ? rng.pick(near) : home;
    const p = generatePlayer(rng, {
      id: newPlayerId(state),
      position: rng.pick(positions),
      targetOvr: clamp(Math.round(34 + own.level * 3 + rng.gaussian(0, 5)), 25, 60),
      age: rng.int(15, 16),
      nationality: nat.id,
      cultureName: nat.culture,
      today: date,
      wealthIndex: home.wealthIndex,
      prodigyChance: PRODIGY[own.level],
    });
    p.academyTraining = TRAINING[own.level];
    state.players[p.id] = p;
    own.players.push(p.id);
    // Your own kids: you know them inside out.
    learn(state, p, 80, 80, date);
    state.knowledge[p.id]!.characterSeen = [...characterOf(p)];
    state.pool[p.id] = { addedOn: date, source: 'manual', starred: false };
    kids.push(p.id);
  }
  addNews(state, {
    date,
    kind: 'career',
    link: 'academy',
    title: `${own.name}: ${kids.length} new kids`,
    body: `A new intake joins ${own.name}. They're in your pool. Place them with clubs from ${PLACE_AGE}.`,
    playerIds: kids,
  });
}

/** The 1st of July: kids who are 19 and still unplaced leave as free agents. */
function releaseOlder(state: GameState, own: OwnAcademy, date: GameDate) {
  for (const id of [...own.players]) {
    const p = state.players[id];
    if (!p) {
      own.players = own.players.filter((x) => x !== id);
      continue;
    }
    if (ageOn(p.birthDate, date) < LEAVE_AGE) continue;
    own.players = own.players.filter((x) => x !== id);
    p.academyTraining = undefined;
    state.freeAgents.push(id);
    addNews(state, { date, kind: 'career', title: `${name(p)} leaves ${own.name}`, body: 'At 19, with no club found, he goes his own way as a free agent.', playerIds: [id] });
  }
}

/** Pitching rule: a kid can be placed from this age. */
export function placeCheck(state: GameState, p: Player): { ok: boolean; reason?: string } {
  if (!isAcademyPlayer(state, p.id)) return { ok: true };
  return ageOn(p.birthDate, state.date) >= PLACE_AGE ? { ok: true } : { ok: false, reason: `Academy kids can join a club from ${PLACE_AGE}.` };
}

/** A graduate signs: he leaves the academy, the club pays a training fee, and you keep a share of his next move. */
export function onGraduate(state: GameState, p: Player, pl: Placement) {
  const own = state.academy?.own;
  if (!own || !own.players.includes(p.id)) return;
  own.players = own.players.filter((x) => x !== p.id);
  own.graduates.push(p.id);
  p.academyTraining = undefined;
  const club = state.clubs[pl.clubId]!;
  const fee = usd(Math.round((TRAINING_FEE[club.tier] * state.countries[club.countryId]!.wealthIndex) / 500) * 500);
  pl.sellOnPct = SELL_ON_PCT;
  own.earned = usd(own.earned + fee);
  addLedger(state, { amount: fee, kind: 'training-fee', label: `Training fee: ${name(p)} to ${club.name}` });
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'academy',
    title: `${own.name} graduate: ${name(p)} joins ${club.name}`,
    body: `${club.name} pay ${formatUSD(fee)} for his training, and you keep ${SELL_ON_PCT}% of whatever they sell him for.`,
    playerIds: [p.id],
    clubIds: [club.id],
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

/** Mondays: upkeep. The 1st of July: sponsorships renew, the academy recruits, 19-year-olds leave. */
export function academyTick(state: GameState, date: GameDate, rolled: boolean) {
  if (!state.scout || state.careerOver || !state.academy) return;
  const own = state.academy.own;
  if (own && new Date(date * 86_400_000).getUTCDay() === 1)
    addLedger(state, { amount: usd(-upkeep(state, own)), kind: 'academy', label: `${own.name} upkeep` }, { merge: true });
  if (!rolled) return;
  renewSponsorships(state, date);
  if (own) {
    releaseOlder(state, own, date);
    recruit(state, own, date);
  }
}

export const nextIntake = (date: GameDate): GameDate => {
  const d = new Date(date * 86_400_000);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return makeDate(y, 7, 1);
};
