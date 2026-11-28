import type { NegotiationKey } from './model/mission';
import type { PotentialGrade, ReportGrade, Verdict } from './model/report';
import type { FocusOutcome, MatchEvent } from './systems/matchday';
import type { HuntClue, HuntStage, HuntStatus } from './model/hunt';
import type { DeadlineFeedItem, ReviewPlayer, SeasonReview } from './model/review';
/**
 * Read-only view models the UI receives from the engine worker.
 * They carry only what a screen renders, never the whole world.
 */
import type { GameDate } from './core/calendar';
import type { CityId, ClubId, ContinentId, CountryId, LeagueId, PlayerId, StaffId } from './core/ids';
import type { USD } from './core/money';
import type { FormationId } from './data/formations';
import type { Club, ClubOfficial, ClubTier } from './model/club';
import type { AttributeKey, Foot, Position } from './model/player';
import type { NewsItem } from './model/season';
import type { DealLogEntry, DealStage, Official } from './model/deal';
import type { Background, Difficulty, LedgerEntry, ScoutSkills, SearchFilters } from './model/scout';
import type { Range } from './systems/knowledge';
import type { LineupSlot, SlotNeed } from './systems/squad-needs';
import type { AwardResult, Objective, ObjectiveKind, SpecialtyKind, Trophy } from './model/goals';
import type { AgencyLogo } from './model/agency';

export interface ClubBadge {
  id: ClubId;
  name: string;
  shortName: string;
  tier: ClubTier;
  colors: Club['colors'];
  crest: Club['crest'];
  kit: Club['kit'];
}

export interface CountrySummary {
  id: CountryId;
  name: string;
  mapId: string;
  continentId: ContinentId;
  strength: number;
  wealthIndex: number;
  /** Name culture, used by the UI for portraits. */
  culture: string;
  leagueCount: number;
  clubCount: number;
  playerCount: number;
  topClub?: ClubBadge;
}

export interface WorldSummary {
  seed: number;
  date: GameDate;
  continents: { id: ContinentId; name: string }[];
  countries: CountrySummary[];
  clubCities: { id: CityId; name: string; countryId: CountryId; lat: number; lon: number; clubs: number; bestTier: ClubTier }[];
  totals: { clubs: number; players: number; freeAgents: number; leagues: number };
}

export interface ClubRow extends ClubBadge {
  cityName: string;
  reputation: number;
  formation: FormationId;
  xiOvr: number;
  squadValue: USD;
  transferBudget: USD;
}

export interface LeagueView {
  id: LeagueId;
  name: string;
  level: number;
  clubs: ClubRow[];
  table: TableRowView[];
  rounds: number;
  /** Latest round with results (or 1 before the season starts). */
  currentRound: number;
  promotionSpots: number;
  hasPromotion: boolean;
  hasRelegation: boolean;
}

export interface CountryView extends CountrySummary {
  continentName: string;
  costIndex: number;
  regions: { name: string; cities: { id: CityId; name: string; lat: number; lon: number; clubs: number }[] }[];
  leagues: LeagueView[];
  freeAgents: number;
}

export interface PlayerRow {
  id: PlayerId;
  name: string;
  age: number;
  nationality: { id: CountryId; name: string };
  position: Position;
  /** Your best estimate (middle of the range). */
  ovr: number;
  ovrRange: Range;
  /** How much you know about him, 0–100. */
  knowledge: number;
  potential?: Range;
  prodigy: boolean;
  inPool: boolean;
  value: USD;
  wage: USD;
  /** Free agents: the weekly wage he expects for his level (his wage is 0 until he signs). */
  expectedWage?: USD;
  contractUntil?: GameDate;
  portraitSeed: number;
  isCaptain: boolean;
  stats: StatLine;
  injury?: string;
  /** Club name for lists that mix clubs (search, pool). */
  club?: ClubBadge;
  /** Your deal in progress for him, if any. */
  openDeal?: { club: string; stage: 'negotiating' | 'agreed' };
  /** When you last looked at him yourself, and how current that read is (absent: public information only). */
  seenOn?: GameDate;
  /** Whole months since you looked (0 = this month). */
  seenMonthsAgo?: number;
  freshness?: 'fresh' | 'ageing' | 'stale';
  /** Why your read went stale early (a move, an injury…). */
  staleReason?: string;
  /** A video catch-up would bring your read up to date now, for this much (no time). */
  catchUp?: USD;
}

export interface OfficialView extends Pick<ClubOfficial, 'id' | 'role' | 'firstName' | 'lastName' | 'age' | 'priorities' | 'stubbornness' | 'portraitSeed'> {
  nationality: string;
  /** Your relationship and how to meet them (null without a scout). */
  meeting: MeetingView | null;
}

export interface PresidentView {
  id: StaffId;
  name: string;
  age: number;
  nationality: string;
  portraitSeed: number;
  policy: 'youth' | 'win-now' | 'homegrown' | 'sell';
  policyLabel: string;
  policyLine: string;
  /** Your standing in the boardroom, 0–100. */
  standing: number;
  /** Fees above this go to the board. */
  feeThreshold: USD;
}

/** A big signing needs the board's yes after the coach's. */
export interface BoardPreview {
  president: string;
  policyLabel: string;
  read: 'good' | 'toss-up' | 'long-shot';
  reasons: { text: string; good: boolean }[];
}

export interface BoardAskView {
  id: number;
  club: ClubBadge;
  president: string;
  outgoing: string;
  reason: string;
  daysLeft: number;
  candidates: { id: StaffId; name: string; age: number; relationship: number; lastClub?: string; formation?: string }[];
}

export interface CampaignRunView {
  country: { id: CountryId; name: string };
  startedOn: GameDate;
  endsOn: GameDate;
  weeklyCost: USD;
  spent: USD;
  invites: number;
  endedOn?: GameDate;
  weeksLeft: number;
}

/** Profile campaigns: what's running, what it costs where. */
export interface CampaignView {
  active?: CampaignRunView;
  last?: CampaignRunView;
  /** Markets you could target, cheapest first, with your home market first. */
  markets: { id: CountryId; name: string; weeklyCost: USD; home: boolean }[];
  weeks: [number, number];
  /** Flops cost this many times as much while one runs. */
  spotlight: number;
  /** Briefs and player questions come this much more often, in percent. */
  boostPct: number;
  /** Why you can't run one, if you can't. */
  blocked?: string;
}

/** A player asking whether to join a club. */
export interface ConsultationView {
  id: number;
  player: { id: PlayerId; name: string; portraitSeed: number; nationalityId: CountryId; age: number; position: Position; rapport: number };
  from: ClubBadge;
  to: ClubBadge & { leagueName: string; formation: string };
  fee: USD;
  /** Your read: whether he'd start there (less reliable in markets you don't know). */
  read: 'starter' | 'squad';
  /** How well you know the club's market, 0–100. */
  marketKnowledge: number;
  daysLeft: number;
  /** The club is one of yours: a move pays you a finder's fee. */
  finderFee?: USD;
}

export interface ClubView extends ClubBadge {
  city: { id: CityId; name: string; lat: number; lon: number };
  country: { id: CountryId; name: string; wealthIndex: number };
  league: { id: LeagueId; name: string; level: number };
  reputation: number;
  founded: number;
  stadium: string;
  capacity: number;
  transferBudget: USD;
  wageBudget: USD;
  wageBill: USD;
  squadValue: USD;
  averageAge: number;
  formation: FormationId;
  /** How the club plays: what kind of footballer the coach wants. */
  style: StyleView;
  acceptsProspects: Club['acceptsProspects'];
  lineup: (LineupSlot & { name?: string; portraitSeed?: number; ovrRange?: Range })[];
  /** Their needs as far as you know them (see needsRead): none when unknown, the pressing ones when rough. */
  needs: (SlotNeed & { avgRange?: Range })[];
  /** How well you know their needs, why it may be out of date, and what studying their squad would give you. */
  /** A rival's rumour about you here, costing you standing until it fades or you meet the coach. */
  smear?: { by: string; amount: number; cleared: boolean; until: GameDate };
  /** How your pitches have gone here lately. */
  pitchRecord?: {
    noes: number;
    maxNoes: number;
    /** The coach won't take your pitches until then. */
    coldUntil?: GameDate;
    hit?: { rate: number; pitches: number; label: 'wall' | 'trusted' | 'fair'; /** On a coach's yes there, e.g. −0.1. */ effect: number };
  };
  needsRead: {
    tier: 'unknown' | 'rough' | 'good' | 'sure';
    level: number;
    stale?: string;
    since?: GameDate;
    floor?: string;
    study: { days: number; level: number; useful: boolean };
    /** Paid and staff sources: an insider's tip, an assistant's analysis, the country's data service. */
    paid: {
      insider: { ok: boolean; reason?: string; cost: USD };
      analysts: { id: number; name: string; skill: number; ok: boolean; reason?: string }[];
      /** Assistants already studying this club. */
      studying: { name: string; until: GameDate }[];
      data: { countryId: CountryId; country: string; cost: USD; subscribed: boolean };
    } | null;
    /** People who could tell you: the head coach, players you know there, rival scouts who work for them. */
    asks: {
      coach: { name: string; ok: boolean; reason?: string; chance: number; cost: USD };
      players: { id: PlayerId; name: string; position: Position; ok: boolean; reason?: string }[];
      rivals: { id: number; name: string; ok: boolean; reason?: string }[];
    } | null;
  };
  squad: PlayerRow[];
  coach: OfficialView;
  president?: PresidentView;
  leaguePosition?: number;
  fixtures: FixtureView[];
  history: { season: string; leagueName: string; position: number; points: number }[];
  /** Your working relationship with this club (null without a scout). */
  work: ClubWorkView | null;
}

export interface PlayerView {
  id: PlayerId;
  firstName: string;
  lastName: string;
  age: number;
  birthDate: GameDate;
  nationality: { id: CountryId; name: string };
  heightCm: number;
  foot: Foot;
  naturalPosition: Position;
  ovr: number;
  ovrRange: Range;
  positionRatings: { position: Position; ovr: Range; familiarity: number }[];
  attributes: Record<AttributeKey, Range>;
  knowledge: number;
  /** How current your own read is (absent: public information only). */
  seen?: { on: GameDate; monthsAgo: number; freshness: 'fresh' | 'ageing' | 'stale'; reason?: string };
  potential?: Range;
  prodigy: boolean;
  traits?: { consistency: string; injuryRisk: string; ambition?: string };
  /** Settling in after a move: how long is left, how much it costs him, and whether a visit from you would help. */
  settling?: { daysLeft: number; penaltyPct: number; aftercare: { ok: boolean; reason?: string } };
  /** His character as far as you know it. `total` shows once you've met him or know him well. */
  character: { known: TraitView[]; total?: number };
  inPool: boolean;
  starred: boolean;
  /** Footage: a day for `gain` knowledge, or a catch-up (no time) once it has told you all it can. Absent with no scout. */
  video?: { ok: boolean; reason?: string; cost: USD; catchUp: boolean; gain: number };
  meeting: MeetingView | null;
  live: LiveView | null;
  /** Freelance representation of a free agent. */
  rivalInterest: RivalInterestView[];
  /** An assistant's rating, if one of them found him. */
  assistantReport?: { by: string; rating: number; date: GameDate };
  representation: { status: 'represented' | 'available' | 'unavailable'; reason?: string } | null;
  /** An active or offered selling mandate on this player. */
  mandate?: { id: number; club: ClubBadge; askingFee: USD; commissionPct: number; commission: USD; status: 'offered' | 'active'; daysLeft?: number };
  value: USD;
  wage: USD;
  contractUntil?: GameDate;
  club?: ClubBadge & { leagueName: string; countryName: string };
  isFreeAgent: boolean;
  portraitSeed: number;
  isCaptain: boolean;
  stats: StatLine & { starts: number; minutes: number; tackles: number; cleanSheets: number; captaincies: number; motm: number };
  history: (StatLine & { season: string; club?: ClubBadge })[];
  injury?: { description: string; until: GameDate };
}

export interface StatLine {
  apps: number;
  goals: number;
  assists: number;
  /** Average match rating, undefined with no appearances. */
  avgRating?: number;
}

export interface TableRowView {
  position: number;
  club: ClubBadge;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

export interface FixtureView {
  id: string;
  round: number;
  date: GameDate;
  leagueName: string;
  home: ClubBadge;
  away: ClubBadge;
  result?: {
    homeGoals: number;
    awayGoals: number;
    attendance: number;
    goals: { minute: number; clubId: ClubId; name: string; ownGoal?: boolean; assist?: string }[];
    motm?: string;
  };
}

export type SeasonPhase = 'pre-season' | 'season' | 'off-season';

export interface Clock {
  date: GameDate;
  seasonYear: number;
  seasonLabel: string;
  phase: SeasonPhase;
  transferWindow: boolean;
  nextMatchDate?: GameDate;
  /** Set while deadline day is being played: the hour (9 … 24). */
  deadlineHour?: number;
  /** A season review waiting to be opened. */
  pendingReview?: number;
}

export interface AdvanceSummary {
  from: GameDate;
  to: GameDate;
  matchesPlayed: number;
  news: NewsItem[];
  seasonRolledOver: boolean;
  clock: Clock;
  /** What happened to your deals while time passed. */
  dealEvents: DealEventView[];
  /** Match bonuses your placed players earned you. */
  payouts: PayoutView[];
  careerOver?: { date: GameDate; reason: string; kind?: 'bankrupt' | 'retired' | 'scenario' };
  /** Why an "advance until something happens" stopped. */
  stoppedFor?: string;
}

export interface MatchDayPlayer {
  id: PlayerId;
  name: string;
  position: Position;
  age: number;
  ovr: Range;
  /** Knowledge level, 0–100. */
  known: number;
  inPool: boolean;
  portraitSeed: number;
  nationalityId: CountryId;
}

/** A match you can attend for a player: the fixture, the ticket, and both squads to pick from. */
export interface MatchDayView {
  targetId: PlayerId;
  fixture: { id: string; date: GameDate; leagueName: string; home: ClubBadge; away: ClubBadge };
  venue: { id: CityId; name: string };
  daysAway: number;
  ticket: USD;
  /** Hotel nights while you wait in the venue city (0 inside your home region). */
  hotel: USD;
  inPlace: boolean;
  maxFocus: number;
  squads: { club: ClubBadge; players: MatchDayPlayer[] }[];
}

export interface AttendedMatchView {
  home: ClubBadge;
  away: ClubBadge;
  homeGoals: number;
  awayGoals: number;
  events: (MatchEvent & { attributeLabel?: string })[];
  focus: (Omit<FocusOutcome, 'seen'> & {
    player: MatchDayPlayer & { club: ClubBadge };
    seen: { attribute: string; label: string; before: number; after: number; range: Range }[];
  })[];
  others: number;
}

export interface HuntView {
  id: number;
  status: HuntStatus;
  stage: HuntStage;
  position: Position;
  age: number;
  startedOn: GameDate;
  expiresOn: GameDate;
  daysLeft: number;
  /** Newest first. */
  clues: HuntClue[];
  area: { country: { id: CountryId; name: string }; region?: string; city?: { id: CityId; name: string } };
  rivals: { id: number; name: string; portraitSeed: number; nationalityId: CountryId; band: 'behind' | 'on the trail' | 'closing in' | 'found him' }[];
  options?: {
    calls: { cost: USD; days: number; chance: number };
    visit: { cost: USD; days: number; chance: number; inArea: boolean; destination?: { id: CityId; name: string } };
  };
  player?: { id: PlayerId; name: string; club: ClubBadge };
  winner?: string;
}

export interface DeadlineView {
  date: GameDate;
  hour: number;
  feed: DeadlineFeedItem[];
  /** Your deals still being negotiated: each is settled before midnight. */
  open: DealView[];
  feePremium: number;
}

export interface SeasonReviewView extends Omit<SeasonReview, 'players'> {
  label: string;
  /** Money in and out by source, biggest first. */
  rows: { kind: string; label: string; amount: number }[];
  players: (ReviewPlayer & { club: ClubBadge; portraitSeed: number; nationalityId: CountryId })[];
}

export interface FeaturedLeague {
  leagueId: LeagueId;
  leagueName: string;
  countryId: CountryId;
  countryName: string;
  round: number;
  fixtures: FixtureView[];
}

export type { NewsItem };

export interface ScoutView {
  name: string;
  background: Background;
  backgroundLabel: string;
  difficulty: Difficulty;
  money: USD;
  location: {
    cityId: CityId;
    cityName: string;
    countryId: CountryId;
    countryName: string;
    lat: number;
    lon: number;
    isHome: boolean;
    nightly: USD;
    /** Clubs based in this city, biggest first. */
    clubs: ClubBadge[];
  };
  homeCity: { id: CityId; name: string };
  homeCountry: { id: CountryId; name: string };
  reputation: number;
  skills: ScoutSkills;
  /** Markets you know best, strongest first. */
  markets: { countryId: CountryId; name: string; level: number }[];
  ledger: LedgerEntry[];
  poolSize: number;
  /** In debt: when it started and how many days until bankruptcy. */
  debt?: { since: GameDate; daysLeft: number };
  careerOver?: { date: GameDate; reason: string; kind?: 'bankrupt' | 'retired' | 'scenario' };
  /** Short employment label for the top bar, e.g. "Freelance · 2/3 clients". */
  employmentLabel: string;
  /** Full-time: who you work for and your job title. */
  employer?: { club: ClubBadge; title: string };
  /** Which later systems are open (they unlock with reputation). */
  unlocked: Record<'assistants' | 'mandates' | 'representation' | 'agency' | 'academy', boolean>;
  /** The next thing your reputation will open. */
  nextUnlock?: { label: string; reputation: number };
  pendingOffers: number;
  /** Mission offers waiting for an answer. */
  pendingMissions: number;
  /** Selling mandates waiting for your answer (freelance). */
  pendingMandates: number;
  /** Rumoured rival chases on players you are working on. */
  rivalThreats: number;
  /** Assistants without a task. */
  idleAssistants: number;
  /** Wonderkid hunts still open. */
  activeHunts: number;
  /** This season's goals reached, of how many. */
  goals: { done: number; total: number };
  /** A scenario career's goal, time left and progress. */
  scenario?: { name: string; goal: string; deadline: GameDate; daysLeft: number; status: 'active' | 'won' | 'lost'; label: string; fraction: number };
  /** Inbox messages you haven't opened the inbox to see. */
  unreadInbox: number;
}

export interface SearchEstimateView {
  cost: USD;
  days: number;
  affordable: boolean;
  factors: { label: string; effect: string }[];
}

export interface SearchSummary {
  id: number;
  label: string;
  startedOn: GameDate;
  completedOn: GameDate;
  cost: USD;
  days: number;
  matched: number;
  resultCount: number;
  /** Matches left out because they were already in your pool. */
  alreadyInPool: number;
  filters: SearchFilters;
}

export interface SearchView extends SearchSummary {
  results: (PlayerRow & {
    /** For a search made for a club: the weekly wage he'd ask it, and whether its wage budget has room. */
    ask?: USD;
    wageFits?: boolean;
  })[];
  forClub?: { id: ClubId; name: string };
}

export interface LocationTree {
  continents: {
    id: ContinentId;
    name: string;
    countries: {
      id: CountryId;
      name: string;
      leagues: { id: LeagueId; name: string; level: number }[];
      regions: { id: string; name: string; cities: { id: CityId; name: string }[] }[];
    }[];
  }[];
}

export interface MeetingView {
  role: 'player' | 'coach';
  level: number;
  label: string;
  cost: USD;
  city?: { id: CityId; name: string };
  countryName: string;
  inPlace: boolean;
  requiredReputation: number;
  allowed: boolean;
  recentlyMet: boolean;
  /** At the club you work for: free and easier. */
  colleague: boolean;
  /** Never met: the full price. Catch-ups after the first meeting are cheaper. */
  firstMeeting: boolean;
  /** You already met today: more meetings or pitches with them take no extra day (or fee). */
  metToday: boolean;
  /** For a coach, level/label are your standing with his club (not a personal relationship). */
  standing?: boolean;
}

export interface LiveView {
  date: GameDate;
  opponent: ClubBadge;
  home: boolean;
  venue: { id: CityId; name: string };
  daysAway: number;
  ticket: USD;
  inPlace: boolean;
}

export interface TravelQuoteView {
  to: { id: CityId; name: string; countryName: string; lat: number; lon: number };
  from: { id: CityId; name: string; lat: number; lon: number };
  band: 'here' | 'region' | 'country' | 'continent' | 'intercontinental';
  distanceKm: number;
  cost: USD;
  days: number;
  nightly: USD;
  affordable: boolean;
}

export interface DealEventView {
  dealId: number;
  kind: 'completed' | 'agreed' | 'failed' | 'hijacked' | 'collapsed';
  text: string;
  player: { id: PlayerId; name: string; portraitSeed: number; nationalityId: CountryId; age: number; position: Position };
  club: ClubBadge;
  fee: USD;
}

export interface DealView {
  id: number;
  player: { id: PlayerId; name: string; portraitSeed: number; nationalityId: CountryId; age: number; ovrRange?: Range } | null;
  club: ClubBadge & { cityName: string };
  seller?: ClubBadge;
  position: Position;
  stage: DealStage;
  pitchedTo: Official[];
  signOff?: { by: Official; date: GameDate; bypassed?: Official };
  prospect: boolean;
  openedOn: GameDate;
  resolvesOn?: GameDate;
  completedOn?: GameDate;
  fee: USD;
  wage: USD;
  chance?: number;
  reason?: string;
  log: DealLogEntry[];
  /** Rumoured rival chases for the same player. */
  rivals: RivalInterestView[];
}

export interface OfficialPitchView {
  id: string;
  role: Official;
  name: string;
  portraitSeed: number;
  age: number;
  meeting: MeetingView;
  topPriorities: string[];
  /** Your read of how they'll take it (banded, not exact). */
  read: 'good' | 'toss-up' | 'long-shot';
  /** Pitching by phone: open once the club trusts you enough, and a little less convincing. */
  remote: { ok: boolean; trust: number; required: number; reason?: string; read: 'good' | 'toss-up' | 'long-shot' };
}

export interface ReportView {
  id: number;
  playerId: PlayerId;
  playerName: string;
  date: GameDate;
  role: Position;
  rating: number;
  potential: PotentialGrade;
  verdict: Verdict;
  verdictLabel: string;
  knowledge: number;
  reviewOn: GameDate;
  /** Only after the review: his true level then and now, and how close you were. */
  outcome?: { truthThen: number; truthNow: number; error: number; grade: ReportGrade; overrated: boolean; potentialRight: boolean };
}

/** Everything the report form needs. */
export interface ReportDraft {
  allowed: boolean;
  reason?: string;
  knowledge: number;
  minKnowledge: number;
  /** Positions he can play, natural first. */
  roles: Position[];
  /** Pre-filled from what you know (your estimates). */
  suggestion: { role: Position; rating: number; potential: PotentialGrade; verdict: Verdict };
  existing?: ReportView;
  verdicts: { key: Verdict; label: string }[];
}

export interface AgencyStaffView {
  id: number;
  name: string;
  skill: number;
  wage: USD;
  portraitSeed: number;
  nationalityId: CountryId;
  officeId?: number;
  onTask: boolean;
  /** Deals he has lined up for the next window. */
  leads: number;
  maxLeads: number;
  /** Skilled enough to take your briefs. */
  canTakeBriefs: boolean;
  /** Picks up untouched briefs on his own (office staff). */
  takesBriefs: boolean;
  /** The brief or sale he is working, in a few words. */
  working?: string;
}

export interface AgencyBaseView {
  /** 0 = headquarters. */
  officeId: number;
  hq: boolean;
  country: { id: CountryId; name: string };
  cityName: string;
  /** Per month (0 at headquarters, which has weekly upkeep instead). */
  rent: USD;
  openedOn: GameDate;
  staff: AgencyStaffView[];
  dealsThisSeason: number;
  /** Rival agencies with a base in this country too. */
  contestedBy: string[];
  earnedThisSeason: USD;
}

export interface AgencyView {
  check: { ok: boolean; reason?: string };
  requirements: { reputation: number; cost: USD; yourReputation: number; money: USD };
  maxOffices: number;
  clients: { used: number; capacity: number };
  staff: { used: number; capacity: number };
  agency?: {
    name: string;
    shortName: string;
    logo: AgencyLogo;
    foundedOn: GameDate;
    brokered: number;
    earned: USD;
    weeklyUpkeep: USD;
    monthlyRent: USD;
    season: { label: string; cuts: USD; costs: USD };
    bases: AgencyBaseView[];
    unplaced: AgencyStaffView[];
    deals: { date: GameDate; playerId: PlayerId; playerName: string; club: ClubBadge; by: string; fee: USD; cut: USD }[];
    /** What the staff have been doing, newest first. */
    log: { date: GameDate; kind: 'brief' | 'lead' | 'deal' | 'pitch' | 'rival'; text: string }[];
    /** Briefs you've accepted that nobody is working: neither you (no open deal) nor staff. */
    untouchedBriefs: number;
    /** Active briefs staff are handling. */
    staffBriefs: number;
    /** The competition. */
    rivals: {
      id: number;
      name: string;
      shortName: string;
      color: string;
      countries: { id: CountryId; name: string; shared: boolean }[];
      strength: number;
      dealsThisSeason: number;
      hired: number;
    }[];
  };
  /** Countries where you could open an office. */
  openable: { id: CountryId; name: string; continent: string; clubs: number; setup: USD; rent: USD; market: number }[];
}

export interface ObjectiveView {
  id: number;
  title: string;
  kind: ObjectiveKind;
  target: number;
  progress: number;
  /** How the numbers read: a count, dollars, or a reputation score. */
  unit: 'count' | 'money' | 'reputation';
  /** Reputation goals start from where you were, so progress shows from there. */
  start?: number;
  status: Objective['status'];
  doneOn?: GameDate;
  reward: { money: USD; reputation: number };
  /** Judged only when the season ends. */
  atSeasonEnd: boolean;
}

export interface TrophyView extends Trophy {
  club?: ClubBadge;
  playerName?: string;
}

/** How a placed player is doing this season (colours his map pin). */
export type PlacementForm = 'star' | 'good' | 'ok' | 'poor' | 'bench' | 'gone';

export interface PlacementPinView {
  /** One pin per city. */
  cityId: CityId;
  cityName: string;
  countryName: string;
  lat: number;
  lon: number;
  /** The best form among the players still there (or 'gone' when none are). */
  form: PlacementForm;
  players: {
    playerId: PlayerId;
    name: string;
    club: ClubBadge;
    signedOn: GameDate;
    form: PlacementForm;
    apps: number;
    avg?: number;
  }[];
}

export interface WallClubView {
  club: ClubBadge;
  cityName: string;
  countryName: string;
  placements: number;
  /** How you know them, strongest first. */
  roles: ('employer' | 'client' | 'placed' | 'missions')[];
}

export interface LegacyView {
  pins: PlacementPinView[];
  wall: WallClubView[];
  countries: number;
  placements: number;
}

export interface SpecialtyView {
  key: string;
  kind: SpecialtyKind;
  label: string;
  level: 0 | 1 | 2;
  count: number;
  share: number;
  /** Placements still needed for the next level. */
  needed: number;
  /** What it does for you, in a line. */
  effect: string;
}

export interface GoalsView {
  season: number;
  seasonLabel: string;
  objectives: ObjectiveView[];
  past: { season: number; label: string; items: { title: string; status: Objective['status'] }[] }[];
  trophies: TrophyView[];
  specialties: SpecialtyView[];
  placements: number;
  rules: { specialistCount: number; expertCount: number; share: number };
  lastAwards?: { label: string; awards: AwardResult[] };
}

export interface TrackRecordView {
  written: number;
  reviewed: number;
  pending: number;
  accuracy?: number;
  overrated: number;
  potentialRight: number;
  minReviewed: number;
  /** Extra club trust from your accuracy (±8). */
  trust: number;
  reports: ReportView[];
}

export interface PitchPreview {
  player: { id: PlayerId; name: string; age: number; naturalPosition: Position; prodigyKnown: boolean; potential?: Range };
  club: ClubBadge & {
    cityId: CityId;
    cityName: string;
    formation: string;
    acceptsProspects: 'never' | 'prodigies' | 'yes';
    transferBudget: USD;
    wageRoom: USD;
  };
  positions: Position[];
  position: Position;
  /** The club's average at this position as far as you know it (the middle of your range; absent when unknown). */
  positionalAverage?: number;
  /** Your range for it: exact when you know the club well, wide when you don't. */
  averageRange?: Range;
  /** How well you know what they need at this position. */
  readTier: 'unknown' | 'rough' | 'good' | 'sure';
  /** Your estimate of him at this position. */
  estimate: Range;
  /** How your estimate compares with the bar (unknown when you don't know their average). */
  clearsBar: 'yes' | 'maybe' | 'no' | 'unknown';
  /** He could still get in as a prospect (young, club open to it, potential looks high enough). */
  prospectRoute: boolean;
  fee: USD;
  wage: USD;
  /** How much less he asks because he trusts you (rapport). */
  wageSaving: USD;
  /** Most the club will pay him (a discussed brief's wage ceiling, else 1.5× his ask). */
  wageCeiling: USD;
  /** Rival scouts chasing this need after reading about it: each raises the bar by a point. */
  competition: number;
  /** What weighs on this pitch: noes this month, a coach who stopped listening, tiredness at the position, your hit rate. */
  pressure?: {
    noes: number;
    maxNoes: number;
    coldUntil?: GameDate;
    fatigueNoes: number;
    fatigueCut: number;
    hit?: { rate: number; pitches: number; label: 'wall' | 'trusted' | 'fair'; /** On a coach's yes there, e.g. −0.1. */ effect: number };
  };
  /** Rough chance he accepts once the club is on board, at his ask and at the ceiling. */
  acceptance: { atAsk: number; atCeiling: number };
  /** Your open report on him backs this pitch. */
  report?: { role: Position; rating: number; sameRole: boolean };
  /** Your specialties this pitch falls in (they help the sign-off). */
  specialties: string[];
  /** The club's style, and whether he suits it as far as you can tell (on your read of him). */
  style: StyleView & { fit: 'fits' | 'neutral' | 'clashes' };
  /** How he'd settle at this club, judged on what you know of him (absent: a move at home, nothing to settle). */
  settling?: { months: number; label: 'quick' | 'a few months' | 'slow' | 'very slow'; reasons: string[]; unknownCharacter: boolean };
  affordable: boolean;
  affordReason?: string;
  inCity: boolean;
  /** Whether you may recommend to this club at all (employer / client rules). */
  work: { ok: boolean; reason?: string };
  /** Why you may pitch here: the club is yours, a client's sale, or a free agent you represent. */
  rights: 'club' | 'mandate' | 'represented' | 'open' | 'employer' | 'none';
  rivalInterest: RivalInterestView[];
  /** Your cut if this is a mandate sale. */
  commission?: USD;
  /** Whether you could propose a scouting agreement instead. */
  agreement: { ok: boolean; reason?: string };
  /** Active missions from this club, and how this player looks against each brief (from what you can see). */
  missions: MissionFitView[];
  coach: OfficialPitchView;
  existing?: DealView;
  /** How current your read on him is. */
  freshness?: 'fresh' | 'ageing' | 'stale';
  seenOn?: GameDate;
  /** Whole months since you last looked (for the warning). */
  seenMonthsAgo?: number;
  staleReason?: string;
  /** After a no: whether you may pitch him again now, from when, and what would open it sooner. */
  repitch?: { ok: boolean; because?: string; from: GameDate; conditions: string[]; message: string };
  /** A signing this size goes to the board after the coach says yes. */
  board?: BoardPreview;
}

export interface ClubSuggestion {
  club: ClubBadge & { cityName: string; countryName: string; leagueName: string };
  reason: string;
  /** As far as you know it (absent when you don't know the club's needs). */
  positionalAverage?: number;
}

export interface PayoutView {
  player: { id: PlayerId; name: string; portraitSeed: number; nationalityId: CountryId };
  club: ClubBadge;
  opponent: ClubBadge;
  home: boolean;
  score: [number, number];
  position: Position;
  items: { kind: string; label: string; amount: USD }[];
  total: USD;
}

export interface PlacementView {
  id: number;
  player: { id: PlayerId; name: string; portraitSeed: number; nationalityId: CountryId; age: number } | null;
  club: ClubBadge;
  position: Position;
  signedOn: GameDate;
  expiresOn: GameDate;
  fee: USD;
  bonus: USD;
  prospect: boolean;
  earnings: { appearance: number; goals: number; assists: number; tackles: number; cleanSheets: number; captain: number };
  matchTotal: USD;
  active: boolean;
  endReason?: string;
  stats?: StatLine;
  /** How he's doing since he signed, how he feels about it, and what the club thinks of him so far. */
  story: {
    share: number;
    rating?: number;
    games: number;
    mood?: 'happy' | 'restless' | 'wants-out';
    verdict?: 'hit' | 'solid' | 'flop';
    settlingDays?: number;
    canVisit: boolean;
  };
}

export interface FinancesView {
  money: USD;
  debt?: { since: GameDate; daysLeft: number };
  seasonLabel: string;
  /** This season, by ledger kind (positive = income, negative = expense). */
  season: { kind: string; label: string; amount: number }[];
  /** Whole career, by ledger kind. */
  career: { kind: string; label: string; amount: number }[];
  history: { date: GameDate; money: number }[];
  ledger: LedgerEntry[];
  placements: PlacementView[];
  rates: { mode: 'freelance' | 'fulltime'; matchMultiplier: number };
  /** Costs of being a scout: weekly living costs, and the tax bill building up on this season's profit. */
  overheads: { livingWeekly: USD; taxRate: number; taxProfit: number; taxEstimate: USD; taxDay: GameDate };
}

export interface ClubWorkView {
  status: 'employer' | 'client' | 'none';
  trust: number;
  canPropose: boolean;
  proposeReason?: string;
  signings: number;
}

export interface OfferView {
  id: number;
  kind: 'fulltime' | 'client';
  club: ClubBadge & { cityName: string; countryName: string; leagueName: string };
  title?: string;
  salary?: USD;
  seasons?: number;
  expenseCover: number;
  /** Full-time: the season bonus terms, in words. */
  bonuses?: string;
  /** Full-time signing bonus, percent of the fee. */
  signingPct: number;
  /** Full-time: the terms you can choose, with the salary each pays (and with an extra season). */
  terms?: { focus: 'standard' | 'salary' | 'bonuses'; label: string; blurb: string; salary: USD; extendedSalary: USD }[];
  expiresOn: GameDate;
  renewal?: boolean;
  trust: number;
}

export interface CareerView {
  /** Every player you placed, newest first, with how it's going. */
  players: PlacementView[];
  record: { hits: number; solid: number; flops: number };
  name: string;
  backgroundLabel: string;
  difficulty: string;
  reputation: number;
  skills: ScoutSkills;
  /** What your background does for you, in plain words. */
  perks: { good: string[]; bad: string[] };
  markets: { countryId: CountryId; name: string; level: number }[];
  homeCity: string;
  employment:
    | {
        mode: 'freelance';
        slots: number;
        clients: (ClubBadge & {
          cityName: string;
          trust: number;
          /** How their next quarterly review is shaping up, including the best rival who brought them players. */
          review: {
            outlook: 'delighted' | 'satisfied' | 'at-risk' | 'leaving';
            score: number;
            bar: number;
            warnedOn?: GameDate;
            grace: boolean;
            reviewOn: GameDate;
            deals: number;
            briefs: number;
            failed: number;
            hits: number;
            flops: number;
            rival?: { name: string; score: number; signings: number };
            behind: boolean;
          };
        })[];
      }
    | {
        mode: 'fulltime';
        club: ClubBadge & { cityName: string };
        title: string;
        salary: USD;
        since: GameDate;
        until: GameDate;
        leavingOn?: GameDate;
        expenseCover: number;
        /** The season bonus terms, in words. */
        bonuses: string;
        /** The terms you signed, in words. */
        terms: string;
        trust: number;
        /** What the club wants from the current (or last) transfer window. */
        windowPlan?: {
          closes: GameDate;
          budget: USD;
          bonus: USD;
          buys: { position: Position; done: boolean }[];
          sells: { player: { id: PlayerId; name: string }; done: boolean }[];
          result?: 'done' | 'missed';
        };
      };
  offers: OfferView[];
  /** The scout you work under. */
  mentor?: MentorView;
  /** An established scout offering to take you on. */
  mentorOffer?: MentorOfferView;
  clubs: {
    club: ClubBadge & { cityName: string };
    trust: number;
    signings: number;
    weakPitches: number;
    status: 'employer' | 'client' | 'mentor' | 'none';
  }[];
  /** What each reputation level opens up. */
  milestones: { reputation: number; label: string; reached: boolean }[];
  stats: { signings: number; placementsActive: number; earned: number };
}

export interface MentorView {
  id: number;
  name: string;
  portraitSeed: number;
  nationalityId: CountryId;
  reputation: number;
  signings: number;
  /** His clubs, which take your calls. */
  clients: (ClubBadge & { trust: number })[];
  since: GameDate;
  /** Stay until this date and you part on good terms. */
  termEndsOn: GameDate;
  /** Leaving now makes him a rival. */
  earlyLeave: boolean;
  cutPct: number;
  /** What he has taken so far. */
  taken: USD;
  /** Standing at which clubs take a pitch by phone, while he vouches for you (normally higher). */
  phoneTrust: number;
  normalPhoneTrust: number;
  standingFloor: number;
}

export interface MentorOfferView {
  name: string;
  portraitSeed: number;
  nationalityId: CountryId;
  reputation: number;
  clients: ClubBadge[];
  cutPct: number;
  expiresOn: GameDate;
  daysLeft: number;
}

export interface MissionView {
  id: number;
  club: ClubBadge & { cityName: string; countryId: CountryId };
  position: Position;
  requirements: string[];
  raw: { minOvr: number; minAge?: number; maxAge?: number; maxFee?: USD; foot?: 'Left' | 'Right' };
  brief: string;
  status: 'offered' | 'active' | 'succeeded' | 'failed' | 'declined' | 'expired';
  postedOn: GameDate;
  acceptBy: GameDate;
  weeks: number;
  deadline?: GameDate;
  daysLeft?: number;
  /** Past the deadline, kept open while one of your candidates is still in talks. */
  overtime?: boolean;
  reward: USD;
  resolvedOn?: GameDate;
  /** Player whose signing completed it. */
  completedBy?: string;
  /** Players you have recommended to the club at this position since accepting the brief. */
  recommendations: MissionRecommendationView[];
  /** What the club told you when you discussed the brief. */
  /** Terms you can ask the club to loosen (after discussing), with your odds and any reward cut. */
  negotiation: { key: NegotiationKey; label: string; rewardCut?: number; chance: number; outcome?: 'agreed' | 'refused' }[];
  preferences?: { maxWage: USD; keyAttributes: { attribute: AttributeKey; label: string; min: number }[]; idealAge: [number, number]; discussedOn: GameDate };
  /** The assistant handling it for you. */
  delegatedTo?: { id: number; name: string };
  /** Assistants you could hand it to, or why not. */
  delegates: { id: number; name: string; skill: number; ok: boolean; reason?: string }[];
  /** The assistant's share, in percent. */
  delegateCutPct: number;
}

export interface MissionRecommendationView {
  dealId: number;
  player: { id: PlayerId; name: string; portraitSeed: number; nationalityId: CountryId; age: number };
  stage: DealStage;
  /** Against the brief, on what you know: fits / might fit / doesn't fit. */
  fit: 'yes' | 'maybe' | 'no';
  /** This deal completed the mission. */
  completed: boolean;
}

export interface MissionFitView {
  id: number;
  position: Position;
  deadline?: GameDate;
  reward: USD;
  /** Each requirement: yes / maybe (your estimate straddles it) / no. */
  checks: { label: string; status: 'yes' | 'maybe' | 'no' }[];
  /** The club's preferences, if you discussed the brief: meeting them all makes sign-off likelier. */
  preferences?: { label: string; status: 'yes' | 'maybe' | 'no' }[];
  samePosition: boolean;
}

export interface MandateView {
  id: number;
  club: ClubBadge & { cityName: string; countryId: CountryId };
  player: { id: PlayerId; name: string; age: number; position: Position; portraitSeed: number; nationalityId: CountryId; ovr: Range; value: USD };
  askingFee: USD;
  commissionPct: number;
  /** Commission at the asking fee. */
  commission: USD;
  reason: string;
  status: 'offered' | 'active' | 'succeeded' | 'failed' | 'declined' | 'expired';
  postedOn: GameDate;
  acceptBy: GameDate;
  weeks: number;
  deadline?: GameDate;
  daysLeft?: number;
  /** Past the deadline, kept open while a buyer is still in talks. */
  overtime?: boolean;
  resolvedOn?: GameDate;
  note?: string;
  soldTo?: string;
  /** Clubs you have pitched him to under this mandate, newest first. */
  deals: { dealId: number; club: ClubBadge; stage: DealStage; fee: USD }[];
  /** The assistant handling the sale for you. */
  delegatedTo?: { id: number; name: string };
  /** Assistants you could hand it to, or why not. */
  delegates: { id: number; name: string; skill: number; ok: boolean; reason?: string }[];
  /** The assistant's share of the commission, in percent. */
  delegateCutPct: number;
  /** The selling club's own report, and how far to trust it. */
  report?: { rating: number; potential: 'A' | 'B' | 'C' | 'D'; strengths: string[]; precision: 'tight' | 'fair' | 'rough'; standing: number };
}

export interface RepresentedView {
  id: PlayerId;
  name: string;
  age: number;
  position: Position;
  portraitSeed: number;
  nationalityId: CountryId;
  ovr: Range;
  potential?: Range;
  prodigy: boolean;
  /** Open deals for him. */
  deals: number;
}

export interface MarketView {
  freelance: boolean;
  /** Full-time: your employer's name (they give you selling briefs). */
  employer?: string;
  mandates: MandateView[];
  represented: RepresentedView[];
  maxRepresented: number;
  representRapport: number;
}

export interface DiscoveryView {
  id: PlayerId;
  name: string;
  age: number;
  position: Position;
  portraitSeed: number;
  nationalityId: CountryId;
  club?: ClubBadge;
  potential?: Range;
}

/** A rumoured rival chase for a player (only what has reached the news). */
export interface RivalInterestView {
  rivalId: number;
  rivalName: string;
  club: ClubBadge;
  /** Talks are well advanced: he may close as soon as a window is open. */
  advanced: boolean;
}

export interface RivalRow {
  id: number;
  name: string;
  portraitSeed: number;
  nationalityId: CountryId;
  reputation: number;
  employer?: ClubBadge;
  clients: number;
  signings: number;
  steals: number;
  /** His current chase, if a rumour revealed it. */
  chase?: { player: { id: PlayerId; name: string }; club: ClubBadge; advanced: boolean; yours: boolean };
  /** Works in your home country. */
  local: boolean;
  /** How he works, once you've seen enough of him. */
  style?: { label: string; blurb: string };
  /** He has signed players for your clients in the last year. */
  atYourClients: number;
  /** Your nemesis. */
  nemesis: boolean;
}

export interface NemesisView {
  id: number;
  name: string;
  portraitSeed: number;
  nationalityId: CountryId;
  reputation: number;
  style: { label: string; blurb: string };
  since: GameDate;
  season: { label: string; you: number; him: number; steals: number; clientsTaken: number; yourRep: number; hisRep: number };
  won: number;
  lost: number;
  history: { year: number; you: number; him: number; won: boolean }[];
  /** Rumours he (or anyone) is spreading about you at clubs right now. */
  smears: { club: ClubBadge; by: string; amount: number; cleared: boolean; until: GameDate }[];
}

export interface RivalsView {
  you: { name: string; reputation: number; rank: number };
  /** The rival who made it personal (once he has noticed you). */
  nemesis?: NemesisView;
  rivals: RivalRow[];
  /** Rumoured chases on players you are working on (deals or pool). */
  threats: number;
}

export interface AssistantTaskView {
  area: string;
  scope: 'country' | 'region' | 'city';
  positions: Position[];
  age?: [number, number];
  maxValue?: USD;
  weeks: number;
  endsOn: GameDate;
  daysLeft: number;
  found: number;
  weeklyExpenses: USD;
  /** In his home market. */
  local: boolean;
}

export interface AssistantView {
  id: number;
  name: string;
  portraitSeed: number;
  nationalityId: CountryId;
  age: number;
  skill: number;
  speciality: { id: CountryId; name: string };
  wage: USD;
  hiredOn: GameDate;
  xp: number;
  xpToLevel: number;
  reports: number;
  /** Placed at an agency base instead of field tasks. */
  office?: { id: number; label: string };
  /** Studying a club's needs for you. */
  analysis?: { club: string; until: GameDate };
  /** A rival agency wants him: match by then or he goes. */
  offer?: { agency: string; wage: USD; until: GameDate };
  /** On your employer's staff: the club's name (it pays him). */
  clubPaid?: string;
  task?: AssistantTaskView;
  /** A brief he is handling for you. */
  job?: {
    kind: 'brief' | 'sale';
    missionId?: number;
    mandateId?: number;
    /** The buying club (brief) or the selling club (sale). */
    club: ClubBadge;
    position: Position;
    /** On a sale: the player he's selling. */
    player?: string;
    pitched: number;
    maxPitches: number;
    current?: { player: string; club: string; stage: DealStage };
    weeklyExpenses: USD;
  };
}

export interface AssistantCandidateView {
  id: number;
  name: string;
  portraitSeed: number;
  nationalityId: CountryId;
  age: number;
  skill: number;
  speciality: { id: CountryId; name: string };
  wage: USD;
}

export interface StaffView {
  assistants: AssistantView[];
  market: AssistantCandidateView[];
  limit: number;
  /** Best skill your reputation can attract. */
  ceiling: number;
  /** Wages plus running task expenses. */
  weeklyCost: USD;
  maxWeeks: number;
}

export interface TaskEstimateView {
  weeklyExpenses: USD;
  /** Wage + expenses over the whole task. */
  total: USD;
  local: boolean;
  /** Players in the area who fit and aren't in your pool yet. */
  matches: number;
}

export interface GlobalSearchResults {
  players: { id: PlayerId; name: string; age: number; position: Position; club?: ClubBadge; value: USD; inPool: boolean }[];
  clubs: { club: ClubBadge; cityName: string; leagueName: string }[];
  leagues: { id: LeagueId; name: string; countryId: CountryId; countryName: string }[];
  countries: { id: CountryId; name: string; continentName: string }[];
  cities: { id: CityId; name: string; countryId: CountryId; countryName: string; clubs: number; clubId?: ClubId }[];
}

export interface OnboardingView {
  steps: {
    id: 'meet' | 'client' | 'search' | 'pitch' | 'sign';
    label: string;
    hint: string;
    done: boolean;
    screen: 'world' | 'career' | 'search' | 'deals' | 'finances';
    /** Clubs to pick from at random instead of opening the screen (nearby coaches who will see you). */
    clubIds?: ClubId[];
  }[];
  dismissed: boolean;
}

/** One club's need, as the weekly needs magazine reports it. */
export interface GazetteNeed {
  club: ClubBadge & { cityName: string; leagueName: string; countryId: CountryId };
  position: Position;
  severity: number;
  /** The positional average a signing must beat. */
  average: number;
  depth: number;
  transferBudget: USD;
  /** An open brief from this club at this position. */
  mission?: { id: number; status: 'offered' | 'active'; reward: USD };
  /** Your standing with the club (leads only). */
  coach?: number;
  /** Leads only: gossip rather than confirmed (and sometimes wrong). */
  rumour?: boolean;
  /** Leads only: rival scouts said to be working on it. */
  circling?: number;
  /** Leads only, full-time: one of your employer's players who could fill it (`sale`: you have a brief to sell him). */
  yourFit?: { id: PlayerId; name: string; sale: boolean };
}

export interface GazettePoolFit {
  player: PlayerRow;
  club: ClubBadge;
  position: Position;
  /** How far the player's estimate clears the bar. */
  margin: number;
}

export type TouchlineSection = 'front' | 'results' | 'transfers' | 'rumours' | 'interview' | 'pressure' | 'pundit' | 'corner' | 'wanted';

/** The Touchline's front page: the week's biggest story. */
export interface FrontPage {
  kind: 'yours' | 'sacking' | 'board' | 'transfer' | 'top' | 'need';
  kicker: string;
  headline: string;
  standfirst: string;
  club?: ClubBadge;
  player?: { id: PlayerId; name: string };
  /** For a needs story: the need itself, with search actions. */
  need?: GazetteNeed;
}

export interface TouchlineResult {
  home: ClubBadge;
  away: ClubBadge;
  score: [number, number];
  note?: 'upset' | 'thrashing' | 'goal-fest';
}

export interface TouchlineTableRow {
  pos: number;
  club: ClubBadge;
  played: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
  yours: boolean;
}

export interface TouchlineRumour {
  club: ClubBadge;
  player: { id: PlayerId; name: string; position: Position; clubName?: string };
  text: string;
}

export interface TouchlineInterview {
  coach: string;
  club: ClubBadge;
  quote: string;
  position: Position;
  /** The club has since posted a brief at this position. */
  briefPosted: boolean;
}

export interface TouchlinePressure {
  club: ClubBadge;
  coach: string;
  daysInJob?: number;
  recentPoints: number;
  tablePos: number;
  heat: 'warm' | 'hot' | 'boiling';
  president?: string;
  policy?: string;
}

export interface TouchlinePundit {
  title: { club: ClubBadge; pos: number };
  relegated: { club: ClubBadge; pos: number }[];
  breakout?: { id: PlayerId; name: string; club?: ClubBadge; apps: number; goals: number; rating?: number };
  /** The season is over: the picks are graded. */
  final: boolean;
  /** How many relegation spots the league has. */
  drop: number;
}

export interface TouchlineSigning {
  player: { id: PlayerId; name: string; position: Position };
  club: ClubBadge;
  apps: number;
  goals: number;
  assists: number;
  rating?: number;
  /** Starred in the past week (goal or man of the match). */
  starred: boolean;
}

export interface GazetteView {
  issue: number;
  date: GameDate;
  seasonLabel: string;
  countryName: string;
  countryId: CountryId;
  /** Needs at your employer or clients, most pressing first. */
  yourClubs: GazetteNeed[];
  /** You have no clubs yet (freelance with no clients). */
  noClubs: boolean;
  /** Other clubs in your home country with an urgent need and money to spend. */
  leads: GazetteNeed[];
  /** Positions in demand across your clubs and your home country. */
  demand: { position: Position; clubs: number; urgent: number; lowestBar: number; topBudget: USD }[];
  /** Players already in your pool who would solve one of your clubs' needs (the leads' needs while you have no clubs). */
  poolFits: GazettePoolFit[];
  /** Rival chases the rumour mill has revealed. */
  rumours: { rival: string; player: { id: PlayerId; name: string }; club: ClubBadge; advanced: boolean; yours: boolean }[];
  /** The paper's own pages. */
  leagueName?: string;
  front: FrontPage;
  results: TouchlineResult[];
  table: TouchlineTableRow[];
  transfers: { id: number; title: string; body: string; date: GameDate }[];
  links: TouchlineRumour[];
  interview?: TouchlineInterview;
  pressure: TouchlinePressure[];
  pundit?: TouchlinePundit;
  corner: TouchlineSigning[];
  bylines: Record<TouchlineSection, string>;
}

/** Where a Home item leads: a UI route by screen name (and id for club/player pages). */
export interface HomeLink {
  screen: 'calendar' | 'academy' | 'deals' | 'missions' | 'hunts' | 'events' | 'staff' | 'career' | 'rivals' | 'inbox' | 'finances' | 'gazette' | 'goals' | 'club' | 'player' | 'deadline';
  id?: string;
}

export interface HomeItem {
  key: string;
  kind: 'deal' | 'mission' | 'hunt' | 'assistant' | 'offer' | 'mandate' | 'inbox' | 'rival' | 'debt' | 'clients' | 'report' | 'coach' | 'event' | 'dilemma' | 'settling' | 'placed';
  /** urgent: act now or lose something; action: waiting on you; info: worth knowing. */
  tone: 'urgent' | 'action' | 'info';
  title: string;
  detail: string;
  daysLeft?: number;
  /** 0–1, how far along (for running work). */
  progress?: number;
  club?: ClubBadge;
  link: HomeLink;
}

export interface HomeView {
  needsYou: HomeItem[];
  inProgress: HomeItem[];
  upcoming: { key: string; date: GameDate; daysAway: number; label: string; link?: HomeLink }[];
  season: {
    label: string;
    placements: number;
    earned: USD;
    spent: USD;
    reputation: number;
    rank: number;
    scouts: number;
    goals: { done: number; total: number };
    poolSize: number;
    /** Freelance: clients used of slots. Full-time: the employer. */
    work: { mode: 'freelance'; clients: number; slots: number } | { mode: 'fulltime'; club: ClubBadge };
  };
}

export interface ScoutingEventView {
  id: number;
  kind: 'youth-tournament' | 'u20-championship' | 'trial-day' | 'showcase' | 'international';
  label: string;
  name: string;
  city: { id: CityId; name: string };
  countryName: string;
  start: GameDate;
  end: GameDate;
  days: number;
  ticket: USD;
  size: number;
  status: 'upcoming' | 'on' | 'over';
  daysAway: number;
  canAttend: { ok: boolean; reason?: string };
  /** You're in the host city. */
  here: boolean;
  /** Days attending takes from today (the rest of the event). */
  attendDays: number;
  /** After you attend: who you saw, and whether they're in your pool. */
  seen?: (PlayerRow & { inPool: boolean })[];
}

export interface DilemmaView {
  id: number;
  kind: 'agent-cut' | 'inflate-report' | 'talk-down' | 'family-fee';
  title: string;
  body: string;
  choices: { key: string; label: string; hint: string }[];
  /** Days left to answer (open ones). */
  daysLeft?: number;
  club?: ClubBadge;
  player?: { id: PlayerId; name: string };
  /** Settled: what you chose and what came of it (or that it lapsed). */
  choice?: string;
  outcome?: string;
  lapsed?: boolean;
}

export interface TraitView {
  id: import('./model/player').TraitId;
  label: string;
  tone: 'good' | 'bad' | 'mixed';
  effect: string;
}

/** What a calendar entry is about: the world's dates, or your own. */
export type CalendarKind = 'window' | 'deadline-day' | 'season' | 'event' | 'brief' | 'answer' | 'work';

export interface CalendarEntry {
  key: string;
  kind: CalendarKind;
  start: GameDate;
  /** Last day, for things that run over several days. */
  end?: GameDate;
  label: string;
  detail?: string;
  link?: HomeLink;
}

export interface CalendarView {
  today: GameDate;
  entries: CalendarEntry[];
}

export interface StyleView {
  id: import('./systems/styles').ClubStyle;
  label: string;
  blurb: string;
  /** The attributes this style asks for, as labels. */
  attrs: string[];
}

export interface TournamentPlayerView {
  id: PlayerId;
  name: string;
  country: string;
  club?: string;
  apps: number;
  goals: number;
  avg?: number;
  /** In your pool, or one of the players you placed. */
  yours: 'placed' | 'pool' | null;
}

export interface TournamentView {
  name: string;
  host: string;
  city: string;
  start: GameDate;
  end: GameDate;
  squadsOn: GameDate;
  status: 'upcoming' | 'squads' | 'on' | 'done';
  winner?: string;
  groups: { name: string; rows: { country: string; played: number; pts: number; gd: number; gf: number; through: boolean }[] }[];
  knockout: { round: string; matches: { home: string; away: string; score?: string; winner?: string; penalties?: boolean }[] }[];
  /** Your players and pool players in the squads. */
  yours: TournamentPlayerView[];
  standouts: TournamentPlayerView[];
}

export interface AcademyKidView extends PlayerRow {
  /** Old enough to place at a club. */
  placeable: boolean;
  traits: TraitView[];
}

export interface AcademyView {
  unlocked: boolean;
  unlockReputation: number;
  hasAgency: boolean;
  sponsorships: { club: ClubBadge; since: GameDate; fee: USD }[];
  maxSponsorships: number;
  /** Clubs you could sponsor (those you work with or know well), with the price and whether they'd say yes. */
  candidates: { club: ClubBadge; fee: USD; trust: number; ok: boolean; reason?: string }[];
  nextIntake: GameDate;
  own?: {
    name: string;
    country: string;
    city: string;
    level: 1 | 2 | 3;
    capacity: number;
    upkeepWeekly: USD;
    upgrade?: { level: 2 | 3; cost: USD };
    earned: USD;
    placeAge: number;
    sellOnPct: number;
    kids: AcademyKidView[];
    graduates: { id: PlayerId; name: string; club?: ClubBadge; sellOnPaid: boolean }[];
  };
  /** Where you could build one (countries where your agency has a base). */
  sites: { id: CountryId; name: string; cost: USD; ok: boolean; reason?: string }[];
}
