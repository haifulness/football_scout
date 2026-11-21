# Phase 4: When you can pitch a rejected player again

## Problem
A rejection is final today: once a club says no, that player can never be pitched to it again, even
after the coach is sacked, the player improves, or the club posts a brief for his position.

## Rules (the reason decides, and changes re-open early)
- **Club-level no** (fee over budget, no wage room, below their level, prospect policy): re-opens as
  soon as those checks pass again (new budget, wages freed, he improved, his fee fell), or after 6 months.
- **The coach said no**: re-opens after 6 months, or sooner if any of these happen:
  - the coach changes (someone else decides now);
  - your read on him rises by 5+ at that position (you know more, or he improved);
  - the club posts a brief for his position;
  - he becomes a free agent.
- A new pitch is a new deal; the old one stays in history.

## Files
- `src/engine/model/deal.ts` (record who said no, why, and your estimate then)
- `src/engine/systems/deals.ts` (`repitchCheck`, record on rejection, allow a new pitch)
- `src/engine/index.ts` / `views.ts` (pitch preview: when and why you can try again)
- `src/ui/components/recommend-dialog.tsx` (show the date and the early re-open conditions)

## Validation
Tests: a coach no blocks until 6 months; a new coach, a +5 estimate, or a brief re-opens it early; a
money no re-opens when the club can afford him; the dialog view lists the conditions.
