# Phase 3: Dilemmas and integrity

## Requirements
- Occasional choices (about one a month) built from the current game: an agent offers a cut to push his
  player; a club asks you to talk down a player it's selling; a rival offers to trade notes; a prospect's
  family pushes the wrong club.
- Each choice has visible short-term effects (money, relationship, knowledge) and moves a hidden
  integrity score. Integrity changes how fast honest clubs trust you and how often shady offers come.
- Shown on Home (Needs you) and in the inbox; must be answered within a few days or it lapses.

## Files
- New `src/engine/model/dilemma.ts`, `src/engine/systems/dilemmas.ts`
- `scout.ts` (`integrity?: number`), `employment.ts` (trust uses integrity)
- Engine: `getDilemmas()`, `resolveDilemma(id, choice)`; UI: dilemma card on Home / Inbox

## Validation
Tests: dilemma generated with real context, each choice applies its effects once, lapses after the
deadline, integrity moves trust as described.
