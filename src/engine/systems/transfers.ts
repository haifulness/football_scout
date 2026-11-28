import { staleClub } from './club-read';
import { paySellOn } from './academy';
import { startSettling } from './settling';
import { hasTrait } from './character';
import { ageOn, makeDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD, roundPrice, usd, type USD } from '../core/money';
import { Rng } from '../core/rng';
import type { Club } from '../model/club';
import { POSITIONS, type Player, type Position } from '../model/player';
import type { GameState } from '../model/world-state';
import { pickCaptain } from '../generation/world-generator';
import { contractYearsLeft } from './development';
import { TIER_BANDS, weeklyWage } from './economy';
import { ovrAt } from './ratings';
import { addNews } from './season';
import { positionalAverage, squadNeeds } from './squad-needs';
import { agencyOnSignings } from './agency';

const MAX_SQUAD = 32;

/**
 * What a club would have to pay. Free agents cost nothing; otherwise market
 * value with a premium for long contracts and for prising away a starter.
 */
export function transferFee(state: GameState, p: Player): USD {
  if (!p.clubId) return usd(0);
  const years = contractYearsLeft(p, state.date);
  const contractPremium = years >= 3 ? 0.35 : years >= 2 ? 0.2 : years >= 1 ? 0.1 : 0;
  return roundPrice(p.value * (1.05 + contractPremium));
}

/** What a free agent expects a week: the going rate for his level, at the kind of club that level fits, in his home market. */
export function freeAgentWage(state: GameState, p: Player): USD {
  const ovr = ovrAt(p, p.naturalPosition);
  const tiers = [1, 2, 3, 4, 5] as const;
  const tier = tiers.find((t) => ovr >= TIER_BANDS[t].squadOvr.min) ?? 5;
  return weeklyWage(ovr, tier, state.countries[p.nationality]!.wealthIndex);
}

/** The weekly wage a search judges a player by: his ask at the club the search is for, else what he earns (or, if free, expects). */
export function searchWage(state: GameState, p: Player, forClub?: Club): USD {
  if (forClub && p.clubId !== forClub.id) return brokeredWage(state, p, forClub);
  return p.clubId ? p.wage : freeAgentWage(state, p);
}

/** Most a player will knock off what he earns now to make a move. */
export const MAX_PAY_CUT = 0.25;
/** The most above the buying club's pay scale he holds out for (on account of what he earns now). */
const ABOVE_SCALE = 1.3;

/**
 * The wage he asks the buying club for. It starts from the club's pay scale for a player of his level:
 * he wants a 10% rise on what he earns now, but holds out for at most 30% above that scale,
 * and never takes more than a 25% cut.
 */
export function offeredWage(state: GameState, p: Player, buyer: Club): USD {
  const scale = weeklyWage(ovrAt(p, p.naturalPosition), buyer.tier, state.countries[buyer.countryId]!.wealthIndex);
  const wanted = Math.min(p.wage * 1.1, Math.max(scale * ABOVE_SCALE, p.wage * (1 - MAX_PAY_CUT)));
  // A tidy figure, but never past the biggest cut he'd take.
  return usd(Math.max(roundPrice(Math.max(scale, wanted)), Math.round(p.wage * (1 - MAX_PAY_CUT))));
}

/** Most a player knocks off his wage demand for a scout he trusts (at rapport 100). */
export const RAPPORT_WAGE_DISCOUNT = 0.2;

/**
 * The wage he asks in a deal you broker: his demand, less up to 20% the better he knows you
 * (rapport from meeting him). Never a bigger cut than 25% on what he earns now.
 */
export function brokeredWage(state: GameState, p: Player, buyer: Club): USD {
  // A mercenary asks for more.
  const base = offeredWage(state, p, buyer) * (hasTrait(p, 'mercenary') ? 1.15 : 1);
  const rapport = state.scout?.rapport[p.id] ?? 0;
  return usd(Math.max(Math.round(p.wage * (1 - MAX_PAY_CUT)), Math.round(base * (1 - (RAPPORT_WAGE_DISCOUNT * rapport) / 100))));
}

/** How far over its wage budget a club will stretch for a signing it wants. */
export const WAGE_STRETCH = 1.1;

/** What a club can still add to its weekly wage bill (its budget, stretched a little). */
export function wageRoom(state: GameState, club: Club): USD {
  const bill = club.squad.reduce((n, id) => n + state.players[id]!.wage, 0);
  return usd(Math.max(0, Math.round(club.wageBudget * WAGE_STRETCH - bill)));
}

/** A club has room for a typical player's wages: at least its squad's median wage. */
export function hasWageRoomForSigning(state: GameState, club: Club): boolean {
  const wages = club.squad.map((id) => state.players[id]!.wage).sort((a, b) => a - b);
  const median = wages.length ? wages[Math.floor(wages.length / 2)]! : 0;
  return wageRoom(state, club) >= median;
}

export function canAfford(state: GameState, buyer: Club, fee: USD, wage: USD): { ok: boolean; reason?: string } {
  if (fee > buyer.transferBudget)
    return { ok: false, reason: `We can't afford the fee (about ${formatUSD(fee)}; our budget is ${formatUSD(buyer.transferBudget)}).` };
  const bill = buyer.squad.reduce((n, id) => n + state.players[id]!.wage, 0);
  if (bill + wage > buyer.wageBudget * WAGE_STRETCH) return { ok: false, reason: `His wages (${formatUSD(wage)}/wk) would break our wage structure.` };
  return { ok: true };
}

/** Moves a player between clubs: squads, budgets, contract, wage, captaincy. */
export function executeTransfer(state: GameState, p: Player, buyer: Club, fee: USD, wage: USD, date: GameDate) {
  const seller = p.clubId ? state.clubs[p.clubId] : undefined;
  paySellOn(state, p, seller?.id, fee);
  if (seller) {
    seller.squad = seller.squad.filter((id) => id !== p.id);
    if (seller.captainId === p.id) seller.captainId = pickCaptain(seller.squad.map((id) => state.players[id]!));
    seller.coachDoubts = seller.coachDoubts?.filter((id) => id !== p.id);
    seller.transferBudget = usd(seller.transferBudget + Math.round(fee * 0.8)); // some goes on agents & levies
  } else {
    state.freeAgents = state.freeAgents.filter((id) => id !== p.id);
  }
  buyer.transferBudget = usd(Math.max(0, buyer.transferBudget - fee));
  startSettling(state, p, buyer, date);
  // Both squads changed: your read on what each needs is less true now.
  staleClub(state, buyer.id, `They signed a ${p.naturalPosition}`, 25, p.naturalPosition);
  if (seller) staleClub(state, seller.id, `They sold a ${p.naturalPosition}`, 25, p.naturalPosition);
  buyer.squad.push(p.id);
  p.clubId = buyer.id;
  p.wage = wage;
  p.joinedOn = date;
  const age = ageOn(p.birthDate, date);
  const years = age >= 31 ? 1 : age >= 28 ? 2 : age <= 21 ? 5 : 4;
  const { year, month } = toParts(date);
  p.contractUntil = makeDate(year + years + (month >= 7 ? 1 : 0), 6, 30);
  p.injury = p.injury && p.injury.until > date ? p.injury : undefined;
  if (buyer.squad.length > MAX_SQUAD) trimSquad(state, buyer, p.id);
}

/** Releases the least useful player (never the one just signed). */
function trimSquad(state: GameState, club: Club, keep: PlayerId) {
  const worth = (x: Player) => ovrAt(x, x.naturalPosition) + (ageOn(x.birthDate, state.date) <= 20 ? 6 : 0);
  const worst = club.squad
    .filter((id) => id !== keep)
    .map((id) => state.players[id]!)
    .sort((a, b) => worth(a) - worth(b))[0];
  if (!worst) return;
  club.squad = club.squad.filter((id) => id !== worst.id);
  if (club.captainId === worst.id) club.captainId = pickCaptain(club.squad.map((id) => state.players[id]!));
  worst.clubId = undefined;
  worst.contractUntil = undefined;
  worst.wage = usd(0);
  state.freeAgents.push(worst.id);
}

// ── AI transfer market ──────────────────────────────────────────────────

const WEEKLY_BUY_CHANCE = 0.12;
const RECENT_SIGNING_DAYS = 300;

/**
 * Once a week during a window, some clubs with a clear need buy a better
 * player they can afford: from a club at their level or below, or a free agent.
 * This keeps the world moving and can beat you to a target.
 */
/** Late business on deadline day: fewer clubs per hour, paying over the odds and stretching their budget. */
export interface MarketRound {
  chance: number;
  label: string;
  /** Multiplier on the normal fee. */
  premium: number;
  /** Most of its transfer budget a club will spend on one player. */
  budgetShare: number;
}

export interface AiSigning {
  playerId: PlayerId;
  clubId: ClubId;
  fromId?: ClubId;
  fee: USD;
}

export function aiTransferWeek(state: GameState, date: GameDate, round?: MarketRound): { moved: PlayerId[]; signings: AiSigning[] } {
  const rng = Rng.derive(state.seed, round ? round.label : `ai-market:${date}`);
  // Index the market once: players by natural position with their level.
  const byPos = new Map<Position, { p: Player; ovr: number; tier: number }[]>(POSITIONS.map((pos) => [pos, []]));
  const userTargets = new Set(state.deals.filter((d) => d.stage === 'agreed').map((d) => d.playerId)); // agreed deals are binding
  const represented = new Set(state.scout?.represented ?? []); // free agents you act for
  for (const p of Object.values(state.players)) {
    if (userTargets.has(p.id) || represented.has(p.id)) continue;
    // Clubs don't sell a player they only just signed.
    if (p.joinedOn !== undefined && date - p.joinedOn < RECENT_SIGNING_DAYS) continue;
    if (ageOn(p.birthDate, date) > 32) continue;
    byPos.get(p.naturalPosition)!.push({ p, ovr: ovrAt(p, p.naturalPosition), tier: p.clubId ? state.clubs[p.clubId]!.tier : 6 });
  }
  const moved: PlayerId[] = [];
  const signings: AiSigning[] = [];
  const movedSet = new Set<PlayerId>();
  for (const club of rng.shuffle(Object.values(state.clubs))) {
    if (!rng.chance(round?.chance ?? WEEKLY_BUY_CHANCE)) continue;
    const squad = club.squad.map((id) => state.players[id]!);
    const need = squadNeeds(club.formation, squad).find((n) => n.severity >= 0.35);
    if (!need) continue;
    const avg = positionalAverage(squad, need.position).average || need.starterOvr;
    const pool = (byPos.get(need.position) ?? []).filter(
      (c) => !movedSet.has(c.p.id) && c.p.clubId !== club.id && c.tier >= club.tier && c.ovr > avg + 2 && c.ovr <= avg + 12,
    );
    const options = pool
      .map((c) => ({ ...c, fee: round ? roundPrice(transferFee(state, c.p) * round.premium) : transferFee(state, c.p) }))
      .filter((c) => c.fee <= club.transferBudget * (round?.budgetShare ?? 0.6))
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 5);
    if (!options.length) continue;
    const pick = rng.pick(options);
    const wage = offeredWage(state, pick.p, club);
    if (!canAfford(state, club, pick.fee, wage).ok) continue;
    const from = pick.p.clubId ? state.clubs[pick.p.clubId]! : undefined;
    executeTransfer(state, pick.p, club, pick.fee, wage, date);
    movedSet.add(pick.p.id);
    moved.push(pick.p.id);
    signings.push({ playerId: pick.p.id, clubId: club.id, fromId: from?.id, fee: pick.fee });
    if (pick.fee >= 8_000_000 || (club.tier === 1 && state.leagues[club.leagueId]!.level === 1)) {
      addNews(state, {
        date,
        kind: 'transfer',
        title: `${pick.p.firstName} ${pick.p.lastName} joins ${club.name}`,
        body: from
          ? `${club.name} sign ${pick.p.firstName} ${pick.p.lastName} (${need.position}, ${ageOn(pick.p.birthDate, date)}) from ${from.name} for ${formatUSD(pick.fee)}.`
          : `${club.name} sign free agent ${pick.p.firstName} ${pick.p.lastName} (${need.position}, ${ageOn(pick.p.birthDate, date)}).`,
        countryId: club.countryId,
        clubIds: from ? [club.id, from.id] : [club.id],
        playerIds: [pick.p.id],
      });
    }
  }
  agencyOnSignings(state, signings, date, round ? round.label : `ai-market:${date}`);
  return { moved, signings };
}
