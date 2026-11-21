import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { CityId, ClubId, CountryId, PlayerId, LeagueId } from '../../engine/core/ids';
import type { CareerSetup, SearchFilters } from '../../engine/model/scout';
import type { LiveResult, MeetTarget, MeetingResult } from '../../engine/systems/fieldwork';
import type { AdvanceSummary, AttendedMatchView, Clock, DealEventView, DiscoveryView, DealView, ScoutView, SearchView, TrophyView, WorldSummary } from '../../engine/views';
import type { PitchArgs } from '../../engine/systems/deals';
import type { SaveStatus } from '../../worker/game-host';
import { Comlink, engine } from './engine-client';
import type { AttributeKey, Position } from '../../engine/model/player';
import type { USD } from '../../engine/core/money';

/** A club's brief: the pool picker shows only players who could meet it (until you choose to see everyone). */
export interface RecommendBrief {
  label: string;
  position: Position;
  minOvr: number;
  minAge?: number;
  maxAge?: number;
  maxFee?: USD;
  /** Readable terms for the banner, e.g. "rated 51+". */
  summary: string[];
}
export interface RecommendRequest {
  playerId?: PlayerId;
  clubId?: ClubId;
  brief?: RecommendBrief;
}

export interface SearchPrefill {
  positions?: Position[];
  age?: [number, number];
  maxValue?: number;
  minRating?: number;
  /** Per-position bars (from a club's needs). */
  ratingFloors?: Partial<Record<Position, number>>;
  maxWage?: number;
  attributes?: { attribute: AttributeKey; min: number }[];
  countryId?: CountryId;
  /** The club the search is for: results show what each player would ask it. */
  clubId?: ClubId;
  clubName?: string;
  label?: string;
  /** After the search, go back to the (brief-filtered) pool instead of showing results here. */
  returnTo?: 'pool';
}

/** What a trip is for: a label, and where to pick up on arrival. */
export interface TripPurpose {
  label: string;
  route?: Route;
  /** Reopen the recommend dialog on arrival. */
  recommend?: { playerId?: PlayerId; clubId?: ClubId };
}

/** Player Pool filters, kept while you move around (reset on reload). */
export interface PoolFilters {
  pos: Position | 'all';
  query: string;
  age: [number, number];
  minRating: number;
  maxValue?: number;
  maxWage?: number;
  knowledge: 'any' | 'low' | 'high';
  /** Ageing or stale reads only ('old'), or fresh ones. */
  freshness: 'any' | 'old' | 'fresh';
  starred: boolean;
  assistant: boolean;
  freeAgents: boolean;
  prodigies: boolean;
  /** A mission brief the pool is filtered by, and the search that would expand it. */
  brief?: { label: string; summary: string[]; prefill: SearchPrefill };
}
export const DEFAULT_POOL_FILTERS: PoolFilters = {
  pos: 'all',
  query: '',
  age: [15, 40],
  minRating: 0,
  knowledge: 'any',
  freshness: 'any',
  starred: false,
  assistant: false,
  freeAgents: false,
  prodigies: false,
};

export type Route =
  | { screen: 'inbox' }
  | { screen: 'news' }
  | { screen: 'gazette' }
  | { screen: 'world' }
  | { screen: 'search'; searchId?: number }
  | { screen: 'pool' }
  | { screen: 'deals' }
  | { screen: 'finances' }
  | { screen: 'career' }
  | { screen: 'missions' }
  | { screen: 'rivals' }
  | { screen: 'staff' }
  | { screen: 'deadline' }
  | { screen: 'hunts' }
  | { screen: 'events' }
  | { screen: 'goals' }
  | { screen: 'agency' }
  | { screen: 'matchday'; id: PlayerId }
  | { screen: 'country'; id: CountryId; leagueId?: LeagueId }
  | { screen: 'club'; id: ClubId }
  | { screen: 'player'; id: PlayerId };

interface GameStore {
  status: 'menu' | 'generating' | 'loading' | 'ready';
  progress: { fraction: number; label: string };
  world?: WorldSummary;
  clock?: Clock;
  scout?: ScoutView | null;
  /** Bumps whenever game state changes, so screens refetch. */
  version: number;
  /** Busy with something that moves time (advance, search, video). */
  advancing: boolean;
  save: SaveStatus & { saving: boolean; error?: string };
  route: Route;
  history: Route[];
  newGame: (seed: number, setup: CareerSetup) => Promise<void>;
  createCareer: (setup: CareerSetup) => Promise<void>;
  loadSave: (id: string) => Promise<void>;
  saveNow: () => Promise<void>;
  quitToMenu: () => Promise<void>;
  advance: (mode: 'day' | 'week' | 'matchday' | 'event') => Promise<void>;
  /** Why the last "until something happens" advance stopped. */
  lastStop?: string;
  /** Deadline day: let hours pass, or play on to midnight. */
  passHours: (hours: number) => Promise<void>;
  finishDeadline: () => Promise<void>;
  /** The season review being shown (starting year), if any. */
  reviewOpen?: number;
  openReview: (season: number) => void;
  closeReview: () => Promise<void>;
  runSearch: (filters: SearchFilters) => Promise<SearchView>;
  watchVideo: (playerId: PlayerId) => Promise<{ before: number; after: number; cost: number }>;
  travel: (cityId: CityId) => Promise<void>;
  pitch: (args: PitchArgs) => Promise<DealView>;
  proposeAgreement: (clubId: ClubId) => Promise<{ accepted: boolean; reason: string }>;
  /** Filters to start the next search with (e.g. from a mission brief). */
  searchPrefill?: SearchPrefill;
  searchFor: (prefill: SearchPrefill) => void;
  consumeSearchPrefill: () => SearchPrefill | undefined;
  /** Career actions that don't move time. */
  careerAction: (fn: () => Promise<unknown>) => Promise<void>;
  /** The open recommend dialog (player and/or club preselected, optionally a mission brief to filter the pool by). */
  recommend?: RecommendRequest;
  openRecommend: (r: RecommendRequest) => void;
  closeRecommend: () => void;
  /** Completed signings waiting for their "Here we go" reveal. */
  reveals: DealEventView[];
  dismissReveal: () => void;
  /** Prodigies just revealed by your scouting, waiting for their reveal. */
  discoveries: DiscoveryView[];
  dismissDiscovery: () => void;
  /** Trophies just won, waiting for their reveal. */
  trophies: TrophyView[];
  dismissTrophy: () => void;
  scoutLive: (playerId: PlayerId) => Promise<LiveResult>;
  meet: (target: MeetTarget) => Promise<MeetingResult>;
  /** Attend a player's next match in person, watching up to three players closely. */
  attendMatch: (playerId: PlayerId, focus: PlayerId[]) => Promise<AttendedMatchView>;
  /** Work a wonderkid hunt's trail (takes days). */
  huntAction: (huntId: number, method: 'calls' | 'visit') => Promise<{ success: boolean; text: string }>;
  /** Attend a scouting event for its remaining days. */
  attendEvent: (id: number) => Promise<void>;
  /** Destination of the open travel planner, if any. */
  travelTarget?: CityId;
  poolFilters: PoolFilters;
  setPoolFilters: (f: Partial<PoolFilters>) => void;
  /** Players the last brief search added, highlighted in the pool. */
  poolAdded?: { ids: PlayerId[]; label: string };
  setPoolAdded: (a?: { ids: PlayerId[]; label: string }) => void;
  /** Why the planned trip is being made (set when opening the planner). */
  travelPurpose?: TripPurpose;
  /** The reason for your latest trip, shown in the top bar while you are there. */
  trip?: TripPurpose & { cityId: CityId };
  openTravel: (cityId: CityId, purpose?: TripPurpose) => void;
  closeTravel: () => void;
  /** Re-read scout + bump version after a state change that doesn't move time (pool edits). */
  touch: () => Promise<void>;
  navigate: (route: Route) => void;
  back: () => void;
}

/** Ask the browser not to evict our saves under storage pressure (best effort). */
function requestPersistentStorage() {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong while saving.');

export const useGame = create<GameStore>((set, get) => {
  /** Shared bookkeeping after anything that moves game time. */
  async function afterAdvance(summary: AdvanceSummary) {
    const [world, scout, found, won] = await Promise.all([
      summary.seasonRolledOver ? engine.getWorldSummary() : Promise.resolve(get().world),
      engine.getScout(),
      engine.takeDiscoveries(),
      engine.takeTrophies(),
    ]);
    const done = summary.dealEvents.filter((e) => e.kind === 'completed');
    const before = get().clock;
    // Deadline day opens its own screen; a new season review opens itself.
    if (summary.clock.deadlineHour !== undefined && before?.deadlineHour === undefined) get().navigate({ screen: 'deadline' });
    if (summary.clock.deadlineHour === undefined && get().route.screen === 'deadline') get().navigate({ screen: 'deals' });
    const review = summary.clock.pendingReview !== undefined && summary.clock.pendingReview !== before?.pendingReview ? summary.clock.pendingReview : undefined;
    set((s) => ({
      lastStop: summary.stoppedFor,
      reviewOpen: review ?? s.reviewOpen,
      clock: summary.clock,
      world,
      scout,
      version: s.version + 1,
      save: { ...s.save, dirty: true },
      reveals: [...s.reveals, ...done],
      discoveries: [...s.discoveries, ...found],
      trophies: [...s.trophies, ...won],
    }));
  }

  /** Autosave in the background once a week of game time has passed. */
  async function autosave() {
    const { clock, save } = get();
    if (!clock || (save.savedGameDate !== undefined && clock.date - save.savedGameDate < 7)) return;
    set((s) => ({ save: { ...s.save, saving: true } }));
    try {
      await engine.autosaveIfDue();
      set({ save: { ...(await engine.getSaveStatus()), saving: false } });
    } catch (e) {
      set((s) => ({ save: { ...s.save, saving: false, error: errorText(e) } }));
    }
  }

  /** Runs a time-moving action with the busy flag, bookkeeping and autosave. */
  async function timed<T extends { advance?: AdvanceSummary }>(fn: () => Promise<T>, pick: (r: T) => AdvanceSummary): Promise<T> {
    if (get().advancing) throw new Error('Busy');
    set({ advancing: true });
    let result: T;
    try {
      result = await fn();
      await afterAdvance(pick(result));
    } finally {
      set({ advancing: false });
    }
    void autosave();
    return result;
  }

  async function enterGame(world: WorldSummary) {
    const [clock, status, scout] = await Promise.all([engine.getClock(), engine.getSaveStatus(), engine.getScout()]);
    set({
      status: 'ready',
      world,
      clock,
      scout,
      route: { screen: 'world' },
      history: [],
      version: 0,
      save: { ...status, saving: false },
    });
  }

  return {
    status: 'menu',
    progress: { fraction: 0, label: '' },
    version: 0,
    advancing: false,
    save: { dirty: false, saving: false },
    route: { screen: 'world' },
    history: [],
    reveals: [],
    discoveries: [],
    trophies: [],
    poolFilters: DEFAULT_POOL_FILTERS,

    async newGame(seed, setup) {
      set({ status: 'generating', progress: { fraction: 0, label: 'Drawing the map' } });
      requestPersistentStorage();
      try {
        const world = await engine.newGame(
          seed,
          setup,
          Comlink.proxy((fraction: number, label: string) => set({ progress: { fraction, label } })),
        );
        await enterGame(world);
      } catch (e) {
        set({ status: 'menu' });
        throw e;
      }
    },

    async createCareer(setup) {
      const scout = await engine.createCareer(setup);
      set((s) => ({ scout, version: s.version + 1, save: { ...s.save, dirty: true } }));
      await get().saveNow();
    },

    async loadSave(id) {
      set({ status: 'loading', progress: { fraction: 0.5, label: 'Opening your save' } });
      try {
        await enterGame(await engine.loadSave(id));
      } catch (e) {
        set({ status: 'menu' });
        throw e;
      }
    },

    async saveNow() {
      if (get().save.saving || get().status !== 'ready') return;
      set((s) => ({ save: { ...s.save, saving: true, error: undefined } }));
      try {
        await engine.save();
        set({ save: { ...(await engine.getSaveStatus()), saving: false } });
      } catch (e) {
        set((s) => ({ save: { ...s.save, saving: false, error: errorText(e) } }));
      }
    },

    async quitToMenu() {
      if (get().save.dirty) await get().saveNow();
      if (get().save.error) return; // keep the player in-game rather than lose progress
      await engine.closeGame();
      set({
        status: 'menu',
        world: undefined,
        clock: undefined,
        scout: undefined,
        route: { screen: 'world' },
        history: [],
        save: { dirty: false, saving: false },
      });
    },

    async advance(mode) {
      if (get().advancing) return;
      await timed(
        async () => ({
          advance:
            mode === 'matchday'
              ? await engine.advanceToNextMatchday()
              : mode === 'event'
                ? await engine.advanceUntilEvent()
                : await engine.advance(mode === 'day' ? 1 : 7),
        }),
        (r) => r.advance,
      );
    },

    async passHours(hours) {
      if (get().advancing) return;
      await timed(
        async () => ({ advance: await engine.passDeadlineHours(hours) }),
        (r) => r.advance,
      );
    },

    async finishDeadline() {
      if (get().advancing) return;
      await timed(
        async () => ({ advance: await engine.finishDeadline() }),
        (r) => r.advance,
      );
    },

    openReview(season) {
      set({ reviewOpen: season });
    },

    async closeReview() {
      set({ reviewOpen: undefined });
      if (get().clock?.pendingReview !== undefined) {
        await engine.dismissSeasonReview();
        set({ clock: await engine.getClock() });
      }
    },

    async runSearch(filters) {
      const r = await timed(
        () => engine.runSearch(filters),
        (x) => x.advance,
      );
      // Searches cost real money: save straight away so a reload never loses one.
      void get().saveNow();
      return r.search;
    },

    async watchVideo(playerId) {
      return timed(
        () => engine.watchVideo(playerId),
        (x) => x.advance,
      );
    },

    async travel(cityId) {
      await timed(
        () => engine.travel(cityId),
        (x) => x.advance,
      );
      // Pick up where you left off: reopen the pitch, or go back to the page you planned the trip from.
      const purpose = get().travelPurpose;
      set({ trip: purpose && { ...purpose, cityId } });
      if (purpose?.recommend) set({ recommend: purpose.recommend });
      else if (purpose?.route) get().navigate(purpose.route);
      void get().saveNow();
    },

    async scoutLive(playerId) {
      const r = await timed(
        () => engine.scoutLive(playerId),
        (x) => x.advance,
      );
      return r.result;
    },

    async meet(target) {
      const r = await timed(
        () => engine.meet(target),
        (x) => x.advance,
      );
      return r.result;
    },

    async attendMatch(playerId, focus) {
      const r = await timed(
        () => engine.attendMatch(playerId, focus),
        (x) => x.advance,
      );
      return r.match;
    },

    async attendEvent(id) {
      await timed(
        () => engine.attendEvent(id),
        (x) => x.advance,
      );
      void get().saveNow();
    },

    async huntAction(huntId, method) {
      const r = await timed(
        () => engine.huntAction(huntId, method),
        (x) => x.advance,
      );
      return r.result;
    },

    async pitch(args) {
      const r = await timed(
        () => engine.pitch(args),
        (x) => x.advance,
      );
      void get().saveNow();
      return r.deal;
    },

    async proposeAgreement(clubId) {
      const r = await timed(
        () => engine.proposeAgreement(clubId),
        (x) => x.advance,
      );
      void get().saveNow();
      return { accepted: r.accepted, reason: r.reason };
    },

    async careerAction(fn) {
      await fn();
      await get().touch();
      void get().saveNow();
    },

    searchFor(prefill) {
      set({ searchPrefill: prefill });
      get().navigate({ screen: 'search' });
    },

    consumeSearchPrefill() {
      const p = get().searchPrefill;
      if (p) set({ searchPrefill: undefined });
      return p;
    },

    openRecommend(r) {
      set({ recommend: r });
    },

    closeRecommend() {
      set({ recommend: undefined });
    },

    setPoolAdded(a) {
      set({ poolAdded: a });
    },

    setPoolFilters(f) {
      set((s) => ({ poolFilters: f.pos === undefined && Object.keys(f).length === 0 ? DEFAULT_POOL_FILTERS : { ...s.poolFilters, ...f } }));
    },

    dismissDiscovery() {
      set((s) => ({ discoveries: s.discoveries.slice(1) }));
    },

    dismissTrophy() {
      set((s) => ({ trophies: s.trophies.slice(1) }));
    },

    dismissReveal() {
      set((s) => ({ reveals: s.reveals.slice(1) }));
    },

    openTravel(cityId, purpose) {
      set({ travelTarget: cityId, travelPurpose: purpose });
    },

    closeTravel() {
      set({ travelTarget: undefined, travelPurpose: undefined });
    },

    async touch() {
      const scout = await engine.getScout();
      set((s) => ({ scout, version: s.version + 1, save: { ...s.save, dirty: true } }));
    },

    navigate(route) {
      set({ history: [...get().history, get().route], route });
    },

    back() {
      const history = [...get().history];
      const prev = history.pop();
      if (prev) set({ route: prev, history });
    },
  };
});

/**
 * Fetch a view model from the engine. Refetches when deps change and whenever
 * game state changes. Returns undefined while loading.
 */
export function useEngineQuery<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const version = useGame((s) => s.version);
  const [data, setData] = useState<T>();
  useEffect(() => {
    let alive = true;
    fn().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [...deps, version]);
  return data;
}
