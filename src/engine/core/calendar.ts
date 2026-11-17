/** A game date is a whole number of days since 1970-01-01 (UTC). */
export type GameDate = number & { readonly __brand: 'GameDate' };

const DAY_MS = 86_400_000;

export const makeDate = (year: number, month: number, day: number): GameDate => Math.floor(Date.UTC(year, month - 1, day) / DAY_MS) as GameDate;

export const addDays = (d: GameDate, days: number): GameDate => (d + days) as GameDate;

export const toParts = (d: GameDate) => {
  const js = new Date(d * DAY_MS);
  return { year: js.getUTCFullYear(), month: js.getUTCMonth() + 1, day: js.getUTCDate(), weekday: js.getUTCDay() };
};

export const formatDate = (d: GameDate): string =>
  new Date(d * DAY_MS).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Age in whole years on a given date. */
export const ageOn = (birth: GameDate, on: GameDate): number => {
  const b = toParts(birth);
  const n = toParts(on);
  let age = n.year - b.year;
  if (n.month < b.month || (n.month === b.month && n.day < b.day)) age--;
  return age;
};

/** Careers start at the opening of the summer transfer window. */
export const CAREER_START: GameDate = makeDate(2026, 7, 1);

export const isTransferWindow = (d: GameDate): boolean => {
  const { month } = toParts(d);
  return month === 7 || month === 8 || month === 1;
};
