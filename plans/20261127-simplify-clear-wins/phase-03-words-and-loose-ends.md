# Phase 3: words and loose ends

## A. One word per idea
- **Reputation**: you, across the game.
- **Standing**: how a club sees you (`clubTrust`, `standingLabel`).
- **Rapport**: a person (coach, player, contact). Replaces "relationship" in the UI.
- "Their trusted eye" and "throwing names at the wall" become a plain hit rate: "Hit rate 70%: +5%".

Known fixes:
- recommend-dialog.tsx about line 728: meeting the coach shows "Standing 20 → 35", but the number is the coach
  relationship. Change to "Rapport with the coach 20 → 35".
- Sweep UI strings in src/ui and text built in src/engine/views.ts and index.ts for "relationship" and "trust"
  used for these ideas. Variable names stay as they are.

## B. Loose ends
- Remove the unused facade method `writeReport` (index.ts about line 439). `systems/reports.ts writeReport` is
  still used inside the engine and stays.
- Rival agencies: when `rivalBrokers` takes a signing, add an `agencyLog` line ("Northgate got to the Silva deal
  before your staff"), so you see the competition happen.
- employment.ts about line 38: remove the stray doc comment above `standingLabel` (it belongs to `clubTrust`).
- Headers of systems/scenarios.ts and systems/goals.ts: remove the plan and phase references ("phase 22",
  "PLAN §5a, phase 18") and describe the behaviour instead.

## Tests
- Unit: a rival-agency broker writes one agency log entry.
- Full suite and `tsc -b --noEmit`.

## Done
- The UI already used "standing" for clubs and "rapport" for players; two strings changed (the coach meeting note
  and the ask-the-coach tooltip). The hit-rate wording changed in phase 1.
- Plan and phase references were removed from every engine header (about 20 files), not only the two named here.
- Rival-agency deals log as `kind: 'rival'` (⚔️, in red) on the agency screen.
