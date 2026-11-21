import { addDays, ageOn, type GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import { formatUSD, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import type { Dilemma, DilemmaKind } from '../model/dilemma';
import type { Player } from '../model/player';
import type { GameState } from '../model/world-state';
import { learn } from './knowledge';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';

/**
 * Dilemmas: about once a month the game puts a choice to you, built from your own career (your clients,
 * your pool). Each choice has a visible short-term effect and moves a hidden integrity score, which shifts
 * how much clubs trust you and how often shady offers come your way.
 */

const ANSWER_DAYS = 5;
const MIN_GAP_DAYS = 25;
const DAILY_CHANCE = 1 / 12;

export interface DilemmaChoice {
  key: string;
  label: string;
  /** What you can expect (short-term, visible). */
  hint: string;
}

export interface DilemmaText {
  title: string;
  body: string;
  choices: DilemmaChoice[];
}

const playerName = (p?: Player) => (p ? `${p.firstName} ${p.lastName}` : 'the player');

function myClubs(state: GameState): ClubId[] {
  const e = state.scout!.employment;
  return e.mode === 'fulltime' ? [e.clubId] : e.clients;
}

/** The words for a dilemma, from its stored context. */
export function dilemmaText(state: GameState, d: Dilemma): DilemmaText {
  const p = d.playerId ? state.players[d.playerId] : undefined;
  const club = d.clubId ? state.clubs[d.clubId] : undefined;
  const coach = club ? state.officials[club.headCoachId] : undefined;
  const coachName = coach ? `${coach.firstName} ${coach.lastName}` : 'the coach';
  const money = d.amount ? formatUSD(d.amount) : '';
  switch (d.kind) {
    case 'agent-cut':
      return {
        title: `An agent offers you ${money}`,
        body: `${playerName(p)}'s agent has a proposal: put his client in front of ${club?.name ?? 'one of your clubs'} and there's ${money} in it for you, no questions asked.`,
        choices: [
          { key: 'take', label: `Take the ${money}`, hint: 'Money now. If it gets out, clubs will hear about it.' },
          { key: 'decline', label: 'Turn him down', hint: 'Nothing changes, except what you know about yourself.' },
          { key: 'report', label: `Tell ${club?.name ?? 'the club'}`, hint: `${coachName} will appreciate the honesty.` },
        ],
      };
    case 'inflate-report':
      return {
        title: `${coachName} wants a favour`,
        body: `${coachName} already wants ${playerName(p)} at ${club?.name ?? 'the club'}, but the board isn't convinced. He asks you to write him up a few points better than you rate him.`,
        choices: [
          { key: 'inflate', label: 'Write what he wants', hint: `${coachName} owes you one. Your name is on the report.` },
          { key: 'refuse', label: 'Report what you saw', hint: 'He may be put out. Clubs learn your reports can be trusted.' },
        ],
      };
    case 'talk-down':
      return {
        title: `${club?.name ?? 'A club'} want you to talk a player down`,
        body: `${club?.name ?? 'The club'} plan to bid for ${playerName(p)}. ${coachName} asks you to tell people you've seen worrying things in him, so his price drops before they move.`,
        choices: [
          { key: 'spread', label: 'Spread the doubts', hint: `${coachName} will be grateful. It isn't true.` },
          { key: 'refuse', label: 'Refuse', hint: 'He may be put out.' },
        ],
      };
    case 'family-fee':
      return {
        title: `${playerName(p)}'s family make you an offer`,
        body: `${playerName(p)}'s family will pay you ${money} to steer him to a big club, ready or not. You think he needs a club where he'll play.`,
        choices: [
          { key: 'take', label: `Take the ${money}`, hint: 'The family loves you. The advice is bad for him.' },
          { key: 'truth', label: 'Tell them what you think', hint: 'They may not like it. He trusts you more.' },
        ],
      };
  }
}

function pick<T>(rng: Rng, xs: T[]): T | undefined {
  return xs.length ? rng.pick(xs) : undefined;
}

/** Build a dilemma that fits the career right now, or nothing if none fits. */
function makeDilemma(state: GameState, rng: Rng, date: GameDate): Dilemma | undefined {
  const sc = state.scout!;
  const clubs = myClubs(state);
  const pool = Object.keys(state.pool)
    .map((id) => state.players[id as PlayerId])
    .filter((p): p is Player => !!p);
  const integrity = sc.integrity ?? 50;
  const options: { kind: DilemmaKind; weight: number }[] = [];
  if (clubs.length && pool.some((p) => p.clubId && !clubs.includes(p.clubId))) options.push({ kind: 'agent-cut', weight: 1.4 - integrity / 100 });
  if (clubs.length) options.push({ kind: 'inflate-report', weight: 0.8 }, { kind: 'talk-down', weight: 0.6 });
  if (pool.some((p) => ageOn(p.birthDate, date) <= 20)) options.push({ kind: 'family-fee', weight: 0.7 });
  if (!options.length) return undefined;
  const kind = rng.weighted(options, (o) => o.weight).kind;
  const base = { id: (state.dilemmas?.at(-1)?.id ?? 0) + 1, kind, postedOn: date, expiresOn: addDays(date, ANSWER_DAYS) };
  const clubId = pick(rng, clubs);
  switch (kind) {
    case 'agent-cut': {
      const p = pick(rng, pool.filter((x) => x.clubId && !clubs.includes(x.clubId)))!;
      return { ...base, playerId: p.id, clubId, amount: usd(Math.round(clamp(p.value * 0.02, 1000, 25_000) / 100) * 100) };
    }
    case 'inflate-report':
    case 'talk-down': {
      const club = state.clubs[clubId!]!;
      const others = Object.values(state.players).filter((x) => x.clubId && x.clubId !== club.id && state.clubs[x.clubId]!.countryId === club.countryId && x.value <= club.transferBudget);
      const p = pick(rng, others.slice(0, 400));
      return p ? { ...base, playerId: p.id, clubId } : undefined;
    }
    case 'family-fee': {
      const p = pick(rng, pool.filter((x) => ageOn(x.birthDate, date) <= 20))!;
      return { ...base, playerId: p.id, amount: usd(Math.round(clamp(p.value * 0.01, 500, 10_000) / 100) * 100) };
    }
  }
}

/** Daily: now and then, a choice. Unanswered ones lapse. */
export function dilemmaTick(state: GameState, date: GameDate) {
  const sc = state.scout;
  if (!sc || state.careerOver) return;
  state.dilemmas ??= [];
  for (const d of state.dilemmas) {
    if (!d.resolvedOn && !d.lapsed && date > d.expiresOn) {
      d.lapsed = true;
      d.resolvedOn = date;
    }
  }
  if (state.dilemmas.some((d) => !d.resolvedOn)) return;
  const last = state.dilemmas.at(-1)?.postedOn ?? sc.startedOn ?? date;
  if (date - last < MIN_GAP_DAYS) return;
  const rng = Rng.derive(state.seed, `dilemma:${date}`);
  if (!rng.chance(DAILY_CHANCE)) return;
  const d = makeDilemma(state, rng, date);
  if (!d) return;
  state.dilemmas.push(d);
  if (state.dilemmas.length > 24) state.dilemmas = state.dilemmas.slice(-24);
  const text = dilemmaText(state, d);
  addNews(state, {
    date,
    kind: 'career',
    title: `A choice to make: ${text.title}`,
    body: `${text.body} Answer on Home within ${ANSWER_DAYS} days.`,
    clubIds: d.clubId ? [d.clubId] : undefined,
    playerIds: d.playerId ? [d.playerId] : undefined,
  });
}

const relate = (state: GameState, clubId: ClubId | undefined, delta: number) => {
  const sc = state.scout!;
  const club = clubId ? state.clubs[clubId] : undefined;
  if (!club) return;
  sc.relationships[club.headCoachId] = clamp((sc.relationships[club.headCoachId] ?? 0) + delta, 0, 100);
};

/** Your answer: apply its effects once and say what came of it. */
export function resolveDilemma(state: GameState, id: number, choice: string): { outcome: string } {
  const sc = state.scout!;
  const d = state.dilemmas?.find((x) => x.id === id);
  if (!d || d.resolvedOn) throw new ScoutingError('That has already been settled.');
  const text = dilemmaText(state, d);
  if (!text.choices.some((c) => c.key === choice)) throw new ScoutingError('That is not one of the options.');
  const rng = Rng.derive(state.seed, `dilemma-answer:${d.id}`);
  const p = d.playerId ? state.players[d.playerId] : undefined;
  const integrity = (delta: number) => (sc.integrity = clamp((sc.integrity ?? 50) + delta, 0, 100));
  let outcome = '';
  switch (`${d.kind}:${choice}`) {
    case 'agent-cut:take':
      addLedger(state, { amount: d.amount as USD, kind: 'award', label: `A "thank you" from ${playerName(p)}'s agent` });
      integrity(-15);
      if (rng.chance(0.25)) {
        sc.reputation = clamp(sc.reputation - 4, 0, 100);
        relate(state, d.clubId, -10);
        outcome = `You took the money, and word got out. Your reputation takes a hit (−4), and ${state.clubs[d.clubId!]?.name ?? 'the club'} trust you less.`;
      } else outcome = `You took ${formatUSD(d.amount!)}. Nobody found out. This time.`;
      break;
    case 'agent-cut:decline':
      integrity(5);
      outcome = 'You turned him down. He shrugged and moved on.';
      break;
    case 'agent-cut:report':
      integrity(8);
      relate(state, d.clubId, 6);
      outcome = `You told ${state.clubs[d.clubId!]?.name ?? 'the club'}. The coach thanks you for it (relationship +6).`;
      break;
    case 'inflate-report:inflate':
      integrity(-10);
      relate(state, d.clubId, 10);
      outcome = 'You wrote what he wanted. He owes you one (relationship +10).';
      break;
    case 'inflate-report:refuse':
      integrity(6);
      relate(state, d.clubId, -4);
      outcome = 'You reported what you saw. He was put out (relationship −4), but your word means something.';
      break;
    case 'talk-down:spread':
      integrity(-12);
      relate(state, d.clubId, 8);
      outcome = 'You spread the doubts. The coach is grateful (relationship +8).';
      break;
    case 'talk-down:refuse':
      integrity(5);
      relate(state, d.clubId, -3);
      outcome = 'You refused. The coach was put out (relationship −3).';
      break;
    case 'family-fee:take':
      addLedger(state, { amount: d.amount as USD, kind: 'award', label: `A fee from ${playerName(p)}'s family` });
      integrity(-8);
      if (p) sc.rapport[p.id] = clamp((sc.rapport[p.id] ?? 0) + 20, 0, 100);
      outcome = `You took ${formatUSD(d.amount!)}. The family adore you (rapport +20).`;
      break;
    case 'family-fee:truth':
      integrity(6);
      if (p) {
        sc.rapport[p.id] = clamp((sc.rapport[p.id] ?? 0) + 10, 0, 100);
        learn(state, p, 10, 80, state.date);
      }
      outcome = `They didn't love it, but ${playerName(p)} trusts you more (rapport +10), and the long talk taught you about him.`;
      break;
  }
  d.choice = choice;
  d.outcome = outcome;
  d.resolvedOn = state.date;
  return { outcome };
}
