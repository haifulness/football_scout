import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { CountryId, LeagueId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import type { LeagueView } from '../../engine/views';
import { Crest } from '../visuals/crest';
import { WorldMap } from '../visuals/world-map';
import { FixtureRow, LeagueTable } from '../components/match';
import { Loading, OvrBadge, Panel, PosBadge, StatTile, StrengthPips, TierBadge } from '../components/ui';
import { useSize } from '../components/use-size';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

type View = 'table' | 'fixtures' | 'clubs';

export function CountryScreen({ id, leagueId }: { id: CountryId; leagueId?: LeagueId }) {
  const world = useGame((s) => s.world)!;
  const navigate = useGame((s) => s.navigate);
  const country = useEngineQuery(() => engine.getCountry(id), [id]);
  const freeAgents = useEngineQuery(() => engine.getFreeAgents(id), [id]);
  const [tab, setTab] = useState(0);
  // Opened on a league (e.g. from the global search): show its tab.
  useEffect(() => {
    const i = country?.leagues.findIndex((l) => l.id === leagueId) ?? -1;
    if (i >= 0) setTab(i);
  }, [country, leagueId]);
  const [view, setView] = useState<View>('table');
  const [mapRef, mapSize] = useSize<HTMLDivElement>();

  if (!country) return <Loading label="Opening the files" />;
  const league = country.leagues[tab]!;
  const cities = country.regions.flatMap((r) => r.cities);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <div className="panel-title text-flood-400">{country.continentName}</div>
        <h1 className="font-display text-5xl font-bold uppercase leading-none">{country.name}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-mist-300">
          <StrengthPips value={country.strength} /> Football strength {country.strength}/5
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Clubs" sub={`${country.leagueCount} leagues`}>
              {country.clubCount}
            </StatTile>
            <StatTile label="Players" sub={`${country.freeAgents} free agents`} accent="var(--color-sky-400)">
              {country.playerCount.toLocaleString('en-US')}
            </StatTile>
            <StatTile label="Wealth index" sub="Scales fees & wages" accent="var(--color-flood-400)">
              {country.wealthIndex.toFixed(2)}×
            </StatTile>
            <StatTile label="Cost index" sub="Travel & search costs" accent="var(--color-alert-400)">
              {country.costIndex.toFixed(2)}×
            </StatTile>
          </div>

          <Panel
            title={
              <span className="flex flex-wrap gap-1">
                {country.leagues.map((l, i) => (
                  <button
                    key={l.id}
                    onClick={() => setTab(i)}
                    className={`rounded-md px-2.5 py-1 font-display text-[13px] tracking-wider transition-colors ${tab === i ? 'bg-grass-500 text-night-950' : 'text-mist-300 hover:bg-white/[0.06]'}`}
                  >
                    {l.name}
                  </button>
                ))}
              </span>
            }
            right={
              <span className="flex gap-0.5 rounded-md bg-white/[0.04] p-0.5">
                {(['table', 'fixtures', 'clubs'] as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded px-2.5 py-1 text-[11px] font-semibold capitalize ${view === v ? 'bg-white/[0.1] text-mist-100' : 'text-mist-400 hover:text-mist-100'}`}
                  >
                    {v}
                  </button>
                ))}
              </span>
            }
          >
            {view === 'table' && (
              <>
                <LeagueTable
                  rows={league.table}
                  promotionSpots={league.promotionSpots}
                  hasPromotion={league.hasPromotion}
                  hasRelegation={league.hasRelegation}
                />
                <div className="flex gap-4 border-t border-white/5 px-4 py-2 text-[11px] text-mist-400">
                  <Legend color="var(--color-flood-400)" label="Champion" />
                  {league.hasPromotion && <Legend color="var(--color-good-400)" label="Promotion" />}
                  {league.hasRelegation && <Legend color="var(--color-alert-500)" label="Relegation" />}
                </div>
              </>
            )}
            {view === 'fixtures' && <RoundBrowser league={league} />}
            {view === 'clubs' && <ClubList league={league} onOpen={(cid) => navigate({ screen: 'club', id: cid })} />}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <div ref={mapRef} className="panel h-[340px] overflow-hidden">
            {mapSize.width > 0 && (
              <WorldMap
                world={world}
                width={mapSize.width}
                height={mapSize.height}
                focus={country.mapId}
                highlight={country.mapId}
                cities={cities}
                showCityLabels
              />
            )}
          </div>
          <Panel title="Free agents" right={<span className="text-[11px] text-mist-400">No fee · freelance only</span>}>
            <ul className="max-h-[300px] overflow-y-auto">
              {freeAgents?.slice(0, 40).map((p) => (
                <li key={p.id}>
                  <button onClick={() => navigate({ screen: 'player', id: p.id })} className="data-row flex w-full items-center gap-3 px-4 py-2 text-left">
                    <PosBadge pos={p.position} />
                    <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                    <span className="num text-sm text-mist-400">{p.age}</span>
                    <OvrBadge ovr={p.ovr} range={p.ovrRange} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Regions">
            <div className="space-y-3 p-4">
              {country.regions.map((r) => (
                <div key={r.name}>
                  <div className="text-xs font-semibold text-mist-300">{r.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.cities.map((c) => (
                      <span key={c.id} className={`chip ${c.clubs ? '' : 'opacity-50'}`}>
                        {c.name}
                        {c.clubs > 0 && <b className="text-grass-300">{c.clubs}</b>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="h-2.5 w-[3px] rounded-full" style={{ background: color }} />
    {label}
  </span>
);

function RoundBrowser({ league }: { league: LeagueView }) {
  const [round, setRound] = useState(league.currentRound);
  useEffect(() => setRound(league.currentRound), [league.id, league.currentRound]);
  const fixtures = useEngineQuery(() => engine.getRound(league.id, round), [league.id, round]);
  return (
    <div>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <button className="btn-ghost h-7 px-2 text-xs" disabled={round <= 1} onClick={() => setRound((r) => r - 1)}>
          ‹ Prev
        </button>
        <span className="num text-sm font-semibold">
          Round {round} <span className="text-mist-400">of {league.rounds}</span>
        </span>
        <button className="btn-ghost h-7 px-2 text-xs" disabled={round >= league.rounds} onClick={() => setRound((r) => r + 1)}>
          Next ›
        </button>
      </div>
      {fixtures ? fixtures.map((f) => <FixtureRow key={f.id} f={f} />) : <Loading />}
    </div>
  );
}

function ClubList({ league, onOpen }: { league: LeagueView; onOpen: (id: LeagueView['clubs'][number]['id']) => void }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wider text-mist-400">
          <th className="py-2 pl-4 font-medium">Club</th>
          <th className="font-medium">Tier</th>
          <th className="font-medium">Formation</th>
          <th className="text-right font-medium">Rep</th>
          <th className="text-right font-medium">XI</th>
          <th className="text-right font-medium">Squad value</th>
          <th className="pr-4 text-right font-medium">Budget</th>
        </tr>
      </thead>
      <tbody>
        {league.clubs.map((c, i) => (
          <motion.tr
            key={c.id}
            className="data-row"
            onClick={() => onOpen(c.id)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.015 }}
          >
            <td className="py-2 pl-4">
              <span className="flex items-center gap-2.5">
                <Crest club={c} size={22} />
                <span>
                  <span className="block font-semibold">{c.name}</span>
                  <span className="block text-[11px] text-mist-400">{c.cityName}</span>
                </span>
              </span>
            </td>
            <td>
              <TierBadge tier={c.tier} compact />
            </td>
            <td className="num text-mist-300">{c.formation}</td>
            <td className="num text-right text-mist-300">{c.reputation}</td>
            <td className="text-right">
              <OvrBadge ovr={c.xiOvr} size="sm" />
            </td>
            <td className="num text-right">{formatUSD(c.squadValue)}</td>
            <td className="num pr-4 text-right text-grass-300">{formatUSD(c.transferBudget)}</td>
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
}
