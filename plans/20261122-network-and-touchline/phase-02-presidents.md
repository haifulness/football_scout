# Phase 2 — Presidents: money and direction (done)

The coach decides "is he good enough for my team?"; the president decides "is he worth it for my club?".
A president never answers an ordinary pitch.

## Built
- `src/engine/model/president.ts`, `src/engine/systems/board.ts`. Presidents live in `state.presidents`
  (separate from coaches), `club.presidentId`; created by `ensurePresidents` on generate and on load
  (older saves get theirs; no schema bump). Seeds unchanged: presidents use a derived RNG.
- **Policy**: youth & resale, win now, homegrown first, sell to survive. Shapes briefs (age cap, +2 rating,
  a nationality requirement, a smaller fee cap) and the board's judgement.
- **Big signings need the board**: fee > 70% of the transfer budget, or wage > 3× the squad median. After the
  coach's yes the board decides on age/policy/price/your board standing. A block is a club-level no that
  lifts when the board changes direction or the money no longer needs it. The pitch dialog shows the board's
  read and reasons.
- **Board standing** = relationship with the president + signings at the club + integrity (+ employer).
- **The next coach**: when a board sacks its coach and your board standing is 45+, and you know an
  out-of-work coach, the president asks you first (5 days). Your pick gets the job (+15 with him, +6 with
  the board); no answer and the board picks (−2).
- **Summer**: relegated boards tend to "sell", promoted ones "win now", some change their mind; home news
  as a new `board` kind (Touchline front page). Presidents of your clubs review your season (+4 per signing,
  −3 for none).
- UI: President card on club pages, board chip and reasons in the pitch dialog, advice cards on Home/Inbox,
  board line in the Touchline's coach watch.

## Balance
The bot reads the board's read like a player would (skips long shots). Seeds 4242/777 within range.
