import { addDays, ageOn, isTransferWindow, type GameDate } from '../core/calendar';
import { DEADLINE_FEE_PREMIUM, DEADLINE_SIGNOFF_BONUS } from './deadline';
import { specialtyBonus } from './goals';
import { reportBonus } from './reports';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD, roundPrice, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { FORMATIONS } from '../data/formations';
import type { Club, ClubOfficial, OfficialPriorities } from '../model/club';
import { emptyEarnings, type Deal, type DealEvent, type Official, type Placement } from '../model/deal';
import { settleSigningBonuses } from './payouts';
import { canWorkWith, clubTrust, onSigningCompleted, recordWeakPitch } from './employment';
import { onDealSecured, preferenceBonus } from './missions';
import { onMandateSecured, payCommission, pitchRights } from './market';
import type { Player, Position } from '../model/player';
import type { GameState } from '../model/world-state';
import { meetingInfo } from './fieldwork';
import { ovrAt } from './ratings';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { positionalAverage, squadNeeds } from './squad-needs';
import { brokeredWage, canAfford, executeTransfer, transferFee } from './transfers';

/**
 * Recommending a player (PLAN §3.8):
 * 1. You pitch him in person to the Head Coach.
 * 2. Club-level gate: he must beat the club's average at that position (young
 *    prospects can pass on potential), and the club must be able to afford him.
 * 3. The official you pitched to decides (their priorities, your relationship).
 *    If they say no you may go over their head to the other one, once.
 * 4. Negotiations run 1–2 weeks; then the player and his club decide.
 * 5. It completes in a transfer window (or is agreed and completes when one opens).
 */

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const OPEN_STAGES = new Set(['negotiating', 'agreed']);

export function formationPositions(club: Club): Position[] {
  return [...new Set(FORMATIONS[club.formation].map((s) => s.position))];
}

export function clubPositionalAverage(state: GameState, club: Club, pos: Position): number {
  const squad = club.squad.map((id) => state.players[id]!);
  const { average } = positionalAverage(squad, pos);
  if (average) return average;
  // Nobody plays there regularly: use the XI starter as the bar.
  return squadNeeds(club.formation, squad).find((n) => n.position === pos)?.starterOvr ?? 50;
}

export interface GateResult {
  passes: boolean;
  prospect: boolean;
  average: number;
  ovr: number;
  reason?: string;
}

/** The above-average rule, with the prospect exception. Uses the truth: you only see estimates. */
export function gateCheck(state: GameState, p: Player, club: Club, pos: Position): GateResult {
  const average = clubPositionalAverage(state, club, pos);
  const ovr = ovrAt(p, pos);
  if (ovr > average) return { passes: true, prospect: false, average, ovr };
  const young = ageOn(p.birthDate, state.date) <= 21;
  const prospectOk = young && p.hidden.potential > average && (club.acceptsProspects === 'yes' || (club.acceptsProspects === 'prodigies' && p.isProdigy));
  if (prospectOk) return { passes: true, prospect: true, average, ovr };
  const reason =
    young && club.acceptsProspects === 'never'
      ? `He isn't better than what we have at ${pos}, and we don't take on projects.`
      : young && club.acceptsProspects === 'prodigies'
        ? `He isn't better than what we have at ${pos}. We'd only gamble on a genuine prodigy.`
        : `He isn't better than what we already have at ${pos}.`;
  return { passes: false, prospect: false, average, ovr, reason };
}

/** How well a player matches what an official cares about, 0–1 per priority. */
function fitness(state: GameState, p: Player, club: Club, pos: Position, fee: USD): Record<keyof OfficialPriorities, number> {
  const avg = clubPositionalAverage(state, club, pos);
  const ovr = ovrAt(p, pos);
  const need =
    squadNeeds(
      club.formation,
      club.squad.map((id) => state.players[id]!),
    ).find((n) => n.position === pos)?.severity ?? 0;
  const age = ageOn(p.birthDate, state.date);
  return {
    tacticalFit: clamp(0.4 + need * 0.6, 0, 1),
    currentAbility: clamp((ovr - avg) / 10 + 0.5, 0, 1),
    potential: clamp((p.hidden.potential - avg) / 15 + 0.3, 0, 1),
    value: club.transferBudget > 0 ? clamp(1 - fee / club.transferBudget, 0, 1) : fee === 0 ? 1 : 0,
    resale: age <= 23 ? 1 : age <= 26 ? 0.6 : age <= 29 ? 0.3 : 0.1,
    marketing: clamp(Math.log10(Math.max(p.value, 1000)) / 8 + (p.isProdigy ? 0.3 : 0), 0, 1),
    personality: p.hidden.consistency / 20,
  };
}

/** Chance that this official signs off, 0–1. */
/** Trust a club needs in you before its Head Coach takes a pitch by phone. */
export const REMOTE_PITCH_TRUST = 60;
/** A call convinces a little less than sitting across the desk (on the sign-off odds' log scale: about 6 points at even odds). */
const REMOTE_PITCH_PENALTY = 0.25;

/** Whether you can pitch to this club by phone: only clubs you work for, once they trust you enough. */
export function remotePitchCheck(state: GameState, clubId: ClubId): { ok: boolean; trust: number; reason?: string } {
  const trust = clubTrust(state, clubId);
  if (!canWorkWith(state, clubId).ok) return { ok: false, trust, reason: 'Only clubs you work for take pitches by phone.' };
  if (trust < REMOTE_PITCH_TRUST) return { ok: false, trust, reason: `Pitching by phone opens at trust ${REMOTE_PITCH_TRUST} (now ${trust}).` };
  return { ok: true, trust };
}

export function signOffProbability(state: GameState, o: ClubOfficial, p: Player, club: Club, pos: Position, fee: USD, remote = false): number {
  const fit = fitness(state, p, club, pos, fee);
  let num = 0;
  let den = 0;
  for (const k of Object.keys(o.priorities) as (keyof OfficialPriorities)[]) {
    num += o.priorities[k] * fit[k];
    den += o.priorities[k];
  }
  const match = num / den;
  const scout = state.scout!;
  const relationship = scout.relationships[o.id] ?? 0;
  const trust = clubTrust(state, club.id);
  // Pitching exactly what the club described in a discussed brief helps.
  const brief = preferenceBonus(state, p, club, pos);
  return sigmoid(
    (match - 0.5) * 6 +
      (relationship - 25) / 22 +
      (trust - 25) / 40 +
      (scout.skills.negotiation - 10) * 0.05 -
      (o.stubbornness - 50) / 40 +
      brief +
      reportBonus(state, p.id, pos) +
      specialtyBonus(state, p, pos) +
      (state.deadline ? DEADLINE_SIGNOFF_BONUS : 0) -
      (remote ? REMOTE_PITCH_PENALTY : 0),
  );
}

/** Chance the player (and his club) agree once the buying club is on board, 0–1. */
export function playerChance(state: GameState, deal: Deal): number {
  const p = state.players[deal.playerId];
  if (!p) return 0;
  const buyer = state.clubs[deal.clubId]!;
  const seller = p.clubId ? state.clubs[p.clubId] : undefined;
  const rapport = state.scout?.rapport[p.id] ?? 0;
  const tierGap = seller ? seller.tier - buyer.tier : 1; // positive: stepping up
  const ambitious = p.hidden.ambition >= 15;
  const raise = p.wage > 0 ? deal.wage / p.wage : 2;
  let x = 0.6 + rapport / 30 + tierGap * (tierGap > 0 ? 0.6 : 1.1) + (raise >= 1.3 ? 0.5 : 0);
  if (ambitious && tierGap < 0) x -= 1;
  if (!seller) x += 0.8; // free agents want a club
  if (deal.mandateId !== undefined) x += 1; // his club is pushing him out
  if (deal.represented) x += 0.6; // you speak for him
  // Offering more than he asked makes him keener (up to +50% over his demand counts).
  if (deal.wageDemand && deal.wage > deal.wageDemand) x += clamp((deal.wage / deal.wageDemand - 1) * 2.4, 0, 1.2);
  return clamp(sigmoid(x), 0.03, 0.97);
}

export interface PitchArgs {
  playerId: PlayerId;
  clubId: ClubId;
  position: Position;
  to: Official;
  /** Weekly wage to offer him: at least his demand, at most the club's ceiling. Defaults to his demand. */
  wage?: USD;
  /** By phone instead of in person: no trip and no meeting fee, once the club trusts you (see remotePitchCheck). */
  remote?: boolean;
}

const officialOf = (club: Club, _who: Official) => club.headCoachId;
const roleName = (_who: Official) => 'Head Coach';

function log(deal: Deal, date: GameDate, text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral') {
  deal.log.push({ date, text, tone });
}

/**
 * The most the club will pay him a week: what it agreed in a discussed brief for this
 * position, or otherwise half as much again as he asks.
 */
export function wageCeiling(state: GameState, p: Player, club: Club, pos: Position): USD {
  const demand = brokeredWage(state, p, club);
  const brief = state.missions.find((m) => m.status === 'active' && m.clubId === club.id && m.position === pos && m.preferences);
  return usd(Math.max(demand, brief ? brief.preferences!.maxWage : Math.round(demand * 1.5)));
}

/** The fee for a player you bring to a club: a mandate's asking price, or the market fee (more on deadline day). */
export function pitchFee(state: GameState, p: Player, askingFee?: USD): USD {
  if (askingFee !== undefined) return askingFee;
  const fee = transferFee(state, p);
  return state.deadline ? roundPrice(fee * DEADLINE_FEE_PREMIUM) : fee;
}

/** A one-day pitch, in person or (for trusting clubs) by phone. Returns the deal (new, or the existing one for a second pitch). */
export function pitch(state: GameState, args: PitchArgs): Deal {
  const scout = state.scout;
  if (!scout) throw new ScoutingError('Set up your scout first.');
  const p = state.players[args.playerId];
  const club = state.clubs[args.clubId];
  if (!p || !club) throw new ScoutingError('That player or club no longer exists.');
  if (p.clubId === club.id) throw new ScoutingError(`He already plays for ${club.name}.`);
  const rights = pitchRights(state, p, club);
  if (!rights.ok) throw new ScoutingError(rights.reason);
  if (!formationPositions(club).includes(args.position)) throw new ScoutingError(`${club.name} don't use a ${args.position} in their ${club.formation}.`);

  const existing = state.deals.find((d) => d.playerId === p.id && d.clubId === club.id && (OPEN_STAGES.has(d.stage) || d.stage === 'rejected'));
  if (existing && OPEN_STAGES.has(existing.stage)) throw new ScoutingError('You already have a deal in progress for him with this club.');
  if (existing) throw new ScoutingError('The club has given its answer on this player.');

  const officialId = officialOf(club, args.to);
  const o = state.officials[officialId]!;
  const info = meetingInfo(state, { kind: 'official', id: officialId });
  if (!info.allowed) throw new ScoutingError(`The ${roleName(args.to)} won't see a scout of your standing yet (needs reputation ${info.requiredReputation}).`);
  const remote = !!args.remote;
  if (remote) {
    const check = remotePitchCheck(state, club.id);
    if (!check.ok) throw new ScoutingError(check.reason!);
  } else {
    if (!info.inPlace) throw new ScoutingError(`You need to be in ${state.cities[club.cityId]!.name} to pitch in person.`);
    if (scout.money < info.cost) throw new ScoutingError(`The pitch meeting costs ${formatUSD(info.cost)} but you only have ${formatUSD(scout.money)}.`);
    addLedger(state, { amount: usd(-info.cost), kind: 'meeting', label: `Pitch: ${p.firstName} ${p.lastName} to ${club.name} (${roleName(args.to)})` });
  }
  scout.lastMet[officialId] = state.date;

  const deal: Deal = {
    id: state.counters.deal++,
    playerId: p.id,
    clubId: club.id,
    sellingClubId: p.clubId,
    position: args.position,
    stage: 'rejected',
    pitchedTo: [],
    prospect: false,
    openedOn: state.date,
    fee: rights.mandate ? rights.mandate.askingFee : transferFee(state, p),
    mandateId: rights.mandate?.id,
    represented: rights.represented,
    wage: brokeredWage(state, p, club),
    log: [],
  };
  state.deals.unshift(deal);
  deal.pitchedTo.push(args.to);
  log(deal, state.date, `Pitched ${p.firstName} ${p.lastName} as a ${args.position} to the ${roleName(args.to)}, ${o.firstName} ${o.lastName}${remote ? ', by phone' : ''}.`);

  // Club-level checks: ability (or potential) and money.
  const gate = gateCheck(state, p, club, args.position);
  if (!gate.passes) {
    deal.stage = 'rejected';
    deal.clubLevelRejection = true;
    deal.reason = gate.reason;
    scout.relationships[officialId] = clamp((scout.relationships[officialId] ?? 0) - 3, 0, 100);
    recordWeakPitch(state, club.id);
    log(deal, state.date, `Rejected: "${gate.reason}"`, 'bad');
    return deal;
  }
  deal.prospect = gate.prospect;
  deal.fee = pitchFee(state, p, rights.mandate?.askingFee);
  deal.wageDemand = brokeredWage(state, p, club);
  deal.wage = usd(Math.round(clamp(args.wage ?? deal.wageDemand, deal.wageDemand, wageCeiling(state, p, club, args.position))));
  const afford = canAfford(state, club, deal.fee, deal.wage);
  if (!afford.ok) {
    deal.stage = 'rejected';
    deal.clubLevelRejection = true;
    deal.reason = afford.reason;
    log(deal, state.date, `Rejected: "${afford.reason}"`, 'bad');
    return deal;
  }

  // The official decides.
  const rng = Rng.derive(state.seed, `signoff:${deal.id}:${args.to}`);
  const chance = signOffProbability(state, o, p, club, args.position, deal.fee, remote);
  if (rng.next() < chance) {
    deal.stage = 'negotiating';
    deal.reason = undefined;
    deal.signOff = { by: args.to, date: state.date };
    deal.resolvesOn = addDays(state.date, rng.int(7, 14));
    deal.chance = playerChance(state, deal);
    // A yes in person builds the relationship more than one over the phone.
    scout.relationships[officialId] = clamp((scout.relationships[officialId] ?? 0) + (remote ? 1 : 3), 0, 100);
    log(
      deal,
      state.date,
      `Signed off by the ${roleName(args.to)}${gate.prospect ? ' as a prospect' : ''}. Negotiating with ${p.clubId ? state.clubs[p.clubId]!.name : 'the player'}: fee ${formatUSD(deal.fee)}, ${formatUSD(deal.wage)}/wk.`,
      'good',
    );
  } else {
    deal.stage = 'rejected';
    deal.reason = `The ${roleName(args.to)} wasn't convinced.`;
    log(deal, state.date, `The ${roleName(args.to)} turned it down.`, 'bad');
  }
  return deal;
}

const EVENT_TITLE: Record<DealEvent['kind'], string> = {
  completed: 'Deal done',
  agreed: 'Terms agreed',
  failed: 'Deal failed',
  hijacked: 'Deal hijacked',
  collapsed: 'Deal off',
};

function event(state: GameState, deal: Deal, kind: DealEvent['kind'], text: string) {
  state.pendingDealEvents.push({ dealId: deal.id, kind, playerId: deal.playerId, clubId: deal.clubId, text });
  const p = state.players[deal.playerId];
  const club = state.clubs[deal.clubId];
  addNews(state, {
    date: state.date,
    kind: 'career',
    title: `${EVENT_TITLE[kind]}: ${p ? `${p.firstName} ${p.lastName}` : 'your player'} → ${club?.name ?? 'the club'}`,
    body: text,
    clubIds: club ? [club.id] : undefined,
    playerIds: p ? [p.id] : undefined,
  });
}

/** Another club signed the player: your deal is dead. */
export function hijackDeal(state: GameState, deal: Deal, reason: string) {
  const p = state.players[deal.playerId];
  deal.stage = 'hijacked';
  deal.reason = reason;
  log(deal, state.date, `Hijacked: ${reason}`, 'bad');
  event(state, deal, 'hijacked', p ? `${p.firstName} ${p.lastName}: ${reason}` : reason);
}

/** Daily: resolve negotiations, complete agreed deals when a window is open, notice hijacks. */
export function resolveDeals(state: GameState, date: GameDate) {
  for (const deal of state.deals) {
    if (!OPEN_STAGES.has(deal.stage)) continue;
    const p = state.players[deal.playerId];
    const buyer = state.clubs[deal.clubId]!;
    if (!p) {
      deal.stage = 'collapsed';
      deal.reason = 'He retired.';
      log(deal, date, 'Deal off: he retired.', 'bad');
      event(state, deal, 'collapsed', deal.reason);
      continue;
    }
    if (p.clubId !== deal.sellingClubId) {
      if (!p.clubId) {
        // Released: he's now a free agent, which only makes it cheaper.
        deal.sellingClubId = undefined;
        deal.fee = usd(0);
        log(deal, date, 'He was released by his club: now a free transfer.', 'good');
      } else {
        hijackDeal(state, deal, `${state.clubs[p.clubId]!.name} signed him first.`);
        continue;
      }
    }
    deal.chance = playerChance(state, deal);

    if (deal.stage === 'negotiating' && deal.resolvesOn !== undefined && date >= deal.resolvesOn) {
      const rng = Rng.derive(state.seed, `deal:${deal.id}:resolve`);
      if (rng.next() < deal.chance) {
        if (isTransferWindow(date)) completeDeal(state, deal, date);
        else {
          deal.stage = 'agreed';
          if (deal.mandateId !== undefined) onMandateSecured(state, deal);
          else onDealSecured(state, deal);
          log(deal, date, 'Terms agreed. The move goes through when the transfer window opens.', 'good');
          event(state, deal, 'agreed', `${p.firstName} ${p.lastName} agrees to join ${buyer.name} when the window opens.`);
        }
      } else {
        deal.stage = 'failed';
        deal.reason =
          deal.sellingClubId && deal.mandateId === undefined && rng.chance(0.4)
            ? `${state.clubs[deal.sellingClubId]!.name} wouldn't sell.`
            : `He decided to stay where he is.`;
        log(deal, date, `Collapsed: ${deal.reason}`, 'bad');
        event(state, deal, 'failed', `${p.firstName} ${p.lastName}: ${deal.reason}`);
      }
    } else if (deal.stage === 'agreed' && isTransferWindow(date)) {
      completeDeal(state, deal, date);
    }
  }
}

function completeDeal(state: GameState, deal: Deal, date: GameDate) {
  const p = state.players[deal.playerId]!;
  const buyer = state.clubs[deal.clubId]!;
  const afford = canAfford(state, buyer, deal.fee, deal.wage);
  if (!afford.ok) {
    deal.stage = 'collapsed';
    deal.reason = 'The club can no longer afford him.';
    log(deal, date, `Collapsed: ${deal.reason}`, 'bad');
    event(state, deal, 'collapsed', `${p.firstName} ${p.lastName}: ${deal.reason}`);
    return;
  }
  const average = clubPositionalAverage(state, buyer, deal.position);
  const ovr = ovrAt(p, deal.position);
  const from = deal.sellingClubId ? state.clubs[deal.sellingClubId] : undefined;
  executeTransfer(state, p, buyer, deal.fee, deal.wage, date);
  deal.stage = 'completed';
  deal.completedOn = date;
  if (deal.mandateId !== undefined) {
    // A sale for a client: commission, no placement (the buyer didn't hire you).
    onMandateSecured(state, deal);
    payCommission(state, deal);
    log(
      deal,
      date,
      `HERE WE GO! ${p.firstName} ${p.lastName} joins ${buyer.name} for ${formatUSD(deal.fee)}. Sale completed for ${from?.name ?? 'your client'}.`,
      'good',
    );
    event(state, deal, 'completed', `${p.firstName} ${p.lastName} sold to ${buyer.name} for ${formatUSD(deal.fee)}. Commission paid.`);
    addNews(state, {
      date,
      kind: 'transfer',
      title: `Here we go: ${p.firstName} ${p.lastName} to ${buyer.name}`,
      body: `${from?.name ?? 'His club'} sell ${p.firstName} ${p.lastName} to ${buyer.name} for ${formatUSD(deal.fee)}, brokered by scout ${state.scout!.name}.`,
      countryId: buyer.countryId,
      clubIds: from ? [buyer.id, from.id] : [buyer.id],
      playerIds: [p.id],
    });
    return;
  }
  const placement: Placement = {
    id: state.placements.length,
    dealId: deal.id,
    playerId: p.id,
    clubId: buyer.id,
    position: deal.position,
    signedOn: date,
    expiresOn: p.contractUntil!,
    fee: deal.fee,
    ovrGap: ovr - average,
    prospect: deal.prospect,
    nationality: p.nationality,
    age: ageOn(p.birthDate, date),
    free: !deal.sellingClubId,
    mode: state.scout!.employment.mode === 'fulltime' ? 'fulltime' : 'freelance',
    bonus: usd(0),
    bonusPaid: false,
    earnings: emptyEarnings(),
  };
  state.placements.push(placement);
  settleSigningBonuses(state);
  onSigningCompleted(state, buyer.id);
  onDealSecured(state, deal);
  const scout = state.scout!;
  // Reputation builds steadily: about +2 for a lower-league signing, +3 mid-table, up to +4 for a top-flight one that clearly beats the average,
  // and less the better known you already are (half as much at 50), so the top of the game takes a career to reach.
  const repGain = Math.max(1, Math.round((0.8 + (6 - buyer.tier) * 0.4 + clamp(placement.ovrGap / 5, 0, 1)) * (1 - scout.reputation / 100)));
  scout.reputation = clamp(scout.reputation + repGain, 0, 100);
  log(
    deal,
    date,
    `HERE WE GO! ${p.firstName} ${p.lastName} signs for ${buyer.name}${deal.fee ? ` for ${formatUSD(deal.fee)}` : ' on a free'}. Reputation +${repGain}.`,
    'good',
  );
  event(
    state,
    deal,
    'completed',
    `${p.firstName} ${p.lastName} joins ${buyer.name}${from ? ` from ${from.name}` : ''}.${placement.bonus ? ` Signing bonus ${formatUSD(placement.bonus)}.` : ' Prospect: no signing bonus.'}`,
  );
  addNews(state, {
    date,
    kind: 'transfer',
    title: `Here we go: ${p.firstName} ${p.lastName} to ${buyer.name}`,
    body: `${buyer.name} complete the signing of ${p.firstName} ${p.lastName}${from ? ` from ${from.name}` : ' on a free transfer'}${deal.fee ? ` for ${formatUSD(deal.fee)}` : ''}, recommended by scout ${scout.name}.`,
    countryId: buyer.countryId,
    clubIds: from ? [buyer.id, from.id] : [buyer.id],
    playerIds: [p.id],
  });
}
