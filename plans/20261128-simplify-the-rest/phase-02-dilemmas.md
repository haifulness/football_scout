# Phase 2: dilemmas and integrity out

## Today
- About every 1–2 months a choice card appears on Home and the Inbox, in one of four kinds: agent cut, inflate a
  report, talk a player down, family fee (`systems/dilemmas.ts`; daily 1/12 chance, 25-day gap).
- Each answer moves a hidden `scout.integrity` (0–100) that the UI never shows. Readers:
  - club standing ±8 (`employment.ts:65-68`);
  - board standing (`board.ts:90-92`);
  - how long rumours stick (`nemesis.ts:159`).
- Two other writers: being caught with an insider at a club (`club-asks.ts:191`, −4) and bad finder advice in a
  consultation (`consultations.ts:174`, −6).

## Change
- Delete `systems/dilemmas.ts`, `model/dilemma.ts`, `ui/components/dilemma-cards.tsx`.
- Delete the tick call (`tick.ts:160`), the facade calls (`getDilemmas`, `resolveDilemma`), `DilemmaView`, the
  `'dilemma'` inbox kind, and the card mounts in `world-screen.tsx:39` and `inbox-screen.tsx:58`.
- Remove integrity:
  - drop the term from `clubTrustParts` and `boardStanding`;
  - rumours use a fixed stickiness of 0.45 (today's value at integrity 50).
- The two other writers get a direct cost instead:
  - caught with an insider: −6 standing with that club's coach (a scandal there, not everywhere);
  - bad finder advice: −10 rapport with that player.
- `scout.integrity`, `state.dilemmas` stay optional in the types and are ignored.

## Files
`systems/dilemmas.ts`, `model/dilemma.ts`, `model/world-state.ts`, `model/scout.ts`, `systems/employment.ts`,
`systems/board.ts`, `systems/nemesis.ts`, `systems/club-asks.ts`, `systems/consultations.ts`, `tick.ts`, `index.ts`,
`views.ts`, `ui/components/dilemma-cards.tsx`, `ui/screens/world-screen.tsx`, `ui/screens/inbox-screen.tsx`, and
any palette token used only by dilemmas (violet).

## Tests
- Delete `tests/engine/dilemmas.test.ts`. Update `tests/engine/nemesis.test.ts:79`.
- New asserts in `club-asks.test.ts` (caught costs that coach) and `consultations.test.ts` (bad advice costs rapport).
- A save with integrity 20 loads, and its standing equals a fresh save's with the same record.

## Risk
A save with high integrity loses up to 8 standing at every club. That's within the noise of one signing (+8), so
nothing is needed beyond a line in the changelog.

## Done 2026-11-28
- Built as planned. The two other integrity writers already had a direct cost (being caught with an insider:
  coach −6; bad finder advice: rapport −25), so they just lost the integrity line rather than gaining a new cost.
- New test: an older save's integrity doesn't move standing. Suite: 354 passing. The inbox loads on a save that had
  an open dilemma.
