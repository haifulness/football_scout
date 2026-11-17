# Football Scout: Architecture

> Companion to PLAN.md. Target: runs locally in a browser on macOS (Apple Silicon). No backend.

## 1. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript (strict)** | Game rules are complex, so types catch logic errors early |
| Build/dev | **Vite** | Instant dev server, simple static build. Runs with `npm run dev` |
| UI | **React 19** | Lots of table- and form-heavy screens, and a mature ecosystem |
| Styling | **Tailwind CSS v4** + a small set of in-house components (`ui/components/ui.tsx`) | Fast iteration on dense data UIs. Theme tokens live in `ui/theme/index.css` |
| Charts | Hand-written SVG (finances, season review, scoring bars) | A few small charts don't need a library. Colours were checked with a palette validator |
| Animation | **Motion** | Layout transitions, count-ups, reveal cards, map pins. Every animation checks `useReducedMotion()` |
| World map | **d3-geo** + **world-atlas** TopoJSON, rendered to SVG | Real country borders, flight arcs, placement pins |
| Portraits, crests, kits | In-house procedural SVG (`ui/visuals/`) | Unique and deterministic per seed. Nothing is stored as an image |
| Fonts | Self-hosted Inter (UI) + Barlow Condensed (numbers, headings) | Broadcast feel, works offline |
| UI state | **Zustand** | Lightweight, works well with an external engine |
| Persistence | **IndexedDB via Dexie** | Saves (~5 MB compressed) are far beyond the localStorage limit |
| Heavy compute | **Web Worker** + **Comlink** | Day, week and season simulation stays off the UI thread |
| RNG | Seeded mulberry32 (`engine/core/rng.ts`) with labelled sub-streams | Reproducible worlds, deterministic tests |
| Tests | **Vitest** (+ `fake-indexeddb` for persistence) | Engine and host tests. No UI tests yet |
| Format | Prettier | No ESLint yet. `tsc` in strict mode is the main check |

`@tanstack/react-virtual` is installed but not used yet: tables render plain rows, since the pool and search results are capped.

**Running it:** `npm install && npm run dev`, then open `http://localhost:5173`. `npm run build && npm run preview` serves a production build.

## 2. High-Level Design

The key rule: **the game engine is pure TypeScript with no React or DOM imports.** The UI only reads snapshots and sends commands.

```
┌──────────────────────── Main thread ────────────────────────┐
│  React UI (screens, components)                              │
│      │  reads selectors          ▲ state snapshots / events  │
│      ▼                           │                           │
│  Zustand store (UI state + cached view models)               │
│      │  commands (Comlink RPC)   ▲                           │
└──────┼───────────────────────────┼──────────────────────────┘
       ▼                           │
┌──────────────────────── Web Worker ─────────────────────────┐
│  Engine facade  (command handlers)                           │
│      │                                                       │
│      ├─ systems/  (pure functions: state, input, rng → state, events)
│      ├─ world state (normalized entities + indexes)          │
│      └─ persistence adapter (Dexie)                          │
└──────────────────────────────────────────────────────────────┘
```

- **The `Engine` class** (`engine/index.ts`) is the facade. Its methods are views (`getScout`, `getPlayer`, `getGoals`, `getAgency`, `getCareerSummary`, …), which return plain view objects (`engine/views.ts`), and commands (`startSearch`, `travel`, `meet`, `recommend`, `acceptMission`, `hireAssistant`, `foundAgency`, `retire`, …). Commands validate, change the state, and, if they take time, advance the calendar and return an `AdvanceSummary` (clock, deal events, payouts, news, why it stopped).
- **`GameHost`** (`worker/game-host.ts`) extends `Engine` with saves and the hall of fame. The worker exposes it with Comlink, and the UI calls it as `engine.*` (`ui/store/engine-client.ts`).
- **The UI never holds game state.** Screens read with `useEngineQuery(fn, deps)`, which refetches whenever the store's `version` bumps after an action. One-off moments (Here we go, prodigy reveals, trophies) are pulled after each advance from queues the engine keeps in state (`pendingDealEvents`, `pendingDiscoveries`, `pendingTrophies`).
- Every random draw comes from `Rng.derive(seed, label)` with a label per date, fixture or system, so the same seed and the same actions give the same world, however time is chunked.

## 3. Directory Layout

```
football_scout/
├─ PLAN.md  ARCHITECTURE.md  README.md
├─ index.html  package.json  vite.config.ts  vitest.sim.config.ts  tsconfig.json
├─ src/
│  ├─ main.tsx
│  ├─ engine/                      # pure TS, no React or DOM
│  │  ├─ core/                     # rng (mulberry32, derive), ids (branded), money (integer USD), calendar (GameDate, windows)
│  │  ├─ data/                     # geography (countries, regions, cities, strength, wealth), names per culture, formations
│  │  ├─ generation/               # world-generator, player-generator
│  │  ├─ model/                    # types only: geography, club, player, scout, deal, mission, assistant, rival,
│  │  │                            # season, review, hunt, report, goals, agency, scenario, world-state (root GameState)
│  │  ├─ systems/                  # game rules, one module per area
│  │  │  ├─ ratings  squad-needs  standings  fixtures  match-sim  season  development   # football world
│  │  │  ├─ economy  transfers                                                          # money scale, AI market
│  │  │  ├─ scouting  knowledge  fieldwork  travel  matchday  reports                   # finding and judging players
│  │  │  ├─ deals  payouts  employment  missions  market                                # signing, earning, careers
│  │  │  ├─ assistants  rivals  hunts  deadline  review                                 # staff, competition, pacing
│  │  │  └─ goals  agency  career-end  scenarios                                        # late game and endings
│  │  ├─ tick.ts                   # playDay / advanceDays / advanceUntilEvent
│  │  ├─ views.ts                  # view types returned to the UI
│  │  └─ index.ts                  # Engine facade
│  ├─ worker/
│  │  ├─ engine.worker.ts          # hosts GameHost, exposes it with Comlink
│  │  └─ game-host.ts              # Engine + saves, autosave, import/export, hall of fame
│  ├─ persistence/
│  │  ├─ db.ts                     # Dexie schema: saves, snapshots, hall
│  │  └─ save-format.ts            # envelope, gzip, MIGRATIONS
│  └─ ui/
│     ├─ app.tsx                   # shell: sidebar, top bar, banners, routes, overlays
│     ├─ store/                    # game-store (Zustand: route, clock, version, reveal queues), engine-client
│     ├─ screens/                  # start, world, country, club, player, inbox, news, search, pool, deals, deadline,
│     │                            # missions, hunts, matchday, finances, rivals, staff, goals, agency, career
│     ├─ components/               # dialogs, panels and overlays: recommend-dialog, travel-planner, here-we-go,
│     │                            # prodigy-reveal, trophy-reveal, season-review, career-end, legacy, scenario-banner, …
│     ├─ visuals/                  # crest, kit, portrait, world-map (pure functions of seed → SVG)
│     └─ theme/index.css           # design tokens and base styles
└─ tests/
   ├─ engine/                      # Vitest, one file per area (22 files)
   └─ sim/                         # balance harness: bot.ts (scripted freelancer), agency-sim.ts, balance.sim.ts
```

## 4. Domain Model (abridged)

`GameState` (`model/world-state.ts`, schema 16) is **normalized**: `Record<Id, Entity>` maps plus lists. The main parts:

```ts
interface GameState {
  schemaVersion: 16; seed: number; date: GameDate;
  continents, countries, regions, cities;              // geography with coordinates, strength, wealth, cost index
  leagues, clubs, officials, players; freeAgents;      // the football world
  season: { year; ended }; fixtures; news;
  scout?: Scout;                                       // you: money, location, reputation, skills, markets,
                                                       // relationships, rapport, employment, clubRecord, startedOn, startReputation
  knowledge: Record<PlayerId, Knowledge>;              // fog: level 0–100, per-attribute levels from match days
  pool; searches; ledger; ledgerTotals; balanceHistory;
  deals; placements; offers; missions; mandates;       // signing and earning
  rivals; assistants; assistantMarket;                 // other people
  hunts; reports; seasonReviews; deadline?;            // phases 14–17
  objectives; trophies; prodigyFinds;                  // phase 18
  agency?: Agency;                                     // phase 19
  scenario?: ScenarioState;                            // phase 22
  careerOver?: { date; reason; kind?: 'bankrupt' | 'retired' | 'scenario' }; careerId?;
  pendingDealEvents; pendingPayouts; pendingDiscoveries; pendingTrophies?;   // queues for UI moments
  counters: { player; staff; news; search; deal; offer; mission; mandate; assistant; hunt; report; objective; trophy };
}
```

Key entities:
- **Player:** attributes 1–20, position familiarity, hidden potential and traits, `isProdigy`, contract, wage, value, season stats and history. OVR at a position comes from weighted attributes (`systems/ratings.ts`).
- **Club:** tier 1–5, reputation, budgets, formation, squad, Head Coach (`ClubOfficial` with priorities and stubbornness), colours and crest, `acceptsProspects`.
- **Deal → Placement:** a deal moves through `negotiating → agreed → completed` (or `rejected`, `failed`, `hijacked`, `collapsed`). A completed deal becomes a `Placement` that pays a signing bonus and match bonuses until his first contract ends. It records nationality, age and free-agent status for specialties.
- **Money** is the branded integer `USD`, created only through `core/money.ts`. Every ledger entry has a `LedgerKind`, and `ledgerTotals` keeps per-season sums that outlive the 500-line ledger cap.

## 5. Simulation Pipeline (`tick.ts`)

`advanceDays(n)` calls `playDay` once per day, in this order:

```
playDay(date):
  1 July          rolloverSeason: season review → goals closed and awards voted (seasonHonours) → archive stats,
                  promotion/relegation, coaching changes, contracts and releases, retirements, academy intake,
                  squads filled, budgets reset → new season, review baseline, new season goals, fixtures
  1st of month    player development, knowledge decay
  every day       matches: match-sim per fixture → player stats → match bonuses for your placements
  end of May      endSeason: final tables, champions, promotion/relegation news
  window Mondays  aiTransferWeek (AI clubs buy and sell; agency staff may broker some of it)
  with a scout    rivalTick → resolveDeals → updatePlacements → signing bonuses → employmentTick (salary,
                  contracts, offers) → missionTick → marketTick (mandates) → assistantTick (wages, scans) →
                  huntTick → reportTick → objectiveTick → agencyTick (upkeep, rent) → checkSolvency → scenarioTick
  every day       hotel night if you are away from home
```

Commands that "take time" (search, travel, scouting) compute their duration and then call `advanceDays(duration)`, so the world keeps moving while you work. The UI shows a summary of the events that happened in between.

### Systems added after the MVP (phases 14–22)

**Pacing (phase 14):**
- The main time controls (+1d, +1w, Matchday, Play on) pass `stopAtDeadline`: they stop the evening before **deadline day** (31 Aug, 31 Jan) and open it as `state.deadline`. Searches, trips and other actions that take days play straight through it.
- `advanceUntilEvent` ("Play on") plays day by day and stops at the first of: deadline day, a new season, a deal event, a new offer, a new Inbox message, the window opening or closing, a mission or mandate deadline exactly 7 days away. It gives up after 8 weeks. The reason is returned as `stoppedFor`.
- **Deadline day** (`systems/deadline.ts`) runs 09:00 → midnight while the calendar waits on the day before. Each hour: a late market round (`aiTransferWeek` with 1.2% of clubs per hour, fee ×1.15, up to 85% of budget) and, for each of your open negotiations, a 1-in-hours-left chance of being decided now, so all are decided by midnight. Pitches, meetings and trips cost hours. Searches, video, live scouting and agreements are blocked. Players you pitch cost ×1.1 and get +0.4 on the sign-off logit. `finishDeadline` plays the rest of the hours, then the calendar day itself (`lastDeadline` stops it from starting again).
- **Scouting reports** (`systems/reports.ts`): need knowledge ≥ 40. They take no time and cost nothing. A rewrite before the review replaces the open report. Stored: role, rating, potential grade, verdict, knowledge, and the hidden true OVR at the role. Sign-off logit + (0.15 + 0.35 × (knowledge − 40)/60 + (accuracy − 0.5) × 0.8), halved for a different role, clamped −0.4…0.9. The review comes 365 days later: error = min(|rating − OVR then|, |rating − OVR now|). Spot on ≤ 2 (1.0), close ≤ 5 (0.75), off ≤ 9 (0.35), else way off (0). Overrated = rating > max(then, now) + 3, which costs 0.15, and way off + overrated costs −1 reputation. Accuracy = mean over the last 10 checked reports, once 3 are checked. Club trust + round((accuracy − 0.5) × 16). A report on a player who retires before the review is voided. Schema 14.
- **Goals, awards & specialties** (`systems/goals.ts`): three objectives a season, drawn by weight from a pool that fits your standing (placements: clamp(2 + rep/20, 2, 6); tier placements at your best reachable tier, only from tier 4; abroad; prodigy; missions, only with an employer or clients; 3 reports; reputation +8/+6/+4; profit = max(0, last season's net × 1.2), rounded to $5k). Reward round((800 + 120 × rep) × difficulty) to $250, reputation +1 (+2 when difficulty ≥ 1.3), paid the day the progress meets the target (`objectiveTick`). Profit is judged at the rollover. All three earn a Clean sweep trophy. Progress is computed from state (placements, `prodigyFinds`, missions, reports, ledger totals) since the objective's `from` date. Older saves get theirs on their first day back. At the rollover `seasonHonours` runs after `writeSeasonReview`: Scout of the Year (home country: rivals with a club there; world: everyone), points = 0.8 × rep + 5 × season signings + N(0, 4), at least one signing to be in the vote. A win is +2 / +3 reputation. Signing of the Season per league with one of your season's signings: best average rating among players who joined that season, with 10+ apps (+1 reputation if yours). Specialties come from placements (each placement stores nationality, age and free at signing): continent (not your home one), position group (GK, DEF, MID, ATT), youth (≤ 21) and free agent. Specialist at 3 and ≥ 30% of placements, expert at 8. Sign-off logit + 0.15 / 0.25 per matching specialty (max 0.4). Invitations and job offers are weighted ×3 / ×4 for clubs on a specialty continent, and those clubs count as near. Invitations get +0.15 chance with a continent specialty, ×1.5 for youth-friendly clubs with a youth specialty. With a position specialty, missions pick a need in that group half the time. Schema 15.
- **Agency** (`systems/agency.ts`, `state.agency`): founding needs reputation 60, freelance work and $40k (ledger `agency-setup`). The headquarters is the home country (base id 0). Up to 4 offices: setup $15k × cost index (rounded to $500), rent $2,500 × cost index a month, in the country's first city; opening lifts your market knowledge there to at least 50. Capacity: clients max(clientSlots(rep), 2 × (bases + 1)), staff max(staffLimit(rep), 1 + 2 × bases). At a base: hotels are free, searches cost ×0.75 and take 2 days less, and search reach has +15 access. Clubs there count as near for invitations. Upkeep: HQ $600 × home cost index every Monday, rent on the 1st (ledger `agency`). An assistant with `officeId` set can't take field tasks and gains xp at half pace. `aiTransferWeek` (and so each deadline-day hour) calls `agencyOnSignings`: for each signing into a base's country, each staffer there has a 1% + 0.5% × skill chance to have brokered it. The cut is clamp(0.8% × fee, tier floor $12k/7k/4k/2k/1k, $20k), ledger `agency-cut`, one news item per batch. The last 60 deals are kept. Full-time offers stop coming and can't be accepted while you run an agency. Balance (`npm run balance`, one season, seed 4242): HQ with 2 staff nets about +$45k after wages, one office adds about break-even, three offices with average staff break even, and three offices with skill-14 staff net about +$58k. Schema 16.
- **Visual polish:** `addTrophy` queues the id in `state.pendingTrophies`. After each time advance the store calls `takeTrophies()` (like `takeDiscoveries()`), and `TrophyReveal` shows them one by one after any "Here we go" and prodigy reveals (z-60, above the season review). `getLegacy()` builds one pin per club city from `placements`: form is from this season's average rating (≥ 7.3 star, ≥ 6.8 good, ≥ 6.3 ok, else poor; under 3 apps bench; ended, retired or moved on is gone), and the pin takes its best player's form. It also builds the club wall: employer, clients, clubs with completed missions (`clubRecord.missionsDone`) and placement clubs, sorted by placements. `WorldMap` takes `pins` (spring pop-in, staggered) and `onPinHover`. Every animation checks `useReducedMotion()`. No schema change (`pendingTrophies` is optional).
- **Career end** (`systems/career-end.ts`): `retire` sets `careerOver` with `kind: 'retired'` (bankruptcy sets `kind: 'bankrupt'`). After that `assertActive` blocks every action. `careerSummary` adds up positive and negative ledger totals across seasons (not starting funds), judges everyone placed or first revealed (`prodigyFinds`) on their OVR now (best find, stars at 80+), and scores (reputation − `scout.startReputation`) × 3 + 40 × log₂(1 + earned/10k) + 5 × placements + 20 × stars + trophy points (60/25/15/10) + accuracy × 50, × 0.75 if bankrupt. `scout.startedOn` (new; older saves fall back to the game's start date) gives the seasons played. `GameHost.endOfCareer()` gives the state a `careerId` (UUID), upserts a `HallEntry` into Dexie's `hall` table (db version 2: `id, score`), saves the game and returns the summary with its rank. `getHallOfFame()` lists the top 20. The UI's `CareerEnd` overlay calls it whenever a loaded or just-ended career is over. No schema change (the new fields are optional).
- **Scenarios** (`systems/scenarios.ts`, `state.scenario`): `CareerSetup.scenario` picks one. `createCareer` runs `scenarioSetup` first (Shoestring moves home to the lowest-wealth country with clubs, and each scenario sets its difficulty), then `startScenario` after the career exists. Shoestring sets money to $1,000 with a starting-funds adjustment, and its deadline is 3 seasons. Rescue picks the lowest `clubLevel` top-flight club in the home country with no rival employed there, makes you full-time there until June 30 with reputation 20, and adds 50% to its transfer budget. Golden's deadline is 3 seasons. Audition picks the lowest-reputation tier-1 club at home and makes it your only client (reputation 35, $25k). `scout.startReputation` records the head start. `scenarioTick` runs daily after the solvency check: Shoestring wins at $100k, Golden at 3 `prodigyFinds` revealed at 17 or under, Audition at club trust ≥ 60 (lost if they stop being a client), and Rescue is judged on the final table once `season.ended` (safe above the relegation spots; lost if you lose the job). It is lost after the deadline, on bankruptcy, or on retiring. Resolving sets `careerOver.kind = 'scenario'` (bankruptcy keeps `'bankrupt'`). The bonus is 400 + 300 × the share of time left. Hall entries carry `scenario` and `scenarioResult`.
- **Match-day visits** (`systems/matchday.ts`): same ticket, venue and three-week horizon as live scouting. The engine plays to match day while collecting the fixture's player lines, then writes the report. Goals come from `fixture.result.goals` (minute, scorer, assist, running score). Then 34 flavour moments, 50% on the focused players (up to 3). Each moment picks a player on the pitch (starters from minute 1 to their minutes, subs for their last minutes) and an action his position can do. Each action is tied to one attribute: good if attribute + N(0, 3.5) ≥ 11. A focused player's moment raises that attribute's own knowledge by 8 + 0.7 × judging ability (cap 100). Scoring adds +12 finishing, an assist +10 passing. Others' moments add +3 (cap 55). Afterwards focused players who played learn 26 + 0.8 × judging ability overall (cap 100), others on the pitch 6 (cap 70). Per-attribute knowledge lives in `Knowledge.attrs`: `attributeLevel = max(overall, attrs[k])` sets that attribute's range width, `learn` keeps it, and it decays with the rest.
- **Wonderkid hunts** (`systems/hunts.ts`, daily in the tick): on Mondays an 8% chance of a whisper (at most 1 open hunt, 2 from reputation 40). The target is a real prodigy aged 19 or under, at a club, not yet in your pool or revealed. Below reputation 20 he is on your continent at a tier 3–5 club, from 20 tier 2+, from 50 anywhere, weighted toward higher potential. One rival (two from reputation 30) races you at (0.018 + 0.0015 × skill) × U(0.6, 1.4) a day. At 50% his trail gives you the next clue. At 100% he wins and starts a finished chase for one of his clubs. Stages: country → region → city → name. Calls: $120 + $60 × stage (× cost index), 2 days, chance 0.3 + 0.02 × network + market/250 − 0.05 × stage (0.15–0.85). In person (you must be in the area): $150 + $50 × stage, 1 day, 0.75 + 0.01 × network. A search that returns him also finds him. On finding: pool (starred), knowledge 80 (prodigy reveal), reputation +1, and he joins rivals' protected list for 120 days. The trail goes cold after 42 days. The last 12 ended hunts are kept.
- **Season review** (`systems/review.ts`): written at each rollover before player stats are archived: money by source, placements, reputation change (from the baseline taken at season start), each placed player's season with best and worst (5+ apps), and your rank among rival scouts by signings this season. The last 20 are kept. `pendingReview` opens it once in the UI, and the Career screen lists them all.

### Match sim (statistical)
- Team strength = weighted OVR of the best XI for the formation (+ home advantage, + randomness).
- Goals: Poisson draws from the strength difference.
- Goal/assist scorers: weighted by position and attacking attributes. Tackles: per-player Poisson by position and defensive attributes. Clean sheet: GK (and defenders) when goals conceded = 0.
- Lineups: best XI by position rating, with rotation, injuries and form. Captain = the club's designated captain if he plays.
- Performance: every league gets the full per-player sim. Measured on an M4: one in-season week takes ~185 ms (~800 matches), a full season ~4 s, so the planned light sim isn't needed yet.
- Determinism: each day's randomness comes from `Rng.derive(seed, 'match:<fixtureId>')` / `'development:<date>'` / `'rollover:<year>'`, so advancing 50 days at once or one day at a time produces identical worlds (covered by a test).
- Calibration (asserted in `tests/engine/season.test.ts`): ~2.6 goals/game, ~44% home wins, ~21% draws, Golden Boot median ~24, top-assist median ~12. Fixture venues alternate (no run longer than 4).
- Squads are kept playable at rollover by signing domestic free agents, or generating trialists when none fit. Unsigned free agents retire more readily (24+: 35%, 30+: 60% a year), and the market is capped at 3,500 after each summer (the weakest and oldest beyond it leave; players in your pool, represented or in open deals are kept).

## 6. Key Formulas

Tuning constants sit at the top of each system module (for example `SIGNING_PCT` in `payouts.ts`, `AGREEMENT_GATE` in `employment.ts`).

```ts
// Position OVR
ovr(player, pos) = Σ attr[k] * weight[pos][k] / Σ weight[pos][k]  → scaled to 1–100, × familiarity penalty

// Search cost & duration
geoWidth   = { city: 1, region: 2, country: 4, continent: 10 }
filterLoad = Σ filterWeights (position: 1 each, age: 0.5, value: 0.5, each stat range: 2)
cost  = BASE_SEARCH * geoWidth^0.6 * (1 + filterLoad * 0.25) * (1 - networkSkill * 0.01) * home.costIndex
        // BASE_SEARCH = $150 → one city, one filter ≈ $150–190; continent + many stat ranges ≈ $2–3k
days  = clamp(2 + geoWidth * 0.8 + filterLoad * 1.5 - regionKnowledge * 0.05, 2, 42)

// Fog (systems/knowledge.ts): the true value is always inside the range shown
level      = max(ownKnowledge, publicLevel)                       // publicLevel = tier visibility (T1 32 → T5 4) + 0.25 × your market knowledge
halfWidth  = 6 × (1 − level/100) × (1 − (judgingAbility − 1) × 0.025)    // attribute points
ovrHalf    = halfWidth × 99/19 × 0.45                             // overall judged directly: attribute errors partly cancel
reveals    : potential at 40 · traits at 60 · prodigy at 70 (40 with judgingPotential ≥ 15) · ambition at 80 · exact at 100
gains      : search hit +10 (cap max(35, public+10), ≤ 55) · video +12…+20 (cap 60; live scouting comes with travel) · −2/month after 60 days untouched

// Search (systems/scouting.ts): pay → advance the search's days → match against the world as it is then
// Hard filters (area, league, position, age, value) are exact; ability filters use noisy perceived values
// (sd = 2.4 × (1 − dataAnalysis/25) × (1 − market/200)). Top 30 by perceived rating go to the Player Pool.
// Each search in a country gives +2 market knowledge there. Searches save immediately because they cost money.

// Travel (systems/travel.ts): band by geography (region · country · continent · intercontinental)
fare   = clamp(bandMin + km × perKm, bandMin, bandMax) × avg(costIndex)   // –200 · –500 · –1.2k · .2k–4k
days   = 1 (intercontinental 2, long continental hops 2) · hotel = $120 × costIndex per night away from home, none inside your home region (day trips) · going home is always allowed, even into debt
// Fieldwork (systems/fieldwork.ts)
live   : must be in the home club's city for the player's next match (≤ 21 days) · ticket by tier · advance to match day
         played → +22 + 0.6 × judgingAbility (cap 100) · didn't play → +6 (cap 60) · everyone else in the match +6 (cap 70)
meet   : 1 day, priced by tier · reputation gate (coach T1 30 / T2 15 / T3 5 · player T1 20 / T2 10)
gain   = 20 × (0.75 + 0.025 × negotiation) × tierEase(T1 .45 … T5 1.2) × (1 − stubbornness/160) × (1 − level/110) × (×0.4 if met < 14 days) ± 30%
         (+4 for a first introduction) · player meetings also add knowledge (+8, cap 85)
// Relationships (staff) and rapport (players) persist and feed phase 6's sign-off and signing odds.

// Deals (systems/deals.ts): pitch in person (1 day, meeting cost) to the Head Coach
gate      : ovrAt(pos) > club positional average (truth) · else prospect if age ≤ 21 & potential > avg & policy allows · else club-level reject
afford    : fee = value × (1.05 + contract premium 0–0.35) (free agents 0) ≤ budget · wage = max(tier wage, current × 1.1) within wage budget × 1.08 (wage budget reset each summer to the wage bill × 1.08–1.18, higher for better-supported clubs)
sign-off  = sigmoid((priorityMatch − 0.5) × 6 + (relationship − 25)/22 + (negotiation − 10) × 0.05 − (stubbornness − 50)/40)
            his no is final for that player at that club
player    = sigmoid(0.6 + rapport/30 + tier step (up +0.6/tier, down −1.1/tier) + raise ≥ 1.3 (+0.5) + free agent (+0.8) − ambitious & stepping down (1))
timeline  : resolves after 7–14 days → in a window: completes; otherwise 'agreed' → completes on Jul 1 / Jan 1 · hijacked if he moves elsewhere first
completion: executeTransfer (squads, budgets, contract, wage, captaincy) · Placement {fee, ovrGap, prospect, expiresOn = contract end} · reputation + max(1, round((0.8 + 0.4 × (6 − tier) + min(1, gap/5)) × (1 − reputation/100)))
// AI market (systems/transfers.ts): Mondays in windows, 12% of clubs with a need (severity ≥ 0.35) buy a player rated avg+2…avg+12
// from their level or below (or a free agent) for ≤ 60% of budget. Budgets refresh each July (70% new allocation, 30% carried over).
// Players who joined a club in the last 300 days are not for sale (protects fresh signings, including yours).

// Payouts (systems/payouts.ts), paid into the ledger with running per-season totals (state.ledgerTotals)
signing   = prospect ? 0 : max(floor[mode][tier], taper(basis) × pct[mode] × clamp(1 + gap/10, 1, 1.5))   // basis = fee, or value for free agents
            pct freelance 2% · full-time 1% · taper = first $1M + 40% of $1–10M + 12% above · floors freelance T5 1.5k · T4 4k · T3 7.5k · T2 30k · T1 125k
match     : × tierMult (T5 .25 · T4 .5 · T3 1 · T2 3 · T1 8) × (freelance 2) — appearance always; ST/LW/RW/AM goals & assists;
            CB/DM tackle match at ≥3 (≥6 ×1.5); LB/RB/LWB/RWB at ≥2 (≥4 ×1.5); GK clean sheet; captain. Category = position played.
stops     : first contract ends, he leaves the club, or retires (updatePlacements, daily)
solvency  : money < 0 starts a 56-day clock (news + banner); back above 0 resets it; at 56 days → state.careerOver, all commands refused
history   : weekly balance snapshot (Mondays) for the finances chart

// Employment (systems/employment.ts)
work rule : freelance → only clients · full-time → only employer (canWorkWith, enforced in pitch)
trust     = clamp(0.7 × coach relationship + min(40, 8 × signings) − min(15, 3 × weak pitches) + 10 if employer)
            feeds sign-off (+(trust − 25)/40), job/client offers, and dismissal (trust < 12 after 90 days)
clients   : slots by reputation 2/3/4/5 at 0/30/50/70 · agreement gate T1 75 · T2 50 · T3 20 · needs relationship ≥ 10
            accept = sigmoid((rel − 20)/8 + (rep − gate)/15 + (trust − 20)/25) · a completed signing keeps the club on (slot permitting)
jobs      : monthly; tier gate T5 5 · T4 15 · T3 30 · T2 50 · T1 70 (+ trust ≥ 25 or gate + 15) · 45% chance (15% if employed, better tiers only)
            salary T5 18k · T4 30k · T3 55k · T2 110k · T1 220k × √wealth (Head of Recruitment ×1.85 at rep 85) · paid weekly
            expense cover 50–90% by tier applied inside addLedger · notice 28 days · renewal offer at contract end if trust ≥ 45
wages     : in your deals he asks brokeredWage = max(current wage, club offer × (1 − 0.2 × rapport/100)); AI moves use the full offer
            offer: you choose his ask … ceiling (a discussed brief's wage ceiling for that position, else 1.5× his ask)
            player chance + min(1.2, (offer/ask − 1) × 2.4) logit · the club's wage-room check uses the offer
colleagues: your employer's Head Coach · relationship floor 20 (set on joining, kept daily) · meetings free, no reputation gate
            gain × 1.6 · a repeat within 14 days keeps 70% (not 40%)
news feed : capped at 400; world news (hat-tricks, transfers, coaching, retirements) is dropped before personal news

// Missions (systems/missions.ts)
offers    : 1st & 15th from each work club (employer ≤ 2 open, client ≤ 1) · chance base (50% / 30%) + quiet days/150 (no long droughts)
brief     : most severe need · minOvr = positional avg + 1–4 · maxAge 23 if the coach values resale/potential, else maybe 27–30 or minAge 25
            maxFee 30–70% of budget · foot 40% for wide positions · 4–10 weeks · accept within 10 days · max 3 active
success   : deal agreed/completed for the club at that position before the deadline and missionFit(truth) passes (no partial credit)
            reward (full-time 2–6 salary weeks · freelance T5 $1–3k … T1 $80–250k) · relationships +5 · reputation +1 · trust +6/mission (≤ 20)
failure   : deadline passes → relationships −6 · reputation −1 · trust −8/mission (≤ 20)

// Freelance market (systems/market.ts) — freelance only
rights    : pitchRights = active mandate for the player (any buyer) | represented free agent (any club) | else canWorkWith (employer/clients)
mandates  : 8th & 22nd from each client with none open · chance 0.15 + quiet days/200 (≤ 0.9) · surplus pick: benched (≤ 2 apps) +2,
            overpaid (below position avg with a wage) +1.5, crowded (4+ at position) +1, noise 0–1, needs ≥ 1.2 · not captain, age ≥ 20, not signed < 300 days
            asking fee = value × 0.85–1.1 (min $1k) · commission 3–5% · 6–10 weeks · accept within 10 days · max 2 active
            deal fee = asking fee · player chance +1 (his club wants him gone) · no "club wouldn't sell" failures
            agreed → mandate succeeded, seller relationships +5, missionsDone +1 · completed → commission to ledger, reputation +1, no placement
            deadline passes → relationships −5, missionsFailed +1
represent : free agent · rapport ≥ 25 · in his country · max 3 · deal player chance +0.6 · normal placement on completion
            AI transfers skip represented players · ends when he signs elsewhere · full-time job ends mandates and representation
prodigy   : knowledge.learn records the first time prodigyVisible (isProdigy && (level ≥ 70 || level ≥ 40 with judgingPotential ≥ 15))
            → news + pendingDiscoveries → Engine.takeDiscoveries() → reveal overlay (after any "Here we go")

// Rival scouts (systems/rivals.ts)
seed      : at career start (or the first day after loading an older save) · easy 50 / normal 80 / hard 110
            first quarter from your home country, rest weighted by club count × (0.5 + wealth) · skill N(10 ± 2 by difficulty, 3.5) in 3–19
            60% full-time at a club near tier 6 − skill/4, else freelance with 1–3 clients · reputation ≈ 2×skill + 6×(6 − tier) ± 8
weekly    : Thursdays · start a chase only within 70 days of a window (50% when idle) · chaseYours first (10% + 1.5% × skill): your negotiating
            deals, then 12 pool players, at a club of his in the same country where the player fits · else top need (severity ≥ 0.2) from 10 clubs
            in his patch + some free agents · fit: seen OVR (truth + N(0, (21 − skill)/4)) in [avg + 1, avg + 14], fee ≤ 70% budget, affordable,
            seller tier ≥ buyer tier, age ≤ 31, not signed in 300 days · no player is chased by two rivals
progress  : + (0.08 + 0.012 × skill) × difficulty speed (0.8 / 1 / 1.25) × 0.7–1.3 per week · at 1, closes in a window with 50% + 2% × skill
            success → transfer, your negotiating deals on him hijacked (named), reputation +3 (+2 for a steal) · failure → reputation −1
            agreed deals and represented players are off limits · chases older than 240 days are dropped
rumours   : at progress ≥ 0.3 for your players (60%/week), prodigies or value ≥ $3M (20%/week) → 'rumour' news; only rumoured chases are shown
careers   : monthly reputation drift toward 3 × skill · 3% chance to move to a better club in his country he qualifies for (JOB_GATE);
            clubs that offered you a job are 4× likelier, and that offer is withdrawn
            job offers skip clubs whose staff rival is 10+ reputation above you · agreement chance −0.7 logit if a better-known rival works there

// Search reach (systems/scouting.ts)
reach     : each match is found with p = sigmoid((access − threshold(tier) + 3) / 10), 3%–100%
            access = 0.6 × reputation + 2 × network + market knowledge / 5 · threshold T5 0 · T4 15 · T3 30 · T2 50 · T1 70 (free agents: T5)
            e.g. a new scout at home (access ≈ 25) finds ~80% of T4, ~45% of T3, ~10% of T2, ~3% of T1 matches

// Assistant scouts (systems/assistants.ts)
market    : refreshed on the 1st (and at career start) · 4–6 candidates, 55% from your home country, else your known markets
            skill 3 … ceiling (7 + reputation/8, ≤ 19) · wage ≈ $300 + $60 × (skill − 4), ±10% · staff limit 1 / 2 / 3 at reputation 0 / 15 / 40
task      : country / region / city · ≤ 3 positions · optional age range and value cap · 1–8 weeks
            expenses/week = 80 / 160 / 320 by scope × cost index × 0.7 in his home market ('assistant-task', covered when full-time)
weekly    : Mondays · wage ('assistant', never covered) · scan: players in the area not in your pool who fit → his rating = OVR at the
            brief position + N(0, (23 − eye)/3), eye = skill (+3 at home) · reports the top 1 + ⌊eye/6⌋ (+1 at 50%) by rating (+3 if ≤ 20)
            each: pool entry with report {by, rating}, knowledge + (8 + skill/2) up to 20 + skill
growth    : 12 working weeks → skill +1 (≤ 20), wage × 1.08 · firing costs one week's wage

// Money scaling (economy.ts): every money value derives from one table
scale(club)            = TIER_SCALE[club.tier] * country.wealthIndex      // wealthIndex 0.4 – 1.5
fee/wage/budget ranges = TIER_BANDS[tier] * country.wealthIndex           // see PLAN §3.9a
travelCost(a, b)       = DIST_BAND_COST[band(a,b)] * dest.costIndex
// money.ts: all results Math.round()-ed to whole USD at the boundary, never stored as floats

// Signing probability (player side + selling club)
p = sigmoid( a*persuasion + b*trust + c*needFit + d*affordability - e*(playerTier - clubTier) - f*ambitionGap )

// Sign-off (sign-off.ts): official only if the chosen official approves
score(official) = Σ priorities[k] * fitness[k](player, club) + g*persuasion[role] + h*relationship[official] - official.stubbornness
approve         = rng() < sigmoid(score)
on second pitch (going over someone's head) approved → relationship[bypassed] -= BYPASS_PENALTY,
                                                       coach bypassed → starter selection bias −15%

// Above-average gate + one-off placement bonus
if ovr(p, slotPos) > teamAvg(slotPos):
   bonus = max(PLACEMENT_FLOOR[mode][tier],
               basis * PLACEMENT_PCT[mode] * clamp(1 + (ovr - avg) / 10, 1, 2))   // basis = fee, or market value for free agents
   // PLACEMENT_PCT: fulltime 1.5%, freelance 4%
elif age(p) <= 21 && club.acceptsProspects(p):                       // prospect exception: no bonus
   bonus = 0
else:
   reject(); bonus = 0                                               // + small trust hit on repeated weak pitches

// Per-match payouts (per Placement, stacked)
total  = APP_BONUS[mode]
total += attacking(ST,LW,RW,AM): GOAL_BONUS[mode]*g + ASSIST_BONUS[mode]*a
total += defensive(CB,DM):        tackles >= 3 ? TACKLE_BONUS[mode] * (tackles >= 6 ? 1.5 : 1) : 0
total += defensive(LB,RB,LWB,RWB): tackles >= 2 ? TACKLE_BONUS[mode] * (tackles >= 4 ? 1.5 : 1) : 0
total += GK: cleanSheet ? CS_BONUS[mode] : 0
total += wasCaptain ? CAPTAIN_BONUS[mode] : 0
// CM/LM/RM: appearance + captain only.
// Base values at tier 3, full-time: app $50, goal $150, assist $100, tackle-match $75, clean sheet $150, captain $75
// × MATCH_TIER_MULT (T5 0.1, T4 0.3, T3 1, T2 3, T1 8) × (freelance ? 2 : 1). Whole USD.

// Sale commission (freelance only)
commission = saleFee * mandate.commissionPct

// Prodigy
isProdigy = potential >= PRODIGY_PA && age <= 19     // ~0.5% of youth intake
revealed when knowledge >= 70 || (knowledge >= 40 && judgePotential >= 15)
```

## 7. Persistence

- **Where:** `GameHost` (`src/worker/game-host.ts`) extends the pure `Engine` with persistence and is what the worker exposes. The engine itself never touches storage.
- **Storage:** Dexie DB `football-scout` (`src/persistence/db.ts`) has two tables. `saves` holds small listing metadata (name, seed, in-game date, season, timestamps, size, schema version) so the menu loads instantly. `snapshots` holds the compressed save bytes, stored as `Uint8Array` rather than `Blob` for portability.
- **Format** (`src/persistence/save-format.ts`): a gzip'd JSON envelope `{ format: 'football-scout-save', meta, state }`. The same bytes go to IndexedDB and to exported `.fsave` backup files.
- **Consistency:** `JSON.stringify` runs synchronously, so a save is always one consistent instant of the world. Compression and the write happen asynchronously after that. Metadata and snapshot are written in one transaction.
- **Slots:** one slot per world. A new world creates its slot immediately. **Autosave** runs after time advances once at least 7 in-game days have passed since the last save. Manual save is the Save button or ⌘S. Menu saves before leaving. Closing the tab with unsaved progress asks first. The app asks for persistent storage on the first new game.
- **Migrations:** `MIGRATIONS[n]` upgrades schema *n* to *n+1* (current: 16: v12 added season reviews, v13 wonderkid hunts, v14 scouting reports, v15 goals, trophies and specialties, v16 the agency). Saves from a newer version, saves with no version, and damaged or foreign files are rejected with a readable `SaveError`.
- **Measured (M4, early season):** ~5.5 MB per save, ~1 s to save, ~0.6 s to load.

## 8. Performance Budget

| Operation | Target (M4) | How it's met |
|---|---|---|
| World generation (~45k players) | < 4 s | In the worker, with a progress bar |
| Advance 1 week | < 300 ms | Full sim for every league fits: ~185 ms for ~800 matches |
| Season rollover | < 3 s | Well under a second after the phase 13 pass (free-agent market capped) |
| Search | < 100 ms compute | One pass over the players in the worker, top 30 kept |
| Save / load | < 1 s | Synchronous snapshot, then gzip and write in the worker (~1 s save, ~0.6 s load) |
| Balance bot | n/a | ~8 s of CPU per simulated season |

## 8a. Visual & Motion Architecture

- **Engine stays visual-free.** Visuals come from seeds and colours already in the model (`club.colors`, `club.crest`, `player.portraitSeed`). The same seed gives the same crest or portrait on every load. Nothing is stored as an image.
- **Moments play in order.** After each advance the store pulls completed deals, revealed prodigies and new trophies into queues. The overlays show them one at a time: Here we go first, then the prodigy reveal, then trophies (above the season review). A jump of several weeks queues them instead of firing all at once.
- **Reduced motion:** every Motion animation checks `useReducedMotion()`. Confetti, turning rays, pop-ins, hover lifts and looping pulses switch off and entrances become instant. A global CSS rule calms the rest.
- **World map** (`ui/visuals/world-map.tsx`): SVG with a cached projection. It draws country fills, club cities, your location, flight arcs, and (on the Goals screen) placement pins coloured by form.

## 9. Testing Strategy

- **Engine tests (Vitest, `npm test`):** 175 tests in 22 files under `tests/engine`, run one file at a time. They use fixed seeds and cover OVR and fog (the true value is always inside the range), search cost and reach, payouts per position and mode (stacking, tackle thresholds), the above-average gate, freelance-only work, rival hijacks, missions, deadline day, hunts, match days, reports, goals and awards, the agency, career end and scenarios. Persistence and hall-of-fame tests run `GameHost` against `fake-indexeddb`.
- **Determinism:** advancing 50 days at once or day by day gives an identical world, and a saved world reloads identically and plays on the same way.
- **Save migrations:** each schema step has a test that upgrades an older save.
- **Balance harness** (`tests/sim`, `npm run balance`; `SEASONS=n` sets the length, `SEED=n` the world, default 4242; separate from `npm test` because it is slow, ~40 s for 5 seasons):
  - prints world money by tier against the tier bands;
  - plays a scripted freelance bot on Normal honestly through the Engine (costs, travel, fog): it courts clubs near home, accepts invitations and one mission at a time, searches its client's most pressing need, meets the coach before pitching, trades a small client for a bigger one when it can, and goes home after trips. It prints income and expenses by kind per season, reputation, season goals and trophies, pitches and sign-offs;
  - runs one season of an agency's books (HQ only, one office, three offices, three offices with skilled staff).
  - Targets (PLAN §3.9a): season 1 roughly −$5k to +$30k, season 5 at $150k–$400k a year. Current (seed 4242): season 1 +$32k, season 5 +$368k, $643k in the bank after 5 seasons.
- **Not yet:** UI tests. The browser checks so far have been manual.

## 10. Extensibility Notes

- Real-data import later: add a `generation/importers/` adapter producing the same `GameState`. Nothing else changes.
- A richer match engine later replaces `match-sim.ts` behind the same result and player-line contract.
- New scenarios are an entry in `SCENARIOS` plus a setup, progress and win check in `systems/scenarios.ts`.
- Retuning: change the constants at the top of the relevant system module, then check with `npm run balance`.
