# A living world: coaches, events, dilemmas

Status: built 2026-11-21 (all four phases)

Goal: break the search → pitch → sign loop with a world that changes under you, a reason to plan the
season, and choices that cost something. Builds on existing systems; no new currencies except a hidden
integrity score.

| # | Phase | Risk | File |
|---|-------|------|------|
| 1 | Coaches get sacked and rehired | Medium (balance of trust) | [phase-01-coach-carousel.md](phase-01-coach-carousel.md) |
| 2 | Scouting events calendar | Medium (new screen, travel) | [phase-02-scouting-events.md](phase-02-scouting-events.md) |
| 3 | Dilemmas and integrity | Medium (writing, effects) | [phase-03-dilemmas.md](phase-03-dilemmas.md) |
| 4 | When you can pitch a rejected player again | Low–medium | [phase-04-repitch-rules.md](phase-04-repitch-rules.md) |

## Acceptance
- Full test suite passes; balance harness stays in range on seeds 4242/777/1111/2024.
- Old saves load (new fields optional).
- Each phase visible on Home / inbox and checked in the browser.
