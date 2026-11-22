# Phase 1 — The Touchline

Rename "The Scouting Weekly" to **The Touchline** and turn it from a listing page into a newspaper built
from what actually happened in the past week. The practical needs data stays, as the paper's "Wanted" page.

## Articles (engine: `src/engine/systems/newspaper.ts`, built on demand in `getGazette()`)
- **Front page**: the biggest story of the week, by priority: one of your signings starred (goal/MOTM),
  a sacking in your home top flight, a big transfer in your country, a change at the top of the table;
  otherwise the most pressing need at your clubs (today's lead).
- **Results**: last round of your home top flight, with a one-line upset/thrashing note.
- **Table**: top four and bottom three of the home top flight, with form.
- **Transfer column**: done deals from world transfer news this week.
- **Rumours**: rival chases (existing), plus club–player links. Most are true (a club with an urgent need and
  money is watching a player who fits), some are false. Deterministic per issue; truth never shown.
- **Interview**: a coach with a need talks; his quote hints at the position (a brief may follow).
- **Under pressure**: coaches in the home top flight the board is losing patience with (the carousel's
  pressure measure), with days in the job and points from the last five.
- **Pundit's predictions**: title, relegation and breakout picks made at season start (stored in
  `state.predictions`), shown against the current table; graded in the season-end issue.
- **Your corner**: how your placed players are doing this season (apps, goals, average rating).
- **Wanted**: your clubs' needs, leads, positions in demand, pool fits (unchanged data).

Bylines from a fixed list of made-up reporters, per section.

## Files
- new `src/engine/systems/newspaper.ts` (+ `pressure` exported from coaching.ts)
- `src/engine/model/world-state.ts` (`predictions?`), `src/engine/views.ts`, `src/engine/index.ts`
- `src/ui/screens/gazette-screen.tsx` (newspaper layout), `src/ui/components/hub-tabs.tsx` (label)
- tests: `tests/engine/newspaper.test.ts`

## Validation
- Unit: front page priority, rumours deterministic per issue with a true/false mix, predictions made once a season.
- Browser: desktop three-column layout, phone stacks; links open clubs/players.
