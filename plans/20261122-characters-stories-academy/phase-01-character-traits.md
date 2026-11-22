# Phase 1: Character traits

## Why
Once you know a player's ratings there is nothing left to find out. Traits give fieldwork a second purpose: finding
out what kind of person he is, which decides whether he settles, sulks or shines.

## Today
- `Player.hidden` already has `consistency`, `ambition`, `loyalty`, `injuryProne` (src/engine/model/player.ts).
- `knowledge.ts` shows three of them as words above `TRAITS_REVEAL_LEVEL` (consistency, injury risk, ambition at 80+).
- The coach's `personality` priority reads only `hidden.consistency` (deals.ts ~line 95).

## Design
- `Player.traits?: TraitId[]`, 0–2 per player, rolled at generation and filled lazily for old saves from a seeded
  hash of the player id (stable, no save bump).
- Starting set (each with one clear effect):
  | Trait | Effect |
  |---|---|
  | Professional | Grows a little faster; settles faster; coach likes him |
  | Leader | Coach likes him; captaincy more likely |
  | Big-game player | Better match ratings against stronger teams |
  | Homesick | Settles slowly abroad; more likely to want to go home |
  | Adaptable | Settles fast anywhere |
  | Hothead | Coach doubts; occasional "dropped after a row" story |
  | Late bloomer | Keeps growing to ~26 |
  | Mercenary | Asks for more wages; follows the money in consultations |
  | Loyal | Rarely wants out; harder to prise from his club |
  | Media darling | Raises his value and fame; presidents like him |
- Existing numeric hidden values stay as they are; traits are labels that sit alongside them. Ambitious/injury-prone
  stay as the existing words, no duplicate.
- How you learn them (stored in `Knowledge.traitsSeen?: TraitId[]`):
  - meeting the player (each meeting reveals one, rapport makes it surer);
  - a match visit focused on him (Big-game, Hothead, Leader show on the pitch);
  - your network at his club (a contact tells you one, chance by `skills.network`);
  - a scout report at high knowledge;
  - an assistant's report sometimes adds one.
- Unknown traits show as "Character: 1 of 2 known" so the player knows there is more to find.

## Files
- model/player.ts (`TraitId`, `traits?`), model/scout.ts (`Knowledge.traitsSeen?`)
- generation/world-generator.ts and the youth intake in systems/season.ts: roll traits
- systems/knowledge.ts: view of known traits; `traitsOf(p)` lazy filler
- systems/fieldwork.ts, systems/matchday.ts, systems/reports.ts, systems/assistants.ts: reveal paths
- systems/deals.ts: coach `personality` priority uses traits; Mercenary wage demand
- systems/development.ts: Professional, Late bloomer
- systems/match-sim.ts: Big-game player rating nudge
- views.ts + player-screen, pool-screen (a small icon when a known trait matters), pitch dialog

## Tests
- Traits are stable for a player across loads; old save fills them.
- Each reveal path adds one unknown trait and never a fake one.
- Coach decision moves with Professional/Hothead; Late bloomer grows after 23.

## Risks
- Development changes shift balance: keep the nudges small (±10%) and run the harness.
