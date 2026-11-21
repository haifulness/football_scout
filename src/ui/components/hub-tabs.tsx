import type { ReactNode } from 'react';
import { useGame, type Route } from '../store/game-store';

type Screen = Route['screen'];
type Summary = NonNullable<ReturnType<typeof useGame.getState>['scout']>;

export interface HubTab {
  screen: Screen;
  label: string;
  /** Hidden until this system unlocks (with reputation). */
  requires?: keyof Summary['unlocked'];
  /** A count worth your attention on this tab. */
  badge?: (s: Summary) => { n: number | string; tone: 'gold' | 'red' | 'violet' | 'muted' | 'green'; title?: string } | undefined;
}

export interface Hub {
  label: string;
  icon: string;
  tabs: HubTab[];
}

const count = (n: number, tone: 'gold' | 'red' | 'violet', title?: string) => (n > 0 ? { n: n > 99 ? '99+' : n, tone, title } : undefined);

/** Menu hubs: several related screens behind one menu item, switched with tabs. Each screen keeps its own route. */
export const HUBS: Record<'weekly' | 'work' | 'agency' | 'career', Hub> = {
  weekly: {
    label: 'Weekly',
    icon: '¶',
    tabs: [
      { screen: 'gazette', label: 'This week' },
      { screen: 'news', label: 'All news' },
    ],
  },
  work: {
    label: 'Work',
    icon: '⇄',
    tabs: [
      { screen: 'deals', label: 'Deals' },
      { screen: 'missions', label: 'Missions', badge: (s) => count(s.pendingMissions + s.pendingMandates, 'gold', 'Waiting for your answer') },
      { screen: 'hunts', label: 'Hunts', badge: (s) => count(s.activeHunts, 'violet', 'Open hunts') },
      { screen: 'events', label: 'Events' },
    ],
  },
  agency: {
    label: 'Agency',
    icon: '◈',
    tabs: [
      { screen: 'staff', label: 'Assistants', requires: 'assistants', badge: (s) => count(s.idleAssistants, 'gold', 'Idle assistants') },
      { screen: 'agency', label: 'Agency', requires: 'agency' },
    ],
  },
  career: {
    label: 'Career',
    icon: '★',
    tabs: [
      { screen: 'career', label: 'Career', badge: (s) => count(s.pendingOffers, 'gold', 'Job offers') },
      {
        screen: 'goals',
        label: 'Goals',
        badge: (s) =>
          s.goals.total
            ? { n: `${s.goals.done}/${s.goals.total}`, tone: s.goals.done === s.goals.total ? 'green' : 'muted', title: 'Season goals reached' }
            : undefined,
      },
      { screen: 'rivals', label: 'Rivals', badge: (s) => count(s.rivalThreats, 'red', 'Rivals chasing your players') },
    ],
  },
};

/** Tabs you can see: locked systems stay hidden. */
export function openTabs(hub: Hub, s: Summary | null | undefined): HubTab[] {
  return hub.tabs.filter((t) => !t.requires || !!s?.unlocked[t.requires]);
}

export function hubOf(screen: Screen): Hub | undefined {
  return Object.values(HUBS).find((h) => h.tabs.some((t) => t.screen === screen));
}

/** The most urgent badge across a hub's tabs, for its menu item. */
export function hubBadge(hub: Hub, s: Summary | null | undefined) {
  if (!s) return undefined;
  const all = openTabs(hub, s)
    .map((t) => t.badge?.(s))
    .filter((b) => !!b);
  const rank = { red: 0, gold: 1, violet: 2, green: 3, muted: 4 } as const;
  return all.sort((a, b) => rank[a.tone] - rank[b.tone])[0];
}

const TONE = {
  gold: 'bg-flood-500 text-night-950',
  red: 'bg-alert-500 text-white',
  violet: 'bg-violet-500 text-white',
  green: 'bg-grass-400 text-night-950',
  muted: 'bg-white/10 text-mist-200',
};

export function Badge({ b, className = '' }: { b: NonNullable<ReturnType<NonNullable<HubTab['badge']>>>; className?: string }) {
  return (
    <span className={`num rounded-full px-1.5 text-[10px] font-bold ${TONE[b.tone]} ${className}`} title={b.title}>
      {b.n}
    </span>
  );
}

/** Tabs across the top of a hub screen. */
export function HubTabs({ hub, current, children }: { hub: Hub; current: Screen; children: ReactNode }) {
  const navigate = useGame((s) => s.navigate);
  const scout = useGame((s) => s.scout);
  const tabs = openTabs(hub, scout);
  const here = hub.tabs.find((t) => t.screen === current);
  const locked = !!here?.requires && !scout?.unlocked[here.requires];
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={hub.label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-white/[0.06] px-1">
        {tabs.map((t) => {
          const active = t.screen === current;
          const b = scout && t.badge?.(scout);
          return (
            <button
              key={t.screen}
              role="tab"
              aria-selected={active}
              onClick={() => !active && navigate({ screen: t.screen } as Route)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                active ? 'border-grass-400 text-mist-50' : 'border-transparent text-mist-400 hover:text-mist-100'
              }`}
            >
              {t.label}
              {b && <Badge b={b} />}
            </button>
          );
        })}
      </div>
      {locked ? (
        <div className="panel px-5 py-6 text-sm text-mist-300">
          <div className="font-display text-2xl font-bold uppercase text-mist-100">Not yet</div>
          This opens as your reputation grows. {scout?.nextUnlock && `Next up: ${scout.nextUnlock.label} at reputation ${scout.nextUnlock.reputation}.`}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
