import type { GameDate } from '../core/calendar';
import type { NewsLink } from '../model/season';
import type { GameState } from '../model/world-state';
import { addNews } from './season';

/**
 * Later systems open as your name grows, so a new career starts small and each step up brings something new.
 * Anything you already use stays open (older saves, scenario head starts), and an unlock never closes again.
 */

export type UnlockKey = 'assistants' | 'mandates' | 'representation' | 'agency';

export const UNLOCKS: { key: UnlockKey; reputation: number; label: string; body: string; link?: NewsLink }[] = [
  {
    key: 'assistants',
    reputation: 12,
    label: 'Assistant scouts',
    body: 'People in the game know your name now: you can hire assistant scouts to cover an area for you and add what they find to your pool. See Agency › Assistants.',
    link: 'staff',
  },
  {
    key: 'mandates',
    reputation: 20,
    label: 'Selling mandates',
    body: "Clients trust you with sales now: they'll ask you to sell players they don't need, for a commission. Offers arrive in Work › Missions.",
    link: 'missions',
  },
  {
    key: 'representation',
    reputation: 25,
    label: 'Representing free agents',
    body: "Free agents will let you represent them now. Meet one until he trusts you, then represent him from his page: you can pitch him to any club, and AI clubs leave him to you.",
  },
  {
    key: 'agency',
    reputation: 40,
    label: 'Your own agency',
    body: 'Your own agency is within reach: offices abroad, more clients, a staff of scouts. Agency › Agency shows what it takes.',
    link: 'agency',
  },
];

const inUse = (state: GameState, key: UnlockKey): boolean => {
  switch (key) {
    case 'assistants':
      return state.assistants.length > 0;
    case 'mandates':
      return state.mandates.length > 0;
    case 'representation':
      return (state.scout?.represented.length ?? 0) > 0;
    case 'agency':
      return !!state.agency;
  }
};

export function isUnlocked(state: GameState, key: UnlockKey): boolean {
  const sc = state.scout;
  if (!sc) return false;
  const u = UNLOCKS.find((x) => x.key === key)!;
  return sc.unlocks?.includes(key) || sc.reputation >= u.reputation || inUse(state, key);
}

/** The next thing your reputation will open, if any. */
export function nextUnlock(state: GameState): { label: string; reputation: number } | undefined {
  const u = UNLOCKS.find((x) => !isUnlocked(state, x.key));
  return u && { label: u.label, reputation: u.reputation };
}

/** Daily: announce each unlock once, the day you reach it. */
export function unlockTick(state: GameState, date: GameDate) {
  const sc = state.scout;
  if (!sc) return;
  // Systems already in use need no announcement; anything else reached is announced the first time.
  sc.unlocks ??= UNLOCKS.filter((u) => inUse(state, u.key)).map((u) => u.key);
  for (const u of UNLOCKS) {
    if (sc.unlocks.includes(u.key) || !isUnlocked(state, u.key)) continue;
    sc.unlocks.push(u.key);
    addNews(state, { date, kind: 'career', title: `Unlocked: ${u.label}`, body: u.body, link: u.link });
  }
}
