import type { GameDate } from '../core/calendar';
import type { PlayerId } from '../core/ids';
import type { Position } from './player';

export type HuntStatus = 'active' | 'found' | 'lost' | 'cold' | 'flop';

/** Why a whisper was hype: the kid is ordinary once you see him properly. */
export type HuntFlop = 'youtube' | 'five-a-side' | 'one-game' | 'family';

/** How far you have narrowed it down: 0 country known · 1 region · 2 city · 3 found him. */
export type HuntStage = 0 | 1 | 2 | 3;

export interface HuntClue {
  date: GameDate;
  text: string;
  tone: 'clue' | 'miss' | 'rival' | 'end';
}

/** A rival scout who heard the same whisper, and how close he is (0–1; 1 = he has him). */
export interface HuntRival {
  rivalId: number;
  progress: number;
  /** Set once his trail has been seen (a free clue for you). */
  spotted?: boolean;
}

/** A rumour about a hidden prodigy, followed clue by clue in a race against rival scouts. */
export interface Hunt {
  id: number;
  playerId: PlayerId;
  /** What the whisper said: his position and age. */
  position: Position;
  age: number;
  startedOn: GameDate;
  /** The trail goes cold after this. */
  expiresOn: GameDate;
  stage: HuntStage;
  clues: HuntClue[];
  rivals: HuntRival[];
  status: HuntStatus;
  endedOn?: GameDate;
  /** The rival who got there first. */
  winnerId?: number;
  /** Set when the whisper is hype, not a prodigy. You only learn it at the end of the trail. */
  flop?: HuntFlop;
}
