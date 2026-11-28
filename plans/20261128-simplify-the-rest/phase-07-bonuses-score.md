# Phase 7: three match bonuses, a score without repeats

## Match bonuses
**Today** (`systems/payouts.ts`): six kinds per match for each placed player, scaled by tier, ×2 freelance, tapering
100/60/30% by year:
- appearance 50;
- goals 150;
- assists 100;
- tackles 75 (×1.5 at double the threshold);
- clean sheet 150 (GK);
- captain 75.

**Change:** three kinds.
- **Appearance:** today's 50 + captain folded in as a flat +25% on the appearance for players who usually captain
  (so captains still earn a bit more, without a line of their own).
- **Goal involvement:** goals 150, assists 100, for every position (today only attackers earn them).
- **Defensive:** clean sheet 150 for GK; for defenders and DMs, a clean sheet *or* the tackle threshold pays 100
  (not both).

Tune the three values so total match-bonus money per season in the balance runs stays within 10% of today.

- `pl.earnings` keeps its old keys optional for old placements, and new matches write the three new keys.
- Guard the read at `payouts.ts:117` and `career-end.ts:90` with `??=` (an old placement with `bonusPaid` and no
  `earnings` can throw today).
- Leave the `'match-bonus'` ledger kind alone, since tournaments and the mentor use it too.

**Files:** `systems/payouts.ts`, `model/deal.ts` (earnings keys), `index.ts:938-1008` (payout and placement views),
`views.ts` (`PayoutView`), matchday payout UI, `systems/career-end.ts:88-91`.

## Career score
**Today** (`systems/career-end.ts:95-125`):
- reputation gained ×3;
- 40·log2(1 + earned/10k);
- 5 per placement;
- 20 per star (current OVR ≥ 80);
- trophies: Scout of the Year 60/25, Signing of the Season 15, clean sweep 10;
- report accuracy ×50.

One signing is counted in reputation, earnings, placements, possibly stars, and possibly the signing trophy.

**Change:**
- Drop **Placements**: a signing already shows up in reputation and earnings.
- Drop the **clean sweep** trophy points: the three goals it rewards already paid money and reputation. The trophy
  stays on the shelf, worth 0 points.
- **Stars** use the player's peak OVR, recorded when it rises, not the current one, so a star doesn't lose you
  points by ageing.
- Keep Scout of the Year and Signing of the Season. They're the headline honours, and their small overlap is fine.
- The end screen lists each line with a one-sentence "what counts" so the score reads as a set of different things.
- The hall of fame stores the old scores as they were. New entries use the new formula, and a "v2" flag on entries
  isn't needed: it's a personal table.

**Files:** `systems/career-end.ts`, `model/deal.ts` or `model/player.ts` (peak OVR on the placement),
`systems/development.ts` (record peak), `ui/components/career-end.tsx`.

## Tests
- `payouts.test.ts`: the three kinds; a defender with a clean sheet and 4 tackles is paid once; old placement
  earnings load.
- `career-end.test.ts`: no placements line; the star counts at peak after decline; clean sweep scores 0.
  `legacy.test.ts:65` still passes (TrophyKind unchanged).
- Balance on the three seeds, both modes: match-bonus income within 10%.

## Done 2026-11-28
- **Match bonuses:** appearance (+25% as captain), goals and assists at any position, and defending (GK clean sheet
  150; a defender's clean sheet or tackling, 50, not both).
  - Tuned on 150 days of real match lines in one world (about 300k lines). Against the old six kinds: defenders
    exactly even at 50, goalkeepers −6% (no captain line), attackers −4%, midfielders +32% (they now earn goals),
    all +2.8%.
  - Old placements keep their assists, tackles and captain totals; `earningsByKind` folds them into the three kinds
    for every screen and total. `payMatchBonuses` now guards a placement with no earnings.
- **Career score:** no Placements line; a clean sweep scores 0 (the trophy stays); a star counts at his best OVR
  since you found him (season history), so ageing doesn't take one away. Each line says what it counts.
- Balance: every seed within 3% of before (freelance 4242 $180k, 77 $429k, 913 $155k; job $111k, $155k, $250k); no
  new losing season.
- Browser check: a staged save with old-format earnings shows "Apps $125 · Goals & assists $500" on Finances. Suite:
  352 passing.
