# Make money and clients matter after season one

Status: in progress (2026-11-22)

Feedback: the game is easy. Stick to two or three clubs, warm up their coaches, bring players that fit; after
four or five briefs money stops mattering. The bot's books agree: costs stay at $5–10k a season while income goes
$12k → $69k → $182k, and every placement keeps paying match bonuses for its whole first contract.

| # | Change | Files |
|---|--------|-------|
| 1 | Tax every July on the season's profit: Easy 15%, Normal 25%, Hard 35%. Business costs are deductible. A reminder a month ahead; Finances shows the running estimate. | new systems/overheads.ts, season.ts rollover, finances view |
| 2 | Living costs, weekly, rising with reputation (≈$70/wk at the start, ≈$600 at 40, ≈$1.3k at 60), scaled by home cost index and difficulty. | overheads.ts, tick (Mondays) |
| 3 | Match bonuses taper: 100% in his first season at the club, 60% in the second, 30% after. | payouts.ts |
| 4 | Each client reviews its year every July: signings, briefs done or failed, hits and flops. Delighted → closer; disappointed → a warning; warned and still nothing, or a bad year → they drop you. A better-known rival at the club and Hard raise the bar. Clubs that signed you less than four months ago wait a year. | new systems/client-review.ts, employment.ts (client since), career view |

## Acceptance
- Season 1 still roughly breaks even for the bot on Normal; seasons 2–3 grow, but slower, and money stays relevant.
- Old saves load (new fields optional).
- Finances shows tax estimate and living costs; Career shows each client's review outlook; the calendar marks tax day
  and review day; Home warns about a client that is unhappy.
- Full suite passes; balance harness on seeds 4242 and 777.
