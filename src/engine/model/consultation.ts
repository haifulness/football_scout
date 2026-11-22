import type { GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import type { USD } from '../core/money';
import type { Position } from './player';

export type ConsultationAnswer = 'go' | 'if-starts' | 'stay';

/** A player asks whether he should join a club that has come in for him. */
export interface Consultation {
  id: number;
  playerId: PlayerId;
  /** The club that wants him. */
  clubId: ClubId;
  /** Where he plays now. */
  fromClubId: ClubId;
  position: Position;
  postedOn: GameDate;
  answerBy: GameDate;
  /** What he pays you for an answer. */
  fee: USD;
  /** Your read of his chances there (right more often in a market you know). */
  read: 'starter' | 'squad';
  answer?: ConsultationAnswer;
  /** He went. */
  moved?: boolean;
  /** The club is yours: a move earns you a finder's fee. */
  finder?: boolean;
  /** When the game checks whether you were right. */
  checkOn?: GameDate;
  verdict?: 'right' | 'wrong';
  outcome?: string;
  resolvedOn?: GameDate;
  lapsed?: boolean;
}
