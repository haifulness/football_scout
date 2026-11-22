# Phase 2: Settling in after a move

## Why
Today a good player is good anywhere. Settling makes *where* you place him matter, and gives you aftercare work.

## Design
- On every completed transfer (yours and AI's) set `Player.settling?: { until: GameDate; start: number }`, where
  `start` is a rating penalty share (0–0.12) that fades linearly to 0 by `until`.
- How long and how hard, from:
  - same country 0, same culture (country `culture`, which is the language group) small, same continent medium,
    another continent large;
  - Adaptable halves it, Homesick doubles it abroad, Professional shortens it;
  - age: under 20 and over 30 take longer;
  - a teammate of the same nationality shortens it.
- Effect: `pickTeam` and match ratings use rating × (1 − current penalty). So an unsettled player plays less and
  scores less, which already feeds bonuses, form and the stories in phase 3.
- Aftercare: meeting a player you placed while he is settling cuts the remaining time (once a month, cost of the
  trip). Rapport rises.
- Shown:
  - pitch dialog: "Settling: likely slow (another continent, homesick)" when the trait is known, "unknown" when not;
  - player page: "Settling in, about 2 months left";
  - Home in-progress item for your placed players who are settling.

## Files
- model/player.ts (`settling?`)
- systems/transfers.ts (where a move completes) or deals.ts `completeDeal` + AI transfers in season.ts
- systems/match-sim.ts `pickTeam` and rating lines
- systems/fieldwork.ts: aftercare meeting
- views.ts, player-screen, deals pitch dialog, home

## Tests
- Domestic move: no settling. Intercontinental homesick: longest. Adaptable: shortest.
- Penalty fades to zero by `until`; aftercare shortens it once a month.
- A settling player is picked less often than the same player settled (seeded).

## Risks
- AI transfers get it too, so league strength shifts slightly in summer; check the harness and that top clubs still
  win titles at a similar rate.
