import { toParts, type GameDate } from '../../src/engine/core/calendar';
import type { ClubId, CountryId, PlayerId } from '../../src/engine/core/ids';
import { Engine } from '../../src/engine/index';
import type { Club } from '../../src/engine/model/club';
import type { Difficulty } from '../../src/engine/model/scout';
import type { GameState } from '../../src/engine/model/world-state';
import { clubPositionalAverage, formationPositions, remotePitchCheck } from '../../src/engine/systems/deals';
import { AGREEMENT_GATE, agreementCheck, clientSlots } from '../../src/engine/systems/employment';
import { meetingInfo } from '../../src/engine/systems/fieldwork';
import { estimate, fog } from '../../src/engine/systems/knowledge';
import { squadNeeds } from '../../src/engine/systems/squad-needs';
import { advanceDays } from '../../src/engine/tick';
import type { SearchFilters } from '../../src/engine/model/scout';
import { completeSearch, startSearch } from '../../src/engine/systems/scouting';

/**
 * A scripted freelance scout for the balance harness. Each week it:
 * accepts client invitations, courts a new client if it has a free slot,
 * searches for one client's most pressing need, and pitches the best fit it can afford to reach.
 * It plays honestly through the Engine (costs, travel, fog), not by reading the truth.
 */

export interface SeasonReport {
  season: number;
  income: number;
  expenses: number;
  net: number;
  byKind: Record<string, number>;
  money: number;
  reputation: number;
  clients: number;
  placements: number;
  pitches: number;
  signOffs: number;
  /** Season goals reached, e.g. "2/3", and trophies won. */
  goals: string;
  trophies: string[];
}

export interface BotResult {
  seasons: SeasonReport[];
  bankrupt?: string;
  secondsPerSeason: number;
  /** Why weeks did or didn't lead to a pitch. */
  why: Record<string, number>;
}

const INCOME = new Set(['signing-bonus', 'match-bonus', 'sale-commission', 'mission-reward', 'salary', 'award']);

export function runBot(opts: { seed: number; seasons: number; difficulty: Difficulty; home?: string }): BotResult {
  const e = new Engine();
  e.generate(opts.seed);
  const home = (opts.home ?? 'eng') as CountryId;
  e.createCareer({ name: 'Bot', nationality: home, homeCountry: home, background: 'analyst', difficulty: opts.difficulty });
  const s = (e as unknown as { state: GameState }).state;
  const startYear = s.season.year;
  const counters = { pitches: 0, signOffs: 0 };
  const why: Record<string, number> = {};
  const note = (k: string) => (why[k] = (why[k] ?? 0) + 1);
  const perSeason = new Map<number, { pitches: number; signOffs: number }>();
  // CPU time, not wall time: background processes can be throttled by the OS, which made wall time misleading.
  const cpu = () => {
    const u = (globalThis as { process?: { cpuUsage(): { user: number; system: number } } }).process?.cpuUsage();
    return u ? (u.user + u.system) / 1e6 : Date.now() / 1000;
  };
  const started = cpu();
  let turn = 0;
  const endMoney = new Map<number, number>();

  const scout = () => s.scout!;
  const clients = (): ClubId[] => (scout().employment.mode === 'freelance' ? (scout().employment as { clients: ClubId[] }).clients : []);
  const goTo = (club: Club) => {
    if (scout().location !== club.cityId) e.travel(club.cityId);
  };
  const timing: Record<string, number> = {};
  const safe = <T>(fn: () => T, label = 'other'): T | undefined => {
    const t0 = performance.now();
    try {
      return fn();
    } catch {
      return undefined;
    } finally {
      timing[label] = (timing[label] ?? 0) + performance.now() - t0;
    }
  };

  let lastYear = s.season.year;
  while (!s.careerOver && s.season.year < startYear + opts.seasons) {
    turn++;
    if (s.season.year !== lastYear) {
      endMoney.set(lastYear, scout().money);
      lastYear = s.season.year;
    }
    const season = s.season.year;
    const tally = perSeason.get(season) ?? { pitches: 0, signOffs: 0 };
    perSeason.set(season, tally);

    // 1. Client invitations.
    for (const o of [...s.offers]) if (o.kind === 'client' && clients().length < clientSlots(scout().reputation)) safe(() => e.acceptOffer(o.id));

    // Accept mission briefs from clients (they pay a reward on top).
    for (const m of s.missions) if (m.status === 'offered' && s.missions.filter((x) => x.status === 'active').length < 1) safe(() => e.acceptMission(m.id));

    // Trade up: with every slot taken, let the smallest client go when a bigger club would now take you on (and no deal of theirs is open).
    if (turn % 8 === 0 && clients().length >= clientSlots(scout().reputation)) {
      const worst = [...clients()].sort((a, b) => s.clubs[b]!.tier - s.clubs[a]!.tier)[0];
      const busy = (id: ClubId) => s.deals.some((d) => d.clubId === id && ['negotiating', 'agreed'].includes(d.stage));
      const better =
        worst && Object.values(s.clubs).some((c) => c.countryId === home && c.tier < s.clubs[worst]!.tier && scout().reputation >= AGREEMENT_GATE[c.tier]);
      if (worst && better && !busy(worst)) safe(() => e.dropClient(worst), 'drop client');
    }

    // 2. Court a new client: a club at home we're allowed to approach, nearest tier we can reach.
    if (clients().length < clientSlots(scout().reputation) && scout().money > 2_000) {
      // Start close to home: clubs in your home region first (day trips, no hotels), then the rest of the country.
      const homeRegion = s.cities[scout().homeCity]!.regionId;
      const local = (c: Club) => (s.cities[c.cityId]!.regionId === homeRegion ? 0 : 1);
      const candidates = Object.values(s.clubs)
        .filter((c) => c.countryId === home && !clients().includes(c.id) && agreementCheck(s, c.id).ok)
        .sort((a, b) => a.tier + local(a) - (b.tier + local(b)) || local(a) - local(b)); // the best club that will have you; a step up is worth a trip
      const target = candidates[turn % Math.max(1, Math.min(4, candidates.length))];
      if (target) {
        const coach = { kind: 'official' as const, id: target.headCoachId };
        if (meetingInfo(s, coach).allowed) {
          goTo(target);
          for (let i = 0; i < 3 && (scout().relationships[target.headCoachId] ?? 0) < 12; i++) safe(() => e.meet(coach), 'meet');
          safe(() => e.proposeAgreement(target.id), 'propose');
        }
      }
    }

    // 3. Work one client: search its top need, pitch up to two fits.
    const list = clients();
    const club = list.length ? s.clubs[list[turn % list.length]!] : undefined;
    if (!club) note('no client');
    else if (scout().money <= 1_500) note('too poor to work');
    // A club with (almost) no money left can only take free agents: search for them now and then, not every week.
    const broke = club ? club.transferBudget < 10_000 && turn % 4 !== 0 : false;
    if (broke) note('client has no budget');
    if (club && scout().money > 1_500 && !broke) {
      // The most pressing need, or failing that the weakest outfield position: any signing above the average helps.
      const needs = squadNeeds(
        club.formation,
        club.squad.map((id) => s.players[id]!),
      ).filter((n) => n.position !== 'GK');
      const need = needs.find((n) => n.severity >= 0.2) ?? needs[turn % Math.max(1, needs.length)];
      if (!need) note('client has no pressing need');
      if (need) {
        const bar = clubPositionalAverage(s, club, need.position) + 1;
        const filters: SearchFilters = {
          // Start local: a region search is cheaper, and nearby players are easier to visit.
          location: turn % 3 === 0 ? { scope: 'country', id: club.countryId } : { scope: 'region', id: s.cities[club.cityId]!.regionId },
          positions: [need.position],
          ratingFloors: { [need.position]: bar },
          value: club.transferBudget > 0 ? [0, club.transferBudget] : undefined,
          attributes: [],
          includeFreeAgents: true,
        };
        // Check the pool first, like a player would: players found earlier who clear the bar and haven't been put to this club.
        const pitched = new Set(s.deals.filter((d) => d.clubId === club.id).map((d) => d.playerId));
        const fromPool = Object.keys(s.pool)
          .map((id) => s.players[id as PlayerId])
          .filter((p): p is NonNullable<typeof p> => !!p && p.clubId !== club.id && !pitched.has(p.id) && (p.positions[need.position] ?? 0) >= 0.75)
          .map((p) => ({ p, est: estimate(fog(s, p).positions[need.position]) }))
          .filter((x) => x.est > bar);
        const r = fromPool.length ? undefined : safe(() => {
          const t0 = performance.now();
          const record = startSearch(s, filters);
          const t1 = performance.now();
          advanceDays(s, record.days);
          const t2 = performance.now();
          completeSearch(s, record);
          const t3 = performance.now();
          const view = e.getSearch(record.id)!;
          const t4 = performance.now();
          timing['search: start'] = (timing['search: start'] ?? 0) + t1 - t0;
          timing['search: days pass'] = (timing['search: days pass'] ?? 0) + t2 - t1;
          timing['search: match'] = (timing['search: match'] ?? 0) + t3 - t2;
          timing['search: view'] = (timing['search: view'] ?? 0) + t4 - t3;
          return { search: view };
        }, 'search');
        const found = (
          fromPool.length
            ? fromPool
            : (r?.search.results ?? [])
                .map((row) => s.players[row.id as PlayerId])
                .filter((p): p is NonNullable<typeof p> => !!p && p.clubId !== club.id)
                .map((p) => ({ p, est: estimate(fog(s, p).positions[need.position]) }))
                .filter((x) => x.est > bar)
        )
          .sort((a, b) => b.est - a.est)
          .slice(0, 2);
        note(
          fromPool.length
            ? 'candidates from the pool'
            : r
              ? r.search.results.length
                ? found.length
                  ? 'found candidates'
                  : 'results but none look good enough'
                : 'search found nobody'
              : 'search failed',
        );
        // A club that trusts you takes the pitch by phone: no trip needed.
        const byPhone = remotePitchCheck(s, club.id).ok;
        // A rival's rumour about you there: go and set the record straight.
        const smear = s.scout!.smears?.[club.id];
        if (smear && !smear.cleared && s.date - smear.date < 180) {
          goTo(club);
          safe(() => e.meet({ kind: 'official' as const, id: club.headCoachId }), 'meet');
        }
        // Get to know the coach before asking him to sign anyone.
        if (found.length && !byPhone) {
          goTo(club);
          const coach = { kind: 'official' as const, id: club.headCoachId };
          for (let i = 0; i < 2 && (scout().relationships[club.headCoachId] ?? 0) < 35; i++) safe(() => e.meet(coach), 'meet');
        }
        for (const { p } of found) {
          if (!formationPositions(club).includes(need.position)) break;
          if (!s.players[p.id] || p.clubId === club.id) continue; // retired or moved since the search
          const preview = safe(() => e.getPitchPreview(p.id, club.id, need.position), 'preview');
          if (!preview) continue;
          if (!preview.work.ok || !preview.affordable || preview.existing) {
            note(
              !preview.affordable
                ? preview.fee > club.transferBudget
                  ? 'club cannot afford the fee'
                  : 'club cannot afford the wage'
                : preview.existing
                  ? 'already pitched'
                  : 'not allowed',
            );
            continue;
          }
          // Like a player reading the pitch dialog: don't waste a pitch the board will surely block.
          if (preview.board?.read === 'long-shot') {
            note('board would block');
            continue;
          }
          if (!byPhone) goTo(club);
          const res = safe(() => e.pitch({ playerId: p.id, clubId: club.id, position: need.position, to: 'coach', remote: byPhone }), 'pitch');
          if (res && byPhone) note('pitched by phone');
          if (res) {
            const d = s.deals.find((x) => x.id === res.deal.id);
            if (d?.boardBlocked) note('board blocked');
            else if (d?.boardChecked) note('board backed');
          }
          if (res) {
            counters.pitches++;
            tally.pitches++;
            if (res.deal.stage === 'negotiating') {
              counters.signOffs++;
              tally.signOffs++;
            }
          }
        }
      }
    }

    // 4. Go home (a trip is cheaper than a week of hotel nights), then let the week play out.
    if (s.cities[scout().location]!.regionId !== s.cities[scout().homeCity]!.regionId) safe(() => e.travel(scout().homeCity));
    safe(() => advanceDays(s, 7), 'advance week');
  }

  const seasons: SeasonReport[] = [];
  for (let y = startYear; y < startYear + opts.seasons; y++) {
    const t = s.ledgerTotals[y] ?? {};
    const byKind = Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'starting-funds')) as Record<string, number>;
    const income = Object.entries(byKind)
      .filter(([k, v]) => INCOME.has(k) && v > 0)
      .reduce((n, [, v]) => n + v, 0);
    const expenses = Object.entries(byKind)
      .filter(([k]) => !INCOME.has(k))
      .reduce((n, [, v]) => n + v, 0);
    const placements = s.placements.filter((p) => seasonOf(p.signedOn) === y).length;
    const tally = perSeason.get(y) ?? { pitches: 0, signOffs: 0 };
    seasons.push({
      season: y,
      income,
      expenses,
      net: income + expenses,
      byKind,
      money: endMoney.get(y) ?? s.scout!.money,
      reputation: s.seasonReviews.find((r) => r.season === y)?.reputation.end ?? s.scout!.reputation,
      clients: 0,
      placements,
      goals: `${s.objectives.filter((o) => o.season === y && o.status === 'done').length}/${s.objectives.filter((o) => o.season === y).length}`,
      trophies: s.trophies.filter((t) => t.season === y).map((t) => t.title),
      ...tally,
    });
  }
  if (seasons.length) {
    const last = seasons[seasons.length - 1]!;
    last.reputation = s.scout!.reputation;
    last.clients = clients().length;
  }
  console.log(
    'timing (s): ' +
      Object.entries(timing)
        .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`)
        .join(' · ') +
      ` · pool ${Object.keys(s.pool).length} · deals ${s.deals.length} · ledger ${s.ledger.length} · news ${s.news.length}`,
  );
  return { seasons, why, bankrupt: s.careerOver?.reason, secondsPerSeason: (cpu() - started) / Math.max(1, seasons.length) };
}

/** The season (starting year) a date falls in: seasons start on 1 July. */
function seasonOf(date: GameDate): number {
  const { year, month } = toParts(date);
  return month >= 7 ? year : year - 1;
}
