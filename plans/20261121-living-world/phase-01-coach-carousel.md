# Phase 1: Coaches get sacked and rehired

## Requirements
- Mid-season: clubs well below where their reputation says they should be, on a bad run, may sack the
  Head Coach (after he's had ~3 months). Summer changes (relegation etc.) keep working.
- Sacked coaches go out of work instead of vanishing; clubs looking for a coach often hire one of them.
  Your relationship (keyed by the coach) follows him: follow a coach you trust to his new club.
- A new coach may bring his own formation (club needs change) and resets coach doubts.
- Inbox news when it touches you: your clients/employer, or a coach you know (relationship > 0).
  Other changes appear in the general news for your home country's top flight.

## Files
- New `src/engine/systems/coaching.ts` (`replaceCoach`, `coachTick`)
- `src/engine/model/club.ts` (`ClubOfficial.appointedOn?`, `unemployedSince?`, `formation?`)
- `src/engine/systems/season.ts` (summer changes use `replaceCoach`)
- `src/engine/tick.ts` (weekly `coachTick`)
- `src/engine/index.ts` / views (club page: appointed date; Home: coaching change items)

## Validation
Tests: a struggling club eventually sacks; a known coach rehired elsewhere keeps your relationship;
inbox news only for relevant clubs; rate of mid-season changes per season in a sane band (10–30% of clubs).
