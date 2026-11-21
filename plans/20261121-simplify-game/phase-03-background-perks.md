# Phase 3: Background perks instead of fixed skill bars

## Requirements
The five skills (1–20) never change, yet the Career screen shows them as progress bars. Replace the bars with 2–3 plain perks per background (e.g. "Ex-pro: tighter ranges when watching live"), shown in setup and on the Career screen. Engine values stay as they are.

## Files
- `src/engine/systems/scouting.ts` (BACKGROUNDS: add `perks: string[]` derived from the skill values)
- `src/ui/components/career-setup.tsx`, `src/ui/screens/career-screen.tsx`

## Steps
1. Write perk text from each background's strongest/weakest skills and what each skill actually does in code (verify by grep).
2. Swap the bars for the perk list.

## Validation
Visual check in setup and Career; no engine test changes expected.
