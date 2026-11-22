/** The GUI colour themes. Same tokens, different paint; the choice is kept per browser. */
export type ThemeId = 'stadium' | 'navy';

export const THEMES: { id: ThemeId; label: string; short: string; swatch: [string, string, string] }[] = [
  { id: 'stadium', label: 'Stadium night', short: 'Stadium', swatch: ['#05080a', '#2fcf73', '#ffc933'] },
  { id: 'navy', label: 'Floodlit navy', short: 'Navy', swatch: ['#070a12', '#4cc9f0', '#f2c14e'] },
];

const KEY = 'theme';

export function storedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'navy' ? 'navy' : 'stadium';
  } catch {
    return 'stadium';
  }
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: every switch on screen shows the same choice. */
export function subscribeTheme(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentTheme(): ThemeId {
  return document.documentElement.dataset.theme === 'navy' ? 'navy' : 'stadium';
}

export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  if (id === 'stadium') delete root.dataset.theme;
  else root.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: the choice lasts until the tab closes */
  }
  listeners.forEach((fn) => fn());
}
