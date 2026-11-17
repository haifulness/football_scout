/**
 * All money is whole US dollars. Values are only created through these helpers,
 * which round at the boundary so ledgers never accumulate floating-point drift.
 */
export type USD = number & { readonly __brand: 'USD' };

export const usd = (amount: number): USD => Math.round(amount) as USD;

export const addUSD = (...amounts: USD[]): USD => usd(amounts.reduce((s, a) => s + a, 0));

/** Percentage of an amount, e.g. pct(fee, 1.5) for 1.5%. */
export const pct = (amount: USD, percent: number): USD => usd((amount * percent) / 100);

export const scaleUSD = (amount: USD, factor: number): USD => usd(amount * factor);

/** Rounds to a "price-like" number: 2 significant figures ($1,234,567 → $1,200,000). */
export const roundPrice = (amount: number): USD => {
  if (amount <= 0) return usd(0);
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(amount)) - 1));
  return usd(Math.round(amount / mag) * mag);
};

export function formatUSD(amount: number, opts: { compact?: boolean } = {}): string {
  const sign = amount < 0 ? '-' : '';
  const a = Math.abs(amount);
  if (opts.compact !== false) {
    if (a >= 1_000_000_000) return `${sign}$${trim(a / 1_000_000_000)}B`;
    if (a >= 1_000_000) return `${sign}$${trim(a / 1_000_000)}M`;
    if (a >= 10_000) return `${sign}$${trim(a / 1_000)}k`;
  }
  return `${sign}$${a.toLocaleString('en-US')}`;
}

const trim = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''));
