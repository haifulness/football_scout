# Players as people, a shaped year, and your own academy

Status: planned 2026-11-22, not started

Six ideas from the 2026-11-22 brainstorm, aimed at three gaps: players are only numbers, a placement stops mattering
once it's signed, and the year has no shape apart from deadline day. The late-game centrepiece is an academy you
sponsor or open yourself.

| # | Phase | Risk | File |
|---|-------|------|------|
| 1 | Character traits | Medium (touches knowledge, deals, match sim) | [phase-01-character-traits.md](phase-01-character-traits.md) |
| 2 | Settling in after a move | Medium (changes who plays) | [phase-02-settling-in.md](phase-02-settling-in.md) |
| 3 | Stories for the players you place | Medium (new monthly events, trust effects) | [phase-03-placement-stories.md](phase-03-placement-stories.md) |
| 4 | Club styles | Low–medium | [phase-04-club-styles.md](phase-04-club-styles.md) |
| 5 | International tournaments | Medium (new competition, values move) | [phase-05-tournaments.md](phase-05-tournaments.md) |
| 6 | Academies: sponsor one, then open your own | High (new player pool, economy) | [phase-06-academy.md](phase-06-academy.md) |

## Order
- 1 → 2 → 3: traits feed settling (homesick, adaptable) and stories (ambitious players sulk on the bench).
- 4 and 5 are independent; either can go any time after 1.
- 6 last: academy kids show traits and settle like everyone else, and the youth cup reuses the events calendar.

## Shared rules
- New state fields are optional and filled on load; no schema bump unless a phase says so.
- Every effect a player can feel is shown in plain words where it happens (pitch dialog, player page, Home).
- No plan IDs or phase numbers in code, tests or commit messages.

## Acceptance
- Full suite passes after each phase; balance harness in range on seeds 4242 and 777.
- Old saves load and play a full year.
- Each phase checked in the browser at desktop and phone width.
