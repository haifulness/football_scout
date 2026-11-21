import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TimeControls } from './components/time-controls';
import { ClubScreen } from './screens/club-screen';
import { CountryScreen } from './screens/country-screen';
import { InboxScreen, NewsScreen } from './screens/inbox-screen';
import { PoolScreen } from './screens/pool-screen';
import { SearchScreen } from './screens/search-screen';
import { CareerSetup } from './components/career-setup';
import { TravelPlanner } from './components/travel-planner';
import { RecommendDialog } from './components/recommend-dialog';
import { HereWeGo } from './components/here-we-go';
import { ProdigyReveal } from './components/prodigy-reveal';
import { TrophyReveal } from './components/trophy-reveal';
import { ScenarioBanner } from './components/scenario-banner';
import { DealsScreen } from './screens/deals-screen';
import { FinancesScreen } from './screens/finances-screen';
import { CareerScreen } from './screens/career-screen';
import { MissionsScreen } from './screens/missions-screen';
import { RivalsScreen } from './screens/rivals-screen';
import { StaffScreen } from './screens/staff-screen';
import { DeadlineScreen } from './screens/deadline-screen';
import { HuntsScreen } from './screens/hunts-screen';
import { MatchDayScreen } from './screens/matchday-screen';
import { SeasonReviewModal } from './components/season-review';
import { GlobalSearch } from './components/global-search';
import { CareerEnd } from './components/career-end';
import { CountUp } from './components/ui';
import { Crest } from './visuals/crest';
import type { ScoutView } from '../engine/views';
import { formatUSD } from '../engine/core/money';
import { PlayerScreen } from './screens/player-screen';
import { GoalsScreen } from './screens/goals-screen';
import { AgencyScreen } from './screens/agency-screen';
import { StartScreen } from './screens/start-screen';
import { WorldScreen } from './screens/world-screen';
import { GazetteScreen } from './screens/gazette-screen';
import { SaveIndicator } from './components/save-indicator';
import { Badge, HUBS, HubTabs, hubBadge, hubOf, type Hub } from './components/hub-tabs';
import { useGame, type Route } from './store/game-store';

const NAV: { label: string; icon: string; screen: Route['screen']; hub?: Hub }[] = [
  { label: 'Home', icon: '⌂', screen: 'world' },
  { label: 'Inbox', icon: '✉', screen: 'inbox' },
  { label: HUBS.weekly.label, icon: HUBS.weekly.icon, screen: 'gazette', hub: HUBS.weekly },
  { label: 'Search', icon: '⌕', screen: 'search' },
  { label: 'Player Pool', icon: '☰', screen: 'pool' },
  { label: HUBS.work.label, icon: HUBS.work.icon, screen: 'deals', hub: HUBS.work },
  { label: 'Finances', icon: '$', screen: 'finances' },
  { label: HUBS.agency.label, icon: HUBS.agency.icon, screen: 'staff', hub: HUBS.agency },
  { label: HUBS.career.label, icon: HUBS.career.icon, screen: 'career', hub: HUBS.career },
];

export function App() {
  const { status, route } = useGame();
  const main = useRef<HTMLElement>(null);
  // Below the lg breakpoint the sidebar is a slide-in menu.
  const [navOpen, setNavOpen] = useState(false);
  // A new screen starts at the top, not wherever the last one was scrolled to, and closes the menu.
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
    setNavOpen(false);
  }, [routeKey(route)]);

  // Cmd/Ctrl+S saves; closing the tab with unsaved progress asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void useGame.getState().saveNow();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      const { status, save } = useGame.getState();
      if (status === 'ready' && (save.dirty || save.saving)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  return (
    <div className="app-atmosphere relative h-full">
      {status !== 'ready' ? (
        <StartScreen />
      ) : (
        <div className="relative z-10 grid h-full grid-cols-1 lg:grid-cols-[220px_1fr]">
          {/* Small screens: a dimmed backdrop behind the open menu. */}
          {navOpen && <div className="fixed inset-0 z-40 bg-night-950/70 backdrop-blur-sm lg:hidden" onClick={() => setNavOpen(false)} />}
          <div
            className={`fixed inset-y-0 left-0 z-50 w-[240px] transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <Sidebar onClose={() => setNavOpen(false)} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col">
            <TopBar onMenu={() => setNavOpen(true)} />
            <DebtBanner />
            <ScenarioBanner />
            <main ref={main} className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3 sm:px-6 sm:pt-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={routeKey(route)}
                  className="h-full"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Screen route={route} />
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
          <CareerGate />
          <TravelPlanner />
          <RecommendDialog />
          <HereWeGo />
          <ProdigyReveal />
          <SeasonReviewModal />
          <TrophyReveal />
          <CareerEnd />
        </div>
      )}
    </div>
  );
}

/** Breadcrumb label: the menu name, or "Hub · Tab" inside a hub. */
function crumb(screen: Route['screen']): string {
  const hub = hubOf(screen);
  const tab = hub?.tabs.find((t) => t.screen === screen);
  if (hub && tab) return tab.label === hub.label ? hub.label : `${hub.label} · ${tab.label}`;
  return NAV.find((n) => n.screen === screen)?.label ?? screen;
}

const routeKey = (r: Route) => ('id' in r ? `${r.screen}:${r.id}` : r.screen);

function Screen({ route }: { route: Route }): ReactNode {
  const hub = hubOf(route.screen);
  const screen = ScreenBody({ route });
  return hub ? (
    <HubTabs hub={hub} current={route.screen}>
      {screen}
    </HubTabs>
  ) : (
    screen
  );
}

function ScreenBody({ route }: { route: Route }): ReactNode {
  switch (route.screen) {
    case 'inbox':
      return <InboxScreen />;
    case 'news':
      return <NewsScreen />;
    case 'gazette':
      return <GazetteScreen />;
    case 'world':
      return <WorldScreen />;
    case 'country':
      return <CountryScreen key={`${route.id}:${route.leagueId ?? ''}`} id={route.id} leagueId={route.leagueId} />;
    case 'club':
      return <ClubScreen id={route.id} />;
    case 'search':
      return <SearchScreen searchId={route.searchId} />;
    case 'pool':
      return <PoolScreen />;
    case 'deals':
      return <DealsScreen />;
    case 'finances':
      return <FinancesScreen />;
    case 'career':
      return <CareerScreen />;
    case 'missions':
      return <MissionsScreen />;
    case 'rivals':
      return <RivalsScreen />;
    case 'staff':
      return <StaffScreen />;
    case 'player':
      return <PlayerScreen id={route.id} />;
    case 'deadline':
      return <DeadlineScreen />;
    case 'hunts':
      return <HuntsScreen />;
    case 'goals':
      return <GoalsScreen />;
    case 'agency':
      return <AgencyScreen />;
    case 'matchday':
      return <MatchDayScreen id={route.id} />;
  }
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const { route, navigate, world, saveNow, quitToMenu, save, scout } = useGame();
  return (
    <aside className="flex h-full flex-col overflow-y-auto border-r border-white/[0.05] bg-night-950/95 backdrop-blur-xl lg:bg-night-950/70">
      <div className="flex items-start px-5 pb-4 pt-5 lg:pb-6">
        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-bold uppercase leading-none tracking-tight">
            Football <span className="text-grass-400">Scout</span>
          </div>
          <div className="mt-1 truncate text-[11px] text-mist-400">{save.name ?? `World #${world?.seed}`}</div>
          {scout?.employer && (
            <button
              onClick={() => navigate({ screen: 'club', id: scout.employer!.club.id })}
              className="mt-2 flex w-full items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5 text-left hover:bg-white/[0.07]"
            >
              <Crest club={scout.employer.club} size={20} />
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-mist-100">{scout.employer.club.name}</span>
                <span className="block truncate text-[10px] text-mist-400">{scout.employer.title}</span>
              </span>
            </button>
          )}
        </div>
        <button className="btn-ghost h-8 w-8 p-0 lg:hidden" onClick={onClose} aria-label="Close menu">
          ✕
        </button>
      </div>
      <div className="px-3 pb-3 lg:hidden">
        <GlobalSearch />
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((n) => {
          const active =
            route.screen === n.screen ||
            (n.hub && n.hub.tabs.some((t) => t.screen === route.screen)) ||
            (n.screen === 'world' && ['country', 'club', 'player'].includes(route.screen));
          const badge = n.hub
            ? hubBadge(n.hub, scout)
            : n.screen === 'inbox' && scout?.unreadInbox
              ? { n: scout.unreadInbox > 99 ? '99+' : scout.unreadInbox, tone: 'gold' as const, title: 'New messages' }
              : undefined;
          return (
            <button
              key={n.label}
              onClick={() => navigate({ screen: n.screen } as Route)}
              className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${active ? 'bg-white/[0.06] text-mist-100' : 'text-mist-300 hover:bg-white/[0.04]'}`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-grass-400 shadow-[0_0_10px_var(--color-grass-400)]"
                />
              )}
              <span className="w-4 text-center opacity-80">{n.icon}</span>
              {n.label}
              {badge && <Badge b={badge} className="ml-auto" />}
            </button>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-white/[0.05] p-3">
        <SaveIndicator />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => void saveNow()} disabled={save.saving} className="btn-ghost px-2 text-xs" title="Save (⌘S)">
            Save
          </button>
          <button onClick={() => void quitToMenu()} disabled={save.saving} className="btn-ghost px-2 text-xs" title="Save and return to the main menu">
            Menu
          </button>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { route, history, back, navigate } = useGame();
  return (
    <header className="relative z-30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.05] bg-night-950/40 px-3 py-2 backdrop-blur-xl sm:px-6 sm:py-3">
      <button onClick={onMenu} className="btn-ghost h-8 w-8 p-0 text-lg lg:hidden" aria-label="Open menu">
        ☰
      </button>
      <button onClick={back} disabled={history.length === 0} className="btn-ghost h-8 w-8 p-0 text-lg" aria-label="Back">
        ‹
      </button>
      <nav className="hidden min-w-0 items-center gap-2 text-sm text-mist-400 sm:flex">
        <button onClick={() => navigate({ screen: 'world' })} className="hover:text-mist-100">
          Home
        </button>
        {route.screen !== 'world' && (
          <>
            <span>/</span>
            <span className="truncate capitalize text-mist-100">{crumb(route.screen)}</span>
          </>
        )}
      </nav>
      <div className="hidden w-40 shrink-0 lg:block 2xl:w-72">
        <GlobalSearch />
      </div>
      <div className="ml-auto">
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <div className="hidden md:block">
            <LocationChip />
          </div>
          <MoneyPill />
          <TimeControls />
        </div>
      </div>
    </header>
  );
}

/** Your bank balance, counting up/down as it changes, and who you work for. */
function MoneyPill() {
  const scout = useGame((s) => s.scout);
  const navigate = useGame((s) => s.navigate);
  if (!scout) return null;
  const low = scout.money < 1000;
  return (
    <div className="flex items-center gap-3">
      {scout.employer && <EmployerChip employer={scout.employer} onOpen={() => navigate({ screen: 'club', id: scout.employer!.club.id })} />}
      <div className="text-right">
        <div className={`num text-lg font-bold leading-none ${low ? 'text-alert-400' : 'text-grass-300'}`}>
          <CountUp value={scout.money} format={(n) => formatUSD(Math.round(n), { compact: false })} />
        </div>
        <div className="text-[10px] uppercase tracking-wider text-mist-400">{scout.employer ? 'Full-time' : scout.employmentLabel}</div>
      </div>
    </div>
  );
}

/** Your employer's crest, name and your title, one tap from its page. */
function EmployerChip({ employer, onOpen }: { employer: NonNullable<ScoutView['employer']>; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] py-1 pl-1.5 pr-2.5 text-left hover:border-white/25"
      title={`You work full-time for ${employer.club.name}`}
    >
      <Crest club={employer.club} size={26} />
      <span className="hidden min-w-0 sm:block">
        <span className="block max-w-[10rem] truncate text-[13px] font-semibold leading-tight text-mist-100">{employer.club.name}</span>
        <span className="block text-[10px] uppercase tracking-wider text-mist-400">{employer.title}</span>
      </span>
    </button>
  );
}

/** Worlds saved before careers existed: ask who the player is before continuing. */
function CareerGate() {
  const { scout, createCareer } = useGame();
  const [busy, setBusy] = useState(false);
  if (scout !== null) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-night-950/85 p-6 backdrop-blur-md">
      <div className="panel w-full max-w-3xl p-6">
        <div className="panel-title text-flood-400">This world has no scout yet</div>
        <h2 className="mb-5 font-display text-4xl font-bold uppercase leading-none">Set up your career</h2>
        <CareerSetup
          busy={busy}
          submitLabel="Start scouting"
          onSubmit={(setup) => {
            setBusy(true);
            void createCareer(setup).finally(() => setBusy(false));
          }}
        />
      </div>
    </div>
  );
}

/** Where you are, what it costs to stay, and the way home. */
function LocationChip() {
  const { scout, openTravel, advancing, trip, navigate, openRecommend } = useGame();
  const [open, setOpen] = useState(false);
  if (!scout) return null;
  const { location: loc } = scout;
  const here = trip && trip.cityId === loc.cityId ? trip : undefined;
  const resume = () => {
    setOpen(false);
    if (here?.recommend) openRecommend(here.recommend);
    else if (here?.route) navigate(here.route);
  };
  return (
    <div className="relative hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 xl:flex">
      <button className="flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} title="Where you are">
        <span className="text-grass-400">⌖</span>
        <span className="leading-tight">
          <span className="block text-xs font-semibold">
            {loc.cityName}, {loc.countryName}
          </span>
          <span className="block max-w-36 truncate text-[10px] text-mist-400">
            {here ? `For: ${here.label}` : loc.isHome ? 'Home' : `${formatUSD(loc.nightly)}/night`}
          </span>
        </span>
        <span className="text-[10px] text-mist-400">▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-night-900 shadow-2xl"
            >
              <div className="border-b border-white/[0.06] px-4 py-3">
                <div className="panel-title text-[10px]">You are in</div>
                <div className="font-semibold">
                  {loc.cityName}, {loc.countryName}
                </div>
                <div className="text-[11px] text-mist-400">{loc.isHome ? 'Your home city' : `Hotel ${formatUSD(loc.nightly)}/night`}</div>
              </div>
              {here && (
                <button
                  onClick={resume}
                  className="flex w-full items-center gap-2 border-b border-white/[0.06] bg-flood-500/[0.06] px-4 py-2.5 text-left text-sm hover:bg-flood-500/[0.12]"
                >
                  <span className="text-flood-300">↩</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] uppercase tracking-wider text-mist-400">Why you came</span>
                    <span className="block truncate text-flood-200">{here.label}</span>
                  </span>
                </button>
              )}
              <div className="px-4 pb-1 pt-2.5 text-[10px] uppercase tracking-wider text-mist-400">Clubs here ({loc.clubs.length})</div>
              <ul className="max-h-64 overflow-y-auto pb-2">
                {loc.clubs.map((c) => (
                  <li key={c.id}>
                    <button
                      className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-white/[0.05]"
                      onClick={() => {
                        setOpen(false);
                        navigate({ screen: 'club', id: c.id });
                      }}
                    >
                      <Crest club={c} size={18} /> <span className="truncate">{c.name}</span>
                    </button>
                  </li>
                ))}
                {!loc.clubs.length && <li className="px-4 py-1.5 text-sm text-mist-400">No professional clubs here.</li>}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {!loc.isHome && (
        <button
          className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-flood-300 hover:bg-white/[0.08]"
          disabled={advancing}
          onClick={() => openTravel(scout.homeCity.id)}
        >
          Go home
        </button>
      )}
    </div>
  );
}

/** Red strip while you're in debt, counting down to bankruptcy. */
function DebtBanner() {
  const { scout, navigate } = useGame();
  if (!scout?.debt || scout.careerOver) return null;
  const weeks = Math.ceil(scout.debt.daysLeft / 7);
  return (
    <div className="flex items-center gap-3 border-b border-alert-500/30 bg-alert-500/10 px-6 py-2 text-sm">
      <span className="h-2 w-2 animate-pulse rounded-full bg-alert-500" />
      <span className="text-alert-400">
        In debt ({formatUSD(scout.money)}). <b>{scout.debt.daysLeft} days</b> ({weeks} week{weeks === 1 ? '' : 's'}) to get back above $0, or your career is
        over.
      </span>
      <button className="ml-auto text-xs font-semibold text-alert-400 underline-offset-2 hover:underline" onClick={() => navigate({ screen: 'finances' })}>
        Finances
      </button>
    </div>
  );
}
