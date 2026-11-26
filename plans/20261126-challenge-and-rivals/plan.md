# Challenge and harsh rivals

Status: done 2026-11-26 (all five phases)

Feedback: still too easy. The loop is: read a club's need in the Touchline's Wanted section, then pitch every
player you have at that position until one sticks. Within a few weeks of a new career that gives $100k and 10
signings.

Why it works today:
- **Leads are free and private.** The Touchline names a club and a position each week, and nobody else acts on it.
- **A coach saying no costs nothing.** Only a club-level no (he isn't good enough, they can't afford him) costs 3
  standing and counts as a weak pitch. A coach who "wasn't convinced" costs nothing, and there's no limit on how
  many names you put forward.
- **Rivals don't fight over the same openings.** They chase their own targets (sometimes your players), compete
  for jobs, and swap reads. They never race you for a club's need or go after your clients during the season.

## A. Pitching costs something
1. **A coach's patience.** Every no from a coach costs a little standing with him (−1 in person, −2 by phone).
   Three noes from the same coach inside 30 days and he stops taking your pitches for 21 days ("he's stopped
   returning your calls"). A yes resets the count. Shown on the club page and in the pitch dialog: "2 noes this
   month: one more and he stops listening".
2. **Fatigue at one position (instead of one pitch at a time).** You can put forward as many names as you like,
   but each name the coach has turned down at that position in the last 30 days takes 5% off the next one's
   sign-off chance (down to −20%). Signings and briefs reset it. Your best player still has a good chance; the
   tenth name in a row doesn't. Shown as "3rd DM this month: −10%". Searching for more players stays worthwhile:
   a better player beats the penalty.
3. **Your hit rate at a club.** Each club remembers your last 10 pitches. Below 30% signed off, you're "throwing
   names at the wall": every coach there is harder to convince (−10%) and briefs come less often. Above 60%,
   you're "their trusted eye": +5% and briefs come more often. Shown on the club page next to standing.

## B. Public leads aren't free money
4. **Rivals read the paper too.** Every Wanted item draws 1–3 rival scouts (by the club's size and the rivals'
   reach). Each starts a pursuit at that club and position. The club now has several names in front of it, so
   its bar rises a point per rival, and the first good signing closes the need. The Touchline says who is
   circling ("Two scouts are said to be working on it").
5. **Gossip can be wrong.** A quarter of Wanted items are wrong: the wrong position, or a need that was already
   filled. Marked as "rumour" vs "confirmed" by how the paper heard it. Your own reads (study, the coach, an
   insider, an assistant) stay the reliable way to know.

## C. Harsh rivals
6. **Rival styles.** Each rival gets a style that changes how he competes:
   - **The Shark**: hijacks your deals in negotiation by offering the player more money (needs a deal of yours
     he's also chasing).
   - **The Insider**: close to coaches; a sign-off bonus at his clubs and he hears about needs first.
   - **The Grinder**: first to every Touchline lead, but with weaker players.
   - **The Talent spotter**: goes after young players and prodigies you have in your pool.
   Styles show on the rivals page once you've met or read about him.
7. **Rivals go after your clients.** A rival pitches to your client clubs. Each quarter, a client compares your
   signings this year with his. If his are doing better, they warn you, and a second bad quarter drops you
   mid-season (the yearly review stays).
8. **A nemesis.** Early in your career, one rival of a similar standing becomes your nemesis. He works the same
   clubs, chases your players and goes after your clients first. A season head-to-head table (signings, hits,
   money) on the rivals page; winning it gives reputation, losing it takes some.
9. **Dirty tricks.** Sometimes a rival spreads a rumour about you at a club (−10 standing there, "word is you
   pushed a flop on them"). Meeting the coach clears it and gets back half. Your integrity decides how often
   rumours stick.
10. **Rival agencies (late game).** Once you run an agency, 2–3 rival agencies open in your markets. They compete
    for brokered deals in countries where you both have offices (fewer for you), and now and then make an offer
    to one of your staff: match his raise or lose him.

## Phases
| # | Phase | Risk |
|---|-------|------|
| 1 | A: coach patience, fatigue at a position, hit rate per club | Medium (touches sign-off, balance) |
| 2 | B: rivals race for Touchline leads, rumours vs confirmed leads | Medium (rival pursuits) |
| 3 | C6–7: rival styles, rivals pitch to your clients and clients compare | Medium–high |
| 4 | C8–9: nemesis and head-to-head, dirty tricks | Medium |
| 5 | C10: rival agencies and staff offers | Low–medium |

## Files (expected)
- systems/deals.ts (`signOffProbability`, `pitch`: patience, fatigue, hit rate), systems/employment.ts
  (`clubRecord` gains recent pitches)
- systems/club-read.ts (`pressLeads`: rumours, rivals drawn), systems/rivals.ts (lead pursuits, styles, client
  pitches, nemesis, rumours), systems/client-review.ts (quarterly comparison), systems/agency.ts (rival agencies)
- model/rival.ts (style, nemesis), model/scout.ts (patience by coach)
- views/index: club page (patience, hit rate), pitch preview (fatigue line), gazette Wanted (circling, rumour),
  rivals page (styles, head-to-head)

## Acceptance
- Spamming one position at a club stops working: by the fourth no in a month the coach stops listening, and each
  extra name has a lower chance.
- A Touchline lead is a race: rivals sign there first a good part of the time, and some leads are wrong.
- Balance bot (`SEED=4242 SEASONS=3`): money at the end of season 1 down clearly from today's; the bot still ends
  season 3 with money in the bank.
- Rivals visibly cost you: hijacked deals, a client lost to a rival, a nemesis table.
