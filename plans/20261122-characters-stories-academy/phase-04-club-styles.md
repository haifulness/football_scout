# Phase 4: Club styles

## Why
Every club wants "a better player at position X". Styles make clubs feel different and give briefs a flavour you
have to read.

## Design
- `Club.style?: ClubStyle`, one of:
  | Style | What they want | Typical clubs |
  |---|---|---|
  | Develops youth | Under 23, high potential; pays less now | Mid-table, smaller budgets |
  | Homegrown | Own countrymen | Clubs in strong football nations |
  | Physical | Pace, strength, stamina | Lower leagues |
  | Technical | Passing, technique, vision | Top clubs in technical cultures |
  | Bargain hunters | Low fee, resale value | Poorer clubs |
  | Star power | Fame, Media darling, big names | Rich clubs, big presidents |
- Rolled from tier, wealth, country and president; filled lazily for old saves.
- A new Head Coach may shift it (30%) to fit his formation and priorities; the Touchline reports it.
- Effects:
  - missions from the club lean to the style (age range, key attributes, nationality, fee cap), with the style
    named in the brief;
  - the coach's sign-off gets a fit bonus or penalty for style (shown in the pitch dialog: "Fits their style");
  - Touchline club previews mention it.

## Files
- model/club.ts (`style?`), generation + lazy filler
- systems/missions.ts brief generation; systems/deals.ts sign-off weights; systems/coaching.ts style shift
- views.ts, club-screen header, mission card, pitch dialog

## Tests
- Style is stable across loads; a coach change can shift it.
- Missions from a youth club have a max age; homegrown requires nationality.
- Fit raises the sign-off chance by a bounded amount.

## Risks
- Low. Keep the fit bonus modest (±8 points) so styles guide rather than decide.
