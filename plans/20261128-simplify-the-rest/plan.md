# Simplify: the rest of the audit

Status: phases 1–4 done 2026-11-28

Follow-up to [the clear wins](../20261127-simplify-clear-wins/plan.md). This plan covers the audit's remaining items:
the client being judged twice, club standing, and the side features table. Every phase removes or merges
something you asked for at some point. So each phase is its own commit and can be dropped without touching the
others.

Reading the code changed three of the audit's claims (see "Not changing").

## Phases
| # | Phase | What you lose | Risk |
|---|-------|---------------|------|
| 1 | [One client review](phase-01-client-review.md): the July review and the quarterly rival race become one quarterly review | Two warnings per client become one | Medium (balance) |
| 2 | [Dilemmas and integrity out](phase-02-dilemmas.md) | The moral-choice cards and the hidden ±8 integrity | Low–medium |
| 3 | [Club standing you can read](phase-03-standing.md): top 3 reasons on the club page; the board shares the same record | A separate board standing formula | Medium (balance) |
| 4 | [Campaigns out, a lighter mentor](phase-04-campaigns-mentor.md) | Paid spotlight campaigns; the mid-career mentor offer and the mentor grudge | Medium (many hooks) |
| 5 | [Two staff modes](phase-05-staff-modes.md): out in the field, or at a base | Club study as its own mode (it becomes a field task) | Low–medium |
| 6 | [Sponsoring only, no own academy](phase-06-academy.md) | Building and running your own academy | Medium (save migration) |
| 7 | [Three match bonuses, a score without repeats](phase-07-bonuses-score.md) | Tackle and captain bonuses; the Placements line in the career score | Low (balance) |

Order: phase 2 before phase 3, since integrity is one of standing's inputs. The rest are independent.

## Not changing
- **Player consultations and club asks.** They aren't two versions of the same thing. In a consultation a player
  pays *you* for advice; it's your only advice income and the only route to finder fees. Club asks are where *you*
  pay or spend time to learn a club's needs, and the club read and the coach's yes depend on them. Cutting either
  would remove something the other doesn't do.
- **Scenarios.** Opt-in at career setup ("Free career" is the default), and self-contained (one module, a banner,
  the end screen). They don't add clutter to a normal career.
- **The Touchline pundit.** It isn't a pick you make. It's a newspaper column the game writes itself, graded from
  the live table, with no effect on money or score. It's world flavour and costs nothing to keep.
- **The mentor at career setup.** Still offered as a choice when you start (phase 4 only drops the mid-career offer
  and the grudge).

## Save compatibility
- No schema bump (house style). Removed fields stay optional in the types and are ignored on load.
- Phases 4 and 6 need an idempotent load-time step: drop a live campaign (refund nothing; the weeks already paid are
  spent), and wind up an own academy (phase 6 says how).
- Ledger kinds `campaign`, `consultation`, `mentor-cut` and the old earnings keys stay in the unions so old totals
  still type-check.

## Testing
- Unit tests change with each phase (listed in the phase files). `npx vitest run --maxWorkers=3` and
  `npx tsc -b --noEmit` pass after each phase.
- Balance after phases 1, 3 and 7: `[JOB=1] SEED=n SEASONS=3 npx vitest run --config vitest.sim.config.ts
  --silent=false -t "bot career"` on seeds 4242, 77 and 913, against the table at the end of the clear-wins plan.
- Browser check per phase on a throwaway staged save, never the Liam Pearce save.

## Acceptance
- A freelance client has one review: one warning, one scorecard, checked quarterly, and the rival's numbers are part
  of it.
- The club page says why your standing is what it is (top 3 reasons, which add up with the rest to the number).
- No dilemma cards, no campaign panel, no own-academy panel. The staff card offers two choices.
- Money from match bonuses per season within about 10% of before; balance seeds within about 10% of today's money,
  with no new losing season.
- Old saves (including one with a live campaign, a mentor, and an own academy) load and play a month without errors.
