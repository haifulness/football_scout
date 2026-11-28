import { earningsTotal } from '../model/deal';
import { makeDate } from '../core/calendar';
import type { GameState } from '../model/world-state';
import type { ReviewPlayer, SeasonReview } from '../model/review';
import { addNews } from './season';

const KEEP_REVIEWS = 20;

/** Remember where you stand as a season begins, for its review. */
export function snapshotReviewBaseline(state: GameState) {
  if (!state.scout) return;
  state.reviewBaseline = {
    season: state.season.year,
    reputation: state.scout.reputation,
    rivalSignings: Object.fromEntries(state.rivals.map((r) => [r.id, r.record.signings])),
  };
}

/** Written at the summer rollover, while the season's player stats are still live. */
export function writeSeasonReview(state: GameState, year: number): SeasonReview | undefined {
  const scout = state.scout;
  if (!scout) return undefined;
  const totals = state.ledgerTotals[year] ?? {};
  const byKind = Object.fromEntries(Object.entries(totals).filter(([k, v]) => k !== 'starting-funds' && v)) as SeasonReview['byKind'];
  const values = Object.values(byKind) as number[];
  const income = values.filter((v) => v > 0).reduce((n, v) => n + v, 0);
  const expenses = values.filter((v) => v < 0).reduce((n, v) => n + v, 0);
  const seasonStart = makeDate(year, 7, 1);
  const seasonEnd = makeDate(year + 1, 7, 1);

  const players: ReviewPlayer[] = [];
  for (const pl of state.placements) {
    if (pl.signedOn >= seasonEnd || (pl.endedOn !== undefined && pl.endedOn < seasonStart)) continue;
    const p = state.players[pl.playerId];
    if (!p) continue;
    const e = pl.earnings;
    players.push({
      playerId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      clubId: pl.clubId,
      apps: p.stats.apps,
      goals: p.stats.goals,
      assists: p.stats.assists,
      rating: p.stats.apps ? Math.round((p.stats.ratingSum / p.stats.apps) * 10) / 10 : 0,
      earned: pl.bonus + earningsTotal(e),
    });
  }
  players.sort((a, b) => b.rating - a.rating || b.apps - a.apps);
  const regulars = players.filter((p) => p.apps >= 5);

  const base = state.reviewBaseline?.season === year ? state.reviewBaseline : undefined;
  const mine = state.placements.filter((pl) => pl.signedOn >= seasonStart && pl.signedOn < seasonEnd).length;
  let rank: SeasonReview['rank'];
  if (base) {
    const rivals = state.rivals.map((r) => ({
      name: `${r.firstName} ${r.lastName}`,
      signings: r.record.signings - (base.rivalSignings[r.id] ?? r.record.signings),
    }));
    const better = rivals.filter((r) => r.signings > mine).length;
    const leader = [...rivals].sort((a, b) => b.signings - a.signings)[0];
    rank = { position: better + 1, of: rivals.length + 1, signings: mine, leader };
  }

  const review: SeasonReview = {
    season: year,
    income,
    expenses,
    byKind,
    placements: mine,
    reputation: { start: base?.reputation, end: scout.reputation },
    players,
    best: regulars[0]?.playerId,
    worst: regulars.length >= 2 ? regulars[regulars.length - 1]!.playerId : undefined,
    rank,
  };
  state.seasonReviews.push(review);
  if (state.seasonReviews.length > KEEP_REVIEWS) state.seasonReviews.splice(0, state.seasonReviews.length - KEEP_REVIEWS);
  state.pendingReview = year;
  const net = income + expenses;
  addNews(state, {
    date: state.date,
    kind: 'career',
    title: `Your ${year}/${String(year + 1).slice(2)} season in review`,
    body: `${mine} placement${mine === 1 ? '' : 's'}, ${net >= 0 ? 'a profit' : 'a loss'} of $${Math.abs(Math.round(net)).toLocaleString('en-US')}${rank ? `, ${ordinal(rank.position)} of ${rank.of} scouts by signings` : ''}. The full review is on your Career screen.`,
    link: 'career',
  });
  return review;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}
