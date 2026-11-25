# Hidden club needs: find out what a club wants

Status: planned 2026-11-25, not started

Feedback: you shouldn't know a club's needs from the start. Today they are fully visible on the club page
(Recruitment needs, best XI with ratings), in the Touchline ("clubs short of players"), in the pitch dialog's club
list ("Urgent need at CM", "Average 36 at CM") and in its bar comparison. Finding out should be work, with
different sources costing time, money, reputation or risk.

## The model
- Per club, a **needs read**: `knowledge.clubs[clubId] = { level 0–100, date, positions?: Partial<Record<Position, number>> }`.
  A general level (how well you know the squad and the coach's plans) plus sharper reads for single positions
  (what an insider or a player told you about one line).
- What you see follows the level, like player fog:
  - **0–24 unknown**: no needs list, positional averages hidden ("?"), the pitch bar shows only your player.
  - **25–49 rough**: the two or three weakest lines named ("they look thin in defence"), averages as wide ranges.
  - **50–79 good**: needs by position with severity, averages ±3.
  - **80+ sure**: exact, as today.
- A read **goes stale** when the squad changes: a transfer in or out, a long injury, a new coach or formation. Each
  change knocks the level down for the positions it touches, with a "your read is out of date" note (as players have).
- The club's own sign-off is unchanged: the coach still judges on the truth. Only what you see is hidden.
- Clients and your employer start at "good"; your mentor's clubs at "rough".

## Ways to learn (each a small action with its own cost, accuracy and risk)
| # | Source | Cost | Accuracy | Catch |
|---|--------|------|----------|-------|
| 1 | **Analyse the squad yourself** | Days (more for a big squad), free | Only as good as what you know of their players | Works at any reputation |
| 2 | **Ask the head coach** | A meeting | Exact | Refusal likely at low reputation; a refusal sours him for months |
| 3 | **Buy it from an insider** | Money | Often wrong on one position | No reputation needed; caught paying twice and integrity drops |
| 4 | **Wait for a brief** | Free | Exact for that position | Needs standing with the club |
| 5 | **Watch them play** (match visit) | Ticket, a day | Good on the XI and weak spots | You also learn about players |
| 6 | **Read the Touchline** | Free | Vague, late | Big clubs get more coverage |
| 7 | **Ask players you know** at the club | Free (rapport) | Accurate for their line | Needs a player you placed or know |
| 8 | **Learn from a refusal** | Free | One line | Only after a failed pitch |
| 9 | **Send an assistant** | His weeks and expenses | By his skill | Needs staff |
| 10 | **Swap with a rival** | A read of yours | Accurate | He now knows your target |
| 11 | **Follow transfer and injury news** | Free | Partial | You have to read the news |
| 12 | **Data subscription** per country | Monthly fee | Rough for every club in its leagues | Never better than "rough" |
| 13 | **Client needs meeting** each quarter | Free for clients | Exact | Only clubs you work for |

## Phases
| # | Phase | Risk |
|---|-------|------|
| 1 | Needs read model, fog on every screen that shows needs, staleness | Medium (touches many views) |
| 2 | Free and time sources: self analysis, watching a match, the Touchline and news, refusals, briefs, client meetings | Medium |
| 3 | Social sources: ask the coach (with refusal memory), players you know, rival swaps | Medium |
| 4 | Paid sources: insiders (unreliable), assistants, data subscription | Low–medium |

## Files (expected)
- model/scout.ts or a new model/club-read.ts; new systems/club-read.ts (levels, decay, sources)
- index.ts: getClub (needs, lineup, averages), getPitchPreview (positionalAverage, clearsBar), pool club list
  (`Urgent need at …`), gazette needs, Home hints
- systems/fieldwork.ts (coach meeting ask), matchday.ts (club read from a visit), missions.ts (brief reveals),
  newspaper.ts (hints), assistants.ts (club analysis task), rivals.ts (swap), dilemmas/integrity for insiders
- UI: club page needs panel and lineup ratings, recommend dialog bar and club list, a "How well you know their
  needs" block with the actions

## Acceptance
- A new career sees no club's needs until it does something; clients start known.
- Each source raises the read by its own amount and costs what the table says; refusals and insider mistakes happen.
- Reads go stale after transfers, injuries and coach changes.
- The bot still finds work (it uses its clients' needs); balance harness in range on 4242 and 777.
- Old saves: clubs you work for start at "good", others at "unknown".
