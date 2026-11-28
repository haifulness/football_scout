import type { GameDate } from '../core/calendar';
import type { CityId, ClubId, ContinentId, CountryId, LeagueId, PlayerId, RegionId, StaffId } from '../core/ids';
import type { USD } from '../core/money';
import type { AttributeKey, Position } from './player';

export type Background = 'ex-pro' | 'analyst' | 'agent-assistant' | 'youth-coach';
export type Difficulty = 'easy' | 'normal' | 'hard';

/** Scout skills, 1–20. */
export interface ScoutSkills {
  /** Narrows stat ranges when you watch players. */
  judgingAbility: number;
  /** Reveals hidden potential and prodigies sooner. */
  judgingPotential: number;
  /** Cheaper searches and (later) meetings. */
  network: number;
  /** Cheaper, faster, more accurate searches and video work. */
  dataAnalysis: number;
  /** Persuasion in meetings and negotiations. */
  negotiation: number;
}

export interface Scout {
  name: string;
  nationality: CountryId;
  homeCountry: CountryId;
  background: Background;
  difficulty: Difficulty;
  money: USD;
  /** Where you are right now. */
  location: CityId;
  /** Where you live: no hotel bills here. */
  homeCity: CityId;
  reputation: number; // 0–100
  skills: ScoutSkills;
  /** How well you know each football market, 0–100. */
  regionKnowledge: Record<CountryId, number>;
  /** Relationship with club officials (Head Coaches, Presidents), 0–100. */
  relationships: Record<StaffId, number>;
  /** Rapport with individual players, 0–100. */
  rapport: Record<PlayerId, number>;
  employment: Employment;
  /** Free agents you represent (freelance only). */
  represented: PlayerId[];
  /** You closed the Getting started checklist. */
  onboardingDismissed?: boolean;
  /** Your track record with each club (feeds trust). */
  clubRecord: Record<ClubId, ClubRecord>;
  /** First day of the current run below $0 (bankruptcy after 8 weeks). */
  brokeSince?: GameDate;
  /** The day the career began (absent in older saves: the game's start date). */
  startedOn?: GameDate;
  /** Reputation at the start (5, or a scenario's head start). The score counts what you gained. */
  startReputation?: number;
  /** When you last met someone (staff or player id), to damp repeat meetings. */
  lastMet: Record<string, GameDate>;
  /** Coaches who have stopped taking your pitches, until then. */
  coldUntil?: Record<string, GameDate>;
  /** How straight you deal, 0–100 (absent: 50). Hidden: honest clubs trust you faster, shady offers come less often. */
  integrity?: number;
  /** Systems you have unlocked (announced once; never closed again). */
  unlocks?: ('assistants' | 'mandates' | 'representation' | 'agency' | 'academy')[];
  /** You work under an established scout (freelance only). */
  mentor?: Mentorship;
  /** An established scout offers to take you on. */
  mentorOffer?: { rivalId: number; expiresOn: GameDate };
  /** You have had (or turned down) a mentor: no more offers. */
  mentorDone?: boolean;
  /** When each freelance client took you on (their first review waits a while). */
  clientSince?: Record<ClubId, GameDate>;
  /** Clients that warned you at their last review: another thin year and they go. */
  clientWarned?: ClubId[];
  /** The rival who has made it personal: he rises with you and goes after your clubs and players. */
  nemesis?: {
    rivalId: number;
    since: GameDate;
    /** This season so far: deals he took off you, clients he took from you. */
    steals: number;
    clientsTaken: number;
    /** Seasons won and lost against him. */
    won: number;
    lost: number;
    history: { year: number; you: number; him: number; won: boolean }[];
  };
  /** Rumours a rival spread about you at a club: standing lost there until it fades (or you clear it). */
  smears?: Record<ClubId, { rivalId: number; date: GameDate; amount: number; cleared?: boolean }>;
  /** Clients who warned you last quarter that a rival's signings are doing better (when). */
  raceWarned?: Record<ClubId, GameDate>;
  /** Head coaches who refused to discuss their needs with you, and when. */
  coachRefused?: Record<StaffId, GameDate>;
  /** When you last asked each player about his club. */
  playerTips?: Record<PlayerId, GameDate>;
  /** When you last swapped reads with each rival. */
  rivalSwaps?: Record<number, GameDate>;
  /** When you last paid an insider at each club. */
  insiderTips?: Record<ClubId, GameDate>;
  /** Countries whose data service you subscribe to. */
  dataSubs?: CountryId[];
}

/** Working under a big-name scout: his clients take your calls, he takes a share of what you earn. */
export interface Mentorship {
  rivalId: number;
  since: GameDate;
  /** What he has taken so far. */
  taken: USD;
}

export interface CareerSetup {
  /** A preset start with its own goal; absent for a free career. */
  scenario?: import('./scenario').ScenarioId;
  name: string;
  nationality: CountryId;
  homeCountry: CountryId;
  background: Background;
  difficulty: Difficulty;
  /** Start as a junior under an established scout. */
  mentor?: boolean;
}

/** What you know about one player. Absent = only public information. */
export interface Knowledge {
  level: number; // 0–100
  lastUpdated: GameDate;
  /** What you've seen of single attributes up close (attending a match), when it beats the overall level. */
  attrs?: Partial<Record<AttributeKey, number>>;
  /** His attributes as they were the last time you looked (your read is of that player, not today's). */
  seenAttrs?: Record<AttributeKey, number>;
  /** Something happened that makes your read out of date at once (until you look again). */
  stale?: string;
  /** His circumstances when you looked: a change since makes your read stale. */
  seenContext?: { clubId?: ClubId; age: number; form?: number; injuredUntil?: GameDate };
  /** Last time your read was brought up to date without new knowledge (a video catch-up). */
  checkedOn?: GameDate;
  /** Character traits your work has uncovered. */
  characterSeen?: import('./player').TraitId[];
}

export interface PoolEntry {
  addedOn: GameDate;
  source: 'search' | 'manual' | 'assistant';
  starred: boolean;
  /** An assistant's report: his own rating, which may be off. */
  /** Someone else's rating: an assistant's, or a selling club's (no assistantId). */
  report?: { assistantId?: number; by: string; rating: number; date: GameDate };
}

export type LocationScope =
  | { scope: 'world' }
  | { scope: 'continent'; id: ContinentId }
  | { scope: 'country'; id: CountryId }
  | { scope: 'region'; id: RegionId }
  | { scope: 'city'; id: CityId };

export interface AttributeFilter {
  attribute: AttributeKey;
  min: number; // 1–20
  /** Upper bound, 1–20 (omitted or 20 = no cap). */
  max?: number;
}

/** Upper bound meaning "no maximum" in a value filter (kept finite so it survives JSON saves). */
export const VALUE_NO_MAX = 1_000_000_000_000;

export interface SearchFilters {
  location: LocationScope;
  leagueId?: LeagueId;
  positions: Position[]; // up to 3, empty = any
  age?: [number, number];
  /** Market value range in USD, inclusive. Use VALUE_NO_MAX for an open top. */
  value?: [number, number];
  /** Weekly wage range in USD (free agents count as $0). Use VALUE_NO_MAX for an open top. */
  wage?: [number, number];
  /** Overall rating range at the searched position (judged by your network, so noisy). */
  rating?: [number, number];
  /** A different bar per position (e.g. a club's needs): he must beat the bar at the position he'd fill. */
  ratingFloors?: Partial<Record<Position, number>>;
  attributes: AttributeFilter[]; // up to 4
  includeFreeAgents: boolean;
  /** The club the search is for (from its needs or a brief). Doesn't change who matches; results show what each would ask it. */
  forClub?: ClubId;
}

export interface SearchRecord {
  id: number;
  filters: SearchFilters;
  label: string;
  startedOn: GameDate;
  completedOn: GameDate;
  cost: USD;
  days: number;
  /** Ranked results (best first). */
  results: PlayerId[];
  /** How many players matched before the result cap. */
  matched: number;
  /** The position each result was judged at, where it differs from his natural one. */
  judgedAs?: Partial<Record<PlayerId, Position>>;
  /** Matches left out because they were already in your pool. */
  alreadyInPool?: number;
}

export type LedgerKind =
  | 'starting-funds'
  | 'search'
  | 'video'
  | 'travel'
  | 'accommodation'
  | 'ticket'
  | 'meeting'
  | 'signing-bonus'
  | 'match-bonus'
  | 'salary'
  | 'mission-reward'
  | 'sale-commission'
  | 'assistant'
  | 'assistant-task'
  | 'award'
  | 'agency'
  | 'agency-setup'
  | 'agency-cut'
  | 'mentor-cut'
  | 'consultation'
  | 'campaign'
  | 'living'
  | 'tax'
  | 'academy'
  | 'training-fee'
  | 'sell-on';

/** How a full-time contract weighs pay against bonuses, and whether you took an extra season. */
export interface ContractTerms {
  focus: 'standard' | 'salary' | 'bonuses';
  /** One season longer than offered: a little less pay, a bigger payout if they sack you. */
  extended?: boolean;
}

export type Employment =
  | { mode: 'freelance'; clients: ClubId[] }
  | {
      mode: 'fulltime';
      clubId: ClubId;
      title: string;
      /** Per year. Paid weekly. */
      salary: USD;
      since: GameDate;
      until: GameDate;
      /** Resigned: you leave on this date. */
      leavingOn?: GameDate;
      /** The club has already offered to renew this contract: if you don't take it, you leave. */
      renewalOffered?: boolean;
      /** What you chose when you signed (standard terms when absent). */
      terms?: ContractTerms;
    };

export interface ClubRecord {
  signings: number;
  /** Pitches the club found not good enough or unaffordable. */
  weakPitches: number;
  missionsDone?: number;
  missionsFailed?: number;
  /** Players you brought who turned out hits / flops (a big fee counts twice). */
  hits?: number;
  flops?: number;
  /** Full-time: players you sold for this club (your employer) without a brief. */
  sales?: number;
}

export interface JobOffer {
  id: number;
  kind: 'fulltime' | 'client';
  clubId: ClubId;
  title?: string;
  salary?: USD;
  /** Contract length in seasons (full-time). */
  seasons?: number;
  createdOn: GameDate;
  expiresOn: GameDate;
  renewal?: boolean;
}

export interface LedgerEntry {
  date: GameDate;
  amount: USD; // positive = income, negative = expense
  kind: LedgerKind;
  label: string;
}
