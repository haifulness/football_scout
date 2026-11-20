# Football Scout

A single-player football scouting career game that runs locally in your browser, in a fictional world on real geography. Find players nobody else has seen, convince coaches to sign them, and get paid every time they perform. See [PLAN.md](PLAN.md) for the game design and [ARCHITECTURE.md](ARCHITECTURE.md) for the technical design.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Engine tests (Vitest) |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Production build into `dist/` |
| `npm run balance` | Balance harness: world money by tier, a bot career, one season of agency books (`SEASONS=n`, `SEED=n`; ~40 s for 5 seasons) |

## Status

**Every planned phase is built (0–22).** 190 engine tests pass. Across four seeds the balance bot makes +$9k to +$87k in its first season and +$229k to +$1M in its fifth (three of the four inside PLAN §3.9a's $150k–$400k; the bot's careers vary a lot from seed to seed).

## The game

### The world
- A seeded world: 42 countries, ~1,600 clubs and ~45,000 players. Browse it from the world map → country → club → player.
- Every league plays a full double round-robin on a real calendar (August–May). A statistical match engine produces scores, scorers, assists, tackles, clean sheets, captaincy, injuries and ratings. Players develop every month.
- **Each summer (1 July):** promotion and relegation, coaching changes, contract renewals and releases, retirements, academy intake and new fixtures, all reported in the Inbox. AI clubs trade all through each transfer window.

### Your scout
- **New career:** pick a name, nationality, home market, background (ex-pro, data analyst, agent's assistant, youth coach) and difficulty ($25k / $10k / $3k to start).
- Or pick a **scenario** instead (see Ending a career).
- **Fog of war:** every rating is a range that narrows as you learn about the player. Potential, traits and prodigies are revealed along the way.
- **Search** filters by area, league, positions, age, value, wage and ability ranges, with a live cost and duration estimate. Results go to your **Player Pool**. Ratings in the results are your estimate (in bold, beside its range) at the position you searched for, and the rating filter goes by exactly that number. The wage filter goes by what a player earns now, or, if he's a free agent, what he expects (shown as ≈). A search started from a club's needs or a mission brief instead filters by what each player would ask that club a week, shown in an Asks column, red when the club's wage budget has no room, and leaves out the club's own players. Your network only reaches so far: early on you mostly find lower-league players, and stars appear as your reputation, network and market knowledge grow.
- **Video analysis** raises knowledge up to 60.
- **Travel:**
  - You have a location. Trips are priced by distance, with a route map and flight animation.
  - Nights away from home cost a hotel, except on day trips inside your home region.
  - You can always travel home, even into debt.
- **Live scouting:**
  - **Quick watch:** one click at a player's next match.
  - **Attend & watch closely:** a play-by-play of the real match. Pick up to three players, and what they do reveals specific attributes.
- **Meetings** with players and Head Coaches build rapport and relationships. Big clubs won't see an unknown scout. A first meeting costs the full price; catch-ups afterwards cost about 40% of it, and the price varies a little from day to day.
- **Scouting reports:** once you know a player well enough (knowledge 40), sign a report: your rating at a role, a potential grade and a verdict.
  - A report makes coaches keener to sign off.
  - A year later it's checked against how he turned out, and your accuracy builds a **track record** that clubs trust.

### Recommending and signing
- **Recommending:**
  - Recommend players to clubs you work for.
  - The dialog compares your estimate with the club's positional average and shows fee and wage against budgets. It also gives your read on the Head Coach, notes any report or specialty that helps, and checks mission requirements.
- **The Head Coach decides:** pitch to him in person, or by phone once a club you work for trusts you (trust 60): no trip or fee, but a little less convincing. His "no", or a club-level "not good enough" or "can't afford", is final for that player.
- **Wages:** a player asks the buying club for its usual pay for someone of his level. Well-paid players hold out for up to 30% more than that, and take at most a 25% cut on what they earn now. Clubs stretch up to 10% past their wage budget for a signing.
- **Exceptions:** young players below the average can still be placed on potential, at clubs that take prospects.
- **Completing deals:** negotiations take 1–2 weeks, and deals complete in transfer windows. Rival scouts and AI clubs can **hijack** your targets. A completed signing gets a **Here we go!** reveal.
- **Deadline day** (31 August and 31 January) is played hour by hour, with a live feed of late deals. Prices rise, coaches sign off more easily, and every open negotiation is settled by midnight.

### Money
- **Signing bonus:** 2% of the fee (or market value for free agents) as a freelancer, 1% full-time. It tapers above $1M, rises up to ×1.5 for a big quality gap, and never falls below a floor by club tier. Prospects pay no signing bonus.
- **Match bonuses** for every placed player until his first contract ends or he leaves:
  - appearances;
  - goals and assists (forwards and attacking midfielders), tackle matches (defenders and defensive midfielders) or clean sheets (goalkeepers);
  - captaincy.
  - They are scaled by club tier and doubled for freelancers.
- **Finances** shows your balance, money in and out by source, placements and the ledger. Eight straight weeks below $0 ends your career.

### Career paths
- **Freelance:**
  - Work for 2–5 client clubs (more with reputation). Propose an agreement once you know the Head Coach, or accept invitations.
  - Take **selling mandates** from clients: sell their player to anyone for a 3–5% commission.
  - **Represent free agents** who trust you.
- **Full-time:** job offers come with a salary, expenses covered and pitching only to your employer. Resign with notice, get dismissed if trust collapses, or renew: when the contract ends a club that trusts you offers one new contract, and turning it down (or letting it lapse) sends you back to freelance work.
- **Trust** per club comes from your relationship with the Head Coach, your record there and your report accuracy. The **Career** screen brings it together.
- **Missions:** clubs post briefs ("CM rated 39+, aged 29 or under, within 8 weeks") built from real squad needs. Complete them for a reward and trust. Miss an accepted deadline and trust drops.
- **Assistant scouts** (Staff screen) scan an area for weeks and add players to your pool with their own, imperfect rating. They improve with time in the field.
- **Your own agency** (Agency screen):
  - From reputation 60, working freelance, found an agency with a name and logo. Open up to 4 offices abroad: each costs rent and adds room for 2 more clients and 2 more staff.
  - Where you have a base, hotels are free and searches are cheaper and reach further.
  - Assistants placed at an office broker some of the transfers into that country for a cut. Well-staffed bases pay their way, empty ones drain money.

### Competition
- **Rival scouts:** 50, 80 or 110 of them, by difficulty. They chase players before each window, hear about the players you're working on, and compete for jobs and clients.
- **Rumours** of their chases warn you on the player page, in the recommend dialog and on the Deals screen. The **Rivals** screen ranks every scout by reputation.
- **Wonderkid hunts:** every few months a contact whispers about a hidden prodigy ("a 16-year-old winger in Portugal, at a lower-league club").
  - On the Hunts screen, narrow it down from country to region, city and name, by phone or in person.
  - One or two rivals race you. Find him first and he's yours to work with for four months.
  - About one whisper in four is just hype: a YouTube skills star, a 5-a-side legend, one lucky game. You only find out at the end of the trail (sometimes a clue gives it away), and so does any rival who chases it.

### Goals, awards and your legacy (Goals screen)
- **Season goals:** three each season, suited to where you stand (place players, place one abroad, find a prodigy, make a profit…). Each pays a bonus and reputation, and all three win a **Clean sweep** trophy.
- **Awards** each summer:
  - **Scout of the Year** for your country and the world, a mid- to late-career honour.
  - **Signing of the Season** in each league where one of your signings plays.
  - Every trophy gets its own reveal and goes into your **trophy cabinet**.
- **Specialties:** where your placements cluster (a continent other than your own, a position group, young players, free agents) you become a specialist (3 placements) or expert (8). Coaches sign off more readily there, and clubs in that niche come looking for you.
- **Your work around the world:** a map pin for every city where you placed players, coloured by how they're doing this season. The **club wall** shows the crest of every club you've worked with.

### Pacing
- Time controls: **+1d**, **+1w**, **Matchday** and **Play on ▸▸**.
- **Play on** runs until something needs you: a deal decision, an offer, a message, a deadline a week away, a window opening or closing, deadline day or a new season. The top bar says why it stopped.
- Each summer a **season review** shows your money by source, placements, reputation change, how each player did, where you ranked among the rivals, and your goals and awards.

### Ending a career
- **Retire** whenever you like (bottom of the Career screen, which shows your score if you stopped today), or go bankrupt.
- **Career summary:** either way it shows seasons, money earned, placements, prodigies found, best find, stars found, trophies and report accuracy.
- **Final score:** reputation gained, earnings, placements, stars, trophies and accuracy. Bankruptcy keeps 75% of it.
- **Hall of fame:** every finished career goes there, on the start screen. Entries are kept apart from saves, so deleting a save keeps them.
- **Scenarios:** short starts with their own goal and time limit. A win scores a bonus, more the earlier you win.

| Scenario | Start | Goal |
|---|---|---|
| Shoestring | $1,000 in the poorest football country, on Hard | $100,000 within 3 seasons |
| Relegation rescue | Full-time scout at the weakest top-flight club in your home market | Avoid relegation this season |
| The golden generation | A normal start | Be first to reveal 3 prodigies aged 17 or under, within 3 seasons |
| Big-club audition | A tier-1 client from day one, reputation 35 | Raise their trust to 60 before the season ends |

### Saves and getting around
- Every world is a save slot in the browser (IndexedDB). It autosaves every in-game week; save any time with **Save** or **⌘S**.
- The main menu has **Continue**, Load, Delete and **Export/Import** of `.fsave` backups. Saves live in this browser, so export a backup before clearing browser data. Older saves upgrade automatically.
- The **search box** in the top bar (`/` or ⌘K) finds any player, club, league, country or city, accents ignored.
- New careers get a **Getting started** checklist on the World screen.
- Animations respect the system's reduce-motion setting.
- The layout works on phones and tablets: below laptop width the sidebar becomes a slide-in menu (☰).
