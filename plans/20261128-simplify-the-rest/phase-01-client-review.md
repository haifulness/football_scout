# Phase 1: one client review

## Today
- **July review** (`systems/client-review.ts`, called only at the 1 July rollover, `tick.ts:76-79`).
  Score = 2·signings + 2·sales + 2·briefs done − 2·briefs failed + hits − 2·flops, over the year since
  `clientSince`. The bar is 1/2/3 by difficulty, +1 if a rival works the club. Results: delighted (coach +6),
  satisfied, at risk (−8, warned), leaving (−5, dropped). 120-day grace.
- **Quarterly race** (`systems/client-race.ts`, 1 Jan/Apr/Oct, `tick.ts:169`). It compares your deals for the client
  (weighted by how much the player plays) with the best rival's, over the last 365 days. Behind once means warned
  (−4). Behind twice means dropped (−5), and the rival takes the client and scores a nemesis point.
- Two warning fields (`clientWarned` array, `raceWarned` dated record), two chips on the career screen
  (`ReviewChip`, `RaceChip`), and the grace constant duplicated.

## Change
- One `reviewClients` in `client-review.ts`, run on 1 Jan, Apr, Jul and Oct. Delete `client-race.ts`.
- **Your score:** today's review formula, over `max(clientSince, date − 365)`.
- **The rival's score:** the race's impact-weighted signings for that club, scaled to the same units (×2, as a
  signing is worth 2 in your score). It's only counted if a rival worked the club in the window.
- **Outcome each quarter:**
  - *Delighted:* score ≥ bar + 2 and not behind the rival. Coach +2 (about +8 a year, close to today's +6).
  - *Satisfied:* score ≥ bar and not behind. The warning clears.
  - *Warned:* below the bar or behind the rival, first time. Coach −4, one news item that names the reason ("you
    brought them 1 signing; Apex Scouting brought 3").
  - *Dropped:* warned last quarter and still failing. Coach −5, `dropClient`. If the rival was ahead, he takes the
    client and scores a nemesis point (as the race does today).
- The bar no longer gets +1 for a rival at the club, since the rival is now compared directly.
- One warning field: `clientWarned` as `Record<ClubId, GameDate>`. On load, an old array or `raceWarned` merges into
  it.
- Grace stays 120 days, one constant.

## Files
- `systems/client-review.ts` (rewrite), delete `systems/client-race.ts`, `tick.ts` (one call, quarterly).
- `model/scout.ts` (`clientWarned` shape, `raceWarned` optional and unused), load normalizer.
- `index.ts:1352-1380` and `views.ts:1052-1058`: one `review` object per client {score, bar, rival?: {name, score},
  outlook, warned, nextCheck}. Calendar entry (`index.ts:2159`) becomes quarterly. "Needs you" warnings
  (`index.ts:2413-2425`).
- `ui/screens/career-screen.tsx`: one `ReviewChip` with a tooltip giving both scores. Remove `RaceChip`.
- `tests/sim/bot.ts:146` if it calls `dropClient` directly.

## Tests
- Rewrite `tests/engine/difficulty.test.ts:72-105` and `tests/engine/rival-styles.test.ts:52-89` into one
  `client-review.test.ts`:
  - satisfied clears;
  - below the bar warns, then drops;
  - behind a rival warns, then drops and hands the client to the rival;
  - grace;
  - the old warning shapes load.
- Balance on the three seeds, freelance. Clients lost per career should be close to today's (log it in the bot).

## Risk
More checks a year (4 instead of 1 for the work score) can drop clients faster. If the balance run loses
noticeably more clients, require a fail on two quarters in a row for the work score (as the race already does).

## Done 2026-11-28
- Built as planned, with two timings kept from the old systems so clients aren't dropped faster:
  - **Deadline after a warning:** three quarters when the problem is thin work (the July review gave a year), one
    quarter when a rival is doing better (as the race did).
  - **Grace for a new client:** 270 days before your work is judged (the July review came 4–16 months in), 120
    before you're compared with a rival.
- Fixed a latent bug: on a review day the old code forecast the *next* review instead of judging that day.
- The missions test helper now sets `clientSince`, as `addClient` does in the game.
- Balance (freelance, 3 seasons; old code on the same seeds in brackets). Season 1 is identical on all three, and
  clients at the end are the same or more:
  - 4242: $178k ($153k)
  - 77: $713k ($380k)
  - 913: $150k ($194k), but season 3 no longer loses money (+$37k, was −$7.4k)
- Browser check on a staged save (one old July warning, one rival ahead, one quiet). One chip per client with both
  scores in the tooltip. On 1 January: a work warning (deadline 1 Oct) and a rival warning (deadline 1 Apr); the old
  warning carried over as "Will drop you" on 1 Apr.
