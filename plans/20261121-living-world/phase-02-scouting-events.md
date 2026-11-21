# Phase 2: Scouting events calendar

## Requirements
- Each season ~8 events on fixed dates in real cities: youth tournaments, an U20 championship, trial days,
  a summer showcase for released players (free agents).
- Each gathers 12–25 relevant players. Attending (be in the city during the event, pay a ticket, spend
  1–3 days) boosts your knowledge of all of them at once and lets you add them to your pool.
- Listed under Coming up on Home and in the Weekly, with travel one click away.

## Files
- New `src/engine/model/event.ts`, `src/engine/systems/events.ts`
- `world-state.ts` (`events?: ScoutingEvent[]`), rollover creates the season's events
- Engine: `getEvents()`, `attendEvent(id)`; UI: Work hub tab "Events"

## Validation
Tests: events generated each season, attending needs presence and money, knowledge rises for the
gathered players, can't attend twice.
