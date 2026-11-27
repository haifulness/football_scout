# A full-time job worth taking

Status: phases 1–3 done 2026-11-27

Feedback: a full-time contract isn't worth it. Freelancing brings far more work and money.

Why, today:
- **Reach.** A full-time scout pitches only to his employer. A freelancer pitches to 2–5 clients, his mentor's
  clubs, and any other club as an open pitch (half the signing bonus). The Touchline's Wanted leads are useless in
  a job.
- **Work.** Full-time: at most 2 open briefs, all from one club. Freelance: one per client, plus selling mandates
  (freelancers only).
- **Pay.** Brief rewards are 2–6 weeks' salary (about $2k–6k at tier 3) against $8k–25k freelance. The signing
  bonus is 0.6% against 1.25%, and match bonuses are half. The salary ($55k a year at tier 3) is less than a good
  freelancer makes in a few weeks.

Goal: a job is a different way to play. You buy and sell for one ambitious club, on steady pay with a stake in
its results. Freelancing stays the high-risk, high-reward path.

## 1. Pay worth signing for
- `SALARY` ×1.8 (tier 3 about $100k, tier 4 $54k, tier 5 $32k). Renewals stay +10%.
- Full-time brief reward: 4–10 weeks' salary (was 2–6).
- `SIGNING_PCT.fulltime` 0.6 → 0.9; `SIGNING_FLOOR.fulltime` raised to about 70% of freelance.
- **Season bonus** at rollover, as a share of salary. Several can apply:
  - title 30%, promotion 25%, top half 10%, cup win 15%;
  - relegation pays nothing and costs 5 standing.
  It's written into the offer ("Bonuses: promotion 25%...") and paid with a news item. Paid pro rata for part
  of a season.
- Files: systems/employment.ts (`SALARY`, `seasonBonus`), systems/missions.ts (reward), systems/payouts.ts,
  systems/season.ts (call at rollover), views and career screen.

## 2. Sell for your club
- **Your employer gives you selling briefs.** It uses the existing mandate system (`Mandate`, `acceptMandate`,
  `payCommission`). marketTick also creates mandates for a full-time employer:
  - surplus players (below the positional average, or unhappy with their minutes);
  - more often than a client does (0.25 + quiet/150);
  - at most 2 at once.
  Commission is 2–3% of the fee (on top of salary), and the pick can't be a player you signed in the last 300 days.
- **Pitch your club's players anywhere.** `pitchRights` lets a full-time scout pitch his employer's players to any
  club, without a mandate. A sale without a brief earns no commission but counts toward the club's trust (a
  "sale" in `clubRecord`) and the window plan.
- The Touchline's Wanted items then point to buyers: a "You have a fit: X (your club)" chip shows when your club
  has a player at that position.
- `endFreelanceWork` no longer expires mandates from your new employer. Taking a job still ends the others.
- Files: systems/market.ts (`pitchRights`, mandate source, `acceptMandate` guard), systems/deals.ts (sale for
  the employer), views (gazette chip), missions screen copy.

## 3. The club's resources
- **Travel at home is free.** Travel, accommodation, tickets and meetings in the club's country: 100% covered.
  Elsewhere `EXPENSE_COVER` stays as it is.
- **A junior scout on the club's payroll.**
  - On joining, the club gives you an assistant (skill 4–8 by tier) with `clubPaid: true`.
  - His wage goes to the club, so no ledger line for you, and he doesn't ask for raises.
  - He works like any assistant (briefs, regions, office pickups).
  - He stays at the club when you leave, and doesn't count toward your staff limit.
- **The club's analysts.** On joining and each 1 July, every player in your employer's league is learned to
  knowledge 15 (capped by `FILE_KNOWLEDGE_CAP` for the tier). They show in search with a rough rating.
- **Window plan.**
  - When a window opens (1 Jun, 1 Jan) the club sets a budget and 2–3 positions, 1 or 2 of them to sell.
  - Each item fills an open brief or a mandate, so 3 briefs at once in a job (was 2).
  - Finishing the plan pays a window bonus of 5% of salary and +4 standing.
  - Shown on the career screen as a checklist.
- Files: systems/scouting.ts (`withExpenseCover`), systems/assistants.ts and model/assistant.ts (`clubPaid`),
  systems/employment.ts (on joining, on leaving), systems/knowledge.ts, new systems/window-plan.ts, missions
  (cap), views, career and staff screens.

## 4. Security and the coach's ear
- **The coach knows you.** At your employer:
  - his patience is 6 noes in 30 days (was 3);
  - fatigue at a position is 2.5% per name (was 5%);
  - a low hit rate costs half as much.
- **Protected from rivals.**
  - Rivals don't poach your employer (`clientsInReach` already covers only freelance clients; check it).
  - Rivals' close bonus on your deals at your employer is halved.
  - Smears at your employer clear on their own after 60 days.
- **Contract talks.** An offer (and a renewal) has two choices before you sign:
  - **Terms:** Salary first (+15% salary, season and window bonuses ×0.5) or Bonuses first (−15% salary,
    bonuses ×1.5).
  - **Length:** the offered seasons, or one more (a longer contract is −5% salary but a sacking pays out the rest
    of the season).
- **A sacking pays out.** Dismissal pays the rest of the current season's salary (was nothing).
- Files: systems/pitch-pressure.ts, systems/rivals.ts, systems/nemesis.ts, systems/employment.ts
  (`acceptOffer` takes terms), model/scout.ts (`Employment.terms`), engine facade, career screen offer card.

## Phases
| # | Phase | Risk |
|---|-------|------|
| 1 | Pay: salary, brief reward, signing bonus, season bonus | Low (balance) |
| 2 | Selling for your employer, pitching your club's players anywhere | Medium (pitch rights, mandates) |
| 3 | Free travel at home, junior scout, analysts, window plan | Medium (assistants, new system) |
| 4 | Coach's patience, protection from rivals, contract terms, payout on sacking | Low–medium |

## Testing
- Unit tests per phase in tests/engine/ (season bonus, employer mandates and pitch rights, club-paid assistant,
  window plan, contract terms).
- **Balance:** tests/sim/bot.ts gains `JOB=1`: the bot takes the first full-time offer it can and plays the job
  (briefs, employer mandates, window plan). Compare `SEED=4242 SEASONS=3` freelance against `JOB=1`.

## Acceptance
- With `JOB=1`, the bot ends each season within about 25% of the freelance bot's money, with fewer swings
  (no season below zero).
- A full-time scout has steady work: at least as many briefs and mandates a season as a freelancer with 3
  clients.
- The Touchline is useful in a job: you can sell your club's players to the clubs it names.
- Freelancing stays the higher ceiling: the best freelance seasons still beat the best job seasons.
