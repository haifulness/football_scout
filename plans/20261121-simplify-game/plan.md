# Simplify the game before adding features

Status: done 2026-11-21 (all six phases)

The core loop (fuzzy estimates → club needs → convince the coach) stays. The aim is fewer
screens, fewer overlapping numbers, and later systems revealed as you grow.

| # | Phase | Kind | Risk | File |
|---|-------|------|------|------|
| 1 | ✅ Merge the menu (15 → 9 items) | UI only | Low | [phase-01-merge-menu.md](phase-01-merge-menu.md) |
| 2 | ✅ One club standing instead of trust + coach relationship | Engine + balance | Medium | [phase-02-club-standing.md](phase-02-club-standing.md) |
| 3 | ✅ Background perks instead of fixed skill bars | UI (+ small engine) | Low | [phase-03-background-perks.md](phase-03-background-perks.md) |
| 4 | ✅ Pitch dialog: one verdict, details on demand | UI | Low–medium | [phase-04-pitch-dialog.md](phase-04-pitch-dialog.md) |
| 5 | ✅ Scout reports written from your pitch | Engine + UI | Medium | [phase-05-auto-reports.md](phase-05-auto-reports.md) |
| 6 | ✅ Reveal later systems as reputation grows | Engine + UI | Low–medium | [phase-06-progressive-unlocks.md](phase-06-progressive-unlocks.md) |

Order: 1 → 3 → 4 → 6 → 5 → 2 (2 last: it moves balance).

## Dependencies
- 6 relies on 1 (unlocks hide items in the merged menu).
- 5 and 2 both touch `clubTrust`; do 5 first so 2 rebalances once.

## Acceptance (whole plan)
- Full test suite passes; balance harness (`SEED=n SEASONS=5 npm run balance`, seeds 4242/777/1111/2024) stays in the current ranges.
- Old saves load (migrations where state shape changes).
- Every screen still reachable; each change checked in the browser at desktop and phone width.
