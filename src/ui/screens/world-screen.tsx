import { AnimatePresence, motion } from 'motion/react';
import { STRENGTH_FILL } from '../theme/color';
import { useMemo, useState, type ReactNode } from 'react';
import type { ContinentId } from '../../engine/core/ids';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { CountrySummary, HomeItem, HomeLink, HomeView } from '../../engine/views';
import { GettingStarted } from '../components/getting-started';
import { DilemmaCards } from '../components/dilemma-cards';
import { BoardAskCards } from '../components/board-ask-cards';
import { ConsultationCards } from '../components/consultation-cards';
import { Money, StatTile, StrengthPips } from '../components/ui';
import { useSize } from '../components/use-size';
import { Crest } from '../visuals/crest';
import { WorldMap } from '../visuals/world-map';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame, type Route } from '../store/game-store';

const toRoute = (l: HomeLink) => (l.id ? { screen: l.screen, id: l.id } : { screen: l.screen }) as Route;

const TONE = {
  urgent: { bar: 'bg-alert-500', text: 'text-alert-400', label: 'Urgent' },
  action: { bar: 'bg-flood-400', text: 'text-flood-300', label: 'Waiting on you' },
  info: { bar: 'bg-white/20', text: 'text-mist-400', label: '' },
} as const;

/** Home: what needs you, what's running, what's coming up, and the map. */
export function WorldScreen() {
  const home = useEngineQuery(() => engine.getHome(), []);
  const scout = useGame((s) => s.scout);
  const navigate = useGame((s) => s.navigate);
  const go = (l: HomeLink) => navigate(toRoute(l));

  return (
    <div className="flex flex-col gap-4">
      <GettingStarted />
      <BoardAskCards />
      <ConsultationCards />
      <DilemmaCards />
      {home && scout && <SeasonStrip home={home} money={scout.money} />}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ItemPanel
            title="Needs you"
            count={home?.needsYou.filter((i) => i.tone !== 'info').length}
            items={home?.needsYou}
            empty="Nothing needs you right now. Search for players, meet a coach, or move time on."
            onOpen={go}
          />
          <ItemPanel
            title="In progress"
            items={home?.inProgress}
            empty="Nothing running. Deals, briefs, hunts and assistants' trips show up here."
            onOpen={go}
            timeline
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <MapPanel />
          {home && <Upcoming home={home} onOpen={go} />}
        </div>
      </div>
    </div>
  );
}

function SeasonStrip({ home, money }: { home: HomeView; money: number }) {
  const navigate = useGame((st) => st.navigate);
  const scout = useGame((st) => st.scout);
  const s = home.season;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <LinkTile onClick={() => navigate({ screen: 'finances' })} hint="Open Finances">
        <StatTile label="Money" sub={`${s.label}: +${formatUSD(s.earned)} in · −${formatUSD(s.spent)} out`} accent="var(--color-good-400)">
          <Money value={money} animated />
        </StatTile>
      </LinkTile>
      <LinkTile onClick={() => navigate({ screen: 'rivals' })} hint="See how you rank against the other scouts">
        <StatTile
          label="Reputation"
          sub={
            scout?.nextUnlock ? `#${s.rank} of ${s.scouts} · ${scout.nextUnlock.label} at ${scout.nextUnlock.reputation}` : `#${s.rank} of ${s.scouts} scouts`
          }
          accent="var(--color-flood-400)"
        >
          {s.reputation}
          <span className="text-sm text-mist-400">/100</span>
        </StatTile>
      </LinkTile>
      {s.work.mode === 'freelance' ? (
        <LinkTile onClick={() => navigate({ screen: 'career' })} hint="Your clients and job offers">
          <StatTile label="Clients" sub="Freelance" accent="var(--color-sky-400)">
            {s.work.clients}
            <span className="text-sm text-mist-400">/{s.work.slots}</span>
          </StatTile>
        </LinkTile>
      ) : (
        <LinkTile onClick={() => s.work.mode === 'fulltime' && navigate({ screen: 'club', id: s.work.club.id })} hint="Open your employer's page">
          <StatTile label="Employer" sub="Full-time" accent="var(--color-sky-400)">
            <span className="flex items-center gap-2 text-lg">
              <Crest club={s.work.club} size={22} />
              <span className="truncate">{s.work.club.shortName}</span>
            </span>
          </StatTile>
        </LinkTile>
      )}
      <LinkTile onClick={() => navigate({ screen: 'deals' })} hint="Your deals and signings">
        <StatTile label="Signings this season" sub={s.goals.total ? `Season goals ${s.goals.done}/${s.goals.total}` : undefined} accent="#a78bfa">
          {s.placements}
        </StatTile>
      </LinkTile>
      <LinkTile onClick={() => navigate({ screen: 'pool' })} hint="Open your player pool">
        <StatTile label="Player pool" sub="Players you're tracking" accent="var(--color-mist-300)">
          {s.poolSize}
        </StatTile>
      </LinkTile>
    </div>
  );
}

/** A stat tile you can tap to open the screen behind it. */
function LinkTile({ onClick, hint, children }: { onClick: () => void; hint: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className="group relative block rounded-xl text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-grass-400 [&>.panel]:transition-colors [&>.panel]:group-hover:border-white/20"
    >
      {children}
      <span className="pointer-events-none absolute right-3 top-2.5 text-mist-400 opacity-0 transition-opacity group-hover:opacity-100">›</span>
    </button>
  );
}

function ItemPanel({
  title,
  count,
  items,
  empty,
  onOpen,
  timeline,
}: {
  title: string;
  count?: number;
  items?: HomeItem[];
  empty: string;
  onOpen: (l: HomeLink) => void;
  timeline?: boolean;
}) {
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
        <h3 className="panel-title">{title}</h3>
        {!!count && <span className="num rounded-full bg-flood-500 px-1.5 text-[10px] font-bold text-night-950">{count}</span>}
      </header>
      {!items ? (
        <div className="px-4 py-6 text-sm text-mist-400">…</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-mist-400">{empty}</div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {items.map((i, n) => (
            <motion.li key={i.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(n * 0.03, 0.3) }}>
              <button onClick={() => onOpen(i.link)} className="data-row relative flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left">
                <span className={`absolute inset-y-2 left-0 w-[3px] rounded-full ${TONE[i.tone].bar}`} />
                {i.club ? (
                  <Crest club={i.club} size={26} />
                ) : (
                  <span className="flex h-[26px] w-[26px] items-center justify-center text-mist-400">{ICON[i.kind]}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-mist-100">{i.title}</span>
                  <span className="block truncate text-[11px] text-mist-400">{i.detail}</span>
                  {timeline && i.progress !== undefined && (
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <span
                        className={`block h-full rounded-full ${i.tone === 'urgent' ? 'bg-alert-500' : 'bg-grass-400'}`}
                        style={{ width: `${Math.max(4, i.progress * 100)}%` }}
                      />
                    </span>
                  )}
                </span>
                {i.daysLeft !== undefined && (
                  <span className={`num shrink-0 text-right text-[12px] ${i.tone === 'urgent' ? 'text-alert-400' : 'text-mist-300'}`} title="Days left">
                    {i.daysLeft === 0 ? 'today' : `${i.daysLeft}d`}
                  </span>
                )}
                <span className="shrink-0 text-mist-400">›</span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ICON: Record<HomeItem['kind'], string> = {
  deal: '⇄',
  mission: '◎',
  hunt: '✧',
  assistant: '☺',
  offer: '★',
  mandate: '$',
  inbox: '✉',
  rival: '👁',
  debt: '!',
  clients: '+',
  report: '✎',
  coach: '☺',
  event: '⚑',
  dilemma: '⚖',
  settling: '⌂',
};

function Upcoming({ home, onOpen }: { home: HomeView; onOpen: (l: HomeLink) => void }) {
  if (!home.upcoming.length) return null;
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
        <h3 className="panel-title">Coming up</h3>
        <button className="text-[11px] font-semibold text-mist-300 hover:text-grass-300" onClick={() => onOpen({ screen: 'calendar' })}>
          Full calendar ›
        </button>
      </header>
      <ul className="divide-y divide-white/[0.04]">
        {home.upcoming.map((u) => (
          <li key={u.key}>
            <button
              disabled={!u.link}
              onClick={() => u.link && onOpen(u.link)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left enabled:hover:bg-white/[0.03] disabled:cursor-default"
            >
              <span className="num w-14 shrink-0 text-[12px] font-semibold text-grass-300">{u.daysAway === 0 ? 'Today' : `in ${u.daysAway}d`}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-mist-200">{u.label}</span>
              <span className="shrink-0 text-[11px] text-mist-400">{formatDate(u.date)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The scouting map, with a list of countries one tap away. */
function MapPanel() {
  const world = useGame((s) => s.world)!;
  const navigate = useGame((s) => s.navigate);
  const scout = useGame((s) => s.scout);
  const [hover, setHover] = useState<CountrySummary>();
  const [view, setView] = useState<'map' | 'list'>('map');
  const [continent, setContinent] = useState<ContinentId | 'all'>('all');
  const [mapRef, mapSize] = useSize<HTMLDivElement>();
  const list = useMemo(
    () =>
      world.countries
        .filter((c) => continent === 'all' || c.continentId === continent)
        .sort((a, b) => b.strength - a.strength || b.wealthIndex - a.wealthIndex),
    [world, continent],
  );
  const open = (c: CountrySummary) => navigate({ screen: 'country', id: c.id });

  return (
    <section className="panel relative flex h-[380px] flex-col overflow-hidden">
      <header className="relative z-10 flex items-center gap-2 border-b border-white/[0.05] px-4 py-2">
        <h3 className="panel-title">Scouting map</h3>
        <div className="ml-auto flex rounded-md bg-white/[0.04] p-0.5 text-[11px] font-semibold">
          {(['map', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-2 py-0.5 capitalize ${view === v ? 'bg-white/10 text-mist-100' : 'text-mist-400 hover:text-mist-100'}`}
            >
              {v === 'map' ? 'Map' : 'Countries'}
            </button>
          ))}
        </div>
      </header>
      {view === 'map' ? (
        <div className="relative min-h-0 flex-1">
          <div ref={mapRef} className="absolute inset-0">
            {mapSize.width > 0 && (
              <WorldMap world={world} width={mapSize.width} height={mapSize.height} onSelect={open} onHover={setHover} you={scout?.location} />
            )}
          </div>
          <div className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-2 text-[11px] text-mist-400">
            Football strength
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s} className="h-2 w-4 rounded-sm" style={{ background: STRENGTH_FILL[s] }} />
            ))}
          </div>
          <AnimatePresence>
            {hover && (
              <motion.div
                key={hover.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="panel pointer-events-none absolute right-3 top-3 w-60 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-xl font-bold uppercase">{hover.name}</span>
                  <StrengthPips value={hover.strength} />
                </div>
                <div className="mt-1 text-[11px] text-mist-400">
                  {hover.leagueCount} leagues · {hover.clubCount} clubs · wealth {hover.wealthIndex.toFixed(2)}×
                </div>
                {hover.topClub && (
                  <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
                    <Crest club={hover.topClub} size={20} />
                    <span className="text-xs text-mist-300">
                      Biggest club: <b className="text-mist-100">{hover.topClub.name}</b>
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap gap-1.5 border-b border-white/5 p-2.5">
            {(['all', ...world.continents.map((c) => c.id)] as const).map((id) => (
              <button
                key={id}
                onClick={() => setContinent(id)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${continent === id ? 'bg-grass-500 text-night-950' : 'bg-white/[0.04] text-mist-300 hover:bg-white/[0.08]'}`}
              >
                {id === 'all' ? 'All' : world.continents.find((c) => c.id === id)!.name.replace(' & Central', '')}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <button onClick={() => open(c)} className="data-row flex w-full items-center gap-3 px-4 py-2 text-left">
                  {c.topClub ? <Crest club={c.topClub} size={20} /> : <span className="w-5" />}
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{c.name}</span>
                    <span className="block text-[11px] text-mist-400">
                      {c.leagueCount} leagues · {c.clubCount} clubs
                    </span>
                  </span>
                  <StrengthPips value={c.strength} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
