# Phase 6: Academies — sponsor one, then open your own

## Why
Late-game money piles up with little worth buying. An academy is a long, satisfying investment: you find kids,
shape them, place them, and earn from their whole careers. It also puts your name on something that lasts.

## Two steps

### A. Sponsor a club's academy (reputation 45, freelance or agency)
- Pitch it to a club's president (existing board system): a yearly fee scaled by tier and wealth.
- While sponsoring:
  - each summer you see that club's youth intake first, well scouted (knowledge high, traits shown);
  - the club's intake gets more prodigies (your money buys coaches);
  - trust with the club rises, and its coach takes your calls about young players;
  - when the club releases an academy kid, you represent him by default.
- One sponsorship at a time (two with an agency). Cancel any time; the year's fee is not refunded.

### B. Open your own academy (agency only, in a country where you have a base)
- Build cost plus weekly upkeep. Three facility levels (pitches, coaching, recruitment reach) bought over time.
- Each summer it recruits 6–10 kids aged 15–16 from its country (and nearby countries at higher recruitment).
  You can also bring in a kid from your pool (unsigned youngsters from hunts or events).
- Academy kids belong to the academy: `Player.academyId?`, no club, not free agents; AI clubs can't sign them.
- They grow through training (development.ts, a coaching factor instead of minutes), so they plateau unless placed.
- From 17 you place them like a represented player (pitch to any club). The club pays a training fee, and you keep a
  sell-on share (a cut of his next transfer fee) written into the placement. Performance bonuses as usual.
- An assistant can be named academy director: his skill raises intake quality and he reports traits.
- A kid not placed by 19 leaves as a free agent.
- Hosting: from level 2 your academy runs a yearly youth cup (a scouting event in its city) where you see other
  clubs' best kids before anyone else.
- Prestige: "Academy graduate" tag on players; an Academy of the Year award; career-end summary counts graduates.

## Files
- new model/academy.ts, systems/academy.ts (`sponsorAcademy`, `openAcademy`, `upgradeAcademy`, `academyTick`
  for the summer intake, `placeGraduate`)
- systems/season.ts youth intake (sponsored clubs), systems/development.ts (training growth),
  systems/market.ts (graduates pitched like represented players), systems/payouts.ts (training fee, sell-on)
- systems/transfers.ts: pay the sell-on share when a graduate is sold
- systems/events.ts: youth cup; systems/goals.ts: award; systems/unlocks.ts: reveal at reputation 45
- views.ts, new academy-screen (or a section of agency-screen), club-screen sponsor badge

## Tests
- Sponsorship: intake is pre-scouted, prodigy chance rises, the fee is charged yearly.
- Own academy: intake each summer, kids can't be signed by AI, grow without minutes, leave at 19 unplaced.
- Placing a graduate pays a training fee; selling him later pays the sell-on share once.
- Balance harness: one bot career with an academy from season 3; money curve stays in range.

## Risks
- Player count grows: cap academy size (level × 12) and release kids at 19.
- Economy: set upkeep so an academy pays back over 3–5 seasons, not one.
- Split into two commits (A then B) so sponsorship can ship on its own.
