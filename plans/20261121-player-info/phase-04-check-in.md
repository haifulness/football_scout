# Phase 4: A cheap check-in

## Requirements
- "Check in" on a pool player: small fee, no time. Refreshes the snapshot to how he is now at your current
  knowledge level (no knowledge gain), and clears "stale".
- Limited so it isn't free re-scouting: once per player per month.
- Video and live watching still add knowledge (and refresh too).

## Files
- `src/engine/systems/knowledge.ts` (`checkIn`), engine method, pool row and player page buttons
