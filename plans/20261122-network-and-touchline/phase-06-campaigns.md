# Phase 6 — Profile campaigns

The agency can pay weekly for a campaign that raises **profile** (reach), not reputation: more clubs send
briefs, more player requests, clubs in new countries notice you. While one runs you're "in the spotlight":
flops and lapsed briefs count 1.5×. Campaigns run 4–12 weeks; cost scales with the market.

## Built

- `src/engine/model/campaign.ts`, `src/engine/systems/campaigns.ts`; `state.campaign?` (running or last).
- Freelancers only, one at a time, 4–12 weeks. Weekly cost: 500 × costIndex × (0.5 + wealthIndex), paid
  Mondays, never more weeks than booked.
- Effects while running: 35% weekly chance a club in the target market invites you as a client (reputation
  gate still applies, smaller clubs likelier, no prior standing needed); brief chance ×1.4; player question
  chance ×1.4.
- Spotlight: failed brief −9 relationship / −2 reputation (normally −6 / −1); failed sale −8 (normally −5);
  a lapsed brief or selling-request offer from a client costs −2 relationship.
- UI: Career "Profile campaign" panel (market, weeks, total; running state with stop). Tests: tests/engine/campaigns.test.ts.
