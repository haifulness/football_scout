# Phase 3: Events that make your read stale

## Requirements
Mark a pool player's read stale at once, with one inbox note, when:
- he moves club or league;
- he's injured for a month or more;
- he turns an age where players change fastest (21 and under each birthday, 31 and over);
- his form jumps (season average rating well above or below when you saw him).

## Files
- `src/engine/systems/knowledge.ts` or new `freshness.ts` (`markStale`, daily/weekly check over the pool)
- Hooks: transfers (`executeTransfer`), injuries (match sim), birthdays (monthly update)

## Validation
Tests: each trigger marks stale once and sends one note; no notes for players outside the pool.
