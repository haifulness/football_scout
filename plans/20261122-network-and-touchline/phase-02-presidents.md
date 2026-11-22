# Phase 2 — Presidents: money and direction

The coach decides "is he good enough for my team?"; the president decides "is he worth it for my club?".
A president never answers an ordinary pitch.

- Each club gets a president again (`Club.presidentId`; officials gain `role: 'president'`) with a
  **policy**: youth & resale, win now, homegrown, or sell to survive. Policy shapes which briefs the club posts
  and what he approves. The world generator still consumes the legacy draws, so seeds don't change; presidents
  are drawn from a separate derived RNG.
- **Big signings need the board**: above 3× the club's median transfer fee (or wage above the ceiling), the
  coach's yes becomes "subject to the board". The president judges age, resale and policy, not fit.
  Standing with him helps.
- **He hires and fires coaches**: after a sacking, a president you stand well with asks you to recommend the
  next coach (choose from out-of-work coaches you know). Your pick gets the job if he's credible.
- **Retainers and sell mandates come from him**: agreements and mandates are framed as boardroom business.
- **Rarely met**: an end-of-season review meeting or a boardroom invite; no everyday pitching.
- The Touchline reports policy changes, board backing, sackings.
- Save migration: v12 adds presidents to existing clubs.
