# Simplify: the clear wins

Status: done 2026-11-28 (all three phases)

Feedback: "Check the entire game for anything that is too complicated and unnecessary." From the audit, these are
the fixes that remove clutter without undoing anything the user designed. The cuts (dilemmas, consultations,
campaigns, own academy, pundit, match bonuses, career score) and the single client review are left for later.

## Phases
| # | Phase | Risk |
|---|-------|------|
| 1 | [Pitch dialog and the coach's yes](phase-01-pitch.md): each factor shown once, nothing counted twice | Medium (balance) |
| 2 | [Scouting actions](phase-02-scouting-actions.md): check-in folds into video, one way to go to a match | Low–medium |
| 3 | [Words and loose ends](phase-03-words-and-loose-ends.md): one word per idea, dead code, rival-agency log | Low |

Phases are independent; do them in order, one commit each.

## Not changing
- **The star on players.** It only pins and sorts the pool, but that is a normal, cheap feature. Kept.
- **Coach patience, position fatigue, hit rate.** Designed in the challenge plan. Only how they're shown changes.
- **Window plan, contract terms.** Asked for today.

## Acceptance
- The pitch dialog's headline area has no factor that is repeated below it.
- `signOffProbability` counts the coach relationship once and report accuracy once. The balance bot on seeds 4242,
  77 and 913 (freelance and `JOB=1`, 3 seasons) ends within about 10% of today's money, with no losing season.
- A player has one footage action and one match action.
- The UI uses: **reputation** (you, everywhere), **standing** (a club's view of you), **rapport** (a person: coach,
  player, contact).
- `npx vitest run --maxWorkers=3` and `tsc -b --noEmit` pass.

## Baseline (job mode, 3 seasons, before this plan)
- 4242: $114k (freelance $139k). 77: $186k (freelance $562k). 913: $262k (freelance $194k).

## After phase 1 (3 seasons, money at end)
| Seed | Freelance | Job |
|------|-----------|-----|
| 4242 | $153k (was $139k) | $107k (was $114k) |
| 77 | $380k (was $562k) | $155k (was $186k) |
| 913 | $194k (same) | $248k (was $262k) |

Seed 77 freelance: the season-3 sign-off rate rose (78%, was 68%) but the career made fewer pitches (45, was 53), a
different path rather than harder coaches. Moving the record base by 6 points changed only seed 4242, so the
sign-off uses `record / 40` with no offset. Losing seasons are the same as before: 4242 freelance season 1 (−$5.9k) and 913 freelance season 3 (−$7.4k).
