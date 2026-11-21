# What you know about a player, and when it goes stale

Status: in progress — phases 5, 1, 2 and 3 built; phase 4 left

Today your read on a player can't go out of date: knowledge decays (−2 a month after 60 days), but ranges
are always drawn around his *current* ability, so a stale estimate silently follows him. These phases make
your information a snapshot that can age, show when it has, and give cheap ways to refresh it. A fifth
phase adds the selling club's own report when you get a mandate.

| # | Phase | Risk | File |
|---|-------|------|------|
| 1 | ✅ Your read is a snapshot | Medium (pitches can now surprise) | [phase-01-snapshot.md](phase-01-snapshot.md) |
| 2 | ✅ Freshness labels and warnings | Low | [phase-02-freshness.md](phase-02-freshness.md) |
| 3 | ✅ Events that make your read stale | Low | [phase-03-stale-events.md](phase-03-stale-events.md) |
| 4 | A cheap check-in | Low | [phase-04-check-in.md](phase-04-check-in.md) |
| 5 | ✅ The selling club’s report on mandate players | Low–medium | [phase-05-mandate-reports.md](phase-05-mandate-reports.md) |

Order: 1 → 2 → 3 → 4 (each builds on the snapshot), 5 independent.

## Acceptance
- Full suite passes; balance harness in range on seeds 4242/777.
- Old saves load: a missing snapshot is taken from the current read the first time it's needed.
- Each phase checked in the browser (pool, player page, pitch dialog, mandate offer).

## Later (not in this plan)
- An assistant task "keep my pool fresh" (check-ins in his area each week).
- Public form since you last looked (apps, goals, rating) in the pool.
