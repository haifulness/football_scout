# Phase 5: International tournaments

## Why
Gives the year a rhythm and a timing game: find a player before the tournament, because a good tournament makes him
famous and expensive, and your edge disappears.

## Design
- Every second summer (June–July), alternating a world cup and continental cups (one per continent with enough
  nations). Host country picked at the start of the season before; announced in the Touchline.
- National squads: each country's best 23 by rating among its nationals (computed once at squad announcement,
  cheap). Small nations still enter continental cups.
- Format: groups of four, then knockouts, all through the existing match sim. Results in the Touchline.
- Effects on players who play:
  - fame: a standout's public profile rises, so everyone's view of him sharpens (knowledge ranges narrow for all,
    including rivals), and AI clubs chase him;
  - value: up to +40% for standouts, a little down for flops;
  - a "breakout" piece for an unknown who shone.
- For you:
  - squad announcements are news a month ahead: scout before;
  - the tournament is a scouting event in the host country (reuses the events calendar): attend to see many
    players at once;
  - players you placed earn a small bonus for a call-up and goals (new payout kind), and a call-up lifts mood.
- League seasons already pause in summer, so no fixture clashes.

## Files
- new model/tournament.ts and systems/tournaments.ts (`tournamentTick`, squads, draw, fixtures, results)
- systems/knowledge.ts public profile; systems/economy.ts or transfers.ts value bump
- systems/events.ts: tournament as an event; systems/payouts.ts: call-up bonus
- systems/newspaper.ts pieces; views.ts; a Tournament card on world-screen and the Touchline

## Tests
- Every second summer has a tournament; squads are the best nationals; the knockouts produce one winner.
- Standout values rise, fame narrows ranges, call-up bonus pays once.
- Old save mid-summer: no crash, the next tournament is scheduled.

## Risks
- Performance: 48–64 teams, about 100 matches, once every two years; fine.
- Value inflation: cap the bump and let it decay back over a season.
