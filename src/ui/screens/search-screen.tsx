import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { CityId, ContinentId, CountryId, LeagueId, RegionId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import { ATTRIBUTES, ATTRIBUTE_LABEL, POSITIONS, type AttributeKey, type Position } from '../../engine/model/player';
import { VALUE_NO_MAX, type LocationScope, type SearchFilters } from '../../engine/model/scout';
import { RESULT_CAP } from '../../engine/systems/scouting';
import type { LocationTree, SearchEstimateView, SearchView } from '../../engine/views';
import { PlayerTable } from '../components/player-table';
import { Loading, Panel, PosBadge } from '../components/ui';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

/** Quick fills for the value range (min, max; undefined max = no limit). */
const VALUE_PRESETS: { label: string; min: number; max?: number }[] = [
  { label: '< $100k', min: 0, max: 100_000 },
  { label: '$100k–1M', min: 100_000, max: 1_000_000 },
  { label: '$1M–10M', min: 1_000_000, max: 10_000_000 },
  { label: '$10M+', min: 10_000_000 },
];

/** "250k", "$1.5m", "2,000,000" → USD; blank → undefined; junk → NaN. */
function parseMoney(text: string): number | undefined {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, '');
  if (!t) return undefined;
  const m = t.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!m) return NaN;
  const mult = m[2] === 'b' ? 1e9 : m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1;
  return Math.round(Number(m[1]) * mult);
}
const SCOPES: LocationScope['scope'][] = ['world', 'continent', 'country', 'region', 'city'];

export function SearchScreen({ searchId }: { searchId?: number }) {
  const scout = useGame((s) => s.scout);
  const tree = useEngineQuery(() => engine.getLocationTree(), []);
  const searches = useEngineQuery(() => engine.getSearches(), []);
  const [viewing, setViewing] = useState<number | undefined>(searchId);
  const result = useEngineQuery(() => (viewing !== undefined ? engine.getSearch(viewing) : Promise.resolve(null)), [viewing]);

  if (!tree || !scout) return <Loading label="Opening the database" />;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <div className="panel-title text-flood-400">Player database</div>
          <h1 className="font-display text-5xl font-bold uppercase leading-none">Search</h1>
        </div>
        <div className="text-right text-sm text-mist-400">
          Up to {RESULT_CAP} new players a search, straight into your <b className="text-mist-100">Player Pool</b>
          <div className="text-[11px]">Players already in your pool are left out.</div>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[460px_1fr]">
        <FilterBuilder tree={tree} homeCountry={scout.homeCountry.id} onResult={(r) => setViewing(r.id)} />
        <div className="flex min-w-0 flex-col gap-4">
          {result ? <ResultsPanel result={result} /> : <EmptyResults />}
          <Panel title="Previous searches">
            {!searches?.length ? (
              <div className="p-6 text-center text-sm text-mist-400">No searches yet.</div>
            ) : (
              <ul className="max-h-[260px] overflow-y-auto">
                {searches.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setViewing(s.id)}
                      className={`data-row flex w-full items-center gap-3 px-4 py-2 text-left ${viewing === s.id ? 'bg-white/[0.05]' : ''}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.label}</span>
                        <span className="block text-[11px] text-mist-400">
                          {formatDate(s.completedOn)} · {s.days} days · {s.matched} matches
                        </span>
                      </span>
                      <span className="num text-sm text-alert-400">−{formatUSD(s.cost)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="panel flex min-h-[260px] flex-col items-center justify-center gap-3 p-10 text-center">
      <Radar active={false} />
      <div className="max-w-sm text-sm text-mist-400">
        Narrow the area and filters, check the cost and time, then run the search. Ability filters are judged by your scouting network, so expect a few near
        misses.
      </div>
    </div>
  );
}

function ResultsPanel({ result }: { result: SearchView }) {
  return (
    <Panel
      title={result.label}
      right={
        <span className="text-[11px] text-mist-400">
          {result.matched > result.resultCount ? `Best ${result.resultCount} of ${result.matched} new matches` : `${result.matched} new matches`}
          {result.alreadyInPool > 0 && ` · ${result.alreadyInPool} already in your pool`}
        </span>
      }
    >
      {result.results.length ? (
        <PlayerTable rows={result.results} showClub askFor={result.forClub?.name} />
      ) : (
        <div className="p-8 text-center text-sm text-mist-400">Nobody matched. Try a wider area or looser filters.</div>
      )}
    </Panel>
  );
}

function FilterBuilder({ tree, homeCountry, onResult }: { tree: LocationTree; homeCountry: CountryId; onResult: (r: SearchView) => void }) {
  const { runSearch, advancing, scout, consumeSearchPrefill, navigate, setPoolAdded } = useGame();
  // Filters handed over from elsewhere (e.g. a mission brief): read once on mount, then cleared.
  const [prefill] = useState(() => useGame.getState().searchPrefill);
  useEffect(() => {
    consumeSearchPrefill();
  }, [consumeSearchPrefill]);
  const [scope, setScope] = useState<LocationScope['scope']>('country');
  const homeContinent = tree.continents.find((c) => c.countries.some((x) => x.id === homeCountry))!.id;
  const [continentId, setContinentId] = useState<ContinentId>(homeContinent);
  const [countryId, setCountryId] = useState<CountryId>(prefill?.countryId ?? homeCountry);
  const [regionId, setRegionId] = useState<string>('');
  const [cityId, setCityId] = useState<string>('');
  const [leagueId, setLeagueId] = useState<string>('');
  const [positions, setPositions] = useState<Position[]>(prefill?.positions ?? []);
  const [ageOn, setAgeOn] = useState(!!prefill?.age);
  // A brief's minimum rating arrives as the bottom of the range.
  const [ratingOn, setRatingOn] = useState(prefill?.minRating !== undefined);
  const [rating, setRating] = useState<[number, number]>([prefill?.minRating ?? 50, 99]);
  const [floors, setFloors] = useState(prefill?.ratingFloors);
  const [age, setAge] = useState<[number, number]>(prefill?.age ?? [17, 23]);
  // A brief's "fee up to" arrives as a max value.
  const [valueOn, setValueOn] = useState(!!prefill?.maxValue);
  const [valueMin, setValueMin] = useState<number>(0);
  const [valueMax, setValueMax] = useState<number | undefined>(prefill?.maxValue);
  const [wageOn, setWageOn] = useState(prefill?.maxWage !== undefined);
  const [wageMin, setWageMin] = useState<number>(0);
  const [wageMax, setWageMax] = useState<number | undefined>(prefill?.maxWage ?? 5_000);
  const [forClub, setForClub] = useState(prefill?.clubId ? { id: prefill.clubId, name: prefill.clubName ?? 'the club' } : undefined);
  const [attrs, setAttrs] = useState<{ attribute: AttributeKey; min: number; max?: number }[]>(prefill?.attributes?.map((a) => ({ ...a, max: 20 })) ?? []);
  const [freeAgents, setFreeAgents] = useState(true);
  const [estimate, setEstimate] = useState<SearchEstimateView>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState<string>();

  const continent = tree.continents.find((c) => c.id === continentId)!;
  const country = tree.continents.flatMap((c) => c.countries).find((c) => c.id === countryId)!;
  const region = country.regions.find((r) => r.id === regionId) ?? country.regions[0]!;

  const filters: SearchFilters = useMemo(() => {
    const location: LocationScope =
      scope === 'world'
        ? { scope }
        : scope === 'continent'
          ? { scope, id: continentId }
          : scope === 'country'
            ? { scope, id: countryId }
            : scope === 'region'
              ? { scope, id: region.id as RegionId }
              : { scope, id: (cityId || region.cities[0]!.id) as CityId };
    return {
      location,
      leagueId: scope === 'country' && leagueId ? (leagueId as LeagueId) : undefined,
      positions,
      age: ageOn ? age : undefined,
      rating: ratingOn ? rating : undefined,
      ratingFloors: floors && Object.keys(floors).length ? floors : undefined,
      value: valueOn ? [valueMin, valueMax ?? VALUE_NO_MAX] : undefined,
      wage: wageOn ? [wageMin, wageMax ?? VALUE_NO_MAX] : undefined,
      attributes: attrs,
      includeFreeAgents: freeAgents,
      forClub: forClub?.id,
    };
  }, [
    forClub,
    scope,
    continentId,
    countryId,
    region,
    cityId,
    leagueId,
    positions,
    ageOn,
    age,
    ratingOn,
    floors,
    rating,
    valueOn,
    valueMin,
    valueMax,
    wageOn,
    wageMin,
    wageMax,
    attrs,
    freeAgents,
  ]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => engine.estimateSearch(filters).then((e) => alive && setEstimate(e)), 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [filters, scout?.money]);

  const togglePos = (p: Position) => setPositions((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : ps.length < 3 ? [...ps, p] : ps));

  const run = async () => {
    setError(undefined);
    setRunning(estimate ? `${estimate.days} days` : '');
    try {
      const [r] = await Promise.all([runSearch(filters), new Promise((res) => setTimeout(res, 1100))]);
      if (prefill?.returnTo === 'pool') {
        // Expanding a brief: the results join the pool, so show them there.
        setPoolAdded({ ids: r.results.map((p) => p.id), label: prefill.label ?? r.label });
        navigate({ screen: 'pool' });
      } else onResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The search failed.');
    } finally {
      setRunning(undefined);
    }
  };

  const select = 'w-full rounded-lg border border-white/10 bg-night-950/70 px-2.5 py-1.5 text-sm text-mist-100 outline-none focus:border-grass-400/60';

  return (
    <Panel title="Filters" className="relative overflow-hidden">
      <div className="flex flex-col gap-4 p-4">
        {forClub && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/[0.06] px-3 py-2 text-[12px]">
            <span className="min-w-0 flex-1 text-sky-200">
              For <b>{forClub.name}</b>: results show the wage each player would ask them.
            </span>
            <button className="text-[11px] text-mist-400 hover:text-mist-100" onClick={() => setForClub(undefined)} title="Search without a club in mind">
              ✕
            </button>
          </div>
        )}
        <Section label="Where">
          <div className="flex gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
            {SCOPES.map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`flex-1 rounded-md py-1 text-[11px] font-semibold capitalize ${scope === s ? 'bg-grass-500 text-night-950' : 'text-mist-300 hover:bg-white/[0.06]'}`}
              >
                {s}
              </button>
            ))}
          </div>
          {scope !== 'world' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {scope === 'continent' ? (
                <select className={`${select} col-span-2`} value={continentId} onChange={(e) => setContinentId(e.target.value as ContinentId)}>
                  {tree.continents.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className={`${select} ${scope === 'country' ? '' : ''}`}
                  value={countryId}
                  onChange={(e) => {
                    setCountryId(e.target.value as CountryId);
                    setRegionId('');
                    setCityId('');
                    setLeagueId('');
                  }}
                >
                  {tree.continents.map((c) => (
                    <optgroup key={c.id} label={c.name}>
                      {c.countries.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {scope === 'country' && (
                <select className={select} value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
                  <option value="">All leagues</option>
                  {country.leagues.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
              {(scope === 'region' || scope === 'city') && (
                <select
                  className={select}
                  value={region.id}
                  onChange={(e) => {
                    setRegionId(e.target.value);
                    setCityId('');
                  }}
                >
                  {country.regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
              {scope === 'city' && (
                <select className={`${select} col-span-2`} value={cityId || region.cities[0]!.id} onChange={(e) => setCityId(e.target.value)}>
                  {region.cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {scope === 'continent' && <div className="mt-1 text-[11px] text-mist-400">{continent.countries.length} countries</div>}
        </Section>

        <Section label={`Positions · ${positions.length}/3`}>
          <div className="flex flex-wrap gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => togglePos(p)}
                className={`rounded-md transition-opacity ${positions.includes(p) ? 'ring-2 ring-grass-400' : positions.length >= 3 ? 'opacity-30' : 'opacity-70 hover:opacity-100'}`}
              >
                <PosBadge pos={p} />
              </button>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Section label="Age">
            <label className="mb-1.5 flex items-center gap-2 text-xs text-mist-300">
              <input type="checkbox" checked={ageOn} onChange={(e) => setAgeOn(e.target.checked)} className="accent-grass-500" /> Limit age
            </label>
            <div className={`flex items-center gap-1.5 ${ageOn ? '' : 'pointer-events-none opacity-40'}`}>
              <NumInput label="minimum age" value={age[0]} min={15} max={age[1]} onChange={(v) => setAge([v, age[1]])} />
              <span className="text-mist-400">–</span>
              <NumInput label="maximum age" value={age[1]} min={age[0]} max={40} onChange={(v) => setAge([age[0], v])} />
            </div>
          </Section>
          <Section label="Market value">
            <label className="mb-1.5 flex items-center gap-2 text-xs text-mist-300">
              <input type="checkbox" checked={valueOn} onChange={(e) => setValueOn(e.target.checked)} className="accent-grass-500" /> Limit value
            </label>
            <div className={`flex items-center gap-1.5 ${valueOn ? '' : 'pointer-events-none opacity-40'}`}>
              <MoneyInput value={valueMin || undefined} placeholder="$0" onChange={(v) => setValueMin(v ?? 0)} label="Minimum market value" />
              <span className="text-mist-400">–</span>
              <MoneyInput value={valueMax} placeholder="No max" onChange={setValueMax} label="Maximum market value" />
            </div>
            {valueOn && valueMax !== undefined && valueMin > valueMax && (
              <div className="mt-1 text-[11px] text-alert-400">Minimum is above maximum: nobody will match.</div>
            )}
          </Section>
        </div>
        <div className="-mt-2 flex flex-wrap justify-end gap-1.5">
          {VALUE_PRESETS.map((v) => {
            const active = valueOn && valueMin === v.min && valueMax === v.max;
            return (
              <button
                key={v.label}
                className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${active ? 'border-grass-400/60 bg-grass-500/15 text-grass-200' : 'border-white/10 text-mist-300 hover:border-white/25'}`}
                onClick={() => {
                  setValueOn(true);
                  setValueMin(v.min);
                  setValueMax(v.max);
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Section label="Rating">
            {floors && Object.keys(floors).length > 0 && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1" title="Each candidate must beat the club's average at the position he would play">
                <span className="text-[11px] text-mist-400">Must beat:</span>
                {(Object.entries(floors) as [Position, number][]).map(([pos, n]) => (
                  <span key={pos} className="chip text-[11px] text-mist-100">
                    {pos} {n}+
                  </span>
                ))}
                <button className="text-[11px] text-mist-400 hover:text-alert-400" onClick={() => setFloors(undefined)} aria-label="Remove position bars">
                  ✕
                </button>
              </div>
            )}
            <label className="mb-1.5 flex items-center gap-2 text-xs text-mist-300" title="Your estimate at the searched position, as the results will show it">
              <input type="checkbox" checked={ratingOn} onChange={(e) => setRatingOn(e.target.checked)} className="accent-grass-500" /> Limit rating
            </label>
            <div className={`flex items-center gap-1.5 ${ratingOn ? '' : 'pointer-events-none opacity-40'}`}>
              <NumInput label="minimum rating" value={rating[0]} min={1} max={rating[1]} onChange={(v) => setRating([v, rating[1]])} />
              <span className="text-mist-400">–</span>
              <NumInput label="maximum rating" value={rating[1]} min={rating[0]} max={99} onChange={(v) => setRating([rating[0], v])} />
            </div>
          </Section>
          <Section label={forClub ? 'Wage they’d ask (per week)' : 'Wage (per week)'}>
            <label
              className="mb-1.5 flex items-center gap-2 text-xs text-mist-300"
              title={
                forClub
                  ? `What each player would ask ${forClub.name} a week (the Asks column)`
                  : 'What he earns now a week; free agents count at the wage they expect'
              }
            >
              <input type="checkbox" checked={wageOn} onChange={(e) => setWageOn(e.target.checked)} className="accent-grass-500" /> Limit wage
            </label>
            <div className={`flex items-center gap-1.5 ${wageOn ? '' : 'pointer-events-none opacity-40'}`}>
              <MoneyInput value={wageMin || undefined} placeholder="$0" onChange={(v) => setWageMin(v ?? 0)} label="Minimum weekly wage" />
              <span className="text-mist-400">–</span>
              <MoneyInput value={wageMax} placeholder="No max" onChange={setWageMax} label="Maximum weekly wage" />
            </div>
          </Section>
        </div>

        <Section label={`Ability filters · ${attrs.length}/4`}>
          <div className="flex flex-col gap-2">
            {attrs.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className={`${select} flex-1`}
                  value={a.attribute}
                  onChange={(e) => setAttrs(attrs.map((x, j) => (j === i ? { ...x, attribute: e.target.value as AttributeKey } : x)))}
                >
                  {ATTRIBUTES.map((k) => (
                    <option key={k} value={k}>
                      {ATTRIBUTE_LABEL[k]}
                    </option>
                  ))}
                </select>
                <div className="flex w-32 shrink-0 items-center gap-1" title="Judged by your network: expect a few near misses">
                  <NumInput
                    steppers={false}
                    label={`minimum ${ATTRIBUTE_LABEL[a.attribute]}`}
                    value={a.min}
                    min={1}
                    max={a.max ?? 20}
                    onChange={(v) => setAttrs(attrs.map((x, j) => (j === i ? { ...x, min: v } : x)))}
                  />
                  <span className="text-mist-400">–</span>
                  <NumInput
                    steppers={false}
                    label={`maximum ${ATTRIBUTE_LABEL[a.attribute]}`}
                    value={a.max ?? 20}
                    min={a.min}
                    max={20}
                    onChange={(v) => setAttrs(attrs.map((x, j) => (j === i ? { ...x, max: v } : x)))}
                  />
                </div>
                <button onClick={() => setAttrs(attrs.filter((_, j) => j !== i))} className="text-mist-400 hover:text-alert-400" aria-label="Remove filter">
                  ✕
                </button>
              </div>
            ))}
            {attrs.length < 4 && (
              <button
                onClick={() => setAttrs([...attrs, { attribute: 'pace', min: 13, max: 20 }])}
                className="self-start text-xs font-semibold text-grass-300 hover:text-grass-400"
              >
                + Add ability filter (expensive)
              </button>
            )}
          </div>
        </Section>

        <label className="flex items-center gap-2 text-xs text-mist-300">
          <input type="checkbox" checked={freeAgents} onChange={(e) => setFreeAgents(e.target.checked)} className="accent-grass-500" />
          Include free agents (found through their home country)
        </label>

        <div className="rounded-xl border border-white/[0.06] bg-night-950/60 p-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-mist-400">Cost</div>
              <div className={`num text-3xl font-bold leading-none ${estimate && !estimate.affordable ? 'text-alert-400' : 'text-mist-100'}`}>
                {estimate ? formatUSD(estimate.cost) : '–'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-mist-400">Time</div>
              <div className="num text-3xl font-bold leading-none">{estimate ? `${estimate.days}d` : '–'}</div>
            </div>
          </div>
          {estimate && (
            <ul className="mt-2 space-y-0.5 border-t border-white/5 pt-2">
              {estimate.factors.map((f) => (
                <li key={f.label} className="flex justify-between text-[11px] text-mist-400">
                  <span>{f.label}</span>
                  <span className="num">{f.effect}</span>
                </li>
              ))}
            </ul>
          )}
          {error && <div className="mt-2 text-xs text-alert-400">{error}</div>}
          <button onClick={() => void run()} disabled={advancing || !estimate?.affordable} className="btn-primary mt-3 w-full py-2.5">
            {estimate && !estimate.affordable ? `Not enough money (${formatUSD(scout?.money ?? 0)})` : 'Run search'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {running !== undefined && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-night-950/85 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Radar active />
            <div className="text-center">
              <div className="panel-title text-grass-300">Scouting</div>
              <div className="mt-1 text-sm text-mist-300">Your network is working the phones… {running}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="panel-title mb-1.5 text-[11px]">{label}</div>
    {children}
  </div>
);

/** A money step that suits the amount: $1k under $10k, $10k under $100k, and so on. */
function moneyStep(v: number): number {
  return v < 10_000 ? 1_000 : v < 100_000 ? 10_000 : v < 1_000_000 ? 50_000 : v < 10_000_000 ? 500_000 : 5_000_000;
}

const fieldClass = (bad: boolean) =>
  `num w-full min-w-0 rounded-lg border bg-night-950/70 px-2 py-1.5 text-center text-sm outline-none focus:border-grass-400/60 ${bad ? 'border-alert-500/60' : 'border-white/10'}`;

/** − / + buttons either side of a field. */
function Stepper({ onStep, label, children }: { onStep: (dir: 1 | -1) => void; label: string; children: ReactNode }) {
  const btn = 'h-8 w-7 shrink-0 rounded-md border border-white/10 text-mist-300 hover:border-white/25 hover:text-mist-100 active:bg-white/[0.06]';
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <button type="button" className={btn} onClick={() => onStep(-1)} aria-label={`Lower ${label}`}>
        −
      </button>
      {children}
      <button type="button" className={btn} onClick={() => onStep(1)} aria-label={`Raise ${label}`}>
        +
      </button>
    </div>
  );
}

/**
 * Money field: type 250k, 1.5m or a plain number. Tapping selects the whole amount so typing replaces it;
 * − / + (or the arrow keys) step by a sensible amount. Blank = no limit.
 */
function MoneyInput({
  value,
  placeholder,
  onChange,
  label,
}: {
  value?: number;
  placeholder: string;
  onChange: (v: number | undefined) => void;
  label: string;
}) {
  // Short and editable: "$41.8M" shows as "41.8m" while you type.
  const show = (v?: number) => (v === undefined ? '' : formatUSD(v));
  const edit = (v?: number) => show(v).replace('$', '').toLowerCase();
  const [text, setText] = useState(show(value));
  const [bad, setBad] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
  }, [value, focused]);
  const step = (dir: 1 | -1) => {
    const base = value ?? 0;
    const next = Math.max(0, base + dir * moneyStep(dir < 0 ? Math.max(0, base - 1) : base));
    setBad(false);
    onChange(next);
    if (focused) setText(edit(next));
  };
  return (
    <Stepper onStep={step} label={label}>
      <input
        aria-label={label}
        title="Type 250k, 1.5m or a number. Blank means no limit."
        inputMode="text"
        enterKeyHint="done"
        value={text}
        placeholder={placeholder}
        onFocus={(e) => {
          setFocused(true);
          setText(edit(value));
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseMoney(e.target.value);
          setBad(Number.isNaN(v));
          if (!Number.isNaN(v)) onChange(v);
        }}
        onBlur={() => {
          setFocused(false);
          const v = parseMoney(text);
          if (Number.isNaN(v)) {
            setBad(false);
            setText(show(value));
          } else setText(show(v));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            step(e.key === 'ArrowUp' ? 1 : -1);
          }
        }}
        className={fieldClass(bad)}
      />
    </Stepper>
  );
}

/** Whole-number field: you can clear it and type freely; it is kept within min–max when you leave it. */
function NumInput({
  value,
  min,
  max,
  onChange,
  label,
  steppers = true,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  /** − / + buttons (off where space is tight). */
  steppers?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const commit = () => {
    const n = parseInt(text, 10);
    const v = Number.isNaN(n) ? value : clamp(n);
    onChange(v);
    setText(String(v));
  };
  const input = (
    <input
      aria-label={label}
      inputMode="numeric"
      enterKeyHint="done"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const v = clamp(value + (e.key === 'ArrowUp' ? 1 : -1));
          onChange(v);
          setText(String(v));
        }
      }}
      className={fieldClass(false)}
    />
  );
  return steppers ? (
    <Stepper onStep={(dir) => onChange(clamp(value + dir))} label={label}>
      {input}
    </Stepper>
  ) : (
    input
  );
}

/** Radar sweep shown while searching (static when idle). */
function Radar({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative h-28 w-28">
      <div className="absolute inset-0 rounded-full border border-grass-400/30" />
      <div className="absolute inset-4 rounded-full border border-grass-400/20" />
      <div className="absolute inset-8 rounded-full border border-grass-400/15" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-grass-400/10" />
      <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-grass-400/10" />
      {active && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'conic-gradient(from 0deg, color-mix(in srgb, var(--color-grass-400) 45%, transparent), transparent 25%)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {[
        [30, 22],
        [70, 40],
        [44, 72],
        [64, 66],
      ].map(([x, y], i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-grass-300"
          style={{ left: `${x}%`, top: `${y}%` }}
          animate={active && !reduce ? { opacity: [0, 1, 0] } : { opacity: active ? 0.8 : 0.35 }}
          transition={active && !reduce ? { duration: 1.6, repeat: Infinity, delay: i * 0.4 } : {}}
        />
      ))}
    </div>
  );
}
