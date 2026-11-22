# Phase 3: Stories for the players you place

## Why
After signing, bonuses roll in and nothing happens. Your players should have arcs: some flourish, some sulk,
some flop, and each one reflects on you.

## Design
- `Placement.mood?: 'happy' | 'restless' | 'wants-out'` and `Placement.verdict?: 'hit' | 'solid' | 'flop'`.
- Monthly placement tick:
  - mood falls when he plays less than he expects (expectation from ambition, fee and his rating vs the squad),
    while settling, or when the club sinks; rises with minutes, form and team success. Loyal resists, Hothead and
    Mercenary amplify.
  - Restless → a story in the inbox ("Benched for a month, he calls you"). You can visit (aftercare meeting) to calm
    him, or let it ride.
  - Wants out → if the club is your client it gives you a selling request for him; otherwise he asks your advice
    (a consultation); AI clubs may sell him. Leaving early ends your bonus stream, as today.
- Verdict at 6 months, again at the end of his first season:
  - hit (starting, good ratings) → trust with the club up, reputation up, a Touchline piece "X's find shines";
  - flop (barely playing) → trust down with that club ("the scout who brought him"), coach remembers.
  - Big fees make both sides bigger.
- Legacy: a "Your players" page on the Career screen, every placement with verdict, minutes, bonuses earned, and
  where he is now. Feeds the career-end summary.

## Files
- model/deal.ts (`Placement.mood?`, `verdict?`)
- new systems/placement-stories.ts with `placementTick` (monthly, after development in tick.ts)
- systems/market.ts: create a mandate from a client; systems/consultations.ts: a "should I leave?" question
- systems/newspaper.ts: hit/flop pieces; systems/career-end.ts summary
- views.ts, career-screen (Your players), inbox, home needs-you

## Tests
- A benched ambitious player goes restless then wants out; a visit pulls him back one step.
- Verdicts: starter with good ratings → hit, trust up; unused → flop, trust down.
- Wants-out at a client creates a selling request once, not every month.

## Risks
- Too many inbox items: cap at one story per player per month and only for active placements.
