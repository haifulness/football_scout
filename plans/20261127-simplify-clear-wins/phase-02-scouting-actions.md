# Phase 2: scouting actions

## A. Check-in folds into video
Today there are two footage actions:
- **Video** (`watchVideo`): a day, adds knowledge up to `VIDEO_KNOWLEDGE_CAP`, and throws at the cap.
- **Check-in** (`checkIn`): 25% of the video price, no time, refreshes a stale read, once a month.

Change: one **Video** action, decided by the state:
- Below the cap: as today (a day, more knowledge), and it also refreshes the read.
- At the cap, with a stale or ageing read: a catch-up at the check-in price, no time, read refreshed. The button
  says so: "Video catch-up · $40 · no time".
- At the cap with a fresh read: disabled ("Footage has told you all it can").

Files:
- systems/scouting.ts: `watchVideo` absorbs `checkIn`. Keep `checkInCost` as the catch-up price and drop the
  once-a-month rule: the read only goes stale slowly, so it doesn't need a limit.
- index.ts: remove the `checkIn` facade method; `PlayerView.checkIn` becomes `video: { ok, reason, cost, catchUp }`.
- ui/components/scouting-panel.tsx and ui/screens/pool-screen.tsx: one button.
- tests/engine/snapshot.test.ts: rewrite the check-in case for the catch-up.
- tests/sim/bot.ts: replace any check-in call.

## B. One way to go to a match
Today, at the venue, a player has two buttons:
- "Attend & watch closely" opens the matchday screen (pick up to 3 to study);
- "Quick watch" calls `scoutLive` and comes back with the usual impression.

Change: one **Go to the match** button. It opens the matchday screen with the player already picked, so going with
just him is a single click (the old quick watch). "Skip to the end" stays.

Files:
- ui/components/scouting-panel.tsx: one button.
- ui/screens/matchday-screen.tsx: preselect the target; allow attending with only him.
- Engine: if `attendMatch(id, [id])` gives the same result as `scoutLive`, the UI stops calling `scoutLive`. Keep
  it in the engine only if the bot or tests still need it.

## Tests
- Unit: catch-up at the cap refreshes the read without adding knowledge; below the cap video adds knowledge.
- Browser check on a staged save: player page shows one footage and one match button; going with only the target
  works.
