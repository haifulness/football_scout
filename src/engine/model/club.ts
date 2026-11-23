import type { GameDate } from '../core/calendar';
import type { CityId, ClubId, CountryId, LeagueId, PlayerId, StaffId } from '../core/ids';
import type { USD } from '../core/money';
import type { FormationId } from '../data/formations';
import type { ClubSeason } from './season';

export type ClubTier = 1 | 2 | 3 | 4 | 5;

export interface League {
  id: LeagueId;
  name: string;
  countryId: CountryId;
  /** 1 = top flight. */
  level: number;
  clubIds: ClubId[];
}

export interface ClubColors {
  primary: string;
  secondary: string;
  accent: string;
}

export type CrestShape = 'shield' | 'round' | 'heater' | 'diamond' | 'badge';
export type CrestPattern = 'plain' | 'stripes' | 'halves' | 'hoops' | 'sash' | 'chevron' | 'quarters' | 'cross';
export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'pinstripes' | 'band';

export interface Club {
  id: ClubId;
  name: string;
  shortName: string;
  cityId: CityId;
  countryId: CountryId;
  leagueId: LeagueId;
  tier: ClubTier;
  reputation: number; // 0–100
  founded: number;
  stadium: string;
  capacity: number;
  transferBudget: USD;
  wageBudget: USD; // per week
  formation: FormationId;
  squad: PlayerId[];
  captainId?: PlayerId;
  headCoachId: StaffId;
  /** The president (absent only in a world from before presidents came back, until it loads). */
  presidentId?: StaffId;
  acceptsProspects: 'never' | 'prodigies' | 'yes';
  colors: ClubColors;
  crest: { shape: CrestShape; pattern: CrestPattern; emblem: 'ball' | 'star' | 'lion' | 'castle' | 'eagle' | 'crown' | 'none' };
  kit: { pattern: KitPattern };
  history: ClubSeason[];
  /** Signings forced past the Head Coach: he picks them less readily. */
  coachDoubts?: PlayerId[];
  /** How the club plays, once a coach has changed it (absent: its own tradition; see systems/styles.ts). */
  style?: import('../systems/styles').ClubStyle;
}

export interface OfficialPriorities {
  tacticalFit: number;
  currentAbility: number;
  potential: number;
  value: number;
  resale: number;
  marketing: number;
  personality: number;
}

/** The Head Coach: he signs off (or turns down) every proposal. */
export interface ClubOfficial {
  id: StaffId;
  role: 'coach';
  firstName: string;
  lastName: string;
  nationality: CountryId;
  age: number;
  clubId: ClubId;
  priorities: OfficialPriorities;
  stubbornness: number; // 0–100
  portraitSeed: number;
  /** When he took this job (absent: since before your career). */
  appointedOn?: GameDate;
  /** Sacked and looking for work (clubId is then his last club). */
  unemployedSince?: GameDate;
  /** The shape he likes to play: a club that hires him often switches to it. */
  formation?: FormationId;
  /** His way of playing, if set (absent: drawn from his id; see systems/styles.ts). */
  style?: import('../systems/styles').ClubStyle;
}
