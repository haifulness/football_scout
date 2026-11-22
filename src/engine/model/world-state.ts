import type { ScoutingEvent } from './event';
import type { Prediction } from './prediction';
import type { BoardAsk, President } from './president';
import type { Dilemma } from './dilemma';
import type { Assistant, AssistantCandidate } from './assistant';
import type { DeadlineDay, ReviewBaseline, SeasonReview } from './review';
import type { Hunt } from './hunt';
import type { Agency } from './agency';
import type { ScenarioState } from './scenario';
import type { Objective, ProdigyFind, Trophy } from './goals';
import type { ScoutReport } from './report';
import type { RivalScout } from './rival';
import type { GameDate } from '../core/calendar';
import type { CityId, ClubId, ContinentId, CountryId, LeagueId, PlayerId, RegionId, StaffId } from '../core/ids';
import type { City, Continent, Country, Region } from './geography';
import type { Club, ClubOfficial, League } from './club';
import type { Player } from './player';
import type { Fixture, NewsItem, SeasonState } from './season';
import type { JobOffer, Knowledge, LedgerEntry, PoolEntry, Scout, SearchRecord } from './scout';
import type { Deal, DealEvent, PayoutEvent, Placement } from './deal';
import type { Mandate, Mission } from './mission';

export interface GameState {
  schemaVersion: 16;
  seed: number;
  date: GameDate;
  continents: Record<ContinentId, Continent>;
  countries: Record<CountryId, Country>;
  regions: Record<RegionId, Region>;
  cities: Record<CityId, City>;
  leagues: Record<LeagueId, League>;
  clubs: Record<ClubId, Club>;
  officials: Record<StaffId, ClubOfficial>;
  players: Record<PlayerId, Player>;
  freeAgents: PlayerId[];
  season: SeasonState;
  fixtures: Record<LeagueId, Fixture[]>;
  news: NewsItem[];
  /** The player character. Undefined until the career is set up. */
  scout?: Scout;
  knowledge: Record<PlayerId, Knowledge>;
  pool: Record<PlayerId, PoolEntry>;
  searches: SearchRecord[];
  ledger: LedgerEntry[];
  deals: Deal[];
  /** Job and client offers waiting for your answer. */
  offers: JobOffer[];
  missions: Mission[];
  mandates: Mandate[];
  /** AI scouts competing with you (created with your career). */
  rivals: RivalScout[];
  /** News ids below this have been seen in the inbox (undefined: everything so far counts as read). */
  inboxSeenId?: number;
  /** Your assistant scouts, and who is looking for work. */
  assistants: Assistant[];
  assistantMarket: AssistantCandidate[];
  /** Prodigies you identified since the last time-advance summary (for the reveal). */
  pendingDiscoveries: PlayerId[];
  placements: Placement[];
  /** Deal events since the last time-advance summary was taken. */
  pendingDealEvents: DealEvent[];
  /** Match bonuses since the last time-advance summary was taken. */
  pendingPayouts: PayoutEvent[];
  /** Ledger totals per season (starting year) and kind: survives the ledger's 500-line cap. */
  ledgerTotals: Record<number, Partial<Record<LedgerEntry['kind'], number>>>;
  /** Weekly balance snapshots for the finances chart. */
  balanceHistory: { date: GameDate; money: number }[];
  /** Your written scouting reports, newest first. */
  reports: ScoutReport[];
  /** Your own agency, once founded. */
  agency?: Agency;
  /** Season goals: this season's three and those of past seasons. */
  objectives: Objective[];
  /** Your trophy cabinet. */
  trophies: Trophy[];
  /** Trophies won since the last time-advance summary (for the reveal). */
  pendingTrophies?: number[];
  /** Prodigies you were first to reveal. */
  prodigyFinds: ProdigyFind[];
  /** Wonderkid hunts: open, and the last ones that ended. */
  hunts: Hunt[];
  /** This season's scouting events (absent in older saves until the next one is drawn). */
  events?: ScoutingEvent[];
  /** The Touchline pundit's pre-season picks for your home top flight, one set per season. */
  predictions?: Prediction[];
  /** Club presidents (filled on load for older saves). */
  presidents?: Record<StaffId, President>;
  /** Presidents asking you who should coach their club next. */
  boardAsks?: BoardAsk[];
  /** Choices put to you (recent ones kept for the record). */
  dilemmas?: Dilemma[];
  /** Your season reviews, newest last (kept for the last 20 seasons). */
  seasonReviews: SeasonReview[];
  /** Season whose review you haven't opened yet. */
  pendingReview?: number;
  /** Where you stood when the season began, for the next review. */
  reviewBaseline?: ReviewBaseline;
  /** Set while deadline day is being played hour by hour. */
  deadline?: DeadlineDay;
  /** The last deadline day you played, so finishing it doesn't start it again. */
  lastDeadline?: GameDate;
  /** Set when bankruptcy ends the career: nothing more can happen in this world. */
  careerOver?: { date: GameDate; reason: string; kind?: 'bankrupt' | 'retired' | 'scenario' };
  /** A scenario career's goal and time limit. */
  scenario?: ScenarioState;
  /** Set by the host when the career's end is written to the hall of fame (one entry per career). */
  careerId?: string;
  /** Monotonic id counters so entities created mid-game never collide. */
  counters: {
    player: number;
    staff: number;
    news: number;
    search: number;
    deal: number;
    offer: number;
    mission: number;
    mandate: number;
    assistant: number;
    hunt: number;
    report: number;
    objective: number;
    trophy: number;
  };
}
