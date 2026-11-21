import { ATTRIBUTE_LABEL } from './model/player';
import { CAREER_START, ageOn, formatDate, isTransferWindow, makeDate, toParts, type GameDate } from './core/calendar';
import type { CityId, ClubId, CountryId, LeagueId, PlayerId } from './core/ids';
import { formatUSD, usd, type USD } from './core/money';
import { generateWorld, type ProgressFn } from './generation/world-generator';
import type { Club, ClubOfficial } from './model/club';
import type { Player } from './model/player';
import { POSITIONS } from './model/player';
import { isInboxItem, type Fixture, type NewsItem, type PlayerMatchLine, type SeasonStats } from './model/season';
import type { CareerSetup, SearchFilters, SearchRecord } from './model/scout';
import type { GameState } from './model/world-state';
import { seasonWindow } from './systems/fixtures';
import { VIDEO_KNOWLEDGE_CAP, attributeRanges, estimate, fog, knowledgeLevel } from './systems/knowledge';
import { MAX_FOCUS, validateFocus, writeAttendedMatch } from './systems/matchday';
import {
  completeLiveScouting,
  meet,
  meetingInfo,
  metToday,
  nextLiveOption,
  relationshipLabel,
  startLiveScouting,
  type LiveResult,
  type MeetTarget,
  type MeetingResult,
} from './systems/fieldwork';
import { nightlyCost, quoteTravel, startTravel } from './systems/travel';
import { acceptMission, declineMission, describeRequirements, discussMission, negotiateMission, negotiationOptions } from './systems/missions';
import type { NegotiationKey } from './model/mission';
import { knownInterest } from './systems/rivals';
import {
  MAX_TASK_WEEKS,
  refreshMarket,
  assignTask,
  describeArea,
  fireAssistant,
  hireAssistant,
  recallAssistant,
  skillCeiling,
  taskExpenses,
} from './systems/assistants';
import type { AssistantBrief } from './model/assistant';
import { inLocation } from './systems/scouting';
import { MAX_REPRESENTED, REPRESENT_RAPPORT, acceptMandate, declineMandate, pitchRights, represent, representCheck, stopRepresenting } from './systems/market';
import { BANKRUPTCY_DAYS } from './systems/payouts';
import {
  AGREEMENT_GATE,
  EXPENSE_COVER,
  acceptOffer,
  agreementCheck,
  clubRecord,
  clubTrust,
  declineOffer,
  dropClient,
  proposeAgreement,
  resign,
} from './systems/employment';
import { REMOTE_PITCH_TRUST, clubPositionalAverage, formationPositions, pitch, pitchFee, remotePitchCheck, signOffProbability, type PitchArgs, playerChance, wageCeiling } from './systems/deals';
import { canAfford, wageRoom, freeAgentWage, offeredWage, transferFee, brokeredWage } from './systems/transfers';
import type { Deal, Official, Placement } from './model/deal';
import type { Mission } from './model/mission';
import type { Position } from './model/player';
import { BACKGROUNDS, completeSearch, createCareer, estimateSearch, startSearch, videoCost, videoGain, watchVideo, ScoutingError } from './systems/scouting';
import { leagueTable } from './systems/season';
import { bestXI, squadNeeds } from './systems/squad-needs';
import { promotionSpots } from './systems/standings';
import { advanceDays, advanceToNextMatchday, advanceUntilEvent, nextMatchDate, type AdvanceResult } from './tick';
import {
  accuracyTrust,
  openReport,
  RECORD_MIN_REVIEWED,
  REPORT_MIN_KNOWLEDGE,
  REVIEW_DAYS,
  trackRecord,
  writeReport,
  fileReportOnPitch,
  reportFromEstimate,
  type ReportArgs,
} from './systems/reports';
import { careerSummary, retire, type CareerSummary } from './systems/career-end';
import { SCENARIOS, scenarioProgress } from './systems/scenarios';
import {
  AGENCY_REP,
  FOUNDING_COST,
  MAX_OFFICES,
  agencyCheck,
  clientCapacity,
  closeOffice,
  foundAgency,
  hqUpkeep,
  officeCountry,
  officeRent,
  officeSetupCost,
  openOffice,
  placeAssistant,
  staffCapacity,
} from './systems/agency';
import { HQ, type AgencyLogo } from './model/agency';
import { SPECIALTY_RULES, matchingSpecialties, objectiveProgress, specialtyProgress } from './systems/goals';
import type { Objective } from './model/goals';
import { VERDICT_LABEL, type ScoutReport, type Verdict } from './model/report';
import { huntAction, huntOptions, huntPlace, type HuntMethod } from './systems/hunts';
import { dilemmaText, resolveDilemma } from './systems/dilemmas';
import { isUnlocked, nextUnlock } from './systems/unlocks';
import { attendCheck, attendEvent, ensureSeasonEvents, eventEnd, eventLabel, eventStatus } from './systems/events';
import { closeDeadline, DEADLINE_ACTION_HOURS, DEADLINE_FEE_PREMIUM, passDeadlineHours } from './systems/deadline';
import type {
  AdvanceSummary,
  ClubBadge,
  ClubRow,
  ClubView,
  Clock,
  CountrySummary,
  CountryView,
  FeaturedLeague,
  FixtureView,
  LeagueView,
  OfficialView,
  PlayerRow,
  PlayerView,
  CareerView,
  ClubSuggestion,
  ClubWorkView,
  DealEventView,
  DealView,
  FinancesView,
  LiveView,
  MissionFitView,
  MissionView,
  MissionRecommendationView,
  MandateView,
  OnboardingView,
  PlacementView,
  StaffView,
  GlobalSearchResults,
  TaskEstimateView,
  RivalInterestView,
  RivalsView,
  GazetteNeed,
  GazetteView,
  HomeItem,
  HomeView,
  ScoutingEventView,
  DilemmaView,
  MarketView,
  DiscoveryView,
  PayoutView,
  OfficialPitchView,
  PitchPreview,
  LegacyView,
  PlacementForm,
  PlacementPinView,
  TrophyView,
  WallClubView,
  AgencyView,
  GoalsView,
  ObjectiveView,
  LocationTree,
  MeetingView,
  TravelQuoteView,
  ScoutView,
  SearchEstimateView,
  SearchSummary,
  SearchView,
  StatLine,
  TableRowView,
  WorldSummary,
  AttendedMatchView,
  DeadlineView,
  HuntView,
  MatchDayPlayer,
  MatchDayView,
  ReportDraft,
  ReportView,
  TrackRecordView,
  SeasonReviewView,
} from './views';

const PRIORITY_LABELS: Record<string, string> = {
  tacticalFit: 'Tactical fit',
  currentAbility: 'Current ability',
  potential: 'Potential',
  value: 'Value for money',
  resale: 'Resale value',
  marketing: 'Marketing appeal',
  personality: 'Personality',
};

const LEDGER_LABELS: Record<string, string> = {
  'starting-funds': 'Starting savings',
  search: 'Searches',
  video: 'Video analysis',
  travel: 'Travel',
  accommodation: 'Hotels',
  ticket: 'Match tickets',
  meeting: 'Meetings & pitches',
  'signing-bonus': 'Signing bonuses',
  'match-bonus': 'Match bonuses',
  salary: 'Salary',
  'mission-reward': 'Mission rewards',
  'sale-commission': 'Sale commissions',
  assistant: 'Assistant wages',
  'assistant-task': 'Assistant tasks',
  award: 'Goals & awards',
  agency: 'Agency upkeep & rent',
  'agency-setup': 'Agency setup',
  'agency-cut': 'Agency deals',
};

const isInbox = isInboxItem;

/** Lower-case and strip accents, so "markovic" finds "Marković". */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const seasonLabel = (year: number) => `${year}/${String(year + 1).slice(2)}`;

/** Engine facade: owns the GameState, runs commands, and answers UI queries with small view models. */
export class Engine {
  protected state?: GameState;

  generate(seed: number, onProgress?: ProgressFn): WorldSummary {
    this.state = generateWorld(seed, onProgress);
    return this.getWorldSummary();
  }

  protected get s(): GameState {
    if (!this.state) throw new Error('No world loaded');
    return this.state;
  }

  // ── Commands ──

  advance(days: number): AdvanceSummary {
    this.assertActive();
    this.assertNoDeadline();
    return this.summarize(advanceDays(this.s, Math.max(1, Math.min(days, 366)), undefined, { stopAtDeadline: true }));
  }

  advanceToNextMatchday(): AdvanceSummary {
    this.assertActive();
    this.assertNoDeadline();
    return this.summarize(advanceToNextMatchday(this.s, undefined, { stopAtDeadline: true }));
  }

  /** Plays on day by day until something needs you (see `advanceUntilEvent`). */
  advanceUntilEvent(): AdvanceSummary {
    this.assertActive();
    this.assertNoDeadline();
    return this.summarize(advanceUntilEvent(this.s));
  }

  // ── Deadline day ──

  getDeadline(): DeadlineView | null {
    const dl = this.s.deadline;
    if (!dl) return null;
    return {
      date: dl.date,
      hour: dl.hour,
      feed: [...dl.feed].reverse(),
      open: this.s.deals.filter((d) => d.stage === 'negotiating').map((d) => this.dealView(d)),
      feePremium: DEADLINE_FEE_PREMIUM,
    };
  }

  /** Lets deadline-day hours pass (time stands still on the calendar until midnight). */
  passDeadlineHours(hours: number): AdvanceSummary {
    this.assertActive();
    if (!this.s.deadline) throw new ScoutingError('It is not deadline day.');
    return this.summarize(this.hoursPassed(() => passDeadlineHours(this.s, Math.max(1, Math.min(hours, 15)))));
  }

  /** Plays out the rest of deadline day to midnight, then the calendar day itself. */
  finishDeadline(): AdvanceSummary {
    this.assertActive();
    const s = this.s;
    if (!s.deadline) throw new ScoutingError('It is not deadline day.');
    const newsBefore = s.counters.news;
    closeDeadline(s);
    const day = advanceDays(s, 1);
    return this.summarize({ ...day, news: s.news.filter((n) => n.id >= newsBefore) });
  }

  /**
   * A meeting's day has been spent; until time moves on for another reason, you're still with them, so the
   * next pitch or chat with the same person is part of the same meeting (no extra day or fee).
   */
  private stillInMeeting(id: string) {
    const sc = this.s.scout;
    if (sc && !this.s.careerOver) sc.lastMet[id] = this.s.date;
  }

  /** An action that takes no time: the world doesn't move. */
  private noTime(): AdvanceResult {
    return this.hoursPassed(() => {});
  }

  /** An action on deadline day takes hours, not days. */
  private hoursPassed(fn: () => void): AdvanceResult {
    const s = this.s;
    const newsBefore = s.counters.news;
    fn();
    return { from: s.date, to: s.date, matchesPlayed: 0, news: s.news.filter((n) => n.id >= newsBefore), seasonRolledOver: false };
  }

  /** Only pitches, meetings, trips and the hour controls work on deadline day. */
  private assertNoDeadline() {
    if (this.s.deadline) throw new ScoutingError('It is deadline day: finish it before moving on (or let the hours run).');
  }

  /** Moves time for an action: a number of days, or one hour on deadline day. */
  private spend(days: number): AdvanceResult {
    if (this.s.deadline) return this.hoursPassed(() => passDeadlineHours(this.s, DEADLINE_ACTION_HOURS * Math.max(1, days)));
    return advanceDays(this.s, days);
  }

  // ── Scouting reports ──

  getReportDraft(playerId: PlayerId): ReportDraft | null {
    const s = this.s;
    const p = s.players[playerId];
    if (!p) return null;
    const f = fog(s, p);
    const roles = [p.naturalPosition, ...POSITIONS.filter((x) => x !== p.naturalPosition && (p.positions[x] ?? 0) >= 0.75)];
    const existing = openReport(s, p.id);
    const read = reportFromEstimate(s, p.id)!;
    return {
      allowed: f.level >= REPORT_MIN_KNOWLEDGE,
      reason: f.level >= REPORT_MIN_KNOWLEDGE ? undefined : `Get your knowledge of him to ${REPORT_MIN_KNOWLEDGE} first (watch him, or meet him).`,
      knowledge: f.level,
      minKnowledge: REPORT_MIN_KNOWLEDGE,
      roles,
      suggestion: existing ? { role: existing.role, rating: existing.rating, potential: existing.potential, verdict: existing.verdict } : read,
      existing: existing && this.reportView(existing),
      verdicts: (Object.keys(VERDICT_LABEL) as Verdict[]).map((key) => ({ key, label: VERDICT_LABEL[key] })),
    };
  }

  writeReport(args: ReportArgs): ReportView {
    this.assertActive();
    return this.reportView(writeReport(this.s, args));
  }

  getTrackRecord(): TrackRecordView {
    const s = this.s;
    return {
      ...trackRecord(s),
      minReviewed: RECORD_MIN_REVIEWED,
      trust: accuracyTrust(s),
      reports: s.reports.filter((r) => !r.voided).map((r) => this.reportView(r)),
    };
  }

  private reportView(r: ScoutReport): ReportView {
    const p = this.s.players[r.playerId];
    return {
      id: r.id,
      playerId: r.playerId,
      playerName: p ? `${p.firstName} ${p.lastName}` : 'Retired player',
      date: r.date,
      role: r.role,
      rating: r.rating,
      potential: r.potential,
      verdict: r.verdict,
      verdictLabel: VERDICT_LABEL[r.verdict],
      knowledge: r.knowledge,
      reviewOn: r.reviewOn,
      outcome: r.outcome && { truthThen: r.truthThen, ...r.outcome },
    };
  }

  // ── Wonderkid hunts ──

  getHunts(): HuntView[] {
    const s = this.s;
    return s.hunts.map((h) => {
      const place = huntPlace(s, h);
      const country = place ? s.countries[place.countryId]! : undefined;
      const opts = h.status === 'active' && place ? huntOptions(s, h) : undefined;
      const known = h.status !== 'active' || h.stage === 3;
      const dest = opts?.visit.destination;
      return {
        id: h.id,
        status: h.status,
        stage: h.stage,
        position: h.position,
        age: h.age,
        startedOn: h.startedOn,
        expiresOn: h.expiresOn,
        daysLeft: Math.max(0, h.expiresOn - s.date),
        clues: [...h.clues].reverse(),
        area: {
          country: { id: place?.countryId ?? s.scout!.homeCountry, name: country?.name ?? 'Unknown' },
          region: place && (h.stage >= 1 || known) ? s.regions[place.regionId]!.name : undefined,
          city: place && (h.stage >= 2 || known) ? { id: place.cityId, name: s.cities[place.cityId]!.name } : undefined,
        },
        rivals: h.rivals.flatMap((hr) => {
          const r = s.rivals.find((x) => x.id === hr.rivalId);
          if (!r) return [];
          const band = hr.progress >= 1 ? 'found him' : hr.progress >= 0.7 ? 'closing in' : hr.progress >= 0.35 ? 'on the trail' : 'behind';
          return [{ id: r.id, name: `${r.firstName} ${r.lastName}`, portraitSeed: r.portraitSeed, nationalityId: r.nationality, band } as const];
        }),
        options: opts && {
          calls: opts.calls,
          visit: { ...opts.visit, destination: dest ? { id: dest, name: s.cities[dest]!.name } : undefined },
        },
        player: known && place ? { id: place.player.id, name: `${place.player.firstName} ${place.player.lastName}`, club: badge(place.club) } : undefined,
        winner: (() => {
          const r = s.rivals.find((x) => x.id === h.winnerId);
          return r ? `${r.firstName} ${r.lastName}` : undefined;
        })(),
      };
    });
  }

  /** Work a hunt's trail: phone contacts (anywhere) or ask around in person (in the area). */
  huntAction(huntId: number, method: HuntMethod): { result: { success: boolean; text: string }; advance: AdvanceSummary } {
    this.assertActive();
    this.assertNoDeadline();
    const r = huntAction(this.s, huntId, method);
    return { result: { success: r.success, text: r.text }, advance: this.summarize(advanceDays(this.s, r.days)) };
  }

  // ── Your agency ──

  getAgency(): AgencyView {
    const s = this.s;
    const sc = s.scout!;
    const check = agencyCheck(s);
    const ag = s.agency;
    const year = s.season.year;
    const staffView = (a: (typeof s.assistants)[number]) => ({
      id: a.id,
      name: `${a.firstName} ${a.lastName}`,
      skill: a.skill,
      wage: a.wage,
      portraitSeed: a.portraitSeed,
      nationalityId: a.nationality,
      officeId: a.officeId,
      onTask: !!a.task,
    });
    const countryName = (id: string) => s.countries[id as keyof typeof s.countries]!.name;
    const base = (officeId: number, countryId: (typeof sc)['homeCountry'], cityId: (typeof sc)['homeCity'], rent: number, openedOn: GameDate) => {
      const deals = (ag?.deals ?? []).filter((d) => d.date >= makeDate(year, 7, 1) && s.clubs[d.clubId]?.countryId === countryId);
      return {
        officeId,
        hq: officeId === HQ,
        country: { id: countryId, name: countryName(countryId) },
        cityName: s.cities[cityId]!.name,
        rent: usd(rent),
        openedOn,
        staff: s.assistants.filter((a) => a.officeId === officeId).map(staffView),
        dealsThisSeason: deals.length,
        earnedThisSeason: usd(deals.reduce((n, d) => n + d.cut, 0)),
      };
    };
    const used = sc.employment.mode === 'freelance' ? sc.employment.clients.length : 0;
    const homes = new Set([sc.homeCountry, ...(ag?.offices.map((o) => o.countryId) ?? [])]);
    const clubsBy = new Map<string, number>();
    for (const c of Object.values(s.clubs)) clubsBy.set(c.countryId, (clubsBy.get(c.countryId) ?? 0) + 1);
    const totals = s.ledgerTotals[year] ?? {};
    return {
      check: { ok: check.ok, reason: check.reason },
      requirements: { reputation: AGENCY_REP, cost: usd(FOUNDING_COST), yourReputation: sc.reputation, money: sc.money },
      maxOffices: MAX_OFFICES,
      clients: { used, capacity: clientCapacity(s) },
      staff: { used: s.assistants.length, capacity: staffCapacity(s) },
      agency: ag && {
        name: ag.name,
        shortName: ag.shortName,
        logo: ag.logo,
        foundedOn: ag.foundedOn,
        brokered: ag.brokered,
        earned: ag.earned,
        weeklyUpkeep: hqUpkeep(s),
        monthlyRent: usd(ag.offices.reduce((n, o) => n + o.rent, 0)),
        season: { label: seasonLabel(year), cuts: usd(totals['agency-cut'] ?? 0), costs: usd(totals.agency ?? 0) },
        bases: [base(HQ, sc.homeCountry, sc.homeCity, 0, ag.foundedOn), ...ag.offices.map((o) => base(o.id, o.countryId, o.cityId, o.rent, o.openedOn))],
        unplaced: s.assistants.filter((a) => a.officeId === undefined).map(staffView),
        deals: ag.deals.slice(0, 20).map((d) => {
          const p = s.players[d.playerId];
          const a = s.assistants.find((x) => x.id === d.assistantId);
          return {
            date: d.date,
            playerId: d.playerId,
            playerName: p ? `${p.firstName} ${p.lastName}` : 'Retired player',
            club: badge(s.clubs[d.clubId]!),
            by: a ? `${a.firstName} ${a.lastName}` : 'A former assistant',
            fee: d.fee,
            cut: d.cut,
          };
        }),
      },
      openable: [...clubsBy.entries()]
        .filter(([id]) => !homes.has(id as (typeof sc)['homeCountry']))
        .map(([id, clubs]) => {
          const cid = id as (typeof sc)['homeCountry'];
          const c = s.countries[cid]!;
          return { id: cid, name: c.name, continent: s.continents[c.continentId]!.name, clubs, setup: officeSetupCost(s, cid), rent: officeRent(s, cid), market: sc.regionKnowledge[cid] ?? 0 };
        })
        .sort((a, b) => b.clubs - a.clubs),
    };
  }

  foundAgency(args: { name: string; shortName?: string; logo: AgencyLogo }): void {
    this.assertActive();
    foundAgency(this.s, args);
  }

  openOffice(countryId: CountryId): void {
    this.assertActive();
    openOffice(this.s, countryId);
  }

  closeOffice(officeId: number): void {
    this.assertActive();
    closeOffice(this.s, officeId);
  }

  placeAssistant(assistantId: number, officeId: number | null): void {
    this.assertActive();
    placeAssistant(this.s, assistantId, officeId);
  }

  // ── Career end ──

  /** Your career so far (or as it ended): numbers, best find, stars, trophies and the final score. */
  getCareerSummary(): CareerSummary {
    return careerSummary(this.s);
  }

  /** Retire: the career ends today. */
  retire(): CareerSummary {
    retire(this.s);
    return careerSummary(this.s);
  }

  // ── Goals, awards & specialties ──

  getGoals(): GoalsView {
    const s = this.s;
    const year = s.season.year;
    const view = (o: Objective): ObjectiveView => ({
      id: o.id,
      title: o.title,
      kind: o.kind,
      target: o.target,
      progress: objectiveProgress(s, o),
      unit: o.kind === 'profit' ? 'money' : o.kind === 'reputation' ? 'reputation' : 'count',
      start: o.start,
      status: o.status,
      doneOn: o.doneOn,
      reward: o.reward,
      atSeasonEnd: o.kind === 'profit',
    });
    const pastSeasons = [...new Set(s.objectives.filter((o) => o.season < year).map((o) => o.season))].sort((a, b) => b - a);
    const review = s.seasonReviews[s.seasonReviews.length - 1];
    const EFFECT: Record<string, string> = {
      continent: 'More invitations and job offers from clubs there, and coaches sign off its players more readily.',
      position: 'Clubs ask for you by name with missions at these positions, and coaches sign off more readily.',
      youth: 'Clubs that develop young players seek you out, and coaches sign off your young players more readily.',
      free: 'Coaches sign off your free agents more readily.',
    };
    return {
      season: year,
      seasonLabel: seasonLabel(year),
      objectives: s.objectives.filter((o) => o.season === year).map(view),
      past: pastSeasons.map((season) => ({
        season,
        label: seasonLabel(season),
        items: s.objectives.filter((o) => o.season === season).map((o) => ({ title: o.title, status: o.status })),
      })),
      trophies: [...s.trophies].reverse().map((t) => {
        const p = t.playerId ? s.players[t.playerId] : undefined;
        const club = t.clubId ? s.clubs[t.clubId] : undefined;
        return { ...t, club: club ? badge(club) : undefined, playerName: p ? `${p.firstName} ${p.lastName}` : undefined };
      }),
      specialties: specialtyProgress(s).map(({ continentId: _c, group: _g, ...sp }) => ({ ...sp, effect: EFFECT[sp.kind]! })),
      placements: s.placements.length,
      rules: SPECIALTY_RULES,
      lastAwards: review?.awards?.length ? { label: seasonLabel(review.season), awards: review.awards } : undefined,
    };
  }

  /** Trophies won since the last call (each returned once, for the reveal). */
  takeTrophies(): TrophyView[] {
    const s = this.s;
    const ids = new Set(s.pendingTrophies ?? []);
    s.pendingTrophies = [];
    return s.trophies
      .filter((t) => ids.has(t.id))
      .map((t) => {
        const p = t.playerId ? s.players[t.playerId] : undefined;
        const club = t.clubId ? s.clubs[t.clubId] : undefined;
        return { ...t, club: club ? badge(club) : undefined, playerName: p ? `${p.firstName} ${p.lastName}` : undefined };
      });
  }

  /** Your work on the map and every club you've worked with. */
  getLegacy(): LegacyView {
    const s = this.s;
    const sc = s.scout!;
    const RANK: Record<PlacementForm, number> = { star: 5, good: 4, ok: 3, poor: 2, bench: 1, gone: 0 };
    const pins = new Map<string, PlacementPinView>();
    for (const pl of s.placements) {
      const club = s.clubs[pl.clubId];
      if (!club) continue;
      const p = s.players[pl.playerId];
      const here = !!p && !pl.endedOn && p.clubId === pl.clubId;
      const apps = here ? p.stats.apps : 0;
      const avg = here && apps ? p.stats.ratingSum / apps : undefined;
      const form: PlacementForm = !here
        ? 'gone'
        : apps < 3
          ? 'bench'
          : avg! >= 7.3
            ? 'star'
            : avg! >= 6.8
              ? 'good'
              : avg! >= 6.3
                ? 'ok'
                : 'poor';
      const city = s.cities[club.cityId]!;
      const pin =
        pins.get(city.id) ??
        ({ cityId: city.id, cityName: city.name, countryName: s.countries[city.countryId]!.name, lat: city.lat, lon: city.lon, form: 'gone', players: [] } as PlacementPinView);
      pin.players.push({
        playerId: pl.playerId,
        name: p ? `${p.firstName} ${p.lastName}` : 'Retired player',
        club: badge(club),
        signedOn: pl.signedOn,
        form,
        apps,
        avg: avg === undefined ? undefined : Math.round(avg * 100) / 100,
      });
      if (RANK[form] > RANK[pin.form]) pin.form = form;
      pins.set(city.id, pin);
    }
    const wall = new Map<string, WallClubView>();
    const touch = (clubId: string, role: WallClubView['roles'][number]) => {
      const club = s.clubs[clubId as keyof typeof s.clubs];
      if (!club) return;
      const w = wall.get(club.id) ?? {
        club: badge(club),
        cityName: s.cities[club.cityId]!.name,
        countryName: s.countries[club.countryId]!.name,
        placements: 0,
        roles: [],
      };
      if (!w.roles.includes(role)) w.roles.push(role);
      if (role === 'placed') w.placements++;
      wall.set(club.id, w);
    };
    if (sc.employment.mode === 'fulltime') touch(sc.employment.clubId, 'employer');
    else for (const id of sc.employment.clients) touch(id, 'client');
    for (const [id, r] of Object.entries(sc.clubRecord)) if ((r.missionsDone ?? 0) > 0) touch(id, 'missions');
    for (const pl of s.placements) touch(pl.clubId, 'placed');
    const ORDER = ['employer', 'client', 'placed', 'missions'];
    const walled = [...wall.values()].map((w) => ({ ...w, roles: [...w.roles].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)) }));
    walled.sort((a, b) => b.placements - a.placements || a.club.tier - b.club.tier || a.club.name.localeCompare(b.club.name));
    const pinList = [...pins.values()].sort((a, b) => Math.min(...a.players.map((x) => x.signedOn)) - Math.min(...b.players.map((x) => x.signedOn)));
    return {
      pins: pinList,
      wall: walled,
      countries: new Set(pinList.map((p) => p.countryName)).size,
      placements: s.placements.length,
    };
  }

  // ── Season reviews ──

  getSeasonReviews(): SeasonReviewView[] {
    const s = this.s;
    return [...s.seasonReviews].reverse().map((r) => ({
      ...r,
      label: seasonLabel(r.season),
      rows: Object.entries(r.byKind)
        .map(([kind, amount]) => ({ kind, label: LEDGER_LABELS[kind] ?? kind, amount: amount ?? 0 }))
        .sort((a, b) => b.amount - a.amount),
      players: r.players.map((p) => ({
        ...p,
        club: badge(s.clubs[p.clubId]!),
        portraitSeed: s.players[p.playerId]?.portraitSeed ?? 0,
        nationalityId: s.players[p.playerId]?.nationality ?? s.scout!.homeCountry,
      })),
    }));
  }

  /** Marks the latest review as read. */
  dismissSeasonReview(): void {
    this.s.pendingReview = undefined;
  }

  private summarize(r: AdvanceResult): AdvanceSummary {
    const s = this.s;
    const dealEvents: DealEventView[] = s.pendingDealEvents.map((e) => {
      const p = s.players[e.playerId];
      const deal = s.deals.find((d) => d.id === e.dealId);
      return {
        dealId: e.dealId,
        kind: e.kind,
        text: e.text,
        player: p
          ? {
              id: p.id,
              name: `${p.firstName} ${p.lastName}`,
              portraitSeed: p.portraitSeed,
              nationalityId: p.nationality,
              age: ageOn(p.birthDate, s.date),
              position: p.naturalPosition,
            }
          : { id: e.playerId, name: 'Retired player', portraitSeed: 0, nationalityId: s.scout!.homeCountry, age: 0, position: 'CM' },
        club: badge(s.clubs[e.clubId]!),
        fee: deal?.fee ?? usd(0),
      };
    });
    s.pendingDealEvents = [];
    const payouts: PayoutView[] = s.pendingPayouts.map((e) => {
      const p = s.players[e.playerId];
      return {
        player: {
          id: e.playerId,
          name: p ? `${p.firstName} ${p.lastName}` : 'Player',
          portraitSeed: p?.portraitSeed ?? 0,
          nationalityId: p?.nationality ?? s.scout!.homeCountry,
        },
        club: badge(s.clubs[e.clubId]!),
        opponent: badge(s.clubs[e.opponentId]!),
        home: e.home,
        score: e.score,
        position: e.position,
        items: e.items,
        total: e.total,
      };
    });
    s.pendingPayouts = [];
    return { ...r, clock: this.getClock(), dealEvents, payouts, careerOver: s.careerOver };
  }

  /** After bankruptcy nothing more can happen in this world. */
  private assertActive() {
    if (this.s.careerOver) throw new Error(`Your career is over: ${this.s.careerOver.reason}`);
  }

  getFinances(): FinancesView {
    const s = this.s;
    const sc = s.scout!;
    const rows = (totals: Partial<Record<string, number>>) =>
      Object.entries(totals)
        .filter(([, v]) => v)
        .map(([kind, amount]) => ({ kind, label: LEDGER_LABELS[kind] ?? kind, amount: amount ?? 0 }))
        .sort((a, b) => b.amount - a.amount);
    const career: Record<string, number> = {};
    for (const season of Object.values(s.ledgerTotals)) for (const [k, v] of Object.entries(season)) career[k] = (career[k] ?? 0) + (v ?? 0);
    return {
      money: sc.money,
      debt: sc.brokeSince !== undefined ? { since: sc.brokeSince, daysLeft: Math.max(0, BANKRUPTCY_DAYS - (s.date - sc.brokeSince)) } : undefined,
      seasonLabel: seasonLabel(s.season.year),
      season: rows(s.ledgerTotals[s.season.year] ?? {}),
      career: rows(career),
      history: [...s.balanceHistory, { date: s.date, money: sc.money }],
      ledger: s.ledger.slice(0, 200),
      placements: [...s.placements].reverse().map((pl) => this.placementView(pl)),
      rates: { mode: 'freelance', matchMultiplier: 2 },
    };
  }

  private placementView(pl: Placement): PlacementView {
    const s = this.s;
    const p = s.players[pl.playerId];
    const e = pl.earnings ?? { appearance: 0, goals: 0, assists: 0, tackles: 0, cleanSheets: 0, captain: 0 };
    return {
      id: pl.id,
      player: p
        ? { id: p.id, name: `${p.firstName} ${p.lastName}`, portraitSeed: p.portraitSeed, nationalityId: p.nationality, age: ageOn(p.birthDate, s.date) }
        : null,
      club: badge(s.clubs[pl.clubId]!),
      position: pl.position,
      signedOn: pl.signedOn,
      expiresOn: pl.expiresOn,
      fee: pl.fee,
      bonus: pl.bonus,
      prospect: pl.prospect,
      earnings: e,
      matchTotal: usd(Object.values(e).reduce((a, b) => a + b, 0)),
      active: !pl.endedOn,
      endReason: pl.endReason,
      stats: p && !pl.endedOn ? statLine(p.stats) : undefined,
    };
  }

  // ── Scouting commands ──

  createCareer(setup: CareerSetup): ScoutView {
    createCareer(this.s, setup);
    ensureSeasonEvents(this.s);
    return this.getScout()!;
  }

  // ── Scouting events ──

  getEvents(): ScoutingEventView[] {
    const s = this.s;
    return (s.events ?? [])
      .filter((e) => e.season === s.season.year)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        label: eventLabel(e.kind),
        name: e.name,
        city: { id: e.cityId, name: s.cities[e.cityId]!.name },
        countryName: s.countries[e.countryId]!.name,
        start: e.start,
        end: eventEnd(e),
        days: e.days,
        ticket: e.ticket,
        size: e.size,
        status: eventStatus(s, e),
        daysAway: Math.max(0, e.start - s.date),
        canAttend: attendCheck(s, e),
        here: s.scout?.location === e.cityId,
        attendDays: Math.max(1, eventEnd(e) - Math.max(s.date, e.start) + 1),
        seen: e.seen?.flatMap((id) => {
          const p = s.players[id];
          return p ? [{ ...this.playerRow(p), inPool: !!s.pool[id] }] : [];
        }),
      }));
  }

  /** Spend the rest of the event there: everyone you see becomes better known. */
  attendEvent(id: number): { event: ScoutingEventView; advance: AdvanceSummary } {
    this.assertActive();
    this.assertNoDeadline();
    const r = attendEvent(this.s, id);
    const advance = this.summarize(this.spend(r.days));
    return { event: this.getEvents().find((e) => e.id === id)!, advance };
  }

  // ── Dilemmas ──

  /** Open choices first, then the last few you settled. */
  getDilemmas(): DilemmaView[] {
    const s = this.s;
    const all = s.dilemmas ?? [];
    const open = all.filter((d) => !d.resolvedOn);
    const settled = all.filter((d) => d.resolvedOn && !d.lapsed).slice(-3).reverse();
    return [...open, ...settled].map((d) => {
      const t = dilemmaText(s, d);
      const p = d.playerId ? s.players[d.playerId] : undefined;
      return {
        id: d.id,
        kind: d.kind,
        title: t.title,
        body: t.body,
        choices: t.choices,
        daysLeft: d.resolvedOn ? undefined : Math.max(0, d.expiresOn - s.date),
        club: d.clubId ? badge(s.clubs[d.clubId]!) : undefined,
        player: p && { id: p.id, name: `${p.firstName} ${p.lastName}` },
        choice: d.choice ? t.choices.find((c) => c.key === d.choice)?.label : undefined,
        outcome: d.outcome,
        lapsed: d.lapsed,
      };
    });
  }

  resolveDilemma(id: number, choice: string): { outcome: string } {
    this.assertActive();
    return resolveDilemma(this.s, id, choice);
  }

  addAllToPool(playerIds: PlayerId[]): void {
    for (const id of playerIds) this.addToPool(id);
  }

  estimateSearch(filters: SearchFilters): SearchEstimateView {
    return estimateSearch(this.s, filters);
  }

  /** Pays, spends the search's days (the world keeps playing), then returns what was found. */
  runSearch(filters: SearchFilters): { search: SearchView; advance: AdvanceSummary } {
    this.assertActive();
    this.assertNoDeadline();
    const record = startSearch(this.s, filters);
    const advance = this.summarize(advanceDays(this.s, record.days));
    completeSearch(this.s, record);
    return { search: this.getSearch(record.id)!, advance };
  }

  watchVideo(playerId: PlayerId): { cost: number; before: number; after: number; advance: AdvanceSummary } {
    this.assertActive();
    this.assertNoDeadline();
    const r = watchVideo(this.s, playerId);
    return { ...r, advance: this.summarize(advanceDays(this.s, 1)) };
  }

  addToPool(playerId: PlayerId): void {
    if (this.s.players[playerId] && !this.s.pool[playerId]) this.s.pool[playerId] = { addedOn: this.s.date, source: 'manual', starred: false };
  }

  removeFromPool(playerId: PlayerId): void {
    delete this.s.pool[playerId];
  }

  setStarred(playerId: PlayerId, starred: boolean): void {
    const entry = this.s.pool[playerId];
    if (entry) entry.starred = starred;
  }

  // ── Travel & fieldwork ──

  quoteTravel(cityId: CityId): TravelQuoteView {
    const s = this.s;
    const q = quoteTravel(s, cityId);
    const from = s.cities[q.from]!;
    const to = s.cities[q.to]!;
    return {
      to: { id: to.id, name: to.name, countryName: s.countries[to.countryId]!.name, lat: to.lat, lon: to.lon },
      from: { id: from.id, name: from.name, lat: from.lat, lon: from.lon },
      band: q.band,
      distanceKm: q.distanceKm,
      cost: q.cost,
      days: q.days,
      nightly: q.nightly,
      affordable: q.affordable,
    };
  }

  /** Pays and travels; the world keeps playing during the journey. */
  travel(cityId: CityId): { quote: TravelQuoteView; advance: AdvanceSummary } {
    this.assertActive();
    const quote = this.quoteTravel(cityId);
    const q = startTravel(this.s, cityId);
    return { quote, advance: this.summarize(this.spend(q.days)) };
  }

  /** Watch the player's next match from the stands (you must be in the venue's city). */
  scoutLive(playerId: PlayerId): { result: LiveResult; advance: AdvanceSummary } {
    this.assertActive();
    this.assertNoDeadline();
    const s = this.s;
    const before = knowledgeLevel(s, s.players[playerId]!);
    const opt = startLiveScouting(s, playerId);
    const lines: PlayerMatchLine[] = [];
    const clubs = new Set([opt.fixture.homeId, opt.fixture.awayId]);
    const advance = this.summarize(
      advanceDays(s, opt.daysAway, (ls, date) => {
        if (date === opt.fixture.date) for (const l of ls) if (clubs.has(l.clubId)) lines.push(l);
      }),
    );
    return { result: completeLiveScouting(s, playerId, lines, before), advance };
  }

  /** The player's next match you could attend, with both squads to choose who to watch closely. */
  getMatchDay(playerId: PlayerId): MatchDayView | null {
    const s = this.s;
    const p = s.players[playerId];
    if (!p) return null;
    const opt = nextLiveOption(s, p);
    if (!opt) return null;
    const f = opt.fixture;
    const squad = (clubId: ClubId) => {
      const club = s.clubs[clubId]!;
      return {
        club: badge(club),
        players: club.squad
          .map((id) => this.matchDayPlayer(s.players[id]!))
          .sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || estimate(b.ovr) - estimate(a.ovr)),
      };
    };
    return {
      targetId: playerId,
      fixture: { id: f.id, date: f.date, leagueName: s.leagues[f.leagueId]!.name, home: badge(s.clubs[f.homeId]!), away: badge(s.clubs[f.awayId]!) },
      venue: { id: opt.venue, name: s.cities[opt.venue]!.name },
      daysAway: opt.daysAway,
      ticket: opt.ticket,
      hotel: usd(nightlyCost(s, opt.venue) * opt.daysAway),
      inPlace: s.scout?.location === opt.venue,
      maxFocus: MAX_FOCUS,
      squads: [squad(f.homeId), squad(f.awayId)],
    };
  }

  private matchDayPlayer(p: Player): MatchDayPlayer {
    const s = this.s;
    const f = fog(s, p);
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      position: p.naturalPosition,
      age: ageOn(p.birthDate, s.date),
      ovr: f.ovr,
      known: f.level,
      inPool: !!s.pool[p.id],
      portraitSeed: p.portraitSeed,
      nationalityId: p.nationality,
    };
  }

  /** Attend the player's next match in person, watching up to three players closely. */
  attendMatch(playerId: PlayerId, focus: PlayerId[]): { match: AttendedMatchView; advance: AdvanceSummary } {
    this.assertActive();
    this.assertNoDeadline();
    const s = this.s;
    const peek = nextLiveOption(s, s.players[playerId]!);
    if (peek) validateFocus(s, peek.fixture, focus);
    const opt = startLiveScouting(s, playerId);
    const ids = validateFocus(s, opt.fixture, focus);
    const lines: PlayerMatchLine[] = [];
    const clubs = new Set([opt.fixture.homeId, opt.fixture.awayId]);
    const advance = this.summarize(
      advanceDays(s, opt.daysAway, (ls, date) => {
        if (date === opt.fixture.date) for (const l of ls) if (clubs.has(l.clubId)) lines.push(l);
      }),
    );
    const fixture = s.fixtures[opt.fixture.leagueId]!.find((x) => x.id === opt.fixture.id)!;
    const m = writeAttendedMatch(s, fixture, lines, ids);
    return {
      advance,
      match: {
        home: badge(s.clubs[fixture.homeId]!),
        away: badge(s.clubs[fixture.awayId]!),
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
        events: m.events.map((e) => ({ ...e, attributeLabel: e.attribute ? ATTRIBUTE_LABEL[e.attribute] : undefined })),
        focus: m.focus.map((o) => {
          const p = s.players[o.playerId]!;
          const ranges = attributeRanges(s, p);
          return {
            ...o,
            player: { ...this.matchDayPlayer(p), club: badge(s.clubs[p.clubId!]!) },
            seen: o.seen.map((x) => ({
              attribute: x.attribute,
              label: ATTRIBUTE_LABEL[x.attribute],
              before: x.before,
              after: x.after,
              range: ranges[x.attribute],
            })),
          };
        }),
        others: m.others,
      },
    };
  }

  meet(target: MeetTarget): { result: MeetingResult; advance: AdvanceSummary } {
    this.assertActive();
    const sameDay = metToday(this.s, target.id);
    const result = meet(this.s, target);
    const advance = sameDay ? this.noTime() : this.spend(1);
    this.stillInMeeting(target.id);
    return { result, advance: this.summarize(advance) };
  }

  // ── Career ──

  getCareer(): CareerView {
    const s = this.s;
    const sc = s.scout!;
    const e = sc.employment;
    const badgeCity = (id: ClubId) => ({ ...badge(s.clubs[id]!), cityName: s.cities[s.clubs[id]!.cityId]!.name });
    const known = new Set<ClubId>([...(Object.keys(sc.clubRecord) as ClubId[]), ...(e.mode === 'freelance' ? e.clients : [e.clubId])]);
    for (const c of Object.values(s.clubs)) if ((sc.relationships[c.headCoachId] ?? 0) > 0) known.add(c.id);
    const statusOf = (id: ClubId) =>
      (e.mode === 'fulltime' ? (e.clubId === id ? 'employer' : 'none') : e.clients.includes(id) ? 'client' : 'none') as 'employer' | 'client' | 'none';
    const earned = (s.placements ?? []).reduce((n, p) => n + p.bonus + Object.values(p.earnings ?? {}).reduce((a, b) => a + b, 0), 0);
    return {
      name: sc.name,
      backgroundLabel: BACKGROUNDS[sc.background].label,
      difficulty: sc.difficulty,
      reputation: sc.reputation,
      skills: sc.skills,
      perks: BACKGROUNDS[sc.background].perks,
      markets: Object.entries(sc.regionKnowledge)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, level]) => ({ countryId: id as CountryId, name: s.countries[id as CountryId]!.name, level })),
      homeCity: s.cities[sc.homeCity]!.name,
      employment:
        e.mode === 'freelance'
          ? { mode: 'freelance', slots: clientCapacity(s), clients: e.clients.map((id) => ({ ...badgeCity(id), trust: clubTrust(s, id) })) }
          : {
              mode: 'fulltime',
              club: badgeCity(e.clubId),
              title: e.title,
              salary: e.salary,
              since: e.since,
              until: e.until,
              leavingOn: e.leavingOn,
              expenseCover: EXPENSE_COVER[s.clubs[e.clubId]!.tier],
              trust: clubTrust(s, e.clubId),
            },
      offers: s.offers.map((o) => {
        const c = s.clubs[o.clubId]!;
        return {
          id: o.id,
          kind: o.kind,
          title: o.title,
          salary: o.salary,
          seasons: o.seasons,
          expiresOn: o.expiresOn,
          renewal: o.renewal,
          club: { ...badge(c), cityName: s.cities[c.cityId]!.name, countryName: s.countries[c.countryId]!.name, leagueName: s.leagues[c.leagueId]!.name },
          expenseCover: EXPENSE_COVER[c.tier],
          trust: clubTrust(s, c.id),
        };
      }),
      clubs: [...known]
        .map((id) => {
          const c = s.clubs[id]!;
          const r = clubRecord(sc, id);
          return {
            club: badgeCity(id),
            trust: clubTrust(s, id),
            coach: sc.relationships[c.headCoachId] ?? 0,
            signings: r.signings,
            weakPitches: r.weakPitches,
            status: statusOf(id),
          };
        })
        .sort((a, b) => b.trust - a.trust),
      milestones: [
        { reputation: 5, label: 'Tier-5 jobs · meet anyone at tier 4–5 clubs' },
        { reputation: 15, label: 'Tier-2 coaches · tier-4 jobs' },
        { reputation: AGREEMENT_GATE[3], label: 'Tier-3 clients' },
        { reputation: 30, label: 'Elite coaches · tier-3 jobs · 3 client slots' },
        { reputation: AGREEMENT_GATE[2], label: 'Tier-2 clients · tier-2 jobs · 4 client slots' },
        { reputation: 70, label: 'Elite jobs · 5 client slots' },
        { reputation: AGREEMENT_GATE[1], label: 'Elite clients' },
        { reputation: 85, label: 'Head of Recruitment at an elite club' },
      ].map((m) => ({ ...m, reached: sc.reputation >= m.reputation })),
      stats: { signings: s.placements.length, placementsActive: s.placements.filter((p) => !p.endedOn).length, earned },
    };
  }

  acceptOffer(offerId: number): CareerView {
    this.assertActive();
    acceptOffer(this.s, offerId);
    return this.getCareer();
  }

  declineOffer(offerId: number): void {
    declineOffer(this.s, offerId);
  }

  resign(): CareerView {
    this.assertActive();
    resign(this.s);
    return this.getCareer();
  }

  dropClient(clubId: ClubId): void {
    dropClient(this.s, clubId);
  }

  /** In person: ask the Head Coach to take you on as a freelance scout (1 day). */
  proposeAgreement(clubId: ClubId): { accepted: boolean; reason: string; advance: AdvanceSummary } {
    this.assertActive();
    this.assertNoDeadline();
    const coach = this.s.clubs[clubId]?.headCoachId;
    const sameDay = !!coach && metToday(this.s, coach);
    const r = proposeAgreement(this.s, clubId);
    const advance = sameDay ? this.noTime() : advanceDays(this.s, 1);
    if (coach) this.stillInMeeting(coach);
    return { ...r, advance: this.summarize(advance) };
  }

  // ── Missions ──

  getMissions(): MissionView[] {
    const s = this.s;
    return [...s.missions].reverse().map((m) => {
      const club = s.clubs[m.clubId]!;
      const deal = m.dealId !== undefined ? s.deals.find((d) => d.id === m.dealId) : undefined;
      const p = deal ? s.players[deal.playerId] : undefined;
      return {
        id: m.id,
        club: { ...badge(club), cityName: s.cities[club.cityId]!.name, countryId: club.countryId },
        position: m.position,
        requirements: describeRequirements(m.requirements, m.position),
        raw: m.requirements,
        brief: m.brief,
        status: m.status,
        postedOn: m.postedOn,
        acceptBy: m.acceptBy,
        weeks: m.weeks,
        deadline: m.deadline,
        daysLeft: m.deadline !== undefined && m.status === 'active' ? Math.max(0, m.deadline - s.date) : undefined,
        reward: m.reward,
        resolvedOn: m.resolvedOn,
        completedBy: p ? `${p.firstName} ${p.lastName}` : undefined,
        recommendations: this.missionRecommendations(m),
        negotiation: negotiationOptions(s, m),
        preferences: m.preferences && {
          maxWage: m.preferences.maxWage,
          keyAttributes: m.preferences.keyAttributes.map((k) => ({ ...k, label: ATTRIBUTE_LABEL[k.attribute] })),
          idealAge: m.preferences.idealAge,
          discussedOn: m.preferences.discussedOn,
        },
      };
    });
  }

  // ── Freelance market ──

  getMarket(): MarketView {
    const s = this.s;
    const sc = s.scout;
    const mandates: MandateView[] = [...s.mandates].reverse().map((m) => {
      const club = s.clubs[m.clubId]!;
      const p = s.players[m.playerId];
      const deal = m.dealId !== undefined ? s.deals.find((d) => d.id === m.dealId) : undefined;
      const f = p ? fog(s, p) : undefined;
      return {
        id: m.id,
        club: { ...badge(club), cityName: s.cities[club.cityId]!.name, countryId: club.countryId },
        player:
          p && f
            ? {
                id: p.id,
                name: `${p.firstName} ${p.lastName}`,
                age: ageOn(p.birthDate, s.date),
                position: p.naturalPosition,
                portraitSeed: p.portraitSeed,
                nationalityId: p.nationality,
                ovr: f.ovr,
                value: p.value,
              }
            : { id: m.playerId, name: 'Retired player', age: 0, position: 'CM', portraitSeed: 0, nationalityId: club.countryId, ovr: [0, 0], value: usd(0) },
        askingFee: m.askingFee,
        commissionPct: m.commissionPct,
        commission: usd(Math.round((m.askingFee * m.commissionPct) / 100)),
        reason: m.reason,
        status: m.status,
        postedOn: m.postedOn,
        acceptBy: m.acceptBy,
        weeks: m.weeks,
        deadline: m.deadline,
        daysLeft: m.deadline !== undefined && m.status === 'active' ? Math.max(0, m.deadline - s.date) : undefined,
        resolvedOn: m.resolvedOn,
        note: m.note,
        soldTo: deal ? s.clubs[deal.clubId]?.name : undefined,
        deals: s.deals
          .filter((d) => d.mandateId === m.id && s.clubs[d.clubId])
          .map((d) => ({ dealId: d.id, club: badge(s.clubs[d.clubId]!), stage: d.stage, fee: d.fee })),
      };
    });
    const represented = (sc?.represented ?? []).flatMap((id) => {
      const p = s.players[id];
      if (!p) return [];
      const f = fog(s, p);
      return [
        {
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          age: ageOn(p.birthDate, s.date),
          position: p.naturalPosition,
          portraitSeed: p.portraitSeed,
          nationalityId: p.nationality,
          ovr: f.ovr,
          potential: f.potential,
          prodigy: f.prodigy,
          deals: s.deals.filter((d) => d.playerId === p.id && (d.stage === 'negotiating' || d.stage === 'agreed')).length,
        },
      ];
    });
    return { freelance: sc?.employment.mode === 'freelance', mandates, represented, maxRepresented: MAX_REPRESENTED, representRapport: REPRESENT_RAPPORT };
  }

  acceptMandate(id: number): void {
    this.assertActive();
    acceptMandate(this.s, id);
  }

  declineMandate(id: number): void {
    declineMandate(this.s, id);
  }

  represent(playerId: PlayerId): void {
    this.assertActive();
    represent(this.s, playerId);
  }

  stopRepresenting(playerId: PlayerId): void {
    stopRepresenting(this.s, playerId);
  }

  // ── Onboarding ──

  /** The Getting started checklist: your first steps as a scout, ticked off as you go. */
  getOnboarding(): OnboardingView {
    const s = this.s;
    const sc = s.scout!;
    const homeRegion = s.cities[sc.homeCity]!.regionId;
    const regionName = s.regions[homeRegion]?.name ?? 'your region';
    // Clubs near home whose coach will see you and could become a client: your region first, then your country.
    const homeCountry = s.cities[sc.homeCity]!.countryId;
    const candidates = Object.values(s.clubs).filter(
      (c) => c.countryId === homeCountry && sc.reputation >= AGREEMENT_GATE[c.tier] && meetingInfo(s, { kind: 'official', id: c.headCoachId }).allowed,
    );
    const inRegion = candidates.filter((c) => s.cities[c.cityId]!.regionId === homeRegion);
    const meetClubs = (inRegion.length ? inRegion : candidates).map((c) => c.id);
    return {
      dismissed: !!sc.onboardingDismissed,
      steps: [
        {
          id: 'meet',
          label: 'Meet a Head Coach',
          hint: meetClubs.length
            ? `Go opens a random club near you whose Head Coach will see you (click again for another). Travel there and meet him. Clubs in ${regionName} are day trips, with no hotel bills.`
            : `Open a club near you (clubs in ${regionName} are day trips, with no hotel bills), travel there and meet the coach.`,
          done: Object.values(s.clubs).some((c) => (sc.relationships[c.headCoachId] ?? 0) > 0),
          screen: 'world',
          clubIds: meetClubs.length ? meetClubs : undefined,
        },
        {
          id: 'client',
          label: 'Win your first client',
          hint: 'Once the coach knows you (relationship 10+), propose a scouting agreement on the club page. Clubs may also invite you.',
          done: sc.employment.mode === 'fulltime' || sc.employment.clients.length > 0,
          screen: 'career',
        },
        {
          id: 'search',
          label: 'Run a search',
          hint: "On your client's page, click a position under Recruitment needs: it searches for players who beat their average there. Region searches are cheapest.",
          done: s.searches.length > 0,
          screen: 'search',
        },
        {
          id: 'pitch',
          label: 'Recommend a player',
          hint: 'Pick someone whose estimate clears the bar and pitch him to the Head Coach in person. Meeting the coach first makes a yes likelier.',
          done: s.deals.length > 0,
          screen: 'deals',
        },
        {
          id: 'sign',
          label: 'Get a player signed',
          hint: 'Deals complete in a transfer window. Then he pays you a signing bonus and a bonus every time he plays, until his first contract ends.',
          done: s.placements.length > 0,
          screen: 'finances',
        },
      ],
    };
  }

  dismissOnboarding(): void {
    if (this.s.scout) this.s.scout.onboardingDismissed = true;
  }

  // ── Global search ──

  private searchIndex?: { players: Map<PlayerId, string> };

  /** Names are public: find players, clubs, leagues, countries and cities by name (accents ignored). */
  searchEverything(query: string, limit = 6): GlobalSearchResults {
    const s = this.s;
    const q = fold(query.trim());
    const empty = { players: [], clubs: [], leagues: [], countries: [], cities: [] };
    if (q.length < 2) return empty;
    // Rank: whole-name prefix, then word prefix, then anywhere.
    const rank = (name: string) => {
      const n = fold(name);
      if (n.startsWith(q)) return 3;
      if (n.split(/[\s'-]+/).some((w) => w.startsWith(q))) return 2;
      return n.includes(q) ? 1 : 0;
    };
    const top = <T>(items: T[], name: (x: T) => string, tie: (a: T, b: T) => number) =>
      items
        .map((x) => ({ x, r: rank(name(x)) }))
        .filter((e) => e.r > 0)
        .sort((a, b) => b.r - a.r || tie(a.x, b.x))
        .slice(0, limit)
        .map((e) => e.x);
    if (!this.searchIndex || this.searchIndex.players.size !== Object.keys(s.players).length)
      this.searchIndex = { players: new Map(Object.values(s.players).map((p) => [p.id, fold(`${p.firstName} ${p.lastName}`)])) };
    const hits: { p: Player; r: number }[] = [];
    for (const [id, n] of this.searchIndex.players) {
      const r = n.startsWith(q) ? 3 : n.includes(` ${q}`) ? 2 : n.includes(q) ? 1 : 0;
      const p = r && s.players[id];
      if (p) hits.push({ p, r });
    }
    hits.sort((a, b) => Number(!!s.pool[b.p.id]) - Number(!!s.pool[a.p.id]) || b.r - a.r || b.p.value - a.p.value);
    const clubsInCity = new Map<string, Club[]>();
    for (const c of Object.values(s.clubs)) clubsInCity.set(c.cityId, [...(clubsInCity.get(c.cityId) ?? []), c]);
    return {
      players: hits.slice(0, limit).map(({ p }) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        age: ageOn(p.birthDate, s.date),
        position: p.naturalPosition,
        club: p.clubId ? badge(s.clubs[p.clubId]!) : undefined,
        value: p.value,
        inPool: !!s.pool[p.id],
      })),
      clubs: top(
        Object.values(s.clubs),
        (c) => c.name,
        (a, b) => a.tier - b.tier,
      ).map((c) => ({
        club: badge(c),
        cityName: s.cities[c.cityId]!.name,
        leagueName: s.leagues[c.leagueId]!.name,
      })),
      leagues: top(
        Object.values(s.leagues),
        (l) => l.name,
        (a, b) => a.level - b.level,
      ).map((l) => ({
        id: l.id,
        name: l.name,
        countryId: l.countryId,
        countryName: s.countries[l.countryId]!.name,
      })),
      countries: top(
        Object.values(s.countries),
        (c) => c.name,
        (a, b) => a.name.localeCompare(b.name),
      ).map((c) => ({
        id: c.id,
        name: c.name,
        continentName: s.continents[c.continentId]!.name,
      })),
      cities: top(
        Object.values(s.cities),
        (c) => c.name,
        (a, b) => (clubsInCity.get(b.id)?.length ?? 0) - (clubsInCity.get(a.id)?.length ?? 0),
      ).map((c) => {
        const here = clubsInCity.get(c.id) ?? [];
        return {
          id: c.id,
          name: c.name,
          countryId: c.countryId,
          countryName: s.countries[c.countryId]!.name,
          clubs: here.length,
          clubId: here.length === 1 ? here[0]!.id : undefined,
        };
      }),
    };
  }

  // ── Staff ──

  getStaff(): StaffView {
    const s = this.s;
    const sc = s.scout!;
    // Older saves (or a brand-new career) get their first job market on first look.
    if (!s.assistantMarket.length) refreshMarket(s, s.date);
    const country = (id: keyof typeof s.countries) => ({ id, name: s.countries[id]!.name });
    return {
      assistants: s.assistants.map((a) => {
        const t = a.task;
        const taskCountry =
          t &&
          (t.location.scope === 'country'
            ? t.location.id
            : t.location.scope === 'region'
              ? s.regions[t.location.id]!.countryId
              : s.cities[t.location.id]!.countryId);
        return {
          id: a.id,
          name: `${a.firstName} ${a.lastName}`,
          portraitSeed: a.portraitSeed,
          nationalityId: a.nationality,
          age: a.age,
          skill: a.skill,
          speciality: country(a.speciality),
          wage: a.wage,
          hiredOn: a.hiredOn,
          xp: a.xp,
          xpToLevel: 12,
          reports: a.reports,
          office:
            a.officeId === undefined
              ? undefined
              : { id: a.officeId, label: a.officeId === HQ ? 'Headquarters' : (s.countries[officeCountry(s, a.officeId)!]?.name ?? '') },
          task: t && {
            area: describeArea(s, t),
            scope: t.location.scope,
            positions: t.positions,
            age: t.age,
            maxValue: t.maxValue,
            weeks: t.weeks,
            endsOn: t.endsOn,
            daysLeft: Math.max(0, t.endsOn - s.date),
            found: t.found,
            weeklyExpenses: t.weeklyExpenses,
            local: taskCountry === a.speciality,
          },
        };
      }),
      market: s.assistantMarket.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        portraitSeed: c.portraitSeed,
        nationalityId: c.nationality,
        age: c.age,
        skill: c.skill,
        speciality: country(c.speciality),
        wage: c.wage,
      })),
      limit: staffCapacity(s),
      ceiling: skillCeiling(sc.reputation),
      weeklyCost: usd(s.assistants.reduce((n, a) => n + a.wage + (a.task?.weeklyExpenses ?? 0), 0)),
      maxWeeks: MAX_TASK_WEEKS,
    };
  }

  estimateTask(assistantId: number, brief: AssistantBrief, weeks: number): TaskEstimateView {
    const s = this.s;
    const a = s.assistants.find((x) => x.id === assistantId)!;
    const weeklyExpenses = taskExpenses(s, a, brief);
    const country =
      brief.location.scope === 'country'
        ? brief.location.id
        : brief.location.scope === 'region'
          ? s.regions[brief.location.id]!.countryId
          : s.cities[brief.location.id]!.countryId;
    const f = {
      location: brief.location,
      positions: brief.positions,
      age: brief.age,
      value: brief.maxValue ? ([0, brief.maxValue] as [number, number]) : undefined,
      attributes: [],
      includeFreeAgents: true,
    };
    let matches = 0;
    for (const p of Object.values(s.players)) {
      if (s.pool[p.id] || !inLocation(s, p, f)) continue;
      if (brief.positions.length && !brief.positions.some((pos) => (p.positions[pos] ?? 0) >= 0.75)) continue;
      const age = ageOn(p.birthDate, s.date);
      if (brief.age && (age < brief.age[0] || age > brief.age[1])) continue;
      if (brief.maxValue !== undefined && p.value > brief.maxValue) continue;
      matches++;
    }
    return { weeklyExpenses, total: usd((a.wage + weeklyExpenses) * weeks), local: country === a.speciality, matches };
  }

  hireAssistant(candidateId: number): void {
    this.assertActive();
    hireAssistant(this.s, candidateId);
  }

  fireAssistant(id: number): void {
    fireAssistant(this.s, id);
  }

  assignTask(id: number, brief: AssistantBrief, weeks: number): void {
    this.assertActive();
    assignTask(this.s, id, brief, weeks);
  }

  recallAssistant(id: number): void {
    recallAssistant(this.s, id);
  }

  // ── Rivals ──

  getRivals(): RivalsView {
    const s = this.s;
    const sc = s.scout!;
    const yours = new Set<PlayerId>([...s.deals.filter((d) => d.stage === 'negotiating').map((d) => d.playerId), ...(Object.keys(s.pool) as PlayerId[])]);
    const rivals = [...s.rivals]
      .sort((a, b) => b.reputation - a.reputation)
      .map((r) => {
        const chase = r.pursuit?.rumoured ? r.pursuit : undefined;
        const p = chase ? s.players[chase.playerId] : undefined;
        const homeClubs = r.employment.mode === 'fulltime' ? [r.employment.clubId] : r.employment.clients;
        return {
          id: r.id,
          name: `${r.firstName} ${r.lastName}`,
          portraitSeed: r.portraitSeed,
          nationalityId: r.nationality,
          reputation: Math.round(r.reputation),
          employer: r.employment.mode === 'fulltime' ? badge(s.clubs[r.employment.clubId]!) : undefined,
          clients: r.employment.mode === 'freelance' ? r.employment.clients.length : 0,
          signings: r.record.signings,
          steals: r.record.steals,
          chase:
            chase && p
              ? {
                  player: { id: p.id, name: `${p.firstName} ${p.lastName}` },
                  club: badge(s.clubs[chase.clubId]!),
                  advanced: chase.progress >= 0.7,
                  yours: yours.has(p.id),
                }
              : undefined,
          local: homeClubs.some((id) => s.clubs[id]?.countryId === sc.homeCountry) || r.nationality === sc.homeCountry,
        };
      });
    return {
      you: { name: sc.name, reputation: Math.round(sc.reputation), rank: 1 + s.rivals.filter((r) => r.reputation > sc.reputation).length },
      rivals,
      threats: rivals.filter((r) => r.chase?.yours).length,
    };
  }

  /** Home: what needs you, what is running, what is coming up, and how the season is going. */
  getHome(): HomeView {
    const s = this.s;
    const sc = s.scout!;
    const scout = this.getScout()!;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const needsYou: HomeItem[] = [];
    const inProgress: HomeItem[] = [];

    if (scout.debt)
      needsYou.push({
        key: 'debt',
        kind: 'debt',
        tone: 'urgent',
        title: `You're in debt: ${formatUSD(scout.money)}`,
        detail: `Bankrupt in ${plural(scout.debt.daysLeft, 'day')} unless you get back above $0.`,
        daysLeft: scout.debt.daysLeft,
        link: { screen: 'finances' },
      });

    const missions = this.getMissions();
    for (const m of missions.filter((x) => x.status === 'offered')) {
      const left = m.acceptBy - s.date;
      needsYou.push({
        key: `offer-m${m.id}`,
        kind: 'mission',
        tone: left <= 3 ? 'urgent' : 'action',
        title: `${m.club.name} want a ${m.position}`,
        detail: `New brief · reward ${formatUSD(m.reward)} · answer within ${plural(left, 'day')}`,
        daysLeft: left,
        club: m.club,
        link: { screen: 'missions' },
      });
    }
    for (const m of missions.filter((x) => x.status === 'active')) {
      const left = m.daysLeft ?? 0;
      const item: HomeItem = {
        key: `m${m.id}`,
        kind: 'mission',
        tone: left <= 14 && !m.recommendations.length ? 'urgent' : 'info',
        title: `${m.club.name}: ${m.position} brief`,
        detail: m.recommendations.length ? `${plural(m.recommendations.length, 'player')} put forward · ${formatUSD(m.reward)}` : `Nobody put forward yet · ${formatUSD(m.reward)}`,
        daysLeft: left,
        progress: m.deadline !== undefined ? Math.min(1, Math.max(0, 1 - left / (m.weeks * 7))) : undefined,
        club: m.club,
        link: { screen: 'missions' },
      };
      // A brief about to fail with nobody put forward needs you; otherwise it's running work.
      (item.tone === 'urgent' ? needsYou : inProgress).push(item);
    }
    if (scout.pendingMandates)
      needsYou.push({
        key: 'mandates',
        kind: 'mandate',
        tone: 'action',
        title: `${plural(scout.pendingMandates, 'club')} want${scout.pendingMandates === 1 ? 's' : ''} you to sell a player`,
        detail: 'Selling mandates waiting for your answer.',
        link: { screen: 'missions' },
      });
    if (scout.pendingOffers)
      needsYou.push({
        key: 'offers',
        kind: 'offer',
        tone: 'action',
        title: `${plural(scout.pendingOffers, 'job offer')} on the table`,
        detail: 'Clubs want to hire you full-time.',
        link: { screen: 'career' },
      });
    if (scout.rivalThreats)
      needsYou.push({
        key: 'rivals',
        kind: 'rival',
        tone: 'urgent',
        title: `Rivals are chasing ${plural(scout.rivalThreats, 'player')} of yours`,
        detail: 'Move first, or lose them.',
        link: { screen: 'rivals' },
      });
    if (scout.idleAssistants)
      needsYou.push({
        key: 'idle',
        kind: 'assistant',
        tone: 'action',
        title: `${plural(scout.idleAssistants, 'assistant')} with nothing to do`,
        detail: "You're paying their wages: give them an area to scout.",
        link: { screen: 'staff' },
      });
    const e = sc.employment;
    // A new coach at a club you work with: your standing there now rests on someone you may never have met.
    for (const id of e.mode === 'fulltime' ? [e.clubId] : e.clients) {
      const club = s.clubs[id]!;
      const coach = s.officials[club.headCoachId]!;
      if (coach.appointedOn === undefined || s.date - coach.appointedOn > 45 || (sc.relationships[coach.id] ?? 0) >= 15) continue;
      needsYou.push({
        key: `coach-${club.id}`,
        kind: 'coach',
        tone: 'action',
        title: `New coach at ${club.name}: meet ${coach.firstName} ${coach.lastName}`,
        detail: `Appointed ${formatDate(coach.appointedOn)}. Your relationship with him: ${Math.round(sc.relationships[coach.id] ?? 0)}.`,
        club: badge(club),
        link: { screen: 'club', id: club.id },
      });
    }
    if (e.mode === 'freelance') {
      const slots = clientCapacity(s);
      if (e.clients.length < slots)
        needsYou.push({
          key: 'clients',
          kind: 'clients',
          tone: e.clients.length === 0 ? 'action' : 'info',
          title: e.clients.length === 0 ? 'No clients yet' : `Room for ${plural(slots - e.clients.length, 'more client')}`,
          detail: 'The Weekly lists clubs short of players with money to spend.',
          link: { screen: 'gazette' },
        });
    }
    for (const ev of this.getEvents().filter((x) => x.status === 'on' && !x.seen)) {
      const left = ev.end - s.date + 1;
      needsYou.push({
        key: `ev-on${ev.id}`,
        kind: 'event',
        tone: 'action',
        title: `On now: ${ev.name}`,
        detail: `${ev.label} in ${ev.city.name} · about ${ev.size} players · ${ev.here ? 'you are here' : 'travel there to attend'}`,
        daysLeft: left,
        link: { screen: 'events' },
      });
    }
    if (scout.unreadInbox)
      needsYou.push({
        key: 'inbox',
        kind: 'inbox',
        tone: 'info',
        title: `${plural(scout.unreadInbox, 'new message')}`,
        detail: 'In your inbox.',
        link: { screen: 'inbox' },
      });

    for (const d of this.getDeals().filter((x) => x.stage === 'negotiating' || x.stage === 'agreed')) {
      const left = d.resolvesOn !== undefined ? Math.max(0, d.resolvesOn - s.date) : undefined;
      inProgress.push({
        key: `d${d.id}`,
        kind: 'deal',
        tone: d.rivals.length ? 'urgent' : 'info',
        title: `${d.player?.name ?? 'Player'} → ${d.club.name}`,
        detail:
          d.stage === 'agreed'
            ? 'Agreed: completes when the window opens'
            : `Negotiating · ${formatUSD(d.fee)}${d.chance !== undefined ? ` · ${Math.round(d.chance * 100)}% to go through` : ''}${d.rivals.length ? ' · a rival is circling' : ''}`,
        daysLeft: left,
        club: d.club,
        link: { screen: 'deals' },
      });
    }
    for (const h of this.getHunts().filter((x) => x.status === 'active')) {
      inProgress.push({
        key: `h${h.id}`,
        kind: 'hunt',
        tone: h.rivals.some((r) => r.band === 'closing in' || r.band === 'found him') ? 'urgent' : 'info',
        title: `Hunt: a ${h.age}-year-old ${h.position} in ${h.area.city?.name ?? h.area.region ?? h.area.country.name}`,
        detail: `${plural(h.clues.length, 'clue')}${h.rivals.length ? ` · ${plural(h.rivals.length, 'rival')} on the trail` : ''}`,
        daysLeft: h.daysLeft,
        progress: Math.min(1, Math.max(0, (s.date - h.startedOn) / Math.max(1, h.expiresOn - h.startedOn))),
        link: { screen: 'hunts' },
      });
    }
    for (const a of s.assistants) {
      if (!a.task) continue;
      const left = Math.max(0, a.task.endsOn - s.date);
      inProgress.push({
        key: `a${a.id}`,
        kind: 'assistant',
        tone: 'info',
        title: `${a.firstName} ${a.lastName} scouting ${describeArea(s, a.task)}`,
        detail: `${plural(a.task.found, 'player')} found so far`,
        daysLeft: left,
        progress: Math.min(1, Math.max(0, (s.date - a.task.startedOn) / Math.max(1, a.task.endsOn - a.task.startedOn))),
        link: { screen: 'staff' },
      });
    }
    const pendingReports = (s.reports ?? []).filter((r) => !r.outcome && !r.voided);
    if (pendingReports.length) {
      const next = Math.min(...pendingReports.map((r) => r.date + REVIEW_DAYS));
      inProgress.push({
        key: 'reports',
        kind: 'report',
        tone: 'info',
        title: `${plural(pendingReports.length, 'report')} waiting for review`,
        detail: 'Each is checked a year after you wrote it.',
        daysLeft: Math.max(0, next - s.date),
        link: { screen: 'career' },
      });
    }
    const rankTone = { urgent: 0, action: 1, info: 2 } as const;
    needsYou.sort((a, b) => rankTone[a.tone] - rankTone[b.tone] || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
    inProgress.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

    // Calendar: windows, deadline days, the season, and brief deadlines in the next ~10 weeks.
    const { year } = toParts(s.date);
    const dates: { key: string; date: GameDate; label: string; link?: HomeView['upcoming'][number]['link'] }[] = [];
    for (const y of [year, year + 1]) {
      dates.push({ key: `jan-open-${y}`, date: makeDate(y, 1, 1), label: 'January window opens' });
      dates.push({ key: `jan-dd-${y}`, date: makeDate(y, 1, 31), label: 'January deadline day' });
      dates.push({ key: `sum-open-${y}`, date: makeDate(y, 7, 1), label: 'Summer window opens · new season' });
      dates.push({ key: `sum-dd-${y}`, date: makeDate(y, 8, 31), label: 'Summer deadline day' });
      const w = seasonWindow(y);
      dates.push({ key: `kick-${y}`, date: w.start, label: 'League kick-off' });
      dates.push({ key: `end-${y}`, date: w.end, label: 'Last day of the league season' });
    }
    for (const m of missions.filter((x) => x.status === 'active' && x.deadline !== undefined))
      dates.push({ key: `md${m.id}`, date: m.deadline!, label: `${m.club.shortName} ${m.position} brief due`, link: { screen: 'missions' } });
    const events = this.getEvents();
    for (const ev of events.filter((x) => x.status === 'upcoming'))
      dates.push({ key: `ev${ev.id}`, date: ev.start, label: `${ev.name} · ${ev.city.name}`, link: { screen: 'events' } });
    const upcoming = dates
      .filter((d) => d.date >= s.date && d.date - s.date <= 75)
      .sort((a, b) => a.date - b.date)
      .slice(0, 6)
      .map((d) => ({ ...d, daysAway: d.date - s.date }));

    const totals = s.ledgerTotals[s.season.year] ?? {};
    const earned = Object.values(totals).reduce((n, v) => n + Math.max(0, v ?? 0), 0) - Math.max(0, totals['starting-funds'] ?? 0);
    const spent = -Object.values(totals).reduce((n, v) => n + Math.min(0, v ?? 0), 0);
    const seasonStart = makeDate(s.season.year, 7, 1);
    return {
      needsYou,
      inProgress,
      upcoming,
      season: {
        label: seasonLabel(s.season.year),
        placements: s.placements.filter((p) => p.signedOn >= seasonStart).length,
        earned: usd(earned),
        spent: usd(spent),
        reputation: Math.round(sc.reputation),
        rank: 1 + s.rivals.filter((r) => r.reputation > sc.reputation).length,
        scouts: s.rivals.length + 1,
        goals: scout.goals,
        poolSize: scout.poolSize,
        work: e.mode === 'freelance' ? { mode: 'freelance', clients: e.clients.length, slots: clientCapacity(s) } : { mode: 'fulltime', club: badge(s.clubs[e.clubId]!) },
      },
    };
  }

  /**
   * The weekly needs magazine: what your clubs need, which other clubs at home are
   * short and can pay, what positions are in demand, and who in your pool fits.
   */
  getGazette(): GazetteView {
    const s = this.s;
    const sc = s.scout!;
    const e = sc.employment;
    const mine: ClubId[] = e.mode === 'fulltime' ? [e.clubId] : e.clients;
    const mineSet = new Set(mine);
    const openMissions = s.missions.filter((m) => m.status === 'offered' || m.status === 'active');
    const needsOf = (club: Club) => squadNeeds(club.formation, this.squadOf(club));
    const row = (club: Club, n: ReturnType<typeof squadNeeds>[number]): GazetteNeed => {
      const m = openMissions.find((x) => x.clubId === club.id && x.position === n.position);
      return {
        club: { ...badge(club), cityName: s.cities[club.cityId]!.name, leagueName: s.leagues[club.leagueId]!.name, countryId: club.countryId },
        position: n.position,
        severity: Math.round(n.severity * 100) / 100,
        average: n.positionalAverage,
        depth: n.depth,
        transferBudget: club.transferBudget,
        mission: m && { id: m.id, status: m.status as 'offered' | 'active', reward: m.reward },
      };
    };

    const yourClubs = mine
      .flatMap((id) => {
        const club = s.clubs[id]!;
        return needsOf(club)
          .filter((n) => n.severity >= 0.2)
          .map((n) => row(club, n));
      })
      .sort((a, b) => Number(!!b.mission) - Number(!!a.mission) || b.severity - a.severity)
      .slice(0, 8);

    // Home clubs outside your book: urgent needs only, and they must have money.
    const home = Object.values(s.clubs).filter((c) => c.countryId === sc.homeCountry && !mineSet.has(c.id));
    const homeNeeds = home.map((club) => ({ club, needs: needsOf(club) }));
    const leads = homeNeeds
      .flatMap(({ club, needs }) =>
        club.transferBudget > 0
          ? needs.filter((n) => n.severity >= 0.45).map((n) => ({ ...row(club, n), coach: Math.round(sc.relationships[club.headCoachId] ?? 0) }))
          : [],
      )
      .sort((a, b) => b.severity * Math.log10(10 + b.transferBudget) - a.severity * Math.log10(10 + a.transferBudget))
      // One line per club: the most pressing.
      .filter((n, i, all) => all.findIndex((x) => x.club.id === n.club.id) === i)
      .slice(0, 6);

    const allNeeds = [...mine.map((id) => ({ club: s.clubs[id]!, needs: needsOf(s.clubs[id]!) })), ...homeNeeds];
    const byPos = new Map<Position, { clubs: number; urgent: number; lowestBar: number; topBudget: USD }>();
    for (const { club, needs } of allNeeds) {
      for (const n of needs) {
        if (n.severity < 0.2) continue;
        const d = byPos.get(n.position) ?? { clubs: 0, urgent: 0, lowestBar: 99, topBudget: usd(0) };
        d.clubs += 1;
        if (n.severity >= 0.45) d.urgent += 1;
        d.lowestBar = Math.min(d.lowestBar, (n.positionalAverage || 0) + 1);
        d.topBudget = usd(Math.max(d.topBudget, club.transferBudget));
        byPos.set(n.position, d);
      }
    }
    const demand = [...byPos.entries()]
      .map(([position, d]) => ({ position, ...d }))
      .sort((a, b) => b.clubs - a.clubs || b.urgent - a.urgent)
      .slice(0, 6);

    // Pool players who would beat the bar at one of your clubs and fit its budget.
    const negotiating = new Set(s.deals.filter((d) => d.stage === 'negotiating').map((d) => d.playerId));
    const pool = this.getPool().filter((p) => !negotiating.has(p.id));
    // With no clubs yet, match the pool against the leads instead: a ready answer when you court them.
    const poolFits = (yourClubs.length ? yourClubs : leads)
      .flatMap((n) =>
        pool
          .filter((p) => p.position === n.position && p.club?.id !== n.club.id)
          .filter((p) => !p.club || n.transferBudget <= 0 || p.value <= n.transferBudget)
          .map((p) => ({ player: p, club: n.club, position: n.position, margin: p.ovr - (n.average + 1), severity: n.severity }))
          .filter((x) => x.margin >= 0),
      )
      .sort((a, b) => b.severity - a.severity || b.margin - a.margin)
      .slice(0, 8)
      .map(({ severity: _, club, ...rest }) => ({ ...rest, club: badge(s.clubs[club.id]!) }));

    const rumours = s.rivals.flatMap((r) => {
      const chase = r.pursuit?.rumoured ? r.pursuit : undefined;
      const p = chase && s.players[chase.playerId];
      if (!chase || !p) return [];
      return [
        {
          rival: `${r.firstName} ${r.lastName}`,
          player: { id: p.id, name: `${p.firstName} ${p.lastName}` },
          club: badge(s.clubs[chase.clubId]!),
          advanced: chase.progress >= 0.7,
          yours: negotiating.has(p.id) || !!s.pool[p.id],
        },
      ];
    });

    const start = sc.startedOn ?? CAREER_START;
    return {
      issue: Math.floor((s.date - start) / 7) + 1,
      date: s.date,
      seasonLabel: seasonLabel(s.season.year),
      countryName: s.countries[sc.homeCountry]!.name,
      countryId: sc.homeCountry,
      yourClubs,
      noClubs: mine.length === 0,
      leads,
      demand,
      poolFits,
      rumours: rumours.slice(0, 5),
    };
  }

  private rivalInterest(playerId: PlayerId): RivalInterestView[] {
    return knownInterest(this.s, playerId).map(({ rival, club, advanced }) => ({
      rivalId: rival.id,
      rivalName: `${rival.firstName} ${rival.lastName}`,
      club: badge(club),
      advanced,
    }));
  }

  /** Prodigies your work has just revealed (each returned once, for the reveal overlay). */
  takeDiscoveries(): DiscoveryView[] {
    const s = this.s;
    const out = s.pendingDiscoveries.flatMap((id) => {
      const p = s.players[id];
      if (!p) return [];
      const club = p.clubId ? s.clubs[p.clubId] : undefined;
      return [
        {
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          age: ageOn(p.birthDate, s.date),
          position: p.naturalPosition,
          portraitSeed: p.portraitSeed,
          nationalityId: p.nationality,
          club: club && badge(club),
          potential: fog(s, p).potential,
        },
      ];
    });
    s.pendingDiscoveries = [];
    return out;
  }

  private representationView(p: Player): PlayerView['representation'] {
    const sc = this.s.scout;
    if (!sc || sc.employment.mode !== 'freelance' || p.clubId) return null;
    if (sc.represented.includes(p.id)) return { status: 'represented' };
    const check = representCheck(this.s, p);
    return check.ok ? { status: 'available' } : { status: 'unavailable', reason: check.reason };
  }

  private mandateBadge(p: Player): PlayerView['mandate'] {
    const s = this.s;
    const m = s.mandates.find((x) => x.playerId === p.id && (x.status === 'active' || x.status === 'offered'));
    if (!m) return undefined;
    return {
      id: m.id,
      club: badge(s.clubs[m.clubId]!),
      askingFee: m.askingFee,
      commissionPct: m.commissionPct,
      status: m.status as 'offered' | 'active',
      daysLeft: m.deadline !== undefined && m.status === 'active' ? Math.max(0, m.deadline - s.date) : undefined,
    };
  }

  acceptMission(id: number): void {
    this.assertActive();
    acceptMission(this.s, id);
  }

  declineMission(id: number): void {
    declineMission(this.s, id);
  }

  /** How a player looks against each active brief from this club, using only what you can see. */
  /** Deals for this brief: same club and position, opened since you accepted it. */
  private missionRecommendations(m: Mission): MissionRecommendationView[] {
    const s = this.s;
    if (m.deadline === undefined) return [];
    const accepted = m.deadline - m.weeks * 7;
    return s.deals
      .filter((d) => d.clubId === m.clubId && d.position === m.position && d.openedOn >= accepted && d.openedOn <= m.deadline!)
      .flatMap((d) => {
        const p = s.players[d.playerId];
        if (!p) return [];
        const checks = this.briefChecks(m, p, d.fee);
        return [
          {
            dealId: d.id,
            player: {
              id: p.id,
              name: `${p.firstName} ${p.lastName}`,
              portraitSeed: p.portraitSeed,
              nationalityId: p.nationality,
              age: ageOn(p.birthDate, s.date),
            },
            stage: d.stage,
            fit: checks.some((c) => c.status === 'no') ? 'no' : checks.every((c) => c.status === 'yes') ? 'yes' : 'maybe',
            completed: m.dealId === d.id,
          },
        ];
      });
  }

  private missionFits(p: Player, club: Club, pos: Position, fee: USD): MissionFitView[] {
    return this.s.missions
      .filter((m) => m.status === 'active' && m.clubId === club.id)
      .map((m) => ({
        id: m.id,
        position: m.position,
        deadline: m.deadline,
        reward: m.reward,
        checks: this.briefChecks(m, p, fee),
        preferences: m.preferences && this.preferenceChecks(m, p, club),
        samePosition: m.position === pos,
      }));
  }

  /** Each requirement of a brief against what you can see of the player. */
  private briefChecks(m: Mission, p: Player, fee: USD): MissionFitView['checks'] {
    const s = this.s;
    const age = ageOn(p.birthDate, s.date);
    const r = m.requirements;
    const range = fog(s, p).positions[m.position];
    const checks: MissionFitView['checks'] = [
      {
        label: `${m.position} rated ${r.minOvr}+ (you: ${range[0]}–${range[1]})`,
        status: range[0] >= r.minOvr ? 'yes' : range[1] < r.minOvr ? 'no' : 'maybe',
      },
    ];
    if (r.maxAge !== undefined) checks.push({ label: `Aged ${r.maxAge} or under (${age})`, status: age <= r.maxAge ? 'yes' : 'no' });
    if (r.minAge !== undefined) checks.push({ label: `Aged ${r.minAge} or over (${age})`, status: age >= r.minAge ? 'yes' : 'no' });
    if (r.maxFee !== undefined)
      checks.push({ label: `Fee up to ${formatUSD(r.maxFee)} (${fee ? formatUSD(fee) : 'free'})`, status: fee <= r.maxFee ? 'yes' : 'no' });
    if (r.foot) checks.push({ label: `${r.foot}-footed (${p.foot})`, status: p.foot === r.foot || p.foot === 'Both' ? 'yes' : 'no' });
    return checks;
  }

  /** The club's discussed preferences against what you can see of the player. */
  private preferenceChecks(m: Mission, p: Player, club: Club): MissionFitView['checks'] {
    const s = this.s;
    const pref = m.preferences!;
    const age = ageOn(p.birthDate, s.date);
    const wage = brokeredWage(s, p, club);
    const attrs = fog(s, p).attributes;
    return [
      { label: `Wage up to ${formatUSD(pref.maxWage)}/wk (${formatUSD(wage)})`, status: wage <= pref.maxWage ? 'yes' : 'no' },
      { label: `Ideally aged ${pref.idealAge[0]}–${pref.idealAge[1]} (${age})`, status: age >= pref.idealAge[0] && age <= pref.idealAge[1] ? 'yes' : 'no' },
      ...pref.keyAttributes.map(({ attribute, min }) => {
        const r = attrs[attribute];
        return {
          label: `${ATTRIBUTE_LABEL[attribute]} ${min}+ (you: ${r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`})`,
          status: (r[0] >= min ? 'yes' : r[1] < min ? 'no' : 'maybe') as 'yes' | 'maybe' | 'no',
        };
      }),
    ];
  }

  negotiateMission(id: number, key: NegotiationKey): { agreed: boolean; message: string } {
    this.assertActive();
    return negotiateMission(this.s, id, key);
  }

  discussMission(id: number): void {
    this.assertActive();
    discussMission(this.s, id);
  }

  // ── Recommendations ──

  /** Pitch a player to the Head Coach, in person or by phone (one day). */
  /**
   * A pitch takes a day in person, unless you already met the coach today (then put forward as many as you
   * like). A phone call takes no time.
   */
  pitch(args: PitchArgs): { deal: DealView; advance: AdvanceSummary } {
    this.assertActive();
    const club = this.s.clubs[args.clubId];
    const free = !!args.remote || (!!club && metToday(this.s, club.headCoachId));
    const deal = pitch(this.s, args);
    // Your name now goes with him: a report is filed from your estimate (after this pitch's answer).
    fileReportOnPitch(this.s, args.playerId, args.position);
    const advance = free ? this.noTime() : this.spend(1);
    if (!args.remote && club) this.stillInMeeting(club.headCoachId);
    return { deal: this.dealView(deal), advance: this.summarize(advance) };
  }

  getDeals(): DealView[] {
    return this.s.deals.map((d) => this.dealView(d));
  }

  private dealView(d: Deal): DealView {
    const s = this.s;
    const p = s.players[d.playerId];
    const club = s.clubs[d.clubId]!;
    return {
      id: d.id,
      player: p
        ? {
            id: p.id,
            name: `${p.firstName} ${p.lastName}`,
            portraitSeed: p.portraitSeed,
            nationalityId: p.nationality,
            age: ageOn(p.birthDate, s.date),
            ovrRange: fog(s, p).positions[d.position],
          }
        : null,
      club: { ...badge(club), cityName: s.cities[club.cityId]!.name },
      seller: d.sellingClubId && s.clubs[d.sellingClubId] ? badge(s.clubs[d.sellingClubId]!) : undefined,
      position: d.position,
      stage: d.stage,
      pitchedTo: d.pitchedTo,
      signOff: d.signOff,
      prospect: d.prospect,
      openedOn: d.openedOn,
      resolvesOn: d.resolvesOn,
      completedOn: d.completedOn,
      fee: d.fee,
      wage: d.wage,
      chance: d.chance,
      reason: d.reason,
      log: d.log,
      rivals: this.rivalInterest(d.playerId),
    };
  }

  getPitchPreview(playerId: PlayerId, clubId: ClubId, position?: Position): PitchPreview {
    const s = this.s;
    const p = s.players[playerId]!;
    const club = s.clubs[clubId]!;
    const positions = formationPositions(club);
    const pos =
      position && positions.includes(position)
        ? position
        : (positions.find((x) => (p.positions[x] ?? 0) >= 0.75) ?? positions.find((x) => x !== 'GK') ?? positions[0]!);
    const f = fog(s, p);
    const avg = clubPositionalAverage(s, club, pos);
    const est = f.positions[pos];
    const rights = pitchRights(s, p, club);
    const fee = pitchFee(s, p, rights.mandate?.askingFee);
    const wage = brokeredWage(s, p, club);
    const fullWage = offeredWage(s, p, club);
    const afford = canAfford(s, club, fee, wage);
    const age = ageOn(p.birthDate, s.date);
    const policyOk = club.acceptsProspects === 'yes' || (club.acceptsProspects === 'prodigies' && f.prodigy);
    const officialView = (role: Official): OfficialPitchView => {
      const o = s.officials[club.headCoachId]!;
      const prob = s.scout ? signOffProbability(s, o, p, club, pos, fee) : 0.5;
      const remoteProb = s.scout ? signOffProbability(s, o, p, club, pos, fee, true) : 0.5;
      const readOf = (x: number) => (x >= 0.62 ? 'good' : x >= 0.38 ? 'toss-up' : 'long-shot') as OfficialPitchView['read'];
      const remote = s.scout ? remotePitchCheck(s, club.id) : { ok: false, trust: 0 };
      return {
        id: o.id,
        role,
        name: `${o.firstName} ${o.lastName}`,
        portraitSeed: o.portraitSeed,
        age: o.age,
        meeting: this.meetingView({ kind: 'official', id: o.id }),
        topPriorities: (Object.entries(o.priorities) as [string, number][])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => PRIORITY_LABELS[k] ?? k),
        read: readOf(prob),
        remote: { ...remote, required: REMOTE_PITCH_TRUST, read: readOf(remoteProb) },
      };
    };
    const existing = s.deals.find(
      (d) =>
        d.playerId === p.id && d.clubId === club.id && d.stage !== 'completed' && d.stage !== 'failed' && d.stage !== 'hijacked' && d.stage !== 'collapsed',
    );
    return {
      player: { id: p.id, name: `${p.firstName} ${p.lastName}`, age, naturalPosition: p.naturalPosition, prodigyKnown: f.prodigy, potential: f.potential },
      club: {
        ...badge(club),
        cityId: club.cityId,
        cityName: s.cities[club.cityId]!.name,
        formation: club.formation,
        acceptsProspects: club.acceptsProspects,
        transferBudget: club.transferBudget,
        wageRoom: wageRoom(s, club),
      },
      positions,
      position: pos,
      positionalAverage: avg,
      estimate: est,
      clearsBar: est[0] > avg ? 'yes' : est[1] <= avg ? 'no' : 'maybe',
      prospectRoute: age <= 21 && policyOk && (!f.potential || f.potential[1] > avg),
      fee,
      wage,
      wageSaving: usd(Math.max(0, fullWage - wage)),
      wageCeiling: wageCeiling(s, p, club, pos),
      acceptance: (() => {
        const probe = (w: USD) =>
          playerChance(s, {
            id: -1,
            playerId: p.id,
            clubId: club.id,
            position: pos,
            stage: 'negotiating',
            pitchedTo: [],
            prospect: false,
            openedOn: s.date,
            fee,
            wage: w,
            wageDemand: wage,
            log: [],
            mandateId: rights.mandate?.id,
            represented: rights.represented,
          });
        return { atAsk: probe(wage), atCeiling: probe(wageCeiling(s, p, club, pos)) };
      })(),
      report: (() => {
        const r = openReport(s, p.id);
        return r ? { role: r.role, rating: r.rating, sameRole: r.role === pos } : undefined;
      })(),
      specialties: matchingSpecialties(s, p, pos).map((sp) => sp.label),
      affordable: afford.ok,
      affordReason: afford.reason,
      inCity: s.scout?.location === club.cityId,
      work: { ok: rights.ok, reason: rights.reason },
      rivalInterest: this.rivalInterest(p.id),
      rights: !rights.ok ? 'none' : rights.mandate ? 'mandate' : rights.represented ? 'represented' : rights.open ? 'open' : 'club',
      commission: rights.mandate ? usd(Math.round((fee * rights.mandate.commissionPct) / 100)) : undefined,
      agreement: s.scout ? (({ ok, reason }) => ({ ok, reason }))(agreementCheck(s, club.id)) : { ok: false },
      coach: officialView('coach'),
      existing: existing && this.dealView(existing),
      missions: this.missionFits(p, club, pos, fee),
    };
  }

  /** Clubs in a league, for the recommend dialog's club picker. */
  getLeagueClubs(leagueId: LeagueId): (ClubBadge & { cityName: string })[] {
    const s = this.s;
    return s.leagues[leagueId]!.clubIds.map((id) => ({ ...badge(s.clubs[id]!), cityName: s.cities[s.clubs[id]!.cityId]!.name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /** Clubs worth pitching him to, judged only on what you can see (needs, averages, your estimate). */
  getClubSuggestions(playerId: PlayerId): ClubSuggestion[] {
    const s = this.s;
    const p = s.players[playerId]!;
    const est = estimate(fog(s, p).ovr);
    const sale = s.mandates.find((m) => m.status === 'active' && m.playerId === p.id);
    const fee = sale ? sale.askingFee : transferFee(s, p);
    const openToAll = !!sale || (!p.clubId && !!s.scout?.represented.includes(p.id));
    const here = s.scout ? s.cities[s.scout.location]!.countryId : p.nationality;
    const scored: { club: Club; score: number; reason: string; avg: number }[] = [];
    for (const club of Object.values(s.clubs)) {
      if (club.id === p.clubId) continue;
      const job = s.scout?.employment;
      if (job?.mode === 'fulltime' && club.id !== job.clubId) continue;
      const isClient = job?.mode === 'freelance' ? job.clients.includes(club.id) : job?.clubId === club.id;
      const pos = p.naturalPosition;
      if (!formationPositions(club).includes(pos)) continue;
      const inCity = s.scout?.location === club.cityId;
      const known = s.scout?.relationships[club.headCoachId] ?? 0;
      if (!isClient && !inCity && !known && club.countryId !== here) continue;
      // Budgets are public: don't suggest clubs that obviously can't pay.
      if (!isClient && !canAfford(s, club, fee, brokeredWage(s, p, club)).ok) continue;
      const avg = clubPositionalAverage(s, club, pos);
      const need =
        squadNeeds(
          club.formation,
          club.squad.map((id) => s.players[id]!),
        ).find((n) => n.position === pos)?.severity ?? 0;
      const margin = est - avg;
      if (margin < -3 && !isClient && !inCity && !known) continue;
      const score = margin * 0.6 + need * 10 + (inCity ? 6 : 0) + known / 10 + (isClient ? 25 : 0) + (openToAll && margin >= 0 ? 4 : 0);
      const reason =
        openToAll && !isClient && margin >= 0 && need >= 0.2
          ? `Needs a ${pos}`
          : isClient
            ? job?.mode === 'fulltime'
              ? 'Your employer'
              : 'Your client'
            : inCity
              ? 'In your city'
              : known
                ? 'You know people there'
                : need >= 0.45
                  ? `Urgent need at ${pos}`
                  : `Average ${avg} at ${pos}`;
      scored.push({ club, score, reason, avg });
    }
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ club, reason, avg }) => ({
        club: {
          ...badge(club),
          cityName: s.cities[club.cityId]!.name,
          countryName: s.countries[club.countryId]!.name,
          leagueName: s.leagues[club.leagueId]!.name,
        },
        reason,
        positionalAverage: avg,
      }));
  }

  // ── Scouting queries ──

  getScout(): ScoutView | null {
    const s = this.s;
    const sc = s.scout;
    if (!sc) return null;
    const city = s.cities[sc.location]!;
    return {
      name: sc.name,
      background: sc.background,
      backgroundLabel: BACKGROUNDS[sc.background].label,
      difficulty: sc.difficulty,
      money: sc.money,
      location: {
        cityId: city.id,
        cityName: city.name,
        countryId: city.countryId,
        countryName: s.countries[city.countryId]!.name,
        lat: city.lat,
        lon: city.lon,
        isHome: sc.location === sc.homeCity,
        nightly: nightlyCost(s, sc.location),
        clubs: Object.values(s.clubs)
          .filter((c) => c.cityId === city.id)
          .sort((a, b) => a.tier - b.tier)
          .map(badge),
      },
      homeCity: { id: sc.homeCity, name: s.cities[sc.homeCity]!.name },
      homeCountry: { id: sc.homeCountry, name: s.countries[sc.homeCountry]!.name },
      reputation: sc.reputation,
      skills: sc.skills,
      markets: Object.entries(sc.regionKnowledge)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, level]) => ({ countryId: id as CountryId, name: s.countries[id as CountryId]!.name, level })),
      ledger: s.ledger.slice(0, 50),
      poolSize: Object.keys(s.pool).length,
      debt: sc.brokeSince !== undefined ? { since: sc.brokeSince, daysLeft: Math.max(0, BANKRUPTCY_DAYS - (s.date - sc.brokeSince)) } : undefined,
      careerOver: s.careerOver,
      employmentLabel:
        sc.employment.mode === 'fulltime'
          ? `${sc.employment.title} · ${s.clubs[sc.employment.clubId]!.shortName}`
          : `Freelance · ${sc.employment.clients.length}/${clientCapacity(s)} clients`,
      employer: sc.employment.mode === 'fulltime' ? { club: badge(s.clubs[sc.employment.clubId]!), title: sc.employment.title } : undefined,
      unlocked: {
        assistants: isUnlocked(s, 'assistants'),
        mandates: isUnlocked(s, 'mandates'),
        representation: isUnlocked(s, 'representation'),
        agency: isUnlocked(s, 'agency'),
      },
      nextUnlock: nextUnlock(s),
      pendingOffers: s.offers.length,
      pendingMissions: s.missions.filter((m) => m.status === 'offered').length,
      pendingMandates: s.mandates.filter((m) => m.status === 'offered').length,
      idleAssistants: s.assistants.filter((a) => !a.task && a.officeId === undefined).length,
      activeHunts: s.hunts.filter((h) => h.status === 'active').length,
      scenario: (() => {
        const sc = s.scenario;
        const prog = sc && scenarioProgress(s);
        if (!sc || !prog) return undefined;
        const def = SCENARIOS[sc.id];
        return { name: def.name, goal: def.goal, deadline: sc.deadline, daysLeft: Math.max(0, sc.deadline - s.date), status: sc.status, label: prog.label, fraction: prog.fraction };
      })(),
      goals: (() => {
        const mine = s.objectives.filter((o) => o.season === s.season.year);
        return { done: mine.filter((o) => o.status === 'done').length, total: mine.length };
      })(),
      unreadInbox: s.inboxSeenId === undefined ? 0 : s.news.filter((n) => n.id >= s.inboxSeenId! && isInbox(n)).length,
      rivalThreats: s.rivals.filter(
        (r) => r.pursuit?.rumoured && (s.pool[r.pursuit.playerId] || s.deals.some((d) => d.stage === 'negotiating' && d.playerId === r.pursuit!.playerId)),
      ).length,
    };
  }

  getSearches(): SearchSummary[] {
    return this.s.searches.map((r) => searchSummary(r));
  }

  getSearch(id: number): SearchView | null {
    const r = this.s.searches.find((x) => x.id === id);
    if (!r) return null;
    const rows = r.results.map((pid) => this.s.players[pid]).filter((p): p is Player => !!p);
    const club = r.filters.forClub ? this.s.clubs[r.filters.forClub] : undefined;
    return {
      ...searchSummary(r),
      forClub: club && { id: club.id, name: club.name },
      results: rows.map((p) => {
        // Shown at the position the search judged him at, so the rating matches what was searched for.
        const as = r.judgedAs?.[p.id];
        const base = this.playerRow(p);
        const range = as ? fog(this.s, p).positions[as] : undefined;
        const row = range && as ? { ...base, position: as, ovr: estimate(range), ovrRange: range } : base;
        if (!club || p.clubId === club.id) return row;
        const ask = brokeredWage(this.s, p, club);
        return { ...row, ask, wageFits: canAfford(this.s, club, usd(0), ask).ok };
      }),
    };
  }

  getPool(): (PlayerRow & { addedOn: number; starred: boolean; report?: { by: string; rating: number } })[] {
    const s = this.s;
    return Object.entries(s.pool)
      .map(([id, entry]) => ({ p: s.players[id as PlayerId], entry }))
      .filter((x): x is { p: Player; entry: (typeof s.pool)[PlayerId] } => !!x.p)
      .map(({ p, entry }) => ({
        ...this.playerRow(p),
        addedOn: entry.addedOn,
        starred: entry.starred,
        report: entry.report && { by: entry.report.by, rating: entry.report.rating },
      }));
  }

  /** Who you can put forward: your pool, plus players you are selling for a client or representing (pool or not). */
  getRecommendCandidates(): (PlayerRow & { addedOn: number; starred: boolean; tag?: 'sale' | 'represented'; saleFor?: string; fee: USD })[] {
    const s = this.s;
    const rows = new Map(
      this.getPool().map((r) => [r.id, { ...r } as PlayerRow & { addedOn: number; starred: boolean; tag?: 'sale' | 'represented'; saleFor?: string }]),
    );
    const add = (id: PlayerId, tag: 'sale' | 'represented', saleFor?: string) => {
      const p = s.players[id];
      if (!p) return;
      const row = rows.get(id) ?? { ...this.playerRow(p), addedOn: s.date, starred: false };
      rows.set(id, { ...row, tag, saleFor });
    };
    for (const id of s.scout?.represented ?? []) add(id, 'represented');
    for (const m of s.mandates) if (m.status === 'active') add(m.playerId, 'sale', s.clubs[m.clubId]?.name);
    // The fee a buying club would pay today (what mission briefs are checked against), not just market value.
    return [...rows.values()].map((r) => {
      const mandate = s.mandates.find((m) => m.status === 'active' && m.playerId === r.id);
      return { ...r, fee: pitchFee(s, s.players[r.id]!, mandate?.askingFee) };
    });
  }

  getLocationTree(): LocationTree {
    const s = this.s;
    return {
      continents: Object.values(s.continents).map((cont) => ({
        id: cont.id,
        name: cont.name,
        countries: Object.values(s.countries)
          .filter((c) => c.continentId === cont.id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => ({
            id: c.id,
            name: c.name,
            leagues: c.leagueIds.map((lid) => ({ id: lid, name: s.leagues[lid]!.name, level: s.leagues[lid]!.level })),
            regions: c.regionIds.map((rid) => {
              const r = s.regions[rid]!;
              return { id: r.id, name: r.name, cities: r.cityIds.map((cid) => ({ id: cid, name: s.cities[cid]!.name })) };
            }),
          })),
      })),
    };
  }

  // ── Queries ──

  getClock(): Clock {
    const s = this.s;
    const { start, end } = seasonWindow(s.season.year);
    return {
      date: s.deadline?.date ?? s.date, // deadline day shows its own date while it is played
      seasonYear: s.season.year,
      seasonLabel: seasonLabel(s.season.year),
      phase: s.date < start ? 'pre-season' : s.date <= end ? 'season' : 'off-season',
      transferWindow: isTransferWindow(s.date) || !!s.deadline,
      nextMatchDate: nextMatchDate(s),
      deadlineHour: s.deadline?.hour,
      pendingReview: s.pendingReview,
    };
  }

  /** Inbox: your messages (career, money, news about your players). News: everything else. */
  getNews(box: 'inbox' | 'news' = 'news', limit = 150): NewsItem[] {
    return this.s.news.filter((n) => isInbox(n) === (box === 'inbox')).slice(0, limit);
  }

  /** Marks the inbox read; returns the previous marker so the screen can highlight what was new. */
  markInboxRead(): number {
    const s = this.s;
    const before = s.inboxSeenId ?? s.counters.news;
    s.inboxSeenId = s.counters.news;
    return before;
  }

  getWorldSummary(): WorldSummary {
    const s = this.s;
    const cityClubs = new Map<string, Club[]>();
    for (const c of Object.values(s.clubs)) cityClubs.set(c.cityId, [...(cityClubs.get(c.cityId) ?? []), c]);
    return {
      seed: s.seed,
      date: s.date,
      continents: Object.values(s.continents),
      countries: Object.values(s.countries).map((c) => this.countrySummary(c.id)),
      clubCities: [...cityClubs.entries()].map(([cityId, clubs]) => {
        const city = s.cities[cityId as keyof GameState['cities']]!;
        return {
          id: city.id,
          name: city.name,
          countryId: city.countryId,
          lat: city.lat,
          lon: city.lon,
          clubs: clubs.length,
          bestTier: Math.min(...clubs.map((c) => c.tier)) as Club['tier'],
        };
      }),
      totals: {
        clubs: Object.keys(s.clubs).length,
        players: Object.keys(s.players).length,
        freeAgents: s.freeAgents.length,
        leagues: Object.keys(s.leagues).length,
      },
    };
  }

  private countrySummary(id: CountryId): CountrySummary {
    const s = this.s;
    const c = s.countries[id]!;
    const clubs = c.leagueIds.flatMap((l) => s.leagues[l]!.clubIds.map((cid) => s.clubs[cid]!));
    const top = clubs.reduce<Club | undefined>((best, cl) => (!best || cl.reputation > best.reputation ? cl : best), undefined);
    return {
      id: c.id,
      name: c.name,
      mapId: c.mapId,
      continentId: c.continentId,
      strength: c.strength,
      wealthIndex: c.wealthIndex,
      culture: c.culture,
      leagueCount: c.leagueIds.length,
      clubCount: clubs.length,
      playerCount: clubs.reduce((n, cl) => n + cl.squad.length, 0),
      topClub: top && badge(top),
    };
  }

  getCountry(id: CountryId): CountryView {
    const s = this.s;
    const c = s.countries[id]!;
    const clubsInCity = new Map<string, number>();
    for (const cl of Object.values(s.clubs)) if (cl.countryId === id) clubsInCity.set(cl.cityId, (clubsInCity.get(cl.cityId) ?? 0) + 1);
    return {
      ...this.countrySummary(id),
      continentName: s.continents[c.continentId]!.name,
      costIndex: c.costIndex,
      regions: c.regionIds.map((rid) => {
        const r = s.regions[rid]!;
        return {
          name: r.name,
          cities: r.cityIds.map((cid) => {
            const ci = s.cities[cid]!;
            return { id: ci.id, name: ci.name, lat: ci.lat, lon: ci.lon, clubs: clubsInCity.get(cid) ?? 0 };
          }),
        };
      }),
      leagues: c.leagueIds.map((lid, idx) => this.leagueView(lid, idx, c.leagueIds.length)),
      freeAgents: s.freeAgents.filter((pid) => s.players[pid]!.nationality === id).length,
    };
  }

  private leagueView(lid: LeagueId, idx: number, levels: number): LeagueView {
    const s = this.s;
    const l = s.leagues[lid]!;
    const fixtures = s.fixtures[lid] ?? [];
    const played = fixtures.filter((f) => f.result);
    return {
      id: l.id,
      name: l.name,
      level: l.level,
      clubs: l.clubIds.map((cid) => this.clubRow(s.clubs[cid]!)).sort((a, b) => b.xiOvr - a.xiOvr),
      table: this.table(lid),
      rounds: fixtures.reduce((m, f) => Math.max(m, f.round), 0),
      currentRound: played.reduce((m, f) => Math.max(m, f.round), 0) || 1,
      promotionSpots: promotionSpots(l.clubIds.length),
      hasPromotion: idx > 0,
      hasRelegation: idx < levels - 1,
    };
  }

  private table(lid: LeagueId): TableRowView[] {
    return leagueTable(this.s, lid).map((r, i) => ({ ...r, position: i + 1, club: badge(this.s.clubs[r.clubId]!) }));
  }

  getRound(leagueId: LeagueId, round: number): FixtureView[] {
    return (this.s.fixtures[leagueId] ?? []).filter((f) => f.round === round).map((f) => this.fixtureView(f));
  }

  /** Latest round of the biggest top flights, for the inbox. */
  getFeaturedResults(count = 6): FeaturedLeague[] {
    const s = this.s;
    return Object.values(s.countries)
      .sort((a, b) => b.strength - a.strength || b.wealthIndex - a.wealthIndex)
      .slice(0, count)
      .map((c) => {
        const lid = c.leagueIds[0]!;
        const played = (s.fixtures[lid] ?? []).filter((f) => f.result);
        const round = played.reduce((m, f) => Math.max(m, f.round), 0);
        return {
          leagueId: lid,
          leagueName: s.leagues[lid]!.name,
          countryId: c.id,
          countryName: c.name,
          round,
          fixtures: round ? this.getRound(lid, round) : [],
        };
      });
  }

  private fixtureView(f: Fixture): FixtureView {
    const s = this.s;
    const name = (id?: PlayerId) => {
      const p = id ? s.players[id] : undefined;
      return p ? `${p.firstName[0]}. ${p.lastName}` : 'Unknown';
    };
    return {
      id: f.id,
      round: f.round,
      date: f.date,
      leagueName: s.leagues[f.leagueId]!.name,
      home: badge(s.clubs[f.homeId]!),
      away: badge(s.clubs[f.awayId]!),
      result: f.result && {
        homeGoals: f.result.homeGoals,
        awayGoals: f.result.awayGoals,
        attendance: f.result.attendance,
        goals: f.result.goals.map((g) => ({
          minute: g.minute,
          clubId: g.clubId,
          ownGoal: g.ownGoal,
          name: g.ownGoal ? 'Own goal' : name(g.scorerId),
          assist: g.assistId ? name(g.assistId) : undefined,
        })),
        motm: f.result.motmId ? name(f.result.motmId) : undefined,
      },
    };
  }

  private squadOf(club: Club): Player[] {
    return club.squad.map((id) => this.s.players[id]!);
  }

  private clubRow(club: Club): ClubRow {
    const squad = this.squadOf(club);
    const xi = bestXI(club.formation, squad);
    return {
      ...badge(club),
      cityName: this.s.cities[club.cityId]!.name,
      reputation: club.reputation,
      formation: club.formation,
      xiOvr: Math.round(xi.reduce((n, x) => n + x.ovr, 0) / xi.length),
      squadValue: usd(squad.reduce((n, p) => n + p.value, 0)),
      transferBudget: club.transferBudget,
    };
  }

  getClub(id: ClubId): ClubView {
    const s = this.s;
    const club = s.clubs[id]!;
    const squad = this.squadOf(club);
    const city = s.cities[club.cityId]!;
    const country = s.countries[club.countryId]!;
    const league = s.leagues[club.leagueId]!;
    const available = squad.filter((p) => !p.injury || p.injury.until <= s.date);
    const lineup = bestXI(club.formation, available).map((slot) => {
      const p = slot.playerId ? s.players[slot.playerId] : undefined;
      const range = p ? fog(s, p).positions[slot.position] : undefined;
      return {
        ...slot,
        ovr: range ? estimate(range) : 0,
        ovrRange: range,
        name: p ? `${p.firstName[0]}. ${p.lastName}` : undefined,
        portraitSeed: p?.portraitSeed,
      };
    });
    const position = leagueTable(s, league.id).findIndex((r) => r.clubId === id) + 1;
    return {
      ...badge(club),
      city: { id: city.id, name: city.name, lat: city.lat, lon: city.lon },
      country: { id: country.id, name: country.name, wealthIndex: country.wealthIndex },
      league: { id: league.id, name: league.name, level: league.level },
      reputation: club.reputation,
      founded: club.founded,
      stadium: club.stadium,
      capacity: club.capacity,
      transferBudget: club.transferBudget,
      wageBudget: club.wageBudget,
      wageBill: usd(squad.reduce((n, p) => n + p.wage, 0)),
      squadValue: usd(squad.reduce((n, p) => n + p.value, 0)),
      averageAge: Math.round((squad.reduce((n, p) => n + ageOn(p.birthDate, s.date), 0) / squad.length) * 10) / 10,
      formation: club.formation,
      acceptsProspects: club.acceptsProspects,
      lineup,
      needs: squadNeeds(club.formation, squad),
      squad: squad.map((p) => this.playerRow(p, club)).sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || b.ovr - a.ovr),
      coach: this.official(s.officials[club.headCoachId]!),
      leaguePosition: position || undefined,
      fixtures: (s.fixtures[league.id] ?? []).filter((f) => f.homeId === id || f.awayId === id).map((f) => this.fixtureView(f)),
      history: [...club.history]
        .reverse()
        .map((h) => ({ season: seasonLabel(h.season), leagueName: s.leagues[h.leagueId]?.name ?? '—', position: h.position, points: h.points })),
      work: s.scout ? this.clubWork(club.id) : null,
    };
  }

  private clubWork(clubId: ClubId): ClubWorkView {
    const s = this.s;
    const e = s.scout!.employment;
    const status = e.mode === 'fulltime' ? (e.clubId === clubId ? 'employer' : 'none') : e.clients.includes(clubId) ? 'client' : 'none';
    const check = agreementCheck(s, clubId);
    return { status, trust: clubTrust(s, clubId), canPropose: check.ok, proposeReason: check.reason, signings: clubRecord(s.scout!, clubId).signings };
  }

  private official(o: ClubOfficial): OfficialView {
    return {
      id: o.id,
      role: o.role,
      firstName: o.firstName,
      lastName: o.lastName,
      age: o.age,
      priorities: o.priorities,
      stubbornness: o.stubbornness,
      portraitSeed: o.portraitSeed,
      nationality: this.s.countries[o.nationality]!.name,
      meeting: this.s.scout ? this.meetingView({ kind: 'official', id: o.id }) : null,
    };
  }

  private meetingView(target: MeetTarget): MeetingView {
    const s = this.s;
    const m = meetingInfo(s, target);
    return {
      role: m.role,
      level: m.level,
      label: relationshipLabel(m.level),
      cost: m.cost,
      city: m.city ? { id: m.city, name: s.cities[m.city]!.name } : undefined,
      countryName: s.countries[m.country]!.name,
      inPlace: m.inPlace,
      requiredReputation: m.requiredReputation,
      allowed: m.allowed,
      recentlyMet: m.recentlyMet,
      colleague: m.colleague,
      firstMeeting: m.firstMeeting,
      metToday: metToday(s, target.id),
    };
  }

  private liveView(p: Player): LiveView | null {
    const s = this.s;
    const opt = nextLiveOption(s, p);
    if (!opt) return null;
    const home = opt.fixture.homeId === p.clubId;
    const opponent = s.clubs[home ? opt.fixture.awayId : opt.fixture.homeId]!;
    return {
      date: opt.fixture.date,
      opponent: badge(opponent),
      home,
      venue: { id: opt.venue, name: s.cities[opt.venue]!.name },
      daysAway: opt.daysAway,
      ticket: opt.ticket,
      inPlace: s.scout?.location === opt.venue,
    };
  }

  private playerRow(p: Player, club?: Club): PlayerRow {
    const nat = this.s.countries[p.nationality]!;
    const f = fog(this.s, p);
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      age: ageOn(p.birthDate, this.s.date),
      nationality: { id: nat.id, name: nat.name },
      position: p.naturalPosition,
      ovr: estimate(f.ovr),
      ovrRange: f.ovr,
      knowledge: f.level,
      potential: f.potential,
      prodigy: f.prodigy,
      inPool: !!this.s.pool[p.id],
      value: p.value,
      wage: p.wage,
      expectedWage: p.clubId ? undefined : freeAgentWage(this.s, p),
      contractUntil: p.contractUntil,
      portraitSeed: p.portraitSeed,
      isCaptain: (club ?? (p.clubId ? this.s.clubs[p.clubId] : undefined))?.captainId === p.id,
      stats: statLine(p.stats),
      injury: p.injury && p.injury.until > this.s.date ? p.injury.description : undefined,
      club: p.clubId ? badge(this.s.clubs[p.clubId]!) : undefined,
      openDeal: this.openDeal(p.id),
    };
  }

  /** Your negotiating or agreed deal for this player (newest first). */
  private openDeal(id: PlayerId): PlayerRow['openDeal'] {
    const d = this.s.deals.find((x) => x.playerId === id && (x.stage === 'negotiating' || x.stage === 'agreed'));
    return d ? { club: this.s.clubs[d.clubId]?.name ?? 'a club', stage: d.stage as 'negotiating' | 'agreed' } : undefined;
  }

  getPlayer(id: PlayerId): PlayerView | null {
    const s = this.s;
    const p = s.players[id];
    if (!p) return null; // retired
    const club = p.clubId ? s.clubs[p.clubId] : undefined;
    const nat = s.countries[p.nationality]!;
    const f = fog(s, p);
    const canVideo = !!s.scout && f.level < VIDEO_KNOWLEDGE_CAP;
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      age: ageOn(p.birthDate, s.date),
      birthDate: p.birthDate,
      nationality: { id: nat.id, name: nat.name },
      heightCm: p.heightCm,
      foot: p.foot,
      naturalPosition: p.naturalPosition,
      ovr: estimate(f.ovr),
      ovrRange: f.ovr,
      positionRatings: POSITIONS.map((pos) => ({ position: pos, ovr: f.positions[pos], familiarity: p.positions[pos] ?? 0 })),
      attributes: f.attributes,
      knowledge: f.level,
      potential: f.potential,
      prodigy: f.prodigy,
      traits: f.traits,
      inPool: !!s.pool[p.id],
      starred: !!s.pool[p.id]?.starred,
      video: { cost: videoCost(s, p), gain: s.scout ? Math.min(videoGain(s), VIDEO_KNOWLEDGE_CAP - f.level) : 0, available: canVideo },
      meeting: s.scout ? this.meetingView({ kind: 'player', id: p.id }) : null,
      live: s.scout ? this.liveView(p) : null,
      rivalInterest: this.rivalInterest(p.id),
      assistantReport: s.pool[p.id]?.report && { by: s.pool[p.id]!.report!.by, rating: s.pool[p.id]!.report!.rating, date: s.pool[p.id]!.report!.date },
      representation: this.representationView(p),
      mandate: this.mandateBadge(p),
      value: p.value,
      wage: p.wage,
      contractUntil: p.contractUntil,
      club: club && { ...badge(club), leagueName: s.leagues[club.leagueId]!.name, countryName: s.countries[club.countryId]!.name },
      isFreeAgent: !club,
      portraitSeed: p.portraitSeed,
      isCaptain: club?.captainId === p.id,
      stats: {
        ...statLine(p.stats),
        starts: p.stats.starts,
        minutes: p.stats.minutes,
        tackles: p.stats.tackles,
        cleanSheets: p.stats.cleanSheets,
        captaincies: p.stats.captaincies,
        motm: p.stats.motm,
      },
      history: [...p.history].reverse().map((h) => ({
        ...statLine(h),
        season: seasonLabel(h.season),
        club: h.clubId && s.clubs[h.clubId] ? badge(s.clubs[h.clubId]!) : undefined,
      })),
      injury: p.injury && p.injury.until > s.date ? p.injury : undefined,
    };
  }

  getFreeAgents(countryId: CountryId): PlayerRow[] {
    return this.s.freeAgents
      .map((pid) => this.s.players[pid]!)
      .filter((p) => p.nationality === countryId)
      .map((p) => this.playerRow(p))
      .sort((a, b) => b.ovr - a.ovr);
  }
}

function searchSummary(r: SearchRecord): SearchSummary {
  return {
    id: r.id,
    label: r.label,
    startedOn: r.startedOn,
    completedOn: r.completedOn,
    cost: r.cost,
    days: r.days,
    matched: r.matched,
    resultCount: r.results.length,
    alreadyInPool: r.alreadyInPool ?? 0,
    filters: r.filters,
  };
}

function statLine(st: SeasonStats): StatLine {
  return { apps: st.apps, goals: st.goals, assists: st.assists, avgRating: st.apps ? Math.round((st.ratingSum / st.apps) * 100) / 100 : undefined };
}

function badge(c: Club): ClubBadge {
  return { id: c.id, name: c.name, shortName: c.shortName, tier: c.tier, colors: c.colors, crest: c.crest, kit: c.kit };
}

export type EngineApi = Engine;
