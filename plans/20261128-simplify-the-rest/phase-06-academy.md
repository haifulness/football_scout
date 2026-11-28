# Phase 6: sponsoring only, no own academy

## Today (`systems/academy.ts`)
- **Sponsoring** (lines 33–146): from reputation 45 and standing 30, pay a club yearly. You get +8 standing there, a
  bigger youth intake with double prodigy odds, and first sight of the intake. Limit 1, or 2 with an agency.
- **Own academy** (lines 148–304): needs an agency and a base country. It costs $60k to build plus weekly upkeep and
  upgrades. Each July it takes 4–8 kids (capacity 10–24) who train, can be placed from 17 (graduate fee), pay a 15%
  sell-on, and leave at 19.

## Change
- Delete the own-academy half:
  - `openCheck`, build, upgrades, upkeep, `recruit`, `placeCheck`, `onGraduate`, `paySellOn`, the release at 19,
    and `academyTraining` growth;
  - the hooks at `deals.ts:622`, `transfers.ts:105`, `market.ts:83`, `index.ts:693,720,725`,
    `development.ts:36`;
  - the own-academy section of `academy-screen.tsx:103-175`.

  The screen becomes "Sponsorships" (or a section on the agency screen if it's then too thin to stand alone).
- Sponsoring is unchanged.
- **Old saves with an own academy** (load step, once):
  - each kid becomes a youth player at the nearest club in the base country with squad room, keeping his ratings,
    and stays in your pool;
  - you get a one-off refund of half the build and upgrade cost, as a ledger line "Academy wound up", plus a news item;
  - `state.academy.own` is cleared, and `player.academyTraining` is ignored.
- **Placed graduates with a sell-on:** the sell-on is honoured until it pays once or the player retires. Keep
  `paySellOn` for existing records only, with no new ones. If that's more code than it's worth, pay out each open
  sell-on's expected value at wind-up instead (15% of current market value). Pick whichever is smaller in code;
  both are fair.

## Files
`systems/academy.ts`, `model/academy.ts`, `model/player.ts`, `systems/development.ts`, `systems/deals.ts`,
`systems/transfers.ts`, `systems/market.ts`, `systems/season.ts` (intake hooks: keep the sponsor ones at 320–321
and 344), `index.ts`, `views.ts`, `ui/screens/academy-screen.tsx`, nav in `app.tsx`, load normalizer.

## Tests
- `academy.test.ts`: keep the sponsor tests and delete the own-academy ones.
- New wind-up test: a save with an academy of 6 kids loads, the kids are at clubs and in the pool, the refund is
  paid once, and a second load does nothing.
