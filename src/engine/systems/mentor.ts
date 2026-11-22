import { addDays, type GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { usd } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { RivalScout } from '../model/rival';
import type { LedgerEntry, LedgerKind } from '../model/scout';
import type { GameState } from '../model/world-state';
import { rivalName } from './rivals';
import { ScoutingError } from './scouting';
import { addNews } from './season';

/**
 * Working under a big-name scout: a freelance rival takes you on as his junior. His clients take your calls
 * (you can pitch to them and they know you), phone pitches open sooner, and he passes you briefs from his
 * clubs. He takes a share of everything you earn. Leave inside a year and he goes after your players.
 */

/** His share of your commissions. */
export const MENTOR_CUT = 0.3;
/** His clients treat you at least this well ("Known"). */
export const MENTOR_STANDING = 20;
/** Standing a club needs before it takes your pitch by phone, while he vouches for you. */
export const MENTOR_PHONE_TRUST = 45;
/** Stay this long and you part on good terms. */
export const MENTOR_TERM_DAYS = 365;
const OFFER_DAYS = 21;
/** Money he takes a share of. */
const COMMISSION = new Set<LedgerKind>(['signing-bonus', 'match-bonus', 'mission-reward', 'sale-commission']);

export function mentorOf(state: GameState): RivalScout | undefined {
  const id = state.scout?.mentor?.rivalId;
  return id === undefined ? undefined : state.rivals.find((r) => r.id === id);
}

/** His client clubs, which take your calls while you work under him. */
export function mentorClients(state: GameState): ClubId[] {
  const r = mentorOf(state);
  return r && r.employment.mode === 'freelance' && state.scout?.employment.mode === 'freelance' ? r.employment.clients : [];
}

export const isMentorClient = (state: GameState, clubId: ClubId) => mentorClients(state).includes(clubId);

/** The best-known freelance scout in your home country, with at least two clubs on his books. */
export function pickMentor(state: GameState): RivalScout | undefined {
  const sc = state.scout;
  if (!sc) return undefined;
  const yours = new Set(sc.employment.mode === 'freelance' ? sc.employment.clients : []);
  const home = (r: RivalScout) => r.employment.mode === 'freelance' && r.employment.clients.some((id) => state.clubs[id]?.countryId === sc.homeCountry);
  const r = state.rivals.filter((x) => home(x) && !x.grudge && !x.pursuit?.rumoured).sort((a, b) => b.reputation - a.reputation)[0];
  if (!r || r.employment.mode !== 'freelance') return undefined;
  const emp = r.employment;
  // A big name: well known, with a few clubs that matter.
  r.reputation = Math.max(r.reputation, 40);
  r.skill = Math.max(r.skill, 13);
  const taken = new Set<ClubId>(state.rivals.flatMap((x) => (x.employment.mode === 'fulltime' ? [x.employment.clubId] : [])));
  const extra = Object.values(state.clubs)
    .filter((c) => c.countryId === sc.homeCountry && c.tier >= 2 && c.tier <= 4 && !taken.has(c.id) && !yours.has(c.id) && !emp.clients.includes(c.id))
    .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
  const rng = Rng.derive(state.seed, `mentor:${r.id}`);
  while (emp.clients.length < 3 && extra.length) emp.clients.push(extra.splice(rng.int(0, Math.min(5, extra.length) - 1), 1)[0]!.id);
  emp.clients = emp.clients.filter((id) => !yours.has(id));
  return r;
}

export function joinMentor(state: GameState, rivalId: number) {
  const sc = state.scout!;
  if (sc.employment.mode !== 'freelance') throw new ScoutingError('Only a freelancer can work under another scout.');
  if (sc.mentor) throw new ScoutingError('You already work under someone.');
  const r = state.rivals.find((x) => x.id === rivalId);
  if (!r || r.employment.mode !== 'freelance') throw new ScoutingError('He is no longer taking anyone on.');
  sc.mentor = { rivalId, since: state.date, taken: usd(0) };
  sc.mentorOffer = undefined;
  sc.mentorDone = true;
  r.pursuit = undefined; // he won't chase what you are working on
  const clubs = r.employment.clients.map((id) => state.clubs[id]!.name).join(', ');
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'career',
    title: `You join ${rivalName(r)}'s team`,
    body: `${rivalName(r)} takes you on as his junior. His clients (${clubs}) take your calls and he'll pass you briefs he can't take. He keeps ${Math.round(MENTOR_CUT * 100)}% of what you earn.`,
    clubIds: r.employment.clients,
  });
}

export function acceptMentorOffer(state: GameState) {
  const offer = state.scout?.mentorOffer;
  if (!offer) throw new ScoutingError('That offer has gone.');
  joinMentor(state, offer.rivalId);
}

export function declineMentorOffer(state: GameState) {
  const sc = state.scout!;
  sc.mentorOffer = undefined;
  sc.mentorDone = true;
}

/** End the arrangement. Inside a year (unless he ended it) he takes it badly. Returns what happened, in words. */
export function leaveMentor(state: GameState, why: 'quit' | 'job' | 'his-move' = 'quit'): string {
  const sc = state.scout!;
  const m = sc.mentor;
  if (!m) return '';
  const r = state.rivals.find((x) => x.id === m.rivalId);
  const clients = r && r.employment.mode === 'freelance' ? r.employment.clients : [];
  sc.mentor = undefined;
  if (!r) return '';
  const early = why !== 'his-move' && state.date - m.since < MENTOR_TERM_DAYS;
  const coachShift = early ? -8 : 5;
  for (const id of clients) {
    const coach = state.clubs[id]?.headCoachId;
    if (coach) sc.relationships[coach] = clamp((sc.relationships[coach] ?? 0) + coachShift, 0, 100);
  }
  // Briefs he passed you go back to him, unless the club is your own client.
  const own = new Set(sc.employment.mode === 'freelance' ? sc.employment.clients : []);
  for (const mi of state.missions)
    if ((mi.status === 'offered' || mi.status === 'active') && clients.includes(mi.clubId) && !own.has(mi.clubId)) {
      mi.status = 'expired';
      mi.resolvedOn = state.date;
    }
  if (early) r.grudge = true;
  const name = rivalName(r);
  const message =
    why === 'his-move'
      ? `${name} has moved on, so you are on your own again. His old clubs remember you kindly.`
      : early
        ? `${name} won't forget this. You left inside a year: his clubs hear his side of it, and he'll be after your players.`
        : `You and ${name} part on good terms. His clubs will still take your call in person.`;
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'career',
    title: why === 'his-move' ? `${name} moves on` : early ? `You walk out on ${name}` : `You go it alone, with ${name}'s blessing`,
    body: message + (why === 'job' ? ' (You took a full-time job.)' : ''),
    clubIds: clients,
  });
  return message;
}

/** His share of a payment you just received (called as the money comes in). */
export function mentorCut(state: GameState, entry: Omit<LedgerEntry, 'date'>): Omit<LedgerEntry, 'date'> | undefined {
  const m = state.scout?.mentor;
  if (!m || entry.amount <= 0 || !COMMISSION.has(entry.kind)) return undefined;
  const r = mentorOf(state);
  if (!r) return undefined;
  const cut = usd(Math.round(entry.amount * MENTOR_CUT));
  if (cut <= 0) return undefined;
  m.taken = usd(m.taken + cut);
  return { amount: usd(-cut), kind: 'mentor-cut', label: `${rivalName(r)}'s ${Math.round(MENTOR_CUT * 100)}% share` };
}

/** Mondays: offers come and go; a mentor who stops freelancing lets you go. */
export function mentorTick(state: GameState, date: GameDate) {
  const sc = state.scout;
  if (!sc || state.careerOver) return;
  const r = mentorOf(state);
  if (sc.mentor && (!r || r.employment.mode !== 'freelance')) leaveMentor(state, 'his-move');
  if (sc.mentorOffer && date > sc.mentorOffer.expiresOn) {
    const who = state.rivals.find((x) => x.id === sc.mentorOffer!.rivalId);
    sc.mentorOffer = undefined;
    sc.mentorDone = true;
    if (who)
      addNews(state, { date, kind: 'career', link: 'career', title: `${rivalName(who)} takes on someone else`, body: `You didn't answer his offer in time.` });
  }
  if (sc.mentor || sc.mentorOffer || sc.mentorDone || sc.employment.mode !== 'freelance' || sc.reputation >= 30) return;
  const days = date - (sc.startedOn ?? date);
  if (days < 14 || days > 180) return;
  if (!Rng.derive(state.seed, `mentor-offer:${date}`).chance(0.15)) return;
  const pick = pickMentor(state);
  if (!pick || pick.employment.mode !== 'freelance' || !pick.employment.clients.length) return;
  sc.mentorOffer = { rivalId: pick.id, expiresOn: addDays(date, OFFER_DAYS) };
  addNews(state, {
    date,
    kind: 'career',
    link: 'career',
    title: `${rivalName(pick)} offers to take you on`,
    body: `One of the best-known scouts in the country has heard of you. Work under him and his clubs take your calls, but he keeps ${Math.round(MENTOR_CUT * 100)}% of what you earn. Answer in Career.`,
    clubIds: pick.employment.clients,
  });
}
