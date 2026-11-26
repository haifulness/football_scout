import { addDays, type GameDate } from '../core/calendar';
import type { ClubId, StaffId } from '../core/ids';
import type { Deal } from '../model/deal';
import type { Position } from '../model/player';
import type { GameState } from '../model/world-state';

/**
 * Pitching has a cost beyond the trip. A coach runs out of patience with a scout who keeps bringing names he
 * turns down; the fifth DM in a month gets less of a hearing than the first; and a club remembers how often
 * your names were any good.
 */

/** Noes from one club inside this many days... */
export const PATIENCE_DAYS = 30;
/** ...this many of them and the coach stops taking your pitches... */
export const PATIENCE_NOES = 3;
/** ...for this long. */
export const COLD_DAYS = 21;
/** Each recent no at a position takes this off the next name's chance there, up to the cap. */
export const FATIGUE_STEP = 0.05;
export const FATIGUE_MAX = 0.2;
/** Your hit rate at a club: over your last pitches there, judged once you have a few. */
export const HIT_WINDOW = 10;
export const HIT_MIN = 5;
export const HIT_LOW = 0.3;
export const HIT_HIGH = 0.6;
const HIT_LOW_FACTOR = 0.9;
const HIT_HIGH_FACTOR = 1.05;

/** The club gave its answer on this pitch (deals start out undecided). */
const decided = (d: Deal) => !!d.signOff || !!d.rejectedBy || !!d.clubLevelRejection;
/** The coach (or the board, for him) said yes. */
const yes = (d: Deal) => !!d.signOff || !!d.boardBlocked;
const no = (d: Deal) => d.stage === 'rejected' && !d.boardBlocked && (!!d.rejectedBy || !!d.clubLevelRejection);

/** Noes at a club (optionally one position) in the last month, since the last yes there. */
function recentNoes(state: GameState, clubId: ClubId, pos?: Position): number {
  const since = state.date - PATIENCE_DAYS;
  let n = 0;
  // Deals are kept newest first: stop at the first yes.
  for (const d of state.deals) {
    if (d.clubId !== clubId || (pos && d.position !== pos)) continue;
    if (d.openedOn < since) break;
    if (yes(d)) break;
    if (no(d)) n++;
  }
  return n;
}

export function coachNoes(state: GameState, clubId: ClubId): number {
  return recentNoes(state, clubId);
}

/** While set, the coach won't take your pitches. */
export function coldUntil(state: GameState, officialId: StaffId): GameDate | undefined {
  const until = state.scout?.coldUntil?.[officialId];
  return until !== undefined && until > state.date ? until : undefined;
}

/** After a no: one too many and he stops listening. Returns the date he'll listen again, when that happens now. */
export function afterNo(state: GameState, clubId: ClubId, officialId: StaffId): GameDate | undefined {
  const scout = state.scout!;
  if (recentNoes(state, clubId) < PATIENCE_NOES) return undefined;
  const until = addDays(state.date, COLD_DAYS);
  scout.coldUntil = { ...(scout.coldUntil ?? {}), [officialId]: until };
  return until;
}

/** How tired the coach is of names at this position: the share taken off the next one's chance. */
export function positionFatigue(state: GameState, clubId: ClubId, pos: Position): { noes: number; cut: number } {
  const noes = recentNoes(state, clubId, pos);
  return { noes, cut: Math.min(FATIGUE_MAX, noes * FATIGUE_STEP) };
}

export type HitLabel = 'wall' | 'trusted' | 'fair';

/** Your record of signed-off pitches at a club (absent until you have pitched a few times there). */
export function hitRate(state: GameState, clubId: ClubId): { rate: number; pitches: number; label: HitLabel } | undefined {
  const recent: Deal[] = [];
  for (const d of state.deals) {
    if (d.clubId !== clubId || !decided(d)) continue;
    recent.push(d);
    if (recent.length >= HIT_WINDOW) break;
  }
  if (recent.length < HIT_MIN) return undefined;
  const rate = recent.filter(yes).length / recent.length;
  return { rate, pitches: recent.length, label: rate < HIT_LOW ? 'wall' : rate > HIT_HIGH ? 'trusted' : 'fair' };
}

/** What your hit rate does to a coach's yes there. */
export function hitFactor(state: GameState, clubId: ClubId): number {
  const h = hitRate(state, clubId);
  return !h ? 1 : h.label === 'wall' ? HIT_LOW_FACTOR : h.label === 'trusted' ? HIT_HIGH_FACTOR : 1;
}

/** What your hit rate does to how often a club sends you briefs. */
export function hitBriefFactor(state: GameState, clubId: ClubId): number {
  const h = hitRate(state, clubId);
  return !h ? 1 : h.label === 'wall' ? 0.6 : h.label === 'trusted' ? 1.3 : 1;
}

/** Everything that weighs on the next pitch to a club, at a position. */
export function pitchPressure(state: GameState, clubId: ClubId, pos: Position) {
  const club = state.clubs[clubId]!;
  const fatigue = positionFatigue(state, clubId, pos);
  return {
    noes: coachNoes(state, clubId),
    maxNoes: PATIENCE_NOES,
    coldUntil: coldUntil(state, club.headCoachId),
    fatigueNoes: fatigue.noes,
    fatigueCut: fatigue.cut,
    hit: hitRate(state, clubId),
  };
}
