# Phase 5: Reports written from your pitch

## Requirements
No manual report form. When you pitch a player, the game files a report from your estimate
(middle of the range, potential grade, verdict from your confidence). The one-year review and
its "spot on / way off" feedback stay, and still feed trust.

## Files
- `src/engine/systems/reports.ts`, `deals.ts` (on pitch), `src/ui/components/report-panel.tsx` (read-only history)
- Tests: `tests/engine/reports.test.ts`

## Steps
1. On pitch, call `writeReport` if none is open for that player (skip below REPORT_MIN_KNOWLEDGE, as now).
2. Turn the report panel into a read-only record with the review result.

## Validation
Report tests rewritten for the automatic path; accuracy trust still moves.

## Risks
Players lose a way to "bet" on a player they don't pitch; acceptable for simplicity.
