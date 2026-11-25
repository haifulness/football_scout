import { addNews } from './season';
import { ScoutingError } from './scouting';
import type { GameDate } from '../core/calendar';
import type { ClubId } from '../core/ids';
import { clamp, hashString } from '../core/rng';
import type { Club } from '../model/club';
import type { Position } from '../model/player';
import type { GameState } from '../model/world-state';
import { isMentorClient } from './mentor';
import { knowledgeLevel } from './knowledge';
import { squadNeeds, type SlotNeed } from './squad-needs';

/**
 * Your read on a club's needs: how well you know where its squad is thin and how the coach wants to play. Nothing
 * is known at first (the coach still judges every pitch on the truth); you learn it by work, and the read goes out
 * of date as the squad changes. Clubs you work for keep you informed, so you always know them well.
 */

export type ReadTier = 'unknown' | 'rough' | 'good' | 'sure';
export const tierOf = (level: number): ReadTier => (level >= 80 ? 'sure' : level >= 50 ? 'good' : level >= 25 ? 'rough' : 'unknown');

/** What working for a club, or under a mentor who does, tells you. */
const CLIENT_FLOOR = 60;
const MENTOR_FLOOR = 30;
/** A brief for a position tells you exactly what they want there. */
const BRIEF_FLOOR = 85;
/** Squad study: what it can reach, at best. */
export const STUDY_CAP = 70;

const readsOf = (state: GameState) => (state.clubReads ??= {});

function worksFor(state: GameState, clubId: ClubId): boolean {
  const e = state.scout?.employment;
  return !!e && (e.mode === 'fulltime' ? e.clubId === clubId : e.clients.includes(clubId));
}

/** How well you know this club's needs overall, or at one position (0–100). */
export function readLevel(state: GameState, clubId: ClubId, pos?: Position): number {
  const r = state.clubReads?.[clubId];
  let level = r?.level ?? 0;
  if (pos !== undefined && r?.pos?.[pos] !== undefined) level = Math.max(level, r.pos[pos]!);
  if (worksFor(state, clubId)) level = Math.max(level, CLIENT_FLOOR);
  else if (isMentorClient(state, clubId)) level = Math.max(level, MENTOR_FLOOR);
  if (pos !== undefined && state.missions.some((m) => m.clubId === clubId && m.position === pos && (m.status === 'offered' || m.status === 'active'))) level = Math.max(level, BRIEF_FLOOR);
  return level;
}

/** Raise your read (never lowers it); a position-only read sharpens just that line. */
export function learnClub(state: GameState, clubId: ClubId, level: number, date: GameDate, pos?: Position) {
  const r = (readsOf(state)[clubId] ??= { level: 0, date });
  if (pos !== undefined) r.pos = { ...r.pos, [pos]: Math.max(r.pos?.[pos] ?? 0, Math.round(level)) };
  else r.level = Math.max(r.level, Math.round(level));
  r.date = date;
  r.stale = undefined;
  // A solid read puts right whatever an insider got wrong.
  if (r.misread && level >= 80 && (pos === undefined || pos === r.misread.pos)) r.misread = undefined;
}

/** Something changed at the club: what you knew is less true now. */
export function staleClub(state: GameState, clubId: ClubId, why: string, drop: number, pos?: Position) {
  const r = state.clubReads?.[clubId];
  if (!r) return;
  if (pos !== undefined) {
    if (r.pos?.[pos] !== undefined) r.pos[pos] = Math.max(0, r.pos[pos]! - drop);
    r.level = Math.max(0, r.level - Math.round(drop / 2));
  } else {
    r.level = Math.max(0, r.level - drop);
    r.pos = undefined;
    r.misread = undefined;
  }
  r.stale = why;
}

/** A deterministic wobble for ranges, so the same read shows the same numbers. */
const wobble = (state: GameState, clubId: ClubId, key: string) => (hashString(`${state.seed}:read:${clubId}:${key}`) / 4294967296) * 2 - 1;

/** The club's average at a position as you can see it: exact when sure, a range otherwise, nothing when unknown. */
export function seenAverage(state: GameState, club: Club, pos: Position, truth: number): { range?: [number, number]; tier: ReadTier } {
  const tier = tierOf(readLevel(state, club.id, pos));
  if (tier === 'unknown' || truth <= 0) return { tier };
  if (tier === 'sure') return { range: [truth, truth], tier };
  const half = tier === 'good' ? 3 : 8;
  const centre = truth + wobble(state, club.id, `avg:${pos}`) * half * 0.6;
  return { range: [Math.max(1, Math.floor(centre - half)), Math.ceil(centre + half)], tier };
}

export interface SeenNeed {
  position: Position;
  /** As you read it: exact when sure. */
  severity: number;
  depth?: number;
  average?: [number, number];
  tier: ReadTier;
}

/**
 * The club's needs as far as you know them: none when unknown, only the pressing ones (roughly) when rough,
 * all of them with a fuzzy average when good, exact when sure.
 */
export function seenNeeds(state: GameState, club: Club, needs?: SlotNeed[]): SeenNeed[] {
  const all = needs ?? squadNeeds(club.formation, club.squad.map((id) => state.players[id]!).filter(Boolean));
  const out: SeenNeed[] = [];
  for (const n of all) {
    const tier = tierOf(readLevel(state, club.id, n.position));
    if (tier === 'unknown') continue;
    const fake = state.clubReads?.[club.id]?.misread;
    if (tier === 'rough' && n.severity < 0.4 && !(fake?.pos === n.position && fake.severity >= 0.4)) continue;
    const blur = tier === 'sure' ? 0 : tier === 'good' ? 0.1 : 0.25;
    // An insider's wrong line: you believe it until a better read puts it right.
    const misread = tier !== 'sure' && state.clubReads?.[club.id]?.misread?.pos === n.position ? state.clubReads[club.id]!.misread!.severity : undefined;
    if (tier === 'rough' && misread !== undefined && misread < 0.4) continue;
    out.push({
      position: n.position,
      severity: misread ?? clamp(n.severity + wobble(state, club.id, `sev:${n.position}`) * blur, 0, 1),
      depth: tier === 'rough' ? undefined : n.depth,
      average: seenAverage(state, club, n.position, n.positionalAverage).range,
      tier,
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** Study a club's squad: takes days (the caller advances time), raises your read. */
export function studyClub(state: GameState, clubId: ClubId): { before: number; after: number; days: number } {
  const club = state.clubs[clubId];
  if (!club) throw new ScoutingError('No such club.');
  const before = readLevel(state, clubId);
  const level = studyResult(state, club);
  if (level <= before) throw new ScoutingError('A study would tell you nothing new: you already know their needs this well. Get to know their players better first.');
  learnClub(state, clubId, level, state.date);
  return { before, after: readLevel(state, clubId), days: studyDays(club) };
}

/** Watching a club play: the XI the coach really picks, and who struggles. */
export const MATCH_READ = 50;
/** Watching one of its players: a glimpse of the team around him. */
export const LIVE_READ = 35;
/** A coach who turns your player down at the club gate tells you what he has there. */
export const REFUSAL_READ = 80;
/** A client's needs meeting each quarter. */
export const MEETING_READ = 88;

/** You watched a match in person: you learn how both sides play and where they are thin. */
export function learnFromMatch(state: GameState, clubIds: ClubId[], eye: number) {
  for (const id of clubIds) learnClub(state, id, clamp(MATCH_READ + eye * 0.5, 0, 65), state.date);
}

/**
 * The coach said no because your man isn't better than what he has: now you know that line exactly, and he often
 * lets slip where he would spend instead. Returns what he said about it, for the deal log.
 */
export function learnFromRefusal(state: GameState, club: Club, pos: Position, gate: boolean, chance: number): string | undefined {
  if (gate) learnClub(state, club.id, REFUSAL_READ, state.date, pos);
  if (hashString(`${state.seed}:refusal:${club.id}:${pos}:${state.date}`) / 4294967296 >= chance) return undefined;
  const top = squadNeeds(club.formation, club.squad.map((id) => state.players[id]!).filter(Boolean)).find((n) => n.position !== pos && n.severity >= 0.3);
  if (!top) return undefined;
  learnClub(state, club.id, 60, state.date, top.position);
  return `"${pos} isn't where we're short. Bring me a ${top.position} and we'll talk."`;
}

/**
 * The 1st of January, April, July and October: every club you work for sits down with you to go through its needs.
 * Your read on them is near-exact until the squad changes again.
 */
export function clientMeetings(state: GameState, date: GameDate) {
  const e = state.scout?.employment;
  if (!e) return;
  const d = new Date(date * 86_400_000);
  if (d.getUTCDate() !== 1 || d.getUTCMonth() % 3 !== 0) return;
  const clubs = e.mode === 'fulltime' ? [e.clubId] : e.clients;
  for (const id of clubs) {
    const club = state.clubs[id];
    if (!club) continue;
    learnClub(state, id, MEETING_READ, date);
    const top = squadNeeds(club.formation, club.squad.map((pid) => state.players[pid]!).filter(Boolean))
      .filter((n) => n.severity >= 0.2)
      .slice(0, 2);
    addNews(state, {
      date,
      kind: 'career',
      title: `Needs meeting at ${club.name}`,
      body: top.length
        ? `The coach goes through the squad with you: they want a ${top.map((n) => n.position).join(' and a ')}. Your read on their needs is up to date.`
        : 'The coach goes through the squad with you: no gaps worth filling right now. Your read on their needs is up to date.',
      clubIds: [club.id],
    });
  }
}

/** What reading the Touchline gives you about a need it prints. */
export const PRESS_READ = 30;
const PRESS_LEADS = 6;

/**
 * The needs the Touchline prints this week: urgent ones at clubs at home with money to spend (one per club, the
 * most pressing six). It's public, and vague, but it's where a new scout finds work: each printed need gives you a
 * rough read on that position.
 */
export function pressLeads(state: GameState): { clubId: ClubId; pos: Position }[] {
  const scout = state.scout;
  if (!scout) return [];
  const week = (state.date - ((new Date(state.date * 86_400_000).getUTCDay() + 6) % 7)) as GameDate;
  if (state.press?.week === week) return state.press.items;
  const scored: { clubId: ClubId; pos: Position; score: number }[] = [];
  for (const club of Object.values(state.clubs)) {
    if (club.countryId !== scout.homeCountry || club.transferBudget <= 0 || worksFor(state, club.id)) continue;
    const top = squadNeeds(club.formation, club.squad.map((id) => state.players[id]!).filter(Boolean))[0];
    if (!top || top.severity < 0.45) continue;
    scored.push({ clubId: club.id, pos: top.position, score: top.severity * Math.log10(10 + club.transferBudget) });
  }
  const items = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, PRESS_LEADS)
    .map(({ clubId, pos }) => ({ clubId, pos }));
  state.press = { week, items };
  for (const i of items) learnClub(state, i.clubId, PRESS_READ, state.date, i.pos);
  return items;
}

/** Days a squad study takes. */
export const studyDays = (club: Club) => 2 + Math.ceil(club.squad.length / 10);

/**
 * Study their squad yourself: watch their games back, go through their players. Free but slow, and only as good as
 * what you know of their players (plus your skill at reading a team).
 */
export function studyResult(state: GameState, club: Club): number {
  const players = club.squad.map((id) => state.players[id]!).filter(Boolean);
  const known = players.length ? players.reduce((n, p) => n + knowledgeLevel(state, p), 0) / players.length : 0;
  const skill = state.scout?.skills.dataAnalysis ?? 10;
  return clamp(Math.round(20 + known * 0.6 + skill), 25, STUDY_CAP);
}
