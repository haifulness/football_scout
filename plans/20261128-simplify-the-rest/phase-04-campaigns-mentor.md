# Phase 4: campaigns out, a lighter mentor

## Campaigns: cut
**Today** (`systems/campaigns.ts`, freelance only, on the Career hub):
- You pay weekly for 4–12 weeks, and each Monday there's a 35% chance a club invites you on as a client.
- While it runs ("spotlight"), briefs and player consultations come 1.4× as often, and flops cost 1.5×.

**Change:**
- Delete `systems/campaigns.ts`, `model/campaign.ts`, `ui/components/campaign-panel.tsx`.
- Delete the tick call (`tick.ts:151`), the facade (`index.ts:3139-3176`), `CampaignView`, and the deadline entry
  (`index.ts:2152`).
- Remove the spotlight branches in `missions.ts:448,456,478,508`, `market.ts:292,325` and `consultations.ts:209`.
- Load: a live `state.campaign` is dropped. Keep the `'campaign'` ledger kind and its overhead entry.

**What replaces the invites:** nothing new. Freelancers already gain clients through the gazette's Wanted leads,
open pitches and reputation.

## Mentor: keep the setup choice, drop the offer and the grudge
**Today** (`systems/mentor.ts`):
- You can pick a mentor at career setup, or one may offer himself mid-career (`mentorTick`, freelancers under
  reputation 30, once).
- While mentored he takes 30% of commissions, and in return:
  - his clubs are floored at standing 20 and count as pitch targets;
  - phone pitches there need only 45;
  - briefs pass through him;
  - rivals leave you alone.
- Leaving early sets `rival.grudge`, which raises poach and tip odds and spreads rumours (`rivals.ts:166,255`,
  `nemesis.ts:208`).

**Change:**
- Delete `mentorTick` and the offer (`mentorOffer`, `mentorDone`, `MentorOfferView`, and the offer card on the career
  screen).
- Delete the grudge: the `leaveMentor` early-exit branch, and the reads at `rivals.ts:166,255`, `nemesis.ts:208` and
  `mentor.ts:49`. Leaving early just ends the deal, with a news line.
- The setup choice and every in-term benefit stay as they are.
- Load: `scout.mentorOffer` is ignored, and `rival.grudge` is ignored.

## Files
`systems/campaigns.ts`, `model/campaign.ts`, `systems/mentor.ts`, `systems/missions.ts`, `systems/market.ts`,
`systems/consultations.ts`, `systems/rivals.ts`, `systems/nemesis.ts`, `tick.ts`, `index.ts`, `views.ts`,
`ui/components/campaign-panel.tsx`, `ui/screens/career-screen.tsx`, load normalizer.

## Tests
- Delete `tests/engine/campaigns.test.ts`. Remove any spotlight asserts in the missions and market tests (check
  with a grep for `inSpotlight`, `CAMPAIGN_BOOST`).
- `tests/engine/mentor.test.ts`: drop the offer and grudge cases, and keep the term and cut cases. Grep the rivals,
  nemesis and deals tests for `grudge` and `mentorOffer`.
- A save with a live campaign and a pending mentor offer loads cleanly.
