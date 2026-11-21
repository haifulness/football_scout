# Phase 5: The selling club's report on mandate players

## Requirements
- A selling-mandate offer comes with the club's own report on the player: rating at his position,
  potential grade, a short note (why they're selling is already there).
- Accuracy depends on the club: bigger clubs (tiers 1–2) have analysts, so their reports are tighter.
- Honesty depends on your standing: a club selling wants a high price, so its report flatters the
  player; the better your standing, the closer to the truth it is.
- Accepting the mandate gives you a knowledge boost on the player (you get his file), capped by tier.
- The report shows on the mandate card, the player page and the pool row (like assistants' ratings).

## Rules (first pass, tune with tests)
- Noise half-width by tier: 1: ±2, 2: ±3, 3: ±4, 4: ±6, 5: ±8.
- Flattery: +0 to +6, shrinking with standing (≈ +6 at standing 0, +0 at 70+).
- Knowledge on accepting: up to 45 (tier 5) – 65 (tier 1).

## Files
- `src/engine/model/mission.ts` (`Mandate.report?: { rating; potential; note }`)
- `src/engine/systems/market.ts` (write it when the offer is made; boost knowledge on accept)
- Views and `src/ui/components/market-section.tsx` / missions screen, pool row (like assistant reports)

## Validation
Tests: tier changes the error spread; low standing flatters, high standing doesn't; accepting raises knowledge.
