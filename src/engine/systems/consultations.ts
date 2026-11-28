import { addDays, isTransferWindow, toParts, type GameDate } from '../core/calendar';
import { CAMPAIGN_BOOST, inSpotlight } from './campaigns';
import type { PlayerId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { FORMATIONS } from '../data/formations';
import type { Club } from '../model/club';
import type { Consultation, ConsultationAnswer } from '../model/consultation';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { canWorkWith, recordSigning } from './employment';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { bestXI } from './squad-needs';
import { canAfford, executeTransfer, offeredWage, transferFee } from './transfers';

/**
 * Players ask you about a club. In a transfer window a player who knows you asks whether he should join a
 * club that has come in for him. He pays for your answer and acts on it; two months later the game checks
 * whether you were right (is he playing?), and he trusts you more or less for it. Steering him to one of
 * your own clubs earns a finder's fee, and costs you more than his trust if it was bad advice.
 */

const ANSWER_DAYS = 5;
const CHECK_DAYS = 60;
const MIN_GAP_DAYS = 21;
/** Rapport a player needs with you before he asks. */
export const CONSULT_RAPPORT = 15;

const name = (p: Player) => `${p.firstName} ${p.lastName}`;
const OPEN_DEAL = new Set(['negotiating', 'agreed']);

/** Would he be in the club's best eleven, as things stand? */
export function wouldStart(state: GameState, p: Player, club: Club): boolean {
  if (!FORMATIONS[club.formation]) return false;
  const squad = club.squad.filter((id) => id !== p.id).map((id) => state.players[id]!);
  return bestXI(club.formation, [...squad, p]).some((s) => s.playerId === p.id);
}

/** What he pays for an answer: more from a better-paid player, and more the better he knows you. */
export function consultationFee(state: GameState, p: Player): USD {
  const rapport = state.scout?.rapport[p.id] ?? 0;
  return usd(Math.round(clamp(p.wage * 0.5 * (0.5 + rapport / 100), 300, 20_000) / 50) * 50);
}

export function finderFee(fee: USD): USD {
  return usd(Math.max(1000, Math.round((fee * 0.02) / 100) * 100));
}

function list(state: GameState): Consultation[] {
  return (state.consultations ??= []);
}

/** Who might ask: players at a club who know you, or whom you placed. */
function askers(state: GameState): Player[] {
  const sc = state.scout!;
  const busy = new Set(state.deals.filter((d) => OPEN_DEAL.has(d.stage)).map((d) => d.playerId));
  const ids = new Set<PlayerId>([
    ...(Object.entries(sc.rapport) as [PlayerId, number][]).filter(([, v]) => v >= CONSULT_RAPPORT).map(([id]) => id),
    ...state.placements.filter((pl) => !pl.endedOn).map((pl) => pl.playerId),
  ]);
  return [...ids].map((id) => state.players[id]).filter((p): p is Player => !!p && !!p.clubId && !busy.has(p.id));
}

function makeConsultation(state: GameState, rng: Rng, date: GameDate): Consultation | undefined {
  const who = rng.shuffle(askers(state));
  for (const p of who.slice(0, 6)) {
    const from = state.clubs[p.clubId!]!;
    const fee = transferFee(state, p);
    const buyers = Object.values(state.clubs).filter(
      (c) =>
        c.id !== from.id &&
        FORMATIONS[c.formation] &&
        c.tier <= from.tier &&
        c.tier >= from.tier - 1 &&
        (c.countryId === from.countryId || state.countries[c.countryId]!.continentId === state.countries[from.countryId]!.continentId) &&
        canAfford(state, c, fee, offeredWage(state, p, c)).ok,
    );
    if (!buyers.length) continue;
    // Half the time a club where he'd play, half the time one where he wouldn't: no answer is always right.
    const starts = buyers.filter((c) => wouldStart(state, p, c));
    const bench = buyers.filter((c) => !starts.includes(c));
    const side = rng.chance(0.5) ? starts : bench;
    const club = rng.pick(side.length ? side : buyers);
    const truth = wouldStart(state, p, club);
    const known = state.scout!.regionKnowledge[club.countryId] ?? 0;
    const sure = 0.6 + Math.min(0.3, known / 200);
    return {
      id: 1 + Math.max(0, ...list(state).map((c) => c.id)),
      playerId: p.id,
      clubId: club.id,
      fromClubId: from.id,
      position: p.naturalPosition,
      postedOn: date,
      answerBy: addDays(date, ANSWER_DAYS),
      fee: consultationFee(state, p),
      read: (rng.chance(sure) ? truth : !truth) ? 'starter' : 'squad',
      finder: canWorkWith(state, club.id).ok,
    };
  }
  return undefined;
}

export function answerConsultation(state: GameState, id: number, answer: ConsultationAnswer): { message: string } {
  const c = list(state).find((x) => x.id === id);
  if (!c || c.answer || c.lapsed) throw new ScoutingError('He has already made up his mind.');
  const p = state.players[c.playerId];
  const club = state.clubs[c.clubId]!;
  if (!p) throw new ScoutingError('He has retired.');
  const sc = state.scout!;
  c.answer = answer;
  c.checkOn = addDays(state.date, CHECK_DAYS);
  addLedger(state, { amount: c.fee, kind: 'consultation', label: `Advice to ${name(p)} about ${club.name}` });
  const go = answer === 'go' || (answer === 'if-starts' && wouldStart(state, p, club));
  let message: string;
  if (go && p.clubId !== club.id) {
    const fee = transferFee(state, p);
    const wage = offeredWage(state, p, club);
    if (canAfford(state, club, fee, wage).ok) {
      executeTransfer(state, p, club, fee, wage, state.date);
      c.moved = true;
      message = `${name(p)} takes your advice and signs for ${club.name}${answer === 'if-starts' ? ', with the coach’s word that he’ll start' : ''}.`;
      if (c.finder) {
        const f = finderFee(fee);
        addLedger(state, { amount: f, kind: 'signing-bonus', label: `Finder's fee: ${name(p)} to ${club.name}` });
        recordSigning(state, club.id);
        message += ` ${club.name} pay you a ${formatUSD(f)} finder's fee.`;
      }
    } else {
      c.moved = false;
      message = `${name(p)} wanted to go, but ${club.name} couldn't make the numbers work. He stays.`;
    }
  } else {
    c.moved = false;
    message =
      answer === 'if-starts'
        ? `${club.name} wouldn't promise him a place, so ${name(p)} stays where he is.`
        : `${name(p)} takes your advice and turns ${club.name} down.`;
  }
  message += ` He paid you ${formatUSD(c.fee)}. You'll see in a couple of months whether you were right.`;
  sc.lastMet[p.id] = state.date;
  return { message };
}

function judge(state: GameState, c: Consultation) {
  const p = state.players[c.playerId];
  const club = state.clubs[c.clubId];
  c.resolvedOn = state.date;
  if (!p || !club) return;
  const sc = state.scout!;
  const rapport = (d: number) => (sc.rapport[p.id] = clamp((sc.rapport[p.id] ?? 0) + d, 0, 100));
  let right: boolean;
  let why: string;
  if (c.moved) {
    if (p.clubId !== club.id) return; // he has moved on again: nothing to judge
    right = wouldStart(state, p, club);
    why = right ? `He is a regular at ${club.name}.` : `He can't get a game at ${club.name}.`;
  } else if (c.answer === 'if-starts') {
    right = true;
    why = `${club.name} couldn't promise him a place, and he was right not to go without one.`;
  } else {
    right = !wouldStart(state, p, club);
    why = right ? `${club.name} are well covered at ${c.position}: he'd have been on the bench.` : `${club.name} are short at ${c.position}: he'd have walked into the side.`;
  }
  c.verdict = right ? 'right' : 'wrong';
  let effect: string;
  if (right) {
    const gain = c.answer === 'if-starts' ? 6 : 12;
    rapport(gain);
    if (c.moved) sc.reputation = clamp(sc.reputation + 1, 0, 100);
    effect = `He trusts you more (rapport +${gain})${c.moved ? ' and tells people who gave him the advice (reputation +1)' : ''}.`;
  } else if (c.finder && c.moved) {
    rapport(-25);
    effect = `You sent him to your own club and it hasn't worked. He feels used (rapport −25).`;
  } else {
    rapport(-15);
    effect = `He won't take your word as gospel again (rapport −15).`;
  }
  c.outcome = `${why} ${effect}`;
  addNews(state, {
    date: state.date,
    kind: 'career',
    title: right ? `Good advice: ${name(p)}` : `Bad advice: ${name(p)}`,
    body: c.outcome,
    clubIds: [club.id],
    playerIds: [p.id],
  });
}

/** Daily: lapse unanswered questions, judge old answers. Mondays in a window: maybe a new question. */
export function consultationTick(state: GameState, date: GameDate) {
  const sc = state.scout;
  if (!sc || state.careerOver) return;
  const all = list(state);
  for (const c of all) {
    if (!c.answer && !c.lapsed && date > c.answerBy) {
      c.lapsed = true;
      c.resolvedOn = date;
      sc.rapport[c.playerId] = clamp((sc.rapport[c.playerId] ?? 0) - 3, 0, 100);
    } else if (c.answer && !c.resolvedOn && c.checkOn !== undefined && date >= c.checkOn) judge(state, c);
  }
  if (all.length > 30) state.consultations = all.filter((c) => !c.resolvedOn || date - c.resolvedOn < 180);
  if (toParts(date).weekday !== 1 || !isTransferWindow(date)) return;
  if (all.some((c) => !c.answer && !c.lapsed)) return;
  const last = Math.max(-Infinity, ...all.map((c) => c.postedOn));
  if (date - last < MIN_GAP_DAYS) return;
  const rng = Rng.derive(state.seed, `consult:${date}`);
  if (!rng.chance(0.4 * (inSpotlight(state) ? CAMPAIGN_BOOST : 1))) return;
  const c = makeConsultation(state, rng, date);
  if (!c) return;
  state.consultations!.push(c);
  const p = state.players[c.playerId]!;
  const club = state.clubs[c.clubId]!;
  addNews(state, {
    date,
    kind: 'career',
    title: `${name(p)} wants your advice`,
    body: `${club.name} have come in for him. Should he go? He'll pay ${formatUSD(c.fee)} for your answer. Reply within ${ANSWER_DAYS} days on Home.`,
    clubIds: [club.id],
    playerIds: [p.id],
  });
}
