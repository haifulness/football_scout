import { hasTrait } from './character';
import { addDays, type GameDate } from '../core/calendar';
import type { PlayerId } from '../core/ids';
import { clamp, type Rng } from '../core/rng';
import type { FormationId } from '../data/formations';
import type { Club } from '../model/club';
import { POSITION_GROUP, type Player, type Position } from '../model/player';
import type { GoalEvent, Injury, MatchResult, PlayerMatchLine } from '../model/season';
import { ovrAt } from './ratings';
import { bestXI } from './squad-needs';

/**
 * Statistical match engine: no 2D pitch, but every match produces a believable
 * score plus per-player goals, assists, tackles, clean sheets, minutes, captaincy
 * and ratings. Those per-player lines drive scout bonuses in later phases.
 */

const BASE_GOALS = 1.12;
const HOME_ADVANTAGE = 1.12;
const AWAY_FACTOR = 0.9;
const STRENGTH_SCALE = 14;

const SCORER_WEIGHT: Record<Position, number> = {
  ST: 4.5,
  LW: 3,
  RW: 3,
  AM: 2.6,
  LM: 1.6,
  RM: 1.6,
  CM: 1.1,
  DM: 0.5,
  LWB: 0.6,
  RWB: 0.6,
  LB: 0.4,
  RB: 0.4,
  CB: 0.7,
  GK: 0,
};
const ASSIST_WEIGHT: Record<Position, number> = {
  AM: 3,
  LW: 2.6,
  RW: 2.6,
  LM: 2.4,
  RM: 2.4,
  CM: 2.2,
  LWB: 2,
  RWB: 2,
  ST: 1.8,
  LB: 1.6,
  RB: 1.6,
  DM: 1.1,
  CB: 0.5,
  GK: 0.05,
};
const TACKLE_RATE: Record<Position, number> = {
  DM: 3.0,
  LB: 2.2,
  RB: 2.2,
  CB: 2.0,
  LWB: 2.0,
  RWB: 2.0,
  CM: 1.8,
  LM: 1.4,
  RM: 1.4,
  AM: 0.8,
  LW: 0.6,
  RW: 0.6,
  ST: 0.4,
  GK: 0,
};
/** How much each slot contributes to a team's attacking and defensive strength. */
const ROLE_WEIGHT: Record<'GK' | 'DEF' | 'MID' | 'ATT', { att: number; def: number }> = {
  GK: { att: 0, def: 1.3 },
  DEF: { att: 0.2, def: 1 },
  MID: { att: 0.6, def: 0.45 },
  ATT: { att: 1, def: 0.1 },
};

interface OnPitch {
  player: Player;
  position: Position;
  ovr: number;
  started: boolean;
  on: number; // minute entered
  off: number; // minute left
}

interface TeamSheet {
  club: Club;
  players: OnPitch[];
  attack: number;
  defense: number;
  captainId?: PlayerId;
}

const isAvailable = (p: Player, date: GameDate) => !p.injury || p.injury.until <= date;

/** Picks the XI (with light rotation), the bench, and the captain. */
export function pickTeam(club: Club, squad: Player[], date: GameDate, rng: Rng): { xi: OnPitch[]; bench: Player[]; captainId?: PlayerId } {
  const available = squad.filter((p) => isAvailable(p, date));
  const lineup = bestXI(club.formation as FormationId, available);
  const used = new Set(lineup.map((s) => s.playerId).filter(Boolean) as PlayerId[]);
  const byId = new Map(available.map((p) => [p.id, p]));

  const xi: OnPitch[] = [];
  for (const slot of lineup) {
    let player = slot.playerId ? byId.get(slot.playerId) : undefined;
    let ovr = slot.ovr;
    // Rotation: a close alternative sometimes starts instead, so backups get minutes.
    // A coach who had a signing forced on him benches that player more readily.
    const doubted = !!player && !!club.coachDoubts?.includes(player.id);
    if (player && slot.position !== 'GK' && player.id !== club.captainId && rng.chance(doubted ? 0.5 : 0.12)) {
      const alt = available
        .filter((p) => !used.has(p.id))
        .map((p) => ({ p, o: ovrAt(p, slot.position) }))
        .filter((x) => x.o >= slot.ovr - (doubted ? 6 : 3))
        .sort((a, b) => b.o - a.o)[0];
      if (alt) {
        used.delete(player.id);
        used.add(alt.p.id);
        player = alt.p;
        ovr = alt.o;
      }
    }
    if (player) xi.push({ player, position: slot.position, ovr, started: true, on: 0, off: 90 });
  }
  const bench = available
    .filter((p) => !used.has(p.id))
    .sort((a, b) => ovrAt(b, b.naturalPosition) - ovrAt(a, a.naturalPosition))
    .slice(0, 7);

  const onPitchIds = new Set(xi.map((x) => x.player.id));
  const captainId =
    club.captainId && onPitchIds.has(club.captainId)
      ? club.captainId
      : xi.reduce<OnPitch | undefined>((best, x) => (!best || x.player.attributes.leadership > best.player.attributes.leadership ? x : best), undefined)?.player
          .id;
  return { xi, bench, captainId };
}

function strength(players: OnPitch[]): { attack: number; defense: number } {
  let att = 0,
    attW = 0,
    def = 0,
    defW = 0;
  for (const p of players) {
    const w = ROLE_WEIGHT[POSITION_GROUP[p.position]];
    att += p.ovr * w.att;
    attW += w.att;
    def += p.ovr * w.def;
    defW += w.def;
  }
  // A side missing players (injury crisis) is weaker than its averages suggest.
  const shortfall = Math.max(0, 11 - players.length) * 4;
  return { attack: att / Math.max(attW, 1) - shortfall, defense: def / Math.max(defW, 1) - shortfall };
}

function poisson(rng: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0,
    p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

function makeSubs(rng: Rng, xi: OnPitch[], bench: Player[]): OnPitch[] {
  const subs: OnPitch[] = [];
  const pool = [...bench];
  const count = Math.min(pool.length, rng.int(2, 3));
  for (let i = 0; i < count; i++) {
    const minute = rng.int(56, 86);
    const candidates = xi.filter((x) => x.off === 90 && x.position !== 'GK');
    if (!candidates.length) break;
    const out = rng.pick(candidates);
    const group = POSITION_GROUP[out.position];
    const sameGroup = pool.filter((p) => POSITION_GROUP[p.naturalPosition] === group && p.naturalPosition !== 'GK');
    const inc = (sameGroup.length ? sameGroup : pool.filter((p) => p.naturalPosition !== 'GK'))[0];
    if (!inc) break;
    pool.splice(pool.indexOf(inc), 1);
    out.off = minute;
    subs.push({ player: inc, position: out.position, ovr: ovrAt(inc, out.position), started: false, on: minute, off: 90 });
  }
  return subs;
}

const onAt = (team: OnPitch[], minute: number) => team.filter((x) => x.on <= minute && x.off >= minute);

function weightedPick(rng: Rng, players: OnPitch[], weight: (p: OnPitch) => number, exclude?: PlayerId): OnPitch | undefined {
  const pool = players.filter((p) => p.player.id !== exclude && weight(p) > 0);
  return pool.length ? rng.weighted(pool, weight) : undefined;
}

export interface SimulatedMatch {
  result: MatchResult;
  lines: PlayerMatchLine[];
  injuries: { playerId: PlayerId; injury: Injury }[];
}

const INJURIES = ['hamstring strain', 'ankle sprain', 'knee ligament damage', 'calf strain', 'groin strain', 'thigh bruise', 'broken metatarsal', 'concussion'];

export function simulateMatch(rng: Rng, home: { club: Club; squad: Player[] }, away: { club: Club; squad: Player[] }, date: GameDate): SimulatedMatch {
  const sheets = [home, away].map((side): TeamSheet & { all: OnPitch[] } => {
    const { xi, bench, captainId } = pickTeam(side.club, side.squad, date, rng);
    const s = strength(xi);
    const subs = makeSubs(rng, xi, bench);
    return { club: side.club, players: xi, all: [...xi, ...subs], attack: s.attack, defense: s.defense, captainId };
  }) as [TeamSheet & { all: OnPitch[] }, TeamSheet & { all: OnPitch[] }];
  const [H, A] = sheets;

  const lambdaHome = BASE_GOALS * Math.exp((H.attack - A.defense) / STRENGTH_SCALE) * HOME_ADVANTAGE;
  const lambdaAway = BASE_GOALS * Math.exp((A.attack - H.defense) / STRENGTH_SCALE) * AWAY_FACTOR;
  const homeGoals = poisson(rng, lambdaHome);
  const awayGoals = poisson(rng, lambdaAway);

  const goals: GoalEvent[] = [];
  const addGoals = (n: number, team: TeamSheet & { all: OnPitch[] }) => {
    for (let i = 0; i < n; i++) {
      const minute = rng.chance(0.06) ? 90 + rng.int(1, 5) : rng.int(1, 90);
      const pitch = onAt(team.all, Math.min(minute, 90));
      if (rng.chance(0.03)) {
        goals.push({ minute, clubId: team.club.id, ownGoal: true });
        continue;
      }
      const scorer = weightedPick(
        rng,
        pitch,
        (p) => SCORER_WEIGHT[p.position] * Math.pow((p.player.attributes.finishing + p.player.attributes.offTheBall) / 20, 1.2),
      );
      const assist = rng.chance(0.75)
        ? weightedPick(
            rng,
            pitch,
            (p) => ASSIST_WEIGHT[p.position] * ((p.player.attributes.passing + p.player.attributes.vision + p.player.attributes.crossing) / 30),
            scorer?.player.id,
          )
        : undefined;
      goals.push({ minute, clubId: team.club.id, scorerId: scorer?.player.id, assistId: assist?.player.id });
    }
  };
  addGoals(homeGoals, H);
  addGoals(awayGoals, A);
  goals.sort((a, b) => a.minute - b.minute);

  // Per-player lines
  const lines: PlayerMatchLine[] = [];
  const injuries: SimulatedMatch['injuries'] = [];
  for (const [team, opp, scored, conceded] of [
    [H, A, homeGoals, awayGoals],
    [A, H, awayGoals, homeGoals],
  ] as const) {
    const teamAvg = team.players.reduce((s, p) => s + p.ovr, 0) / Math.max(1, team.players.length);
    const oppAvg = opp.players.reduce((s, p) => s + p.ovr, 0) / Math.max(1, opp.players.length);
    const bigGame = oppAvg > teamAvg + 2;
    const pressure = clamp(1 + (opp.attack - team.defense) / 40, 0.7, 1.4);
    const result = scored > conceded ? 1 : scored < conceded ? -1 : 0;
    for (const p of team.all) {
      const minutes = p.off - p.on;
      if (minutes <= 0) continue;
      const g = goals.filter((e) => e.scorerId === p.player.id).length;
      const a = goals.filter((e) => e.assistId === p.player.id).length;
      const tackles = poisson(rng, TACKLE_RATE[p.position] * (p.player.attributes.tackling / 12) * (minutes / 90) * pressure);
      const group = POSITION_GROUP[p.position];
      const cleanSheet = conceded === 0 && minutes >= 60 && (group === 'GK' || group === 'DEF');
      const consistency = p.player.hidden.consistency;
      let rating =
        6.3 +
        g * 0.9 +
        a * 0.55 +
        tackles * 0.1 +
        (cleanSheet ? (group === 'GK' ? 0.8 : 0.45) : 0) -
        (group === 'GK' || group === 'DEF' ? conceded * 0.15 : 0) +
        result * 0.3 +
        (p.ovr - teamAvg) / 25 +
        rng.gaussian(0, 0.55 - consistency * 0.015);
      if (!p.started) rating -= 0.2;
      if (bigGame && hasTrait(p.player, 'big-game')) rating += 0.35;
      lines.push({
        playerId: p.player.id,
        clubId: team.club.id,
        position: p.position,
        started: p.started,
        minutes,
        goals: g,
        assists: a,
        tackles,
        cleanSheet,
        captain: team.captainId === p.player.id && p.started,
        rating: Math.round(clamp(rating, 4, 10) * 10) / 10,
      });
      if (rng.chance(0.006 * (p.player.hidden.injuryProne / 8) * (minutes / 90))) {
        const severe = rng.chance(0.15);
        injuries.push({
          playerId: p.player.id,
          injury: { until: addDays(date, severe ? rng.int(40, 150) : rng.int(4, 35)), description: severe ? rng.pick(INJURIES.slice(2)) : rng.pick(INJURIES) },
        });
      }
    }
  }

  const motm = lines.reduce<PlayerMatchLine | undefined>((best, l) => (!best || l.rating > best.rating ? l : best), undefined);
  const fill = clamp(0.55 + H.club.reputation / 250 + rng.float(-0.05, 0.1), 0.35, 1);
  return {
    result: { homeGoals, awayGoals, goals, attendance: Math.round(H.club.capacity * fill), motmId: motm?.playerId },
    lines,
    injuries,
  };
}
