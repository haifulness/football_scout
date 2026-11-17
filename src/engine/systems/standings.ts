import type { ClubId } from '../core/ids';
import type { Fixture } from '../model/season';

export interface TableRow {
  clubId: ClubId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Most recent last. */
  form: ('W' | 'D' | 'L')[];
}

/** League table from played fixtures: points, then goal difference, then goals scored. */
export function computeTable(clubIds: ClubId[], fixtures: Fixture[]): TableRow[] {
  const rows = new Map<ClubId, TableRow>(
    clubIds.map((id) => [id, { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] }]),
  );
  const played = fixtures.filter((f) => f.result).sort((a, b) => a.date - b.date);
  for (const f of played) {
    const h = rows.get(f.homeId);
    const a = rows.get(f.awayId);
    if (!h || !a) continue;
    const { homeGoals: hg, awayGoals: ag } = f.result!;
    h.played++;
    a.played++;
    h.goalsFor += hg;
    h.goalsAgainst += ag;
    a.goalsFor += ag;
    a.goalsAgainst += hg;
    const record = (winner: TableRow, loser: TableRow) => {
      winner.won++;
      winner.points += 3;
      winner.form.push('W');
      loser.lost++;
      loser.form.push('L');
    };
    if (hg > ag) record(h, a);
    else if (hg < ag) record(a, h);
    else {
      for (const r of [h, a]) {
        r.drawn++;
        r.points++;
        r.form.push('D');
      }
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, form: r.form.slice(-5) }))
    .sort(
      (x, y) =>
        y.points - x.points || y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor || x.clubId.localeCompare(y.clubId),
    );
}

/** Clubs going up/down between adjacent levels. */
export const promotionSpots = (leagueSize: number) => (leagueSize >= 20 ? 3 : 2);
