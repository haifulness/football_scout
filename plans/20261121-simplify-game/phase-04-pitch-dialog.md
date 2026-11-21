# Phase 4: Pitch dialog, one verdict first

## Requirements
Open with one verdict line ("Strong case: likely yes" / "Long shot" / "Blocked: no wage room")
and one Pitch button, defaulting to the head coach and the suggested wage. Bar chart, money rows,
wage offer, going over the coach's head and brief checks sit behind "Details / adjust terms".
Blocking reasons (fee, wage room, policy) always show.

## Files
- `src/ui/components/recommend-dialog.tsx` (856 lines: split into verdict header + details sections)

## Steps
1. Compute the verdict from existing preview data (affordability, chance, brief fit).
2. Collapse the details by default; remember the choice per viewer.
3. Keep the "Meet him first" button next to the verdict when the odds are low.

## Validation
Browser: affordable / unaffordable / brief / phone pitch cases, desktop and phone.
