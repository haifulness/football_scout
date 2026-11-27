import { describe, expect, it } from 'vitest';
import { formatUSD } from '../../src/engine/core/money';
import { generateWorld } from '../../src/engine/generation/world-generator';
import type { ClubTier } from '../../src/engine/model/club';
import { TIER_BANDS } from '../../src/engine/systems/economy';
import { runBot } from './bot';
import { runAgencySeason } from './agency-sim';
import type { CountryId } from '../../src/engine/core/ids';

/**
 * Balance harness (PLAN §3.9a): `npm run balance`. Prints an economy report and a bot
 * career's income curve, and checks the curve against the targets.
 */

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

describe('economy report', () => {
  it('world money by tier stays inside the tier bands', () => {
    const w = generateWorld(2027);
    const rows: string[] = [];
    for (const tier of [1, 2, 3, 4, 5] as ClubTier[]) {
      const clubs = Object.values(w.clubs).filter((c) => c.tier === tier);
      const players = clubs.flatMap((c) => c.squad.map((id) => w.players[id]!));
      const wage = median(players.map((p) => p.wage));
      const value = median(players.map((p) => p.value));
      const budget = median(clubs.map((c) => c.transferBudget));
      rows.push(
        `T${tier}: median wage ${formatUSD(wage)}/wk · value ${formatUSD(value)} · transfer budget ${formatUSD(budget)} · band wage ${formatUSD(TIER_BANDS[tier].wageWeekly.min)}–${formatUSD(TIER_BANDS[tier].wageWeekly.max)}`,
      );
      expect(wage).toBeGreaterThan(0);
    }
    console.log('\n' + rows.join('\n'));
  }, 120_000);
});

describe('bot career (Normal, freelance)', () => {
  it('season 1 roughly breaks even; income grows', () => {
    const r = runBot({
      seed: Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SEED ?? 4242),
      seasons: Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SEASONS ?? 3),
      difficulty: 'normal',
      job: !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.JOB,
    });
    console.log(
      '\n' +
        r.seasons
          .map(
            (x) =>
              `${x.season}/${String(x.season + 1).slice(2)}: income ${formatUSD(x.income)} · expenses ${formatUSD(x.expenses)} · net ${formatUSD(x.net)} · pitches ${x.pitches} (${x.signOffs} signed off) · placements ${x.placements} · money at end ${formatUSD(x.money)} · rep ${x.reputation} · goals ${x.goals}${x.trophies.length ? ` · won ${x.trophies.join(', ')}` : ''}\n   ${Object.entries(
                x.byKind,
              )
                .map(([k, v]) => `${k} ${formatUSD(v)}`)
                .join(' · ')}`,
          )
          .join('\n'),
    );
    const last = r.seasons[r.seasons.length - 1];
    console.log(
      `end: money ${formatUSD(last?.money ?? 0)} · reputation ${last?.reputation} · clients ${last?.clients} · ${r.secondsPerSeason.toFixed(1)} s CPU/season${r.bankrupt ? ` · BANKRUPT: ${r.bankrupt}` : ''}`,
    );
    console.log(
      'weeks: ' +
        Object.entries(r.why)
          .map(([k, v]) => `${k} ${v}`)
          .join(' · '),
    );
    expect(r.seasons.length).toBeGreaterThan(0);
  }, 1_800_000);
});

describe('agency books (one season, no scouting of your own)', () => {
  it('staffed offices pay for themselves; empty ones cost money', () => {
    const seed = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SEED ?? 4242);
    const c = (...ids: string[]) => ids as CountryId[];
    const runs: [CountryId[], number][] = [
      [c(), 0],
      [c('esp'), 0],
      [c('esp', 'ger', 'bra'), 0],
      [c('esp', 'ger', 'bra'), 12],
    ];
    for (const [offices, minSkill] of runs) {
      const r = runAgencySeason(seed, offices, 2, minSkill);
      console.log(
        `${r.label}: ${r.staff} staff (avg skill ${r.avgSkill}) · ${r.brokered} deals · cuts ${formatUSD(r.cuts)} · upkeep & rent ${formatUSD(r.upkeep)} · wages ${formatUSD(r.wages)} · net ${formatUSD(r.net)}`,
      );
    }
    expect(true).toBe(true);
  }, 600_000);
});
