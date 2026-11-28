# Phase 5: two staff modes

## Today
A staffer is in one of four states (`model/assistant.ts:60-66`), each with its own button in a different place:
- **Field task** (`assignTask`): scan a region for 1–8 weeks, adding players to the pool each Monday. Staff screen.
- **Brief or sale** (`delegateMission`, `delegateMandate`, skill ≥12): pitch up to 3 names for a 25% cut. Missions
  screen and market section.
- **Office** (`placeAssistant`): auto-picks untouched briefs in the base's country after 7 days, otherwise builds
  leads that broker AI signings. Agency screen.
- **Club study** (`sendAnalyst`): a 2-week read of one club's needs. Club screen only.

## Change
Two modes, shown as two choices on the staff card: **Send out** and **Place at a base**.
- **Send out** opens one form with three kinds:
  - "Scan a region" (today's field task);
  - "Work a brief or sale" (today's delegation, still skill ≥12);
  - "Study a club" (today's analyst, same 2 weeks and read quality).

  Engine: `task` gains `kind: 'scan' | 'study'` (study takes a `clubId`), and `analysis` folds into it. `job` stays
  as it is but counts as a send-out in the status pill.
- **Place at a base**: unchanged (agency only).
- The other entry points stay as shortcuts that open the same form pre-filled:
  - "Study this club" on the club page;
  - "Hand to staff" on a brief.

  So nothing you can do today goes away, but there's one status ("Out: studying Preston", "At base: Madrid") and one
  place to change it.
- **Fix:** the club-paid junior scout can't be placed at an agency base. Today `placeAssistant` doesn't check
  `clubPaid`, so the club's scout can broker your agency's deals for free. Add the check, and have `agencyOnSignings`
  skip `clubPaid`.
- Load: a live `analysis` becomes a study task with the same end date.

## Files
`model/assistant.ts`, `systems/assistants.ts`, `systems/club-asks.ts` (`sendAnalyst`, `analysisWeek` move under the
task), `systems/delegation.ts` (exclusivity checks), `systems/agency.ts` (`placeAssistant`, `agencyOnSignings`),
`index.ts`, `views.ts`, `ui/screens/staff-screen.tsx`, `ui/screens/club-screen.tsx:791`,
`ui/components/delegate-row.tsx`, load normalizer.

## Tests
- `assistants.test.ts`: a study task gives the same read as today's analyst.
- `agency-office.test.ts`: a club-paid scout can't be placed, and isn't counted by `agencyOnSignings`.
- `delegation.test.ts` unchanged.
- `tests/sim/balance.sim.ts` ("staffed offices pay for themselves") still passes.
