import type { GameDate } from '../core/calendar';
import type { ClubId, CountryId, PlayerId } from '../core/ids';
import type { USD } from '../core/money';
import type { Injury, SeasonLine, SeasonStats } from './season';

export const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_GROUP: Record<Position, 'GK' | 'DEF' | 'MID' | 'ATT'> = {
  GK: 'GK',
  CB: 'DEF',
  LB: 'DEF',
  RB: 'DEF',
  LWB: 'DEF',
  RWB: 'DEF',
  DM: 'MID',
  CM: 'MID',
  AM: 'MID',
  LM: 'MID',
  RM: 'MID',
  LW: 'ATT',
  RW: 'ATT',
  ST: 'ATT',
};

export const ATTRIBUTE_GROUPS = {
  Technical: ['finishing', 'longShots', 'passing', 'crossing', 'dribbling', 'firstTouch', 'technique', 'heading', 'tackling', 'marking'],
  Mental: ['vision', 'decisions', 'anticipation', 'positioning', 'offTheBall', 'composure', 'workRate', 'leadership'],
  Physical: ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping'],
  Goalkeeping: ['reflexes', 'handling', 'oneOnOnes', 'aerialReach', 'kicking', 'commandOfArea'],
} as const;

export type AttributeKey = (typeof ATTRIBUTE_GROUPS)[keyof typeof ATTRIBUTE_GROUPS][number];
export const ATTRIBUTES: AttributeKey[] = Object.values(ATTRIBUTE_GROUPS).flat();

export const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  finishing: 'Finishing',
  longShots: 'Long Shots',
  passing: 'Passing',
  crossing: 'Crossing',
  dribbling: 'Dribbling',
  firstTouch: 'First Touch',
  technique: 'Technique',
  heading: 'Heading',
  tackling: 'Tackling',
  marking: 'Marking',
  vision: 'Vision',
  decisions: 'Decisions',
  anticipation: 'Anticipation',
  positioning: 'Positioning',
  offTheBall: 'Off the Ball',
  composure: 'Composure',
  workRate: 'Work Rate',
  leadership: 'Leadership',
  pace: 'Pace',
  acceleration: 'Acceleration',
  stamina: 'Stamina',
  strength: 'Strength',
  agility: 'Agility',
  jumping: 'Jumping',
  reflexes: 'Reflexes',
  handling: 'Handling',
  oneOnOnes: 'One on Ones',
  aerialReach: 'Aerial Reach',
  kicking: 'Kicking',
  commandOfArea: 'Command of Area',
};

/** Character traits (see systems/character.ts). */
export const TRAITS = ['professional', 'leader', 'big-game', 'homesick', 'adaptable', 'hothead', 'late-bloomer', 'mercenary', 'loyal', 'media-darling'] as const;
export type TraitId = (typeof TRAITS)[number];

export type Foot = 'Left' | 'Right' | 'Both';

export interface Player {
  id: PlayerId;
  firstName: string;
  lastName: string;
  birthDate: GameDate;
  nationality: CountryId;
  heightCm: number;
  foot: Foot;
  clubId?: ClubId;
  contractUntil?: GameDate;
  wage: USD; // per week
  value: USD;
  attributes: Record<AttributeKey, number>; // 1–20
  hidden: {
    potential: number; // OVR ceiling, 1–100
    consistency: number; // 1–20
    ambition: number;
    loyalty: number;
    injuryProne: number;
  };
  /** Familiarity per position, 0–1. The natural position is 1. */
  positions: Partial<Record<Position, number>>;
  naturalPosition: Position;
  isProdigy: boolean;
  portraitSeed: number;
  /** Current-season league stats. */
  stats: SeasonStats;
  history: SeasonLine[];
  injury?: Injury;
  /** When he joined his current club via a transfer (absent = long-standing). */
  joinedOn?: GameDate;
  /** Settling in after a move from abroad: plays below his level, fading to nothing by `until`. */
  settling?: { since: GameDate; until: GameDate; start: number; visited?: GameDate };
}
