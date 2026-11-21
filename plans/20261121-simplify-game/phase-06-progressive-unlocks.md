# Phase 6: Reveal later systems as you grow

## Requirements
New careers see the core only. Later systems appear with a short inbox note when unlocked:
- Selling for clients (mandates) and representing free agents: reputation threshold
- Assistants (Staff): reputation threshold
- Agency: existing `agencyCheck` requirements
Thresholds to set from the balance harness (when bots typically reach them).

## Files
- `src/engine/systems/market.ts`, `assistants.ts`, `agency.ts` (gates), `src/engine/index.ts` (unlock flags in the summary)
- `src/ui/app.tsx` (hide locked hub tabs), `getting-started.tsx` (next unlock hint)

## Steps
1. Add `unlocks(state)` returning which systems are open and the next one's requirement.
2. Gate engine actions and hide UI; post a one-time inbox note per unlock.
3. Scenarios that start ahead keep their systems unlocked.

## Validation
Tests: locked actions throw a clear error; unlock fires once. Browser: fresh career shows the smaller menu.
