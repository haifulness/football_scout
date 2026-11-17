import { GettingStarted } from '../components/getting-started';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { ContinentId } from '../../engine/core/ids';
import type { CountrySummary } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { WorldMap } from '../visuals/world-map';
import { CountUp, StatTile, StrengthPips } from '../components/ui';
import { useSize } from '../components/use-size';
import { useGame } from '../store/game-store';

export function WorldScreen() {
  const world = useGame((s) => s.world)!;
  const navigate = useGame((s) => s.navigate);
  const scout = useGame((s) => s.scout);
  const [hover, setHover] = useState<CountrySummary>();
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
    <div className="flex h-full flex-col gap-4">
      <GettingStarted />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Countries" sub="Across 6 continents">
          <CountUp value={world.countries.length} />
        </StatTile>
        <StatTile label="Leagues" sub="Full pyramids" accent="#38bdf8">
          <CountUp value={world.totals.leagues} />
        </StatTile>
        <StatTile label="Clubs" sub="Each with a Head Coach" accent="#ffc933">
          <CountUp value={world.totals.clubs} />
        </StatTile>
        <StatTile label="Players" sub={`${world.totals.freeAgents.toLocaleString('en-US')} free agents`} accent="#f87171">
          <CountUp value={world.totals.players} />
        </StatTile>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <section className="panel relative min-h-[420px] overflow-hidden">
          <div ref={mapRef} className="absolute inset-0">
            {mapSize.width > 0 && (
              <WorldMap world={world} width={mapSize.width} height={mapSize.height} onSelect={open} onHover={setHover} you={scout?.location} />
            )}
          </div>
          <div className="pointer-events-none absolute left-4 top-3 flex items-center gap-3">
            <span className="panel-title">Scouting map</span>
            <span className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-flood-400" /> elite club city
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-2 text-[11px] text-mist-400">
            Football strength
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s} className="h-2 w-5 rounded-sm" style={{ background: ['#1d4d3a', '#1f6a45', '#21874f', '#27a75c', '#2fcf73'][s - 1] }} />
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
                className="panel pointer-events-none absolute right-4 top-4 w-64 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl font-bold uppercase">{hover.name}</span>
                  <StrengthPips value={hover.strength} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Leagues" value={hover.leagueCount} />
                  <Mini label="Clubs" value={hover.clubCount} />
                  <Mini label="Wealth" value={`${hover.wealthIndex.toFixed(2)}×`} />
                </div>
                {hover.topClub && (
                  <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                    <Crest club={hover.topClub} size={22} />
                    <span className="text-xs text-mist-300">
                      Biggest club: <b className="text-mist-100">{hover.topClub.name}</b>
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="panel flex min-h-0 flex-col">
          <div className="flex flex-wrap gap-1.5 border-b border-white/5 p-3">
            {(['all', ...world.continents.map((c) => c.id)] as const).map((id) => (
              <button
                key={id}
                onClick={() => setContinent(id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${continent === id ? 'bg-grass-500 text-night-950' : 'bg-white/[0.04] text-mist-300 hover:bg-white/[0.08]'}`}
              >
                {id === 'all' ? 'All' : world.continents.find((c) => c.id === id)!.name.replace(' & Central', '')}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {list.map((c, i) => (
              <motion.li key={c.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.015, 0.4) }}>
                <button
                  onClick={() => open(c)}
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover(undefined)}
                  className="data-row flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  {c.topClub ? <Crest club={c.topClub} size={22} /> : <span className="w-[22px]" />}
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{c.name}</span>
                    <span className="block text-[11px] text-mist-400">
                      {c.leagueCount} leagues · {c.clubCount} clubs
                    </span>
                  </span>
                  <StrengthPips value={c.strength} />
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const Mini = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-md bg-white/[0.03] py-1.5">
    <div className="num text-lg font-bold leading-none">{value}</div>
    <div className="mt-1 text-[10px] uppercase tracking-wider text-mist-400">{label}</div>
  </div>
);
