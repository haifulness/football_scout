import type { GameDate } from '../core/calendar';
import type { CityId, CountryId, PlayerId } from '../core/ids';

export type TournamentRound = 'group' | 'r16' | 'qf' | 'sf' | 'final';

export interface TournamentMatch {
  id: string;
  round: TournamentRound;
  /** Group index for group games. */
  group?: number;
  date: GameDate;
  home: CountryId;
  away: CountryId;
  result?: { home: number; away: number; /** Knockouts: who went through (penalties if level). */ winner?: CountryId; penalties?: boolean };
}

/** One summer's international tournament: a World Cup, or your continent's championship. */
export interface Tournament {
  id: number;
  kind: 'world' | 'continental';
  name: string;
  /** The league season (starting year) it closes. */
  season: number;
  hostId: CountryId;
  cityId: CityId;
  start: GameDate;
  end: GameDate;
  /** When the squads are named. */
  squadsOn: GameDate;
  teams: CountryId[];
  groups: CountryId[][];
  squads?: Record<CountryId, PlayerId[]>;
  matches: TournamentMatch[];
  /** Per player: apps, goals, rating sum. */
  lines: Record<PlayerId, { apps: number; goals: number; ratingSum: number }>;
  winner?: CountryId;
  /** Players who shone (and those who flopped), set when it ends. */
  standouts?: PlayerId[];
  flops?: PlayerId[];
}
