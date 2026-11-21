# Phase 1: Merge the menu

## Requirements
Menu goes from 15 items to 9: Home, Inbox, Weekly, Search, Pool, Work, Finances, Agency, Career.
- **Weekly** absorbs the News feed (a "World news" section or tab).
- **Work** = tabs for Deals, Missions, Hunts.
- **Agency** = tabs for Agency and Staff (assistants).
- **Career** = tabs for Career, Goals, Rivals.
- Existing routes (`news`, `deals`, `missions`, `hunts`, `staff`, `goals`, `rivals`) keep working and open the right tab: news items, inbox links and buttons link to them.

## Files
- `src/ui/app.tsx` (NAV, Screen switch, breadcrumb)
- `src/ui/store/game-store.ts` (Route: optional `tab`)
- New `src/ui/components/tabbed-screen.tsx` (tab bar shared by Work, Agency, Career)
- `src/ui/screens/gazette-screen.tsx` (news section)

## Steps
1. Add a small tab-bar component; tab chosen from the route.
2. Map old screens to (hub, tab); NAV shows hubs only; active state covers the old routes.
3. Move the News list into the Weekly as its last section (or a tab).
4. Badges (deadline, counts) move to the hub item.

## Validation
Click every old link type (inbox item, mission news, deal reveal, rival warning) and land on the right tab. Phone menu fits without scrolling.

## Risks
Deep links built from news `link` fields: grep every `navigate({ screen:` and test.
