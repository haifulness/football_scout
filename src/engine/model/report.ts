import type { GameDate } from '../core/calendar';
import type { PlayerId } from '../core/ids';
import type { Position } from './player';

/** Your call on his ceiling: A elite (85+), B very good (75–84), C solid (65–74), D limited (below 65). */
export type PotentialGrade = 'A' | 'B' | 'C' | 'D';

export type Verdict = 'star' | 'ready' | 'future' | 'squad' | 'risky';

export const VERDICT_LABEL: Record<Verdict, string> = {
  star: 'Future star',
  ready: 'Ready now',
  future: 'One for the future',
  squad: 'Squad player',
  risky: 'Risky signing',
};

export type ReportGrade = 'spot on' | 'close' | 'off' | 'way off';

/** A written scouting report: your rating, checked against how he turned out a year later. */
export interface ScoutReport {
  id: number;
  playerId: PlayerId;
  date: GameDate;
  /** The position you rated him at. */
  role: Position;
  /** Your rating at that position, 1–99. */
  rating: number;
  potential: PotentialGrade;
  verdict: Verdict;
  /** How well you knew him when you wrote it. */
  knowledge: number;
  /** His true level at the role when you wrote it (hidden from you). */
  truthThen: number;
  reviewOn: GameDate;
  /** Filled in at the review. */
  outcome?: {
    date: GameDate;
    truthNow: number;
    /** Points off: the smaller gap to his level then or now. */
    error: number;
    grade: ReportGrade;
    overrated: boolean;
    potentialRight: boolean;
  };
  /** He retired or vanished before the review. */
  voided?: boolean;
}
