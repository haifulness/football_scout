import { addDays, ageOn, formatDate, toParts, type GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { formatUSD, roundPrice, usd, type USD } from '../core/money';
import { Rng, clamp } from '../core/rng';
import { FORMATIONS } from '../data/formations';
import type { Club, ClubTier, OfficialPriorities } from '../model/club';
import type { Deal } from '../model/deal';
import type { Mission, MissionPreferences, MissionRequirements, NegotiationKey } from '../model/mission';
import { ATTRIBUTE_LABEL, type AttributeKey, type Player, type Position } from '../model/player';
import type { GameState } from '../model/world-state';
import { clubPositionalAverage } from './deals';
import { clubRecord, clubTrust } from './employment';
import { presidentOf } from './board';
import { positionGroup, specialties } from './goals';
import { POSITION_WEIGHTS, ovrAt } from './ratings';
import { brokeredWage, hasWageRoomForSigning } from './transfers';
import { ScoutingError, addLedger } from './scouting';
import { addNews } from './season';
import { squadNeeds } from './squad-needs';

/**
 * Missions (PLAN §3.11): your employer or clients ask for a specific player
 * profile by a deadline. Accepting is optional; failing an accepted one costs
 * trust. It succeeds when a matching player signs (or agrees terms) for the
 * club in time.
 */

const OFFER_DAYS = 10;
/** Days before an unanswered offer lapses when you get a reminder. */
export const OFFER_REMINDER_DAYS = 2;
const MAX_ACTIVE = 3;
const FREELANCE_REWARD: Record<ClubTier, [number, number]> = {
  5: [1_000, 3_000],
  4: [3_000, 8_000],
  3: [8_000, 25_000],
  2: [25_000, 80_000],
  1: [80_000, 250_000],
};
const LEFT = new Set<Position>(['LB', 'LWB', 'LM', 'LW']);
const RIGHT = new Set<Position>(['RB', 'RWB', 'RM', 'RW']);

const OPEN = (m: Mission) => m.status === 'offered' || m.status === 'active';

/** Clubs that can give you missions: your employer, or your freelance clients. */
function workClubs(state: GameState): ClubId[] {
  const e = state.scout?.employment;
  if (!e) return [];
  return e.mode === 'fulltime' ? [e.clubId] : e.clients;
}

function topPriorities(p: OfficialPriorities, n = 2): (keyof OfficialPriorities)[] {
  return (Object.entries(p) as [keyof OfficialPriorities, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function makeMission(state: GameState, club: Club, rng: Rng): Mission | undefined {
  const squad = club.squad.map((id) => state.players[id]!);
  // Never two open briefs for the same position at one club.
  const openHere = new Set(state.missions.filter((m) => m.clubId === club.id && OPEN(m)).map((m) => m.position));
  const needs = squadNeeds(club.formation, squad).filter((n) => !openHere.has(n.position) && (n.position !== 'GK' || rng.chance(0.3)));
  if (!needs.length) return undefined;
  // A club that knows your specialty asks for it when it has any need there.
  const group = specialties(state).find((s) => s.kind === 'position')?.group;
  const niche = group ? needs.find((n) => positionGroup(n.position) === group && n.severity >= 0.1) : undefined;
  const byName = !!niche && rng.chance(0.5);
  // Vary the asks: weigh each real need by how pressing it is, and go easy on positions this club asked for
  // in its last few briefs (or that any club asked for just now), so the same position doesn't come up again and again.
  const recent = state.missions.filter((m) => state.date - m.postedOn < 180).sort((a, b) => b.postedOn - a.postedOn);
  const askedHere = recent.filter((m) => m.clubId === club.id).slice(0, 3).map((m) => m.position);
  const askedAnywhere = recent.slice(0, 3).map((m) => m.position);
  const weight = (n: (typeof needs)[number]) =>
    (0.05 + n.severity) * (askedHere.includes(n.position) ? 0.1 : 1) * (askedAnywhere.includes(n.position) ? 0.4 : 1);
  const real = needs.filter((n) => n.severity >= 0.1);
  const need = (byName && niche && !askedHere.includes(niche.position) ? niche : undefined) ?? rng.weighted(real.length ? real : needs, weight);
  const pos = need.position;
  const avg = clubPositionalAverage(state, club, pos);
  const coach = state.officials[club.headCoachId]!;
  const req: MissionRequirements = { minOvr: avg + rng.int(1, 4) };
  const policy = presidentOf(state, club)?.policy;
  if (policy === 'youth' && rng.chance(0.7)) req.maxAge = 23;
  else if (topPriorities(coach.priorities, 3).some((k) => k === 'resale' || k === 'potential') && rng.chance(0.6)) req.maxAge = 23;
  else if (rng.chance(0.3)) req.maxAge = rng.int(27, 30);
  else if (rng.chance(0.12)) req.minAge = 25;
  if (policy === 'win-now') req.minOvr += 2;
  if (policy === 'homegrown' && rng.chance(0.6)) req.nationality = club.countryId;
  if (club.transferBudget > 20_000) req.maxFee = roundPrice(club.transferBudget * (policy === 'sell' ? rng.float(0.1, 0.3) : rng.float(0.3, 0.7)));
  if (LEFT.has(pos) && rng.chance(0.4)) req.foot = 'Left';
  if (RIGHT.has(pos) && rng.chance(0.4)) req.foot = 'Right';
  const weeks = rng.int(4, 10);
  const e = state.scout!.employment;
  const reward =
    e.mode === 'fulltime' ? usd(Math.round((e.salary / 52) * rng.int(2, 6))) : usd(Math.round(rng.float(...FREELANCE_REWARD[club.tier]) / 100) * 100);
  const brief =
    (byName ? `We hear you're the one to ask about ${group === 'GK' ? 'goalkeepers' : group === 'DEF' ? 'defenders' : group === 'MID' ? 'midfielders' : 'forwards'}. ` : '') +
    (policy === 'sell' && req.maxFee !== undefined
      ? `Money's tight, so the board wants a bargain at ${pos}. `
      : req.nationality
        ? `The board wants one of our own: a ${pos} from ${state.countries[club.countryId]!.name}. `
        : policy === 'win-now'
          ? `The board wants results this season. `
          : '') +
    (need.severity >= 0.45
      ? `We're short at ${pos}. We need someone ready to start.`
      : req.maxAge && req.maxAge <= 23
        ? `The coach wants a young ${pos} we can develop.`
        : `We want to raise the level at ${pos}.`);
  return {
    id: state.counters.mission++,
    clubId: club.id,
    position: pos,
    requirements: req,
    brief,
    postedOn: state.date,
    acceptBy: addDays(state.date, OFFER_DAYS),
    weeks,
    reward,
    status: 'offered',
  };
}

export function describeRequirements(r: MissionRequirements, pos: Position, state?: GameState): string[] {
  const out = [`${pos} rated ${r.minOvr}+`];
  if (r.maxAge !== undefined) out.push(`aged ${r.maxAge} or under`);
  if (r.minAge !== undefined) out.push(`aged ${r.minAge} or over`);
  if (r.maxFee !== undefined) out.push(`fee up to ${formatUSD(r.maxFee)}`);
  if (r.foot) out.push(`${r.foot.toLowerCase()}-footed`);
  if (r.nationality) out.push(`from ${state?.countries[r.nationality]?.name ?? r.nationality.toUpperCase()}`);
  return out;
}

/** Does this player (at this fee) meet the brief? Judged on the truth. */
export function missionFit(state: GameState, m: Mission, p: Player, fee: USD): { ok: boolean; failed: string[] } {
  const r = m.requirements;
  const failed: string[] = [];
  if (ovrAt(p, m.position) < r.minOvr) failed.push('not good enough');
  const age = ageOn(p.birthDate, state.date);
  if (r.maxAge !== undefined && age > r.maxAge) failed.push('too old');
  if (r.minAge !== undefined && age < r.minAge) failed.push('too young');
  if (r.maxFee !== undefined && fee > r.maxFee) failed.push('too expensive');
  if (r.foot && p.foot !== r.foot && p.foot !== 'Both') failed.push(`not ${r.foot.toLowerCase()}-footed`);
  if (r.nationality && p.nationality !== r.nationality) failed.push('not from the club’s country');
  return { ok: failed.length === 0, failed };
}

// ── Discussing a brief ────────────────────────────────────────────────

/** Ask the club what lies behind the brief. Free, once per mission, while it is offered or active. */
export function discussMission(state: GameState, id: number): MissionPreferences {
  const m = state.missions.find((x) => x.id === id);
  if (!m || (m.status !== 'offered' && m.status !== 'active')) throw new ScoutingError('That brief is closed.');
  if (m.preferences) return m.preferences;
  const club = state.clubs[m.clubId]!;
  const squad = club.squad.map((pid) => state.players[pid]!).filter(Boolean);
  // Wages: what their regulars earn, with a little headroom.
  const wages = squad
    .map((p) => p.wage)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  const median = wages[Math.floor(wages.length / 2)] ?? 1_000;
  const maxWage = roundPrice(Math.max(median * 1.4, 300));
  // Key attributes: the two that weigh most at the position, a notch above what they have there now.
  const weights = Object.entries(POSITION_WEIGHTS[m.position]) as [AttributeKey, number][];
  const top = weights
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k);
  const atPos = squad.filter((p) => p.naturalPosition === m.position);
  const pool = atPos.length ? atPos : squad;
  const keyAttributes = top.map((attribute) => ({
    attribute,
    min: clamp(Math.round(pool.reduce((n, p) => n + p.attributes[attribute], 0) / Math.max(1, pool.length)) + 1, 6, 18),
  }));
  // Age: their brief if it set one, else what the coach values.
  const coach = state.officials[club.headCoachId]!;
  const youth = topPriorities(coach.priorities, 3).some((k) => k === 'resale' || k === 'potential');
  const ready = topPriorities(coach.priorities).includes('currentAbility');
  let idealAge: [number, number] = youth ? [18, 23] : ready ? [24, 30] : [21, 28];
  const r = m.requirements;
  if (r.maxAge !== undefined) idealAge = [Math.min(idealAge[0], r.maxAge - 3), Math.min(idealAge[1], r.maxAge)];
  if (r.minAge !== undefined) idealAge = [Math.max(idealAge[0], r.minAge), Math.max(idealAge[1], r.minAge + 3)];
  m.preferences = { maxWage, keyAttributes, idealAge, discussedOn: state.date };
  return m.preferences;
}

// ── Negotiating a brief ───────────────────────────────────────────────

/** Cut to the reward when the club loosens a hard requirement. */
const REQUIREMENT_CUT: Partial<Record<NegotiationKey, number>> = { fee: 0.15, rating: 0.15, ageLimit: 0.1 };

export interface NegotiationOption {
  key: NegotiationKey;
  /** "Wage up to $11k → $14k/wk" */
  label: string;
  /** Share of the reward you give up if they agree (requirements only). */
  rewardCut?: number;
  chance: number;
  outcome?: 'agreed' | 'refused';
}

const ATTR = (k: NegotiationKey) => (k.startsWith('attr:') ? (k.slice(5) as AttributeKey) : undefined);

function proposal(m: Mission, key: NegotiationKey): { label: string; apply: () => void } | undefined {
  const p = m.preferences;
  const r = m.requirements;
  if (key === 'wage' && p) {
    const to = roundPrice(p.maxWage * 1.3);
    return { label: `Wage up to ${formatUSD(p.maxWage)} → ${formatUSD(to)}/wk`, apply: () => (p.maxWage = to) };
  }
  if (key === 'idealAge' && p) {
    const to: [number, number] = [Math.max(16, p.idealAge[0] - 2), Math.min(38, p.idealAge[1] + 2)];
    return { label: `Ideal age ${p.idealAge[0]}–${p.idealAge[1]} → ${to[0]}–${to[1]}`, apply: () => (p.idealAge = to) };
  }
  const attr = ATTR(key);
  if (attr && p) {
    const k = p.keyAttributes.find((x) => x.attribute === attr);
    if (!k || k.min <= 4) return undefined;
    const to = Math.max(4, k.min - 2);
    return { label: `${ATTRIBUTE_LABEL[attr]} ${k.min}+ → ${to}+`, apply: () => (k.min = to) };
  }
  if (key === 'fee' && r.maxFee !== undefined) {
    const to = roundPrice(r.maxFee * 1.3);
    return { label: `Fee up to ${formatUSD(r.maxFee)} → ${formatUSD(to)}`, apply: () => (r.maxFee = to) };
  }
  if (key === 'rating' && r.minOvr > 1) {
    const to = r.minOvr - 2;
    return { label: `Rated ${r.minOvr}+ → ${to}+`, apply: () => (r.minOvr = to) };
  }
  if (key === 'ageLimit' && (r.maxAge !== undefined || r.minAge !== undefined)) {
    if (r.maxAge !== undefined) {
      const to = Math.min(40, r.maxAge + 2);
      return { label: `Aged ${r.maxAge} or under → ${to} or under`, apply: () => (r.maxAge = to) };
    }
    const to = Math.max(16, r.minAge! - 2);
    return { label: `Aged ${r.minAge} or over → ${to} or over`, apply: () => (r.minAge = to) };
  }
  return undefined;
}

function askChance(state: GameState, m: Mission, key: NegotiationKey): number {
  const club = state.clubs[m.clubId]!;
  const o = state.officials[club.headCoachId]!;
  const rel = state.scout!.relationships[o.id] ?? 0;
  const asked = Object.keys(m.negotiation ?? {}).length;
  const soft = !(key in REQUIREMENT_CUT);
  const x = (rel - 20) / 15 + (clubTrust(state, club.id) - 25) / 30 - (o.stubbornness - 50) / 40 - asked * 0.4 + (soft ? 0.8 : 0);
  return clamp(1 / (1 + Math.exp(-x)), 0.05, 0.95);
}

/** What you could ask this club to loosen on a discussed brief, with your odds. */
export function negotiationOptions(state: GameState, m: Mission): NegotiationOption[] {
  if (!m.preferences) return [];
  const keys: NegotiationKey[] = [
    'wage',
    'idealAge',
    ...m.preferences.keyAttributes.map((k) => `attr:${k.attribute}` as NegotiationKey),
    'fee',
    'rating',
    'ageLimit',
  ];
  return keys.flatMap((key) => {
    const outcome = m.negotiation?.[key];
    const prop = outcome ? undefined : proposal(m, key);
    if (!outcome && !prop) return [];
    return [
      {
        key,
        label: prop?.label ?? key,
        rewardCut: REQUIREMENT_CUT[key],
        chance: outcome ? 0 : askChance(state, m, key),
        outcome,
      },
    ];
  });
}

/** Ask the club to loosen one term. Free and instant; a refusal costs a little goodwill with whoever said no. */
export function negotiateMission(state: GameState, id: number, key: NegotiationKey): { agreed: boolean; message: string } {
  const m = state.missions.find((x) => x.id === id);
  if (!m || (m.status !== 'offered' && m.status !== 'active')) throw new ScoutingError('That brief is closed.');
  if (!m.preferences) throw new ScoutingError('Discuss the brief first.');
  if (m.negotiation?.[key]) throw new ScoutingError('You already asked about that.');
  const prop = proposal(m, key);
  if (!prop) throw new ScoutingError('There is nothing to negotiate there.');
  const club = state.clubs[m.clubId]!;
  const official = state.officials[club.headCoachId]!;
  const chance = askChance(state, m, key);
  const rng = Rng.derive(state.seed, `negotiate:${m.id}:${key}`);
  m.negotiation = { ...m.negotiation };
  const name = `${official.firstName} ${official.lastName}`;
  if (rng.next() < chance) {
    prop.apply();
    const cut = REQUIREMENT_CUT[key];
    if (cut) m.reward = usd(Math.round((m.reward * (1 - cut)) / 100) * 100);
    m.negotiation[key] = 'agreed';
    return { agreed: true, message: `${name} agrees: ${prop.label}.${cut ? ` The reward drops to ${formatUSD(m.reward)}.` : ''}` };
  }
  m.negotiation[key] = 'refused';
  const scout = state.scout!;
  scout.relationships[official.id] = clamp((scout.relationships[official.id] ?? 0) - 2, 0, 100);
  return { agreed: false, message: `${name} won't move on that.` };
}

/** Which preferences of a discussed brief does this player meet (on the truth)? */
export function preferenceFit(state: GameState, m: Mission, p: Player, club: Club): { met: number; total: number } {
  const pref = m.preferences;
  if (!pref) return { met: 0, total: 0 };
  const age = ageOn(p.birthDate, state.date);
  const checks = [
    brokeredWage(state, p, club) <= pref.maxWage,
    age >= pref.idealAge[0] && age <= pref.idealAge[1],
    ...pref.keyAttributes.map((k) => p.attributes[k.attribute] >= k.min),
  ];
  return { met: checks.filter(Boolean).length, total: checks.length };
}

/** Sign-off boost for pitching exactly what a client described: an active, discussed brief at this club and position. */
export function preferenceBonus(state: GameState, p: Player, club: Club, pos: Position): number {
  let best = 0;
  for (const m of state.missions) {
    if (m.status !== 'active' || m.clubId !== club.id || m.position !== pos || !m.preferences) continue;
    const { met, total } = preferenceFit(state, m, p, club);
    best = Math.max(best, met === total ? 0.8 : met >= total - 1 ? 0.3 : 0);
  }
  return best;
}

export function acceptMission(state: GameState, id: number): Mission {
  const m = state.missions.find((x) => x.id === id);
  if (!m || m.status !== 'offered') throw new ScoutingError('That mission is no longer on offer.');
  if (state.missions.filter((x) => x.status === 'active').length >= MAX_ACTIVE) throw new ScoutingError(`You can run at most ${MAX_ACTIVE} missions at once.`);
  m.status = 'active';
  m.deadline = addDays(state.date, m.weeks * 7);
  return m;
}

export function declineMission(state: GameState, id: number) {
  const m = state.missions.find((x) => x.id === id);
  if (m && m.status === 'offered') m.status = 'declined';
}

function adjustRelationships(state: GameState, club: Club, delta: number) {
  const scout = state.scout!;
  scout.relationships[club.headCoachId] = clamp((scout.relationships[club.headCoachId] ?? 0) + delta, 0, 100);
}

/** Call when one of your deals is agreed or completed: does it complete an active mission? */
export function onDealSecured(state: GameState, deal: Deal) {
  if (state.missions.some((m) => m.dealId === deal.id)) return;
  const p = state.players[deal.playerId];
  if (!p) return;
  const m = state.missions.find(
    (x) =>
      x.status === 'active' &&
      x.clubId === deal.clubId &&
      x.position === deal.position &&
      x.deadline !== undefined &&
      state.date <= x.deadline &&
      missionFit(state, x, p, deal.fee).ok,
  );
  if (!m) return;
  const club = state.clubs[m.clubId]!;
  const scout = state.scout!;
  m.status = 'succeeded';
  m.dealId = deal.id;
  m.resolvedOn = state.date;
  addLedger(state, { amount: m.reward, kind: 'mission-reward', label: `Mission reward: ${club.name} (${m.position})` });
  const r = clubRecord(scout, club.id);
  scout.clubRecord[club.id] = { ...r, missionsDone: (r.missionsDone ?? 0) + 1 };
  adjustRelationships(state, club, 5);
  scout.reputation = clamp(scout.reputation + 1, 0, 100);
  deal.log.push({ date: state.date, text: `Mission accomplished for ${club.name}: reward ${formatUSD(m.reward)}.`, tone: 'good' });
  addNews(state, {
    date: state.date,
    kind: 'career',
    link: 'missions',
    title: `Mission accomplished: ${club.name}`,
    body: `${p.firstName} ${p.lastName} fits the brief (${describeRequirements(m.requirements, m.position, state).join(', ')}). Reward ${formatUSD(m.reward)}, and the club's trust in you grows.`,
    clubIds: [club.id],
    countryId: club.countryId,
  });
}

/** Daily: lapse unanswered offers, fail missed deadlines. Twice a month: new missions from the clubs you work for. */
export function missionTick(state: GameState, date: GameDate) {
  const scout = state.scout;
  if (!scout || state.careerOver) return;
  const work = new Set(workClubs(state));
  for (const m of state.missions) {
    if (m.status === 'offered' && (date > m.acceptBy || !work.has(m.clubId))) {
      m.status = 'expired';
      m.resolvedOn = date;
      const club = state.clubs[m.clubId]!;
      // Say so: an offer shouldn't vanish without a word.
      if (work.has(m.clubId))
        addNews(state, {
          date,
          kind: 'career',
          link: 'missions',
          title: `Brief lapsed: ${club.name}`,
          body: `You didn't answer ${club.name}'s ${m.position} brief in time, so they took it elsewhere.`,
          clubIds: [club.id],
          countryId: club.countryId,
        });
    } else if (m.status === 'offered' && m.acceptBy - date === OFFER_REMINDER_DAYS) {
      const club = state.clubs[m.clubId]!;
      addNews(state, {
        date,
        kind: 'career',
        link: 'missions',
        title: `Reply soon: ${club.name}'s ${m.position} brief`,
        body: `The offer lapses in ${OFFER_REMINDER_DAYS} days (${formatDate(m.acceptBy)}). Accept or decline it in Missions.`,
        clubIds: [club.id],
        countryId: club.countryId,
      });
    } else if (m.status === 'active' && m.deadline !== undefined && date > m.deadline) {
      m.status = 'failed';
      m.resolvedOn = date;
      const club = state.clubs[m.clubId]!;
      const r = clubRecord(scout, club.id);
      scout.clubRecord[club.id] = { ...r, missionsFailed: (r.missionsFailed ?? 0) + 1 };
      adjustRelationships(state, club, -6);
      scout.reputation = clamp(scout.reputation - 1, 0, 100);
      addNews(state, {
        date,
        kind: 'career',
        link: 'missions',
        title: `Mission failed: ${club.name}`,
        body: `You didn't deliver a ${describeRequirements(m.requirements, m.position, state).join(', ')} in time. your standing at ${club.name} drops.`,
        clubIds: [club.id],
        countryId: club.countryId,
      });
    }
  }
  if (state.missions.length > 60) state.missions = state.missions.filter((m) => OPEN(m) || (m.resolvedOn !== undefined && date - m.resolvedOn < 365));

  const { day } = toParts(date);
  if (day !== 1 && day !== 15) return;
  const rng = Rng.derive(state.seed, `missions:${date}`);
  const fulltime = scout.employment.mode === 'fulltime';
  for (const clubId of work) {
    const club = state.clubs[clubId];
    if (!club || !FORMATIONS[club.formation]) continue;
    const open = state.missions.filter((m) => m.clubId === clubId && OPEN(m)).length;
    if (open >= (fulltime ? 2 : 1)) continue;
    // The longer a club goes without asking, the likelier it asks: steady pacing, no long droughts.
    const last = Math.max(-Infinity, ...state.missions.filter((m) => m.clubId === clubId).map((m) => m.postedOn));
    const quietDays = Number.isFinite(last) ? date - last : 90;
    if (!rng.chance(clamp((fulltime ? 0.5 : 0.3) + quietDays / 150, 0, 1))) continue;
    // A club at its wage limit can't take on a new player, so it doesn't ask for one.
    if (!hasWageRoomForSigning(state, club)) continue;
    const m = makeMission(state, club, rng);
    if (!m) continue;
    state.missions.push(m);
    addNews(state, {
      date,
      kind: 'career',
      link: 'missions',
      title: `Mission offer: ${club.name} want a ${m.position}`,
      body: `"${m.brief}" Brief: ${describeRequirements(m.requirements, m.position, state).join(', ')}, within ${m.weeks} weeks. Reward ${formatUSD(m.reward)}. Accept by ${formatDate(m.acceptBy)} in Missions.`,
      clubIds: [club.id],
      countryId: club.countryId,
    });
  }
}
