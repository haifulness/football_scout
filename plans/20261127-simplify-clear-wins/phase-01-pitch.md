# Phase 1: the pitch dialog and the coach's yes

## A. Show each factor once (UI only)
File: src/ui/components/recommend-dialog.tsx

Today the `Verdict` chips repeat what the boxes under "Details & terms" already say:
- noes this month, fatigue at the position, hit rate: chips (`Verdict`, about lines 845–853) and `PressureNote`;
- playing style: chip and the style paragraph;
- settling: chip and the settling box.

Change:
- `Verdict` keeps: position vs their average, fee, wage, coach's read, board, brief fit, stale read, rivals after
  him, open pitch, rival scouts on the spot.
- Coach pressure becomes **one** chip: "Coach's mood: cold until 12 Mar", "2/3 noes this month" or
  "3rd DM this month: −10%". It shows only the worst of the three, and only when it's bad.
- The style and settling chips go; their boxes stay under the details fold.
- `PressureNote` stays as the detail. (Its doc comment turned out to be right; the range-bar comment belongs to
  `BarCompare`.)
- The hit-rate line prints the real effect from the view (at your employer it's −5%, not −10%). Add the
  percentages to `PitchPreview['pressure'].hit` in views/index instead of hard-coding them in the UI.

## B. Count each thing once (engine)
File: src/engine/systems/deals.ts `signOffProbability`; src/engine/systems/employment.ts `clubTrust`.

Double counts today:
- The coach relationship is a term of its own, `(relationship − 25)/22`, and is also 70% of `clubTrust`, which
  adds `(trust − 25)/40`.
- Report accuracy is in `reportBonus` (via `trackRecord`) and in `clubTrust` (via `accuracyTrust`).

Change:
- Split `clubTrust` into a helper `clubTrustParts(state, clubId)` that returns the parts. `clubTrust` keeps its
  current total (used for phone pitches, briefs, unlocks), so nothing else changes.
- `signOffProbability` uses the club part **without** the relationship and accuracy parts.
- Retune: removing these lowers the average logit. Add a constant to the sum so the average yes at a typical
  standing stays the same. Pick it by running the balance bot, not by guessing.

## Tests
- New test in tests/engine/: with every other input fixed, raising the coach relationship by 10 moves the logit by
  10/22 only, and changing report accuracy moves only `reportBonus`.
- Existing sign-off and pitch-pressure tests pass; update hard-coded expectations if the constant moves them.
- Balance: `SEED=4242|77|913 SEASONS=3`, freelance and `JOB=1`. Compare with the baseline in plan.md.

## Risk
Signing rates change. If a seed moves more than about 10%, adjust the constant and run again.
