# Phase 4 — Work under a big-name scout

A third start option (and an offer early in a freelance career): join a respected scout (a rival NPC). He takes
30% of your commissions. In return his client clubs treat you as known (standing floor), phone pitches open
sooner, and now and then he passes you a brief he can't take. Leave whenever you like; leaving within a season
or after a falling-out turns him into a rival.

## Built

- `src/engine/systems/mentor.ts`: `pickMentor` (best-known home freelancer, topped up to 3 clubs, rep ≥ 40),
  `joinMentor`, `leaveMentor` (inside 365 days: grudge, his clubs' coaches −8; after: +5), `mentorCut`
  (30% of signing/match bonuses, mission rewards, sale commissions, via `addLedger`), `mentorTick` (Mondays:
  offer to a freelancer under rep 30 in days 14–180, 15%/week, once; ends if he stops freelancing).
- His clients: `canWorkWith` ok, `clubTrust` floor 20, briefs passed at half the usual rate (`workClubs`).
- Phone pitches open at standing 45 instead of 60 while mentored.
- Rivals: your mentor never chases your players; a grudge adds +0.35 to the chase-yours chance.
- Taking a full-time job ends it (`acceptOffer`).
- UI: "How you start" in career setup; Career mentor panel and offer card; Home needs-you item.
- Tests: tests/engine/mentor.test.ts.
