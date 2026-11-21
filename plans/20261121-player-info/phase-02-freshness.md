# Phase 2: Freshness labels and warnings

## Requirements
- Freshness from the snapshot's age: fresh (< 3 months), ageing (3–6), stale (6+), or stale at once (phase 3).
- Pool: a badge per row, sort and filter by freshness. Player page: "Seen 7 months ago".
- Pitch dialog verdict: a chip when the read is ageing/stale ("Your read is 7 months old").

## Files
- `src/engine/index.ts` / `views.ts` (`freshness`, `seenOn` on player rows and the pitch preview)
- `src/ui/screens/pool-screen.tsx`, `player-screen.tsx`, `components/recommend-dialog.tsx`
