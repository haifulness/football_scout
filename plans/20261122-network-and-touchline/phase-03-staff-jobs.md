# Phase 3 — Staff take a job for you (done)

An assistant with skill ≥ 12 can take one active brief (`src/engine/systems/delegation.ts`).
- Mondays he shortlists players in the club's country and his home market who fit the brief as far as his
  eye can tell (age, foot, nationality, fee on the truth; rating with his skill's noise), and pitches the best
  one under your name: no trip or meeting fee for you, weekly brief expenses instead.
- Up to 3 names; a weak pick is a club-level no that costs your standing. If he finds nobody in 4 weeks, or
  runs out of names, he hands it back. He also gains experience.
- His cut: 25% of the mission reward and of the signing bonus (`chargeStaffCut`); nothing if he has left.
- UI: "Hand it to an assistant" on active briefs (Missions), job panel and "Take the brief back" on the
  assistant card, an In progress item on Home.
- Balance unchanged (the bot doesn't delegate).
