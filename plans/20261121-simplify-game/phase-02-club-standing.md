# Phase 2: One club standing

## Requirements
Players see one number per club, **standing** (0–100), instead of "trust" and the head-coach
"relationship". Meetings, signings, briefs and report accuracy all move it. Reputation, player
rapport and market knowledge stay.

## Files
- `src/engine/systems/employment.ts` (`clubTrust`), `fieldwork.ts` (meetings), `deals.ts` (pitch odds, remote pitch at 60), `missions.ts`, `market.ts`
- `src/engine/index.ts` views; `src/ui/components/relationship.tsx`, `recommend-dialog.tsx`, `club-screen.tsx`, `career-screen.tsx`
- `src/persistence/save-format.ts` (migration)

## Steps
1. Decide storage: keep relationships internally but present `standing = clubTrust` everywhere, and make meetings raise standing directly (simplest, no migration); or store standing per club (cleaner, needs migration). Prefer the first.
2. Replace every relationship bar for head coaches with the standing bar; keep presidents behind it.
3. Re-tune thresholds (agreement, phone pitch 60, sign-off odds).

## Validation
Unit tests for meetings/agreements/phone pitch updated; balance harness on 4 seeds; check the pitch card and club page.

## Risks
Balance: early agreements may get easier or harder. Compare placements per season before/after.
