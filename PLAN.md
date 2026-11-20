# Football Scout: Game Plan

> Status: **v1.0, every phase built (0–22, as of 2026-11-17).** All design questions are answered (§9). Currency: **USD**, tier-scaled (§3.9a).
> Anything marked **[ASSUMPTION]** is a placeholder decision that can change.

## 1. Vision

A single-player career sim played locally in the browser (MacBook M4, no server needed). You play a football scout
at the very start of your career. You find players, persuade clubs to sign them, and get paid from the deals and from
how those players perform afterwards. The core tension is **information vs. money vs. time**: every search, trip and
assistant costs money and calendar days, and the payoff only arrives if the player you push actually signs and plays well.

**Pillars**
1. **Discovery feels earned.** You start out seeing players through fog (stat ranges, not exact numbers). Scouting work turns the fog into knowledge.
2. **Every decision costs something.** Searches, travel and assistants all cost money and time.
3. **Long-tail rewards.** A good signing keeps paying you through appearances, goals, tackles, clean sheets and captaincy.
4. **Career arc.** You go from an unknown freelancer to a trusted head of recruitment, an in-demand freelancer working for many clubs, or the owner of your own agency. You retire when you choose, and the career is scored and kept in a hall of fame.

## 2. Core Loop

```
 ┌──────────────────────────────────────────────────────────────┐
 │ 1. Read club needs (formation gaps, missions, average OVR)    │
 │ 2. Search (filters → costs money + advances days)            │
 │ 3. Scout (watch / travel / meet → narrows stat fog)          │
 │ 4. Recommend player to club                                  │
 │ 5. Persuade (meetings with player & club → signing chance)   │
 │ 6. Transfer happens (or fails)                               │
 │ 7. Earn over time (placement fee + performance bonuses)      │
 │ 8. Trust/reputation changes → better clubs, missions, salary │
 └──────────────────────────────────────────────────────────────┘
```

Time moves forward only when you do something (search, travel, scout, wait/"advance week"). The game is turn-based: there's no real-time clock.

## 3. Game Systems

### 3.1 World
- **[DECIDED] Procedurally generated fictional world** (club, player and league names are generated) built on real geography: continents → countries → regions → cities. This avoids licensing problems and gives every save a fresh world.
- League pyramids per country (1–4 tiers depending on the country's football strength).
- Each club has: tier/reputation, budget, wage budget, **formation**, squad, manager style, stadium city.
- MVP world size target: ~6 continents, ~40 countries, ~120 leagues, ~2,000 clubs, ~50,000 players. Tune this for performance.

### 3.2 Players
- Bio: name, age, nationality, birthplace, current club, contract expiry, wage, market value, agent.
- **Attributes (1–20)** in four groups: Technical, Mental, Physical, Goalkeeping.
- **Hidden:** potential (PA), consistency, ambition, loyalty, injury proneness.
- **Position ratings:** an OVR (overall rating) per position, calculated from weighted attributes. A player can be strong in several positions.
- Positions: GK, CB, LB, RB, LWB, RWB, DM, CM, AM, LM, RM, LW, RW, ST.
- Development: young players grow toward PA; players decline after ~30–32. This updates each season and in small monthly steps.

### 3.3 Clubs & Formations
- Each club has a formation (e.g. 4-3-3, 3-5-2, 4-2-3-1). The formation defines its **position slots**.
- **Squad needs** = slots where depth or quality is below the club's standard. These drive what a club will accept from you.
- **Team positional average** = average OVR of squad players in that position. It sets the bar for the "better than average" bonus.
- Managers can change (sackings), which can change the formation and the needs. This keeps the world dynamic.

### 3.4 Time & Season
- Calendar unit = **day**. Matches are played on weekly matchdays.
- Season: pre-season → league season → off-season. Two transfer windows (summer and winter). **[ASSUMPTION]** Signings only complete inside a window, but you can agree a deal in advance (a pre-contract).
- Match simulation is **statistical** (no 2D match engine). Each match produces a score, lineups, minutes, goals, assists, tackles, clean sheets and the captain. That is enough to drive bonuses.

### 3.5 Search
- Filters: location (continent / country / region / city), league, positions (up to 3), age range, value range, attribute or OVR ranges.
- **Cost & duration** grow with complexity:
  - Base cost + a cost per active filter, adjusted by how wide the geography is (a whole continent is cheaper per player but noisier; one city is precise but small).
  - Duration: a few days (simple, local) up to several weeks (multi-continent, tight stat ranges).
  - Stat-range filters are the most expensive, because you're asking for data you don't have yet.
- Results come back with **fog**: stats shown as ranges whose width depends on your scouting skill and on how much you know about the region.
- Search results go into your **Player Pool** (shortlist / database).

### 3.6 Knowledge / Fog of War
- Each (scout, player) pair has a **knowledge level 0–100%**.
- Ways to raise it: search hit (low), watching a match on video (medium, cheap), attending a match in person (high, needs travel), meeting the player (high, also shows personality).
- Stat ranges narrow as knowledge grows. Hidden attributes (potential, ambition) only appear as hints at high knowledge.
- Knowledge fades slowly over time, because players change.

### 3.7 Travel & Meetings
- Your scout has a **current location**. Travel cost and days depend on distance (city → region → country → continent).
- Meeting types: player, player's agent, club (selling club, buying club).
- Each meeting adds to a **persuasion score** for a specific deal. Higher-tier players and clubs need a higher threshold, so they take more meetings.
- Signing chance = f(persuasion, club fit, wage/fee feasibility, player ambition vs. club tier, your trust with the club).

### 3.8 Recommending & Signing
1. You recommend a player to a club (only clubs you work for).
2. The club evaluates: does the player fill a formation need? Is the fee/wage affordable? How much does it trust you?
3. If the club is interested, the negotiation phase starts. Meetings raise the chance.
4. **[DECIDED]** The AI resolves the actual transfer fee/wage negotiation between the clubs. You influence the odds; you don't type numbers.
5. **Sign-off [DECIDED]:** nothing is official until the club's **Head Coach** approves the proposal (see below).
6. Outcome: signed / rejected / hijacked by a rival club or rival scout. Then trust is updated.

**Sign-off: the Head Coach [DECIDED, revised]**
Every club has one named decision-maker, the **Head Coach**, with his own personality, priorities (sporting fit first, with some weight on potential, value and resale) and relationship with you (0–100). **His approval makes the signing official; his no is final for that player at that club.** (Clubs originally had a President as a second decision-maker; he was removed at the player's request.)

- **You choose who to pitch to.** Meetings with that person raise your persuasion with them.
- **Coach changes:** a newly appointed coach starts with a neutral relationship and may bring a new formation. Your old contact leaving can hurt or help you.
- **Club-level trust** (§3.12) is your relationship with the Head Coach, plus your track record with the club.

**Above-average gate [DECIDED]:** at step 2, the club compares the player's OVR in the target slot with the team's positional average. **Not above average → instant rejection, $0 earned** (there's a small trust cost if you keep pitching weak players). Young prospects are the exception (§3.16), judged on potential. The UI shows the club's positional averages, so you can check before you recommend, but you only see the player's OVR through fog, so a recommendation is still a judgment call.

### 3.9 Economy

**Income**
| Source | Trigger | Full-time | Freelance |
|---|---|---|---|
| Salary | Weekly | ✅ scales with role | ❌ |
| Placement bonus (one-off) | Signing of an above-average player | x% of fee, scaled by the OVR gap | higher % |
| Appearance bonus | Each appearance | small flat | larger |
| Attacking bonus (ST, LW, RW, AM) | Goal / assist | flat per event | larger |
| Defensive bonus (CB, LB, RB, LWB, RWB, DM) | Match with **≥ 3 tackles** (FB/WB: **≥ 2**) | flat per qualifying match, +50% at double the threshold | larger |
| GK bonus | Clean sheet | flat | larger |
| Captain bonus | Match as captain | flat | larger |
| Sale commission (freelance only) | You find a buyer for a club's player | – | % of the sale fee |

- **Bonuses stack [DECIDED]:** one match can pay appearance + goal/assist (or tackle) + captain.
- **FB/WB decision:** fullbacks and wingbacks are defenders for bonuses, with a lower threshold (2 tackles) because they defend less often. They do **not** also earn assist bonuses, so each position has one clear bonus category. CM, LM and RM earn appearance and captain bonuses only, which makes attacking or defensive specialists more valuable to place.
- All amounts are in **USD**.

- Freelance rates: ≈ 2.5× full-time for the placement %, ≈ 2× for per-match bonuses, to make up for no salary and no expense cover.
- **[DECIDED]** Performance bonuses last for the player's first contract at the club. They stop early if he leaves.

### 3.9a Money Scale [DECIDED: realistic, tier-scaled USD]
All money is stored as **whole US dollars** (integers, no floating-point drift) and shown compactly ($850, $12.4k, $3.2M). Every value scales with **club tier** and the **country's wealth index** (rich leagues ≈ 1.5×, small leagues ≈ 0.4×), so a scout working in the lower leagues of a small country and one working in a top European-style league live in very different economies.

**World economy (per club tier)**
| Tier | Example | Transfer fees | Player wages / week | Club transfer budget / season |
|---|---|---|---|---|
| 1 | Elite / continental giants | $10M – $150M | $50k – $500k | $50M – $300M |
| 2 | Solid top flight | $2M – $30M | $15k – $80k | $10M – $60M |
| 3 | Lower top flight / strong 2nd tier | $300k – $5M | $3k – $20k | $1M – $10M |
| 4 | Lower professional | $20k – $500k | $500 – $4k | $50k – $1M |
| 5 | Semi-pro | $0 – $30k | $100 – $800 | $0 – $60k |

**Your income**
| Item | Full-time | Freelance |
|---|---|---|
| Salary (per year, by employer tier 5 → 1) | $18k · $30k · $55k · $110k · $220k (Head of Recruitment at tier 1: $400k+) | – |
| Placement bonus | **0.6%** of the tapered fee × gap factor (1.0–1.5) | **1.25%** of the tapered fee × gap factor |
| Placement floor (per tier 5 → 1) | $600 · $1.6k · $2k · $4k · $10k | $1.5k · $4k · $5k · $10k · $25k |
| Sale commission | – | 3–5% of the sale fee (set per mandate) |
| Mission reward | 2–6 weeks of salary | $1k – $250k by tier |

The **floors** make early, tiny deals worth doing (a $0 free-agent placement at a tier-5 club still pays $1,500 to a freelancer). Big fees **taper**: the fee counts in full up to $500k, 25% of it from $500k to $5M and 6% above, so elite deals pay well but not a fortune each. (Retuned 2026-11-20, after the balance bot learned to reuse its pool: the old rates gave $0.6M–$2M by season 5.)

**Per-match bonuses**: base values at **tier 3, full-time**, multiplied by the tier (T5 ×0.25 · T4 ×0.5 · T3 ×1 · T2 ×2 · T1 ×5) and ×2 for freelance:

| Appearance | Goal | Assist | Tackle match (threshold met) | Clean sheet | Captain |
|---|---|---|---|---|---|
| $50 | $150 | $100 | $75 | $150 | $75 |

*Sanity check:* a tier-1 striker you placed as a freelancer, with 35 apps, 20 goals and 8 assists, earns you 2 × 5 × (35×50 + 20×150 + 8×100) = **$55.5k / season**. The same player at tier 4 earns you **$5.6k**.

**Your expenses**
| Item | Cost |
|---|---|
| Search | $150 (one city, one filter) → ~$3k (whole continent, tight stat ranges) |
| Travel | Same region $50–200 · Same country $150–500 · Same continent $400–1.2k · Intercontinental $1.2k–4k |
| Accommodation | $80–300 per night (by the country's cost index) |
| Meeting | $0–500 (coffee with a youth player → dinner with an elite coach) |
| Video scouting package | $50–400 per player |
| Assistant scout | $300–1.2k per week + task expenses |
| Expense cover (full-time) | The club pays 50% (tier 5) → 90% (tier 1) |

**Difficulty starting money:** Easy $25k · Normal $10k · Hard $3k.

**Balance targets** (checked by the balance harness, §8):
- Season 1 net income: around −$5k to +$30k (surviving is the challenge).
- Season 5: $150k – $400k per year for a competent career.
- Late career, top-tier freelancer or Head of Recruitment: $1M+ per year, with prodigy jackpots on top.
- One intercontinental scouting trip should cost about a season's tier-5 placement income, so long trips are a real decision early on.

**Expenses**
- Searches (scaled by complexity).
- Travel (distance) + accommodation per day away.
- Meetings (small fee + travel).
- Assistant scouts (weekly wage + per-task fee).
- **[ASSUMPTION]** Full-time scouts get part of their expenses covered by the club (e.g. 50%), which makes freelance riskier.

**Failure state:** **[DECIDED]** Endless sandbox. Money below 0 for 8 consecutive weeks = bankruptcy = game over.

### 3.10 Employment Modes
- **Full-time:** contracted to one club. Salary + smaller bonuses. That club gives you missions. Exclusivity: you can't recommend to other clubs.
- **Freelance:** work for several clubs at once (limited by reputation, 2 → 5 clubs). Bigger cuts, no salary.
  - **Selling mandates [DECIDED, freelance only]:** a club can hire you to find a buyer for a player it wants to move (surplus, wage dump, cash need). You pitch him to other clubs. The same above-average gate applies at the buying club. You earn a % of the sale fee. Mandates have deadlines, like missions.
  - **Free agents [DECIDED, freelance only]:** you can represent out-of-contract players and place them with no transfer fee. The placement bonus is then based on the player's market value instead of the fee.
- Switch modes by accepting a job offer or resigning (with a notice period).
- Clubs offer jobs based on your reputation and trust.
- **Your own agency (late game, phase 19):** from reputation 60, freelancers can found an agency. Offices abroad replace the reputation caps on clients and staff, and assistants placed at an office broker deals for a cut (see §5a).

### 3.11 Missions
- A club posts: "Find a [position] with [requirements: age, OVR ≥ X, max fee, foot, etc.] within N weeks."
- Accept or decline. **Declining** costs no trust. **Accepting and failing** costs trust. **Succeeding** gives trust + a mission reward.
- Mission success = a matching player **signs** before the deadline. **[ASSUMPTION]** A matching player who is recommended but does not sign earns no credit.

### 3.12 Trust & Reputation
- **Trust (per club, 0–100):** affects whether the club listens to your recommendations, mission offers, job offers and expense cover.
- **Reputation (global, 0–100):** affects which clubs will work with you, player/agent openness to meetings, how many freelance slots you have, and assistant scout quality.
- Reputation grows from successful signings (more for players who outperform) and from completed missions.

### 3.13 Assistant Scouts
- Hire lower-tier scouts (each has a skill level, region expertise and a wage).
- Assign them tasks: "Scan region X for positions Y in age range Z for N weeks."
- They feed players into your pool with lower knowledge levels and some false positives, depending on their skill.
- Costs: weekly wage + task expenses. They can level up over time.

### 3.14 Scout Progression
- Your own attributes: Judging Ability, Judging Potential, Negotiation, Network/Contacts, Region Knowledge (per region), Languages.
- These improve through use (XP), and maybe through paid courses (licences).

### 3.14a Starting Setup [DECIDED: choose background + difficulty]
| Background | Strength | Weakness |
|---|---|---|
| Ex-pro player | High network, players open to meetings, good judging ability | Weak data skills, so searches cost more |
| Data analyst | Cheaper and faster searches, narrower fog from video | Poor network, persuasion is harder |
| Agent's assistant | Strong negotiation/persuasion, knows a few agents | Low judging ability, wider fog |
| Youth coach | Judges potential well, cheaper youth searches | Weak contacts at higher-tier clubs |

Difficulty sets the starting money ($25k / $10k / $3k), expense levels and the strength of rival scouts. Every career starts as an unknown with reputation ~5, in your chosen home country.

Instead of a free career you can pick a **scenario** (phase 22): Shoestring, Relegation rescue, The golden generation or Big-club audition. Each one sets its own start, goal and time limit (see §5a).

### 3.15 Rival Scouts [DECIDED]
- About 50–200 AI scouts, each tied to clubs (or freelance), with skills and home regions.
- They search and scout in the background. They can **pursue the same player**, and the first deal to complete wins. If a rival lands your target, your deal fails ("hijacked").
- News items hint at rival activity ("A scout from X was seen at Y's match"), which creates time pressure.
- Rival scouts build reputation too, and can take freelance slots and job offers you wanted.

### 3.16 Free Agents, Youth & Prodigies [DECIDED]
- The world has a steady stream of **free agents** (released at season end) and **academy youngsters** (16–19).
- **Low-league clubs** (tiers 3–5) value free agents and cheap youth most, because they have small budgets. This is the natural early-career market.
- **Prodigies** are rare (~0.5% of youth) with very high hidden potential. When you identify one (it needs high knowledge, or a high Judging Potential skill), **every club** gets interested, including elite ones. This is the game's "jackpot" moment.
- **Prospect exception [DECIDED]:** a player aged 21 or under who is below the positional average can still be placed. He passes the gate on *potential* instead of current OVR, if the club accepts prospects (an elite club only does so for prodigies). He earns no placement bonus, but his performance bonuses still count.

## 4. Screens (MVP)
1. **New Career**: name, nationality, home country, background, difficulty.
2. **Dashboard / Inbox**: date, money, messages (results, offers, missions, payouts), "Advance" button.
3. **World Map / Browser**: continents → countries → leagues → clubs.
4. **Club View**: formation pitch with slots, squad, positional averages, needs, trust, Head Coach card (portrait, priorities, your relationship).
5. **Search**: filter builder with live cost/duration estimate.
6. **Player Pool**: sortable table with fog ranges, tags, knowledge bars.
7. **Player Profile**: attributes (ranges), position map, history, actions (watch, travel, meet, recommend).
8. **Deals / Negotiations**: active pursuits, persuasion progress with the Head Coach, signing odds, sign-off status.
9. **Missions**: available / active / completed.
10. **Finances**: ledger, income by source, charts.
11. **Staff**: assistant scouts and their tasks.
12. **Career**: reputation, trust per club, job offers, scout attributes.

Added after the MVP: **Rivals** (phase 11), **Deadline day** (14), **Hunts** (15), **Match day** (16), **Goals** with the trophy cabinet, placement map and club wall (18, 20), **Agency** (19), the **career summary** and **hall of fame** (21), and the scenario picker and banner (22). The season review, scouting reports and track record live on existing screens.

## 4a. Visual Direction [DECIDED]
Football Manager's information density, presented like a modern broadcast or data-scouting product. It should look realistic, not cartoonish.

- **Look:** dark "stadium night" theme with grass greens and floodlight accents, broadcast-style typography (condensed sans for numbers), glass panels, subtle grain. A light theme can come later.
- **Realism:** procedurally generated **club crests and kits** (SVG, from each club's colours), procedurally generated **player portraits**, a real **world map** with country borders, real city coordinates, and a stadium photo-style header per club tier.
- **Animated, never in the way:**
  - Animated **world map**: travel arcs fly between cities, and search areas pulse while the search runs.
  - **Formation pitch**: players slide into slots, gaps glow red, and a recommended player is previewed in the slot with an OVR change against the average.
  - **Fog of war on stats**: ranges are drawn as blurred bars that sharpen as knowledge grows.
  - **Matchday ticker**: a live-style scoreline and event feed for matches involving your placed players, with a "cha-ching" when a bonus lands.
  - **Money**: count-up animation on income, a ledger with sparklines, income-by-source charts.
  - **Signings**: a press-conference style "Here we go" reveal card when a deal completes. A prodigy discovery gets its own special reveal.
  - **Time passing**: a calendar flip with an event digest when days advance.
- **Respect "reduce motion"**: every animation has a reduced or disabled variant, and tables stay crisp and fast.

## 5. Implementation Phases

Each phase ends playable or testable. See ARCHITECTURE.md for the module layout.

| # | Phase | Deliverable | Depends on |
|---|---|---|---|
| 0 ✅ | **Project setup** | Vite + React + TS, Tailwind, Vitest, lint, seeded RNG, app shell + **design system** (theme tokens, panels, data table, stat bars, motion primitives) | – |
| 1 ✅ | **World generation** | Geography, leagues, clubs, formations, players, attributes, OVR calc, generated crests/kits/portraits. World map + browser screens | 0 |
| 2 ✅ | **Time & match sim** | Calendar, fixtures, weekly statistical match sim, season rollover, player development | 1 |
| 3 ✅ | **Save/Load** | IndexedDB persistence, autosave, multiple slots | 1 |
| 4 ✅ | **Search & knowledge** | Filter builder, cost/duration formula, fog-of-war ranges, Player Pool, video scouting. *Career setup (name, background, difficulty) was pulled forward from phase 8, because search needs a scout with money and skills.* | 2 |
| 5 ✅ | **Travel & meetings** | Scout location, travel cost/time, meetings, persuasion score | 4 |
| 6 ✅ | **Recommend & sign** | Above-average gate, prospect exception, Head Coach sign-off, club evaluation, signing resolution, transfer windows, AI transfers, "Here we go" reveal | 5 |
| 7 ✅ | **Economy & payouts** | USD ledger, placement bonus, stacked per-match bonuses (tackle thresholds), expenses, bankruptcy = career over, matchday ticker | 6 |
| 8 ✅ | **Employment, trust, reputation** | Full-time vs freelance, job offers, trust/reputation effects (backgrounds & difficulty already done in phase 4) | 7 |
| 9 ✅ | **Missions** | Mission generation, deadlines, success/fail resolution | 8 |
| 10 ✅ | **Freelance market** | Selling mandates, free-agent representation, youth/prodigy flow | 8 |
| 11 ✅ | **Rival scouts** | AI scouts pursuing targets, hijacks, rumour news | 6 |
| 12 ✅ | **Assistant scouts** | Hire, assign tasks, generate pool entries | 4, 7 |
| 13 ✅ | **Balancing & polish** | Tuning config, onboarding, animation polish, reduced-motion pass, performance pass | all |
| 14 ✅ | **Pacing & deadline day** | "Advance until something happens", season review screen, transfer deadline day | 13 |
| 15 ✅ | **Wonderkid hunts** | Timed rumour hunts for hidden talents, vague clues, races against rivals | 11, 13 |
| 16 ✅ | **Match-day visits** | Attend a match in person, watch a play-by-play feed, pick who to focus on, reveal attributes from events | 5, 13 |
| 17 ✅ | **Scouting reports** | Write a verdict per player, report quality speeds sign-offs, track record of how your calls aged | 16 |
| 18 ✅ | **Goals, awards & specialties** | Season objectives, Scout of the Year, trophy cabinet, a specialty reputation that clubs ask for | 17 |
| 19 ✅ | **Your own agency** | Late-game business: offices in other countries, bigger staff, agency upkeep and income | 12, 18 |
| 20 ✅ | **Visual polish** | Trophy animations, world map of your placements, crests of clubs you've worked with | 18 |
| 21 ✅ | **Career end & hall of fame** | Retirement and game-over summary, final score, hall of fame across careers | 18 |
| 22 ✅ | **Scenarios** | Short, focused starts with their own goals and end conditions | 18, 21 |

**MVP = phases 0–11.** Phase 12 can ship right after.

**Expansion = phases 14–22.** All built. They make the game more fun after the MVP. Each one stays playable and testable on its own and is checked with the balance harness, so new income sources don't break the §3.9a targets.

## 5a. Expansion Design Notes

### 14 · Pacing & deadline day
- **Advance until something happens:** one button jumps day by day and stops at the first event that needs you: a new Inbox message, an offer, a deal decision, a search result, a mission deadline within 7 days, or the window opening or closing. It also stops after a set number of weeks.
- **Season review:** at each rollover, a screen with your season's money (in and out by source), placements, best and worst signing, your players' stats, reputation change and how you rank among rival scouts.
- **Deadline day:** the last day of each transfer window becomes hour by hour (for example 09:00 to 23:00, in 1-hour steps). Clubs make late bids, prices rise, open deals have to close before midnight or they fail, and some panic buys skip the usual checks. A ticker shows the hour and live news.

### 15 · Wonderkid hunts
- A few times a season, a rumour reaches your Inbox: a hidden talent in a vague area ("a 16-year-old forward somewhere in northern Peru, lower leagues"). The player is a real prodigy in the world.
- **Clues narrow it down:** country → region → city or club → name. You narrow it by searching the area, meeting local contacts or going there. Each step costs time and money.
- **Racing rivals:** one or two rival scouts get the same rumour. A timer and a rival-progress hint push you to act. Whoever finds him first gets the first chance to represent or place him. Unfinished hunts go cold.
- Hunts suit your standing: bigger reputation means rarer, more valuable talents.

### 16 · Match-day visits
- When you're at a venue on match day, you can **attend** instead of just "watching live". A short text play-by-play (about 30–60 key events) runs at a speed you choose.
- **Focus:** before kick-off, pick up to 3 players to watch closely. Events for them reveal specific attributes ("beat his man twice down the left" → dribbling, pace) and narrow their ranges much more than a normal live watch.
- Players you don't focus on reveal little. Your eye skill sets how much each event tells you. The match result comes from the normal match sim, so attending never changes the outcome.

### 17 · Scouting reports
- For a player you know well enough, write a report: your rating (1–100), a potential grade, a role and a one-line verdict picked from phrases (for example "ready now", "one for the future", "risky signing").
- Recommending with a report raises the coach's sign-off chance, based on how much you know about the player and your past accuracy.
- **Track record:** a year after each report, the game compares your rating with how he turned out. Your accuracy shows on the Career screen, and clubs trust accurate scouts more. Overrating players hurts.

### 18 · Goals, awards & specialties
- **Season objectives:** 3 goals per season based on where you are ("Place 2 players in tier 3", "Find a prodigy", "Finish in profit"). Rewards are reputation and a small cash bonus.
- **Awards:** an end-of-season Scout of the Year vote (you against the rival scouts) per country and worldwide, plus "Signing of the Season". Wins go into a **trophy cabinet**.
- **Specialty:** your record builds labels such as "South America specialist", "goalkeeper expert" or "free-agent hunter". Clubs ask for you by specialty, through more invitations and missions in that niche, and you get a small sign-off bonus there.

### 19 · Your own agency
- Unlocks at a high reputation (about 60). You found an agency with a name and logo. This replaces the client-slot cap with office capacity.
- **Offices** in other countries: rent each month, work at home cost there, and a better local view (more search reach). Staff limits grow with offices.
- **Running it:** weekly upkeep, assistants placed in offices, and the agency takes a cut from its staff's placements. It's a money sink and a money source for the late game, checked with the balance harness.

### 20 · Visual polish
- Trophy and award reveal animations, matching the "Here we go" card.
- **World map of your work:** pins where you've placed players, coloured by how they're doing, growing over a career.
- **Club wall:** crests of every club you've worked with or placed players at.
- All of it respects "reduce motion".

### 21 · Career end & hall of fame
- Retire whenever you like, or reach game over (bankruptcy). Both show a **career summary**: years, total earnings, placements, best find, stars you discovered, awards and accuracy.
- **Final score** from money, reputation, awards and how well your placements did. It's stored in a **hall of fame** across careers (kept in its own saved record, separate from game saves).

### 22 · Scenarios
- Preset starts with their own goals, time limit and score, picked on the new-career screen. Examples:
  - **Shoestring:** start broke in a small, poor country. Reach $100k in 3 seasons.
  - **Relegation rescue:** full-time at a struggling club. Keep them up this season.
  - **The golden generation:** find 3 prodigies before they turn 18.
  - **Big-club audition:** one season to impress a tier-1 club enough to hire you.
- Scenario results go into the hall of fame.

## 6. Acceptance Criteria (MVP)
- Start a new career, play 2+ full seasons with no crashes, then save and reload with identical state.
- A search with filters returns matching players, deducts the right cost, and advances the calendar by the estimated days.
- Fog ranges narrow as knowledge grows, and the true value always stays inside the shown range.
- A recommended player can sign during a window, and later earns match bonuses that show up in the ledger with the right source tag.
- Freelance percentages are higher than full-time for every bonus type.
- Recommending a senior player who isn't above the club's positional average is rejected, and pays $0.
- Selling mandates and free-agent representation are only available in freelance mode.
- A rival scout can land a target you were pursuing, and your deal is marked "hijacked".
- Every animation respects the OS "reduce motion" setting.
- A signing only becomes official after the Head Coach approves it.
- The balance harness confirms the §3.9a targets (season 1 roughly break-even, season 5 at $150k–$400k per year) on Normal difficulty, and no money value is ever fractional.
- An accepted mission that misses its deadline lowers trust. A completed mission raises it.
- Simulating one week for the whole world takes **< 300 ms** on an M4. A season rollover takes **< 3 s**.

## 7. Non-Goals (for now)
- Real player/club data or licensed names.
- 2D/3D match visualisation.
- Multiplayer, cloud saves, mobile layout.
- Managing the team yourself (picking lineups, tactics).

## 8. Risks
| Risk | Mitigation |
|---|---|
| Economy balance (too easy or too punishing) | Tuning constants sit at the top of each system module. The headless balance harness (`npm run balance`) plays N seasons with a bot scout and one season of an agency's books, and reports the income curves |
| Performance with ~50k players | Pure-TS engine in a Web Worker. Every league gets the full sim and still fits the budget (~185 ms a week), so the planned cheaper sim wasn't needed |
| World feels samey | Name generators per nationality, club personalities, manager changes, wonderkids |
| Scope creep | Phase gates: each phase ships playable and tested before the next |

## 9. Decisions & Open Questions

### Decided (2026-11-13)
- **World data:** fictional, procedurally generated world on real geography.
- **Bonus span:** performance bonuses last for the player's **first contract** at the club only (they stop early if he leaves).
- **Negotiation:** you influence the signing odds through recommendations and meetings. The AI settles fee and wage.
- **Win/lose:** an open-ended sandbox with season goals and awards. Money below 0 for 8 consecutive weeks = game over. You can retire whenever you like, and either ending gives a career summary and a final score in the hall of fame (phase 21). Scenarios add a goal and a time limit, and winning or losing ends them (phase 22).

- **Above-average rule:** the placement bonus is a one-off at signing. A club **rejects** a senior player who isn't above its positional average, and you earn nothing (the only exception is prospects, see §3.16).
- **Tackle bonus:** paid only when a player reaches a per-match tackle threshold. Fullbacks and wingbacks count as defenders (see §3.9).
- **Bonuses stack:** a captain who scores earns both the goal bonus and the captain bonus.
- **Bankruptcy** ends the career.
- **Starting setup:** you choose a background and a difficulty (§3.14a).
- **Rival scouts:** yes. AI scouts compete with you and can steal deals (§3.15).
- **Selling side:** yes, but **freelance only** (§3.10).
- **Free agents & youth:** yes. They appeal mainly to low-league clubs, but a prodigy draws interest from every club (§3.16).
- **Locale:** English UI, **USD ($)**.
- **Visual style:** Football Manager–style data density, made lively with motion and realistic presentation (§4a).
- **Prospect exception:** young prospects who are below average can still be placed. There's no placement bonus, but performance bonuses count (§3.16).
- **Sign-off:** every signing needs approval from the club's **Head Coach** (§3.8). (Originally Head Coach or President; the President was later removed.)
- **Money scale:** realistic USD values scaled by club tier and country wealth, with balance targets (§3.9a).

### Still open
- None blocking. Exact numbers will be tuned with the balance harness.
