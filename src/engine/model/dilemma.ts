import type { GameDate } from '../core/calendar';
import type { ClubId, PlayerId } from '../core/ids';
import type { USD } from '../core/money';

export type DilemmaKind = 'agent-cut' | 'inflate-report' | 'talk-down' | 'family-fee';

/** A choice the game puts to you, built from what's happening in your career. */
export interface Dilemma {
  id: number;
  kind: DilemmaKind;
  postedOn: GameDate;
  /** Unanswered by then and it lapses (nothing happens). */
  expiresOn: GameDate;
  playerId?: PlayerId;
  clubId?: ClubId;
  /** Money on the table, if any. */
  amount?: USD;
  /** Your answer, and what came of it. */
  choice?: string;
  outcome?: string;
  resolvedOn?: GameDate;
  lapsed?: boolean;
}
