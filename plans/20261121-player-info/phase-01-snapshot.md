# Phase 1: Your read is a snapshot

## Requirements
- When you learn about a player (video, live, events, meetings, hunts, search results, assistants), store
  what you saw: his estimate range per position you can judge (and potential if visible), and the date.
- Pool, player page, search results and the pitch dialog show that snapshot, not a range around today's
  truth. A fresh look replaces it.
- Clubs still judge the real player: pitch on an old read and the answer reflects how he is now.
- Older saves: a missing snapshot is taken from the current read when first needed.

## Files
- `src/engine/model/scout.ts` (`Knowledge.seen?: { on, ovr, positions, potential? }`)
- `src/engine/systems/knowledge.ts` (`learn` stores the snapshot; `fog` returns it while it's the latest look)
- `src/engine/index.ts` views (seen date alongside ranges)

## Risks
- Every screen reading `fog()` changes behaviour: keep one place that decides snapshot vs live.
- Ranges must still contain the truth *at the time*, not now (tests: grow a young player, check the old range).
