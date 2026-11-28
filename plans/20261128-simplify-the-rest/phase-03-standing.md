# Phase 3: club standing you can read

## Today
- `clubTrust` (`employment.ts:55-82`) adds up to 13 inputs:
  - coach rapport ×0.7;
  - report accuracy;
  - smears;
  - signings, weak pitches, briefs done and failed, sales, hits, flops;
  - sponsorship, employer, integrity (removed in phase 2).

  It's floored at 20 at the mentor's clubs. The club page shows only the total and a label.
- The board has its own formula (`board.ts:83-93`): president rapport + min(20, signings×4) + integrity +
  employer 10. It gates the president's "who should replace the coach?" ask (≥45) and adds up to +0.25 to the
  board's odds of backing a deal.

## Change
- **Reasons on the club page.** `clubTrustParts` returns a list of `{label, value}`:
  - "Coach's rapport", "Report accuracy", "Signings here", "Briefs", "Sales", "Players who made it",
    "Flops", "Weak pitches", "Sponsor", "Your employer", "Rumours";
  - zero terms are left out;
  - `clubTrust` is the clamped sum of that list, so the number and the reasons can't disagree.

  The club page shows the three largest by size (sign shown) under the standing bar, with "+N more" opening the
  full list.
- **One record, two people.** Board standing = president rapport ×0.7 + the same record as `recordStanding`
  (signings, briefs, sales, hits, flops, employer), clamped. The president replaces the coach, and the record is
  shared, so a good season raises both.
  - Writes stay on the president (`relateToBoard`), so board decisions still don't touch your dismissal.
  - Retune the ask gate so a club where you've placed two players and met the president once still qualifies (about
    today's rate). Check with a test fixture rather than guessing: compute today's board standing and the new one
    for a few fixtures and set the gate to keep the same yes/no.
- The president card on the club page shows the same top-3 reasons with "President's rapport" first.

## Files
`systems/employment.ts` (parts list), `systems/board.ts` (`boardStanding` uses `recordStanding`, gate),
`index.ts` (club view: `standingReasons`, president reasons), `views.ts`, `ui/screens/club-screen.tsx` (under the
bar at :250/:317, president card :675).

## Tests
- `employment.test.ts`, `standing.test.ts`: the parts sum to the total, zero terms are hidden, the order is by size.
- `board.test.ts`: the ask gate on the fixtures above. The board odds bonus moves no more than 0.05 on them.
- Exact-value standing tests that change (`employment.test.ts:113`, `reports.test.ts:95`, `missions.test.ts:114-156`,
  `signoff-terms.test.ts:37-40`) should only change for the integrity term removed in phase 2. Anything else
  changing is a bug.
- Balance on the three seeds, both modes.
