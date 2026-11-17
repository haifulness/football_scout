import { clamp, lerp } from '../core/rng';
import { roundPrice, usd, type USD } from '../core/money';
import type { ClubTier } from '../model/club';

/**
 * World money scale. Every fee, wage and budget comes from these bands
 * (PLAN §3.9a), multiplied by the country's wealth index.
 */
interface Band {
  min: number;
  max: number;
}

export const TIER_BANDS: Record<ClubTier, { wageWeekly: Band; transferBudget: Band; squadOvr: Band; reputation: Band; capacity: Band }> = {
  1: {
    wageWeekly: { min: 50_000, max: 500_000 },
    transferBudget: { min: 50_000_000, max: 300_000_000 },
    squadOvr: { min: 76, max: 86 },
    reputation: { min: 82, max: 99 },
    capacity: { min: 45_000, max: 85_000 },
  },
  2: {
    wageWeekly: { min: 15_000, max: 80_000 },
    transferBudget: { min: 10_000_000, max: 60_000_000 },
    squadOvr: { min: 68, max: 78 },
    reputation: { min: 66, max: 84 },
    capacity: { min: 22_000, max: 50_000 },
  },
  3: {
    wageWeekly: { min: 3_000, max: 20_000 },
    transferBudget: { min: 1_000_000, max: 10_000_000 },
    squadOvr: { min: 58, max: 70 },
    reputation: { min: 48, max: 68 },
    capacity: { min: 9_000, max: 28_000 },
  },
  4: {
    wageWeekly: { min: 500, max: 4_000 },
    transferBudget: { min: 50_000, max: 1_000_000 },
    squadOvr: { min: 48, max: 60 },
    reputation: { min: 30, max: 50 },
    capacity: { min: 3_000, max: 12_000 },
  },
  5: {
    wageWeekly: { min: 100, max: 800 },
    transferBudget: { min: 0, max: 60_000 },
    squadOvr: { min: 38, max: 50 },
    reputation: { min: 10, max: 32 },
    capacity: { min: 500, max: 4_000 },
  },
};

/**
 * Market value from ability. Log-linear fit through the tier bands:
 * OVR 42 ≈ $10k (semi-pro), OVR 65 ≈ $950k, OVR 78 ≈ $12.5M, OVR 90 ≈ $134M.
 */
export function baseValue(ovr: number): number {
  return 10_000 * Math.exp(0.198 * (ovr - 42));
}

export function ageValueFactor(age: number, potential: number, ovr: number): number {
  const growth = Math.max(0, potential - ovr);
  if (age <= 21) return 1 + growth * 0.035; // young players are priced on what they could become
  if (age <= 24) return 1 + growth * 0.02;
  if (age <= 28) return 1;
  if (age <= 30) return 0.8;
  if (age <= 32) return 0.55;
  return 0.3;
}

/** Even generational talents top out here. */
export const MAX_VALUE = 180_000_000;

export function marketValue(p: { ovr: number; age: number; potential: number; contractYearsLeft: number; wealthIndex: number }): USD {
  const contract = p.contractYearsLeft <= 0 ? 0.1 : p.contractYearsLeft < 1 ? 0.55 : p.contractYearsLeft < 2 ? 0.85 : 1;
  const wealth = Math.sqrt(p.wealthIndex);
  return roundPrice(Math.min(MAX_VALUE, baseValue(p.ovr) * ageValueFactor(p.age, p.potential, p.ovr) * contract * wealth));
}

/** Weekly wage: position in the club's wage band by how the player ranks against the tier's squad OVR band. */
export function weeklyWage(ovr: number, tier: ClubTier, wealthIndex: number): USD {
  const b = TIER_BANDS[tier];
  const t = clamp((ovr - b.squadOvr.min + 4) / (b.squadOvr.max - b.squadOvr.min + 8), 0, 1);
  return roundPrice(lerp(b.wageWeekly.min, b.wageWeekly.max, t * t) * wealthIndex);
}

export function bandValue(band: Band, t: number, wealthIndex = 1): USD {
  return usd(lerp(band.min, band.max, clamp(t, 0, 1)) * wealthIndex);
}
