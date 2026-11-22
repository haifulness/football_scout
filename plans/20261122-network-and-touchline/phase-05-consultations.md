# Phase 5 — Players ask you about a club

Now and then a player asks "should I join Club X?". You answer Go / Only if he starts / Stay away; the game
knows the truth (depth at his position, the coach's formation, wage room, coach under pressure). A few months
later the outcome is checked: right answers build trust (leading to a representation offer), wrong ones cost
it. Steering him toward a club you have a deal with pays more but costs integrity if it goes wrong. Fee scales
with your relationship.

## Built

- `src/engine/model/consultation.ts`, `src/engine/systems/consultations.ts`; `state.consultations?`.
- Mondays in a transfer window (40%, one open at a time, 21 days apart): a player with rapport ≥ 15, or one
  you placed, asks about a club of the same or one tier better in his continent that can afford him. Half the
  time he'd start there, half not. Your read is right 60–90% of the time, depending on how well you know the market.
- Answers: Go (he signs), Only if he starts (signs only if he'd make the best XI), Stay away. He pays a fee
  (wage × 0.5 × (0.5 + rapport/100), $300–$20k) when you answer.
- Judged 60 days later on the best XI: right +12 rapport (+6 for "only if"), +1 reputation if he moved;
  wrong −15. A move to your own club pays a finder's fee (2% of the fee, min $1k) and counts as a signing;
  if it goes wrong, −25 rapport and −6 integrity.
- Not done: the representation offer from the original idea (representation is for free agents only).
- UI: ConsultationCards on Home and Inbox. Tests: tests/engine/consultations.test.ts.
