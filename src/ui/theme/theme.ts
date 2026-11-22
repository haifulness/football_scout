/** The GUI colour themes. Same tokens, different paint (src/ui/theme/index.css); the choice is kept per browser. */
export type ThemeId = 'stadium' | 'navy' | 'plum' | 'terrace' | 'pitch';

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** One line on the mood. */
  blurb: string;
  /** For the picker's preview (literal colours: the preview shows a theme that isn't the active one). */
  preview: { bg: string; panel: string; line: string; text: string; faint: string; main: string; onMain: string; good: string; gold: string; info: string };
}

export const THEMES: ThemeDef[] = [
  {
    id: 'stadium',
    label: 'Stadium night',
    blurb: 'Pitch-black, grass green, floodlight amber.',
    preview: { bg: '#05080a', panel: '#0e161b', line: '#1a2830', text: '#e4eef2', faint: '#8aa2ad', main: '#1f9d55', onMain: '#05080a', good: '#2fcf73', gold: '#ffc933', info: '#38bdf8' },
  },
  {
    id: 'navy',
    label: 'Floodlit navy',
    blurb: 'Ink navy under cold floodlights, cyan and soft gold.',
    preview: { bg: '#070a12', panel: '#101726', line: '#1d2739', text: '#eef2fa', faint: '#8590ab', main: '#22b5e0', onMain: '#070a12', good: '#3ddc84', gold: '#f2c14e', info: '#e6a3e0' },
  },
  {
    id: 'plum',
    label: 'Midnight plum',
    blurb: 'A plum-black box at a night game, lavender and gold.',
    preview: { bg: '#0b070d', panel: '#18111d', line: '#291e31', text: '#f3eef8', faint: '#9d90ad', main: '#9b7ff5', onMain: '#0b070d', good: '#4ade80', gold: '#f5c451', info: '#7fe7ff' },
  },
  {
    id: 'terrace',
    label: 'Terrace ember',
    blurb: 'Warm espresso under the terrace lights, teal and amber.',
    preview: { bg: '#0d0907', panel: '#1c1511', line: '#2f241d', text: '#f7f0e5', faint: '#ab9b8b', main: '#22aaa5', onMain: '#0d0907', good: '#86e36b', gold: '#f2a93b', info: '#b8a8ff' },
  },
  {
    id: 'pitch',
    label: 'Matchday pitch',
    blurb: 'Floodlit turf, not black. Sky blue, gold and pink.',
    preview: { bg: '#0f2419', panel: '#173426', line: '#284f3a', text: '#f1f6f0', faint: '#a7c3b0', main: '#43b2ef', onMain: '#0f2419', good: '#5ee07a', gold: '#f5c84c', info: '#f59bd0' },
  },
];

const KEY = 'theme';
const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export function storedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'stadium';
  } catch {
    return 'stadium';
  }
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: every picker on screen shows the same choice. */
export function subscribeTheme(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentTheme(): ThemeId {
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : 'stadium';
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
