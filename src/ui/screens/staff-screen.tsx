import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { CityId, CountryId, RegionId } from '../../engine/core/ids';
import { formatUSD, usd } from '../../engine/core/money';
import type { AssistantBrief } from '../../engine/model/assistant';
import { POSITIONS, type Position } from '../../engine/model/player';
import type { AssistantCandidateView, AssistantView, TaskEstimateView } from '../../engine/views';
import { Loading, Panel, PosBadge, useCultureLookup } from '../components/ui';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

const VALUE_CAPS: { label: string; value?: number }[] = [
  { label: 'Any value' },
  { label: 'Up to $100k', value: 100_000 },
  { label: 'Up to $500k', value: 500_000 },
  { label: 'Up to $2M', value: 2_000_000 },
  { label: 'Up to $10M', value: 10_000_000 },
];
const control = 'w-full rounded-lg border border-white/10 bg-night-950/70 px-2.5 py-1.5 text-sm text-mist-100 outline-none focus:border-grass-400/60';

export function StaffScreen() {
  const staff = useEngineQuery(() => engine.getStaff(), []);
  if (!staff) return <Loading label="Calling your staff" />;
  const full = staff.assistants.length >= staff.limit;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end gap-6">
        <div className="min-w-0 flex-1">
          <div className="panel-title text-grass-400">
            {staff.assistants.length}/{staff.limit} assistants · {formatUSD(staff.weeklyCost)} a week
          </div>
          <h1 className="font-display text-5xl font-bold uppercase leading-none">Staff</h1>
          <p className="mt-2 max-w-2xl text-sm text-mist-400">
            Assistant scouts scan an area for you and add players to your pool with their own rating. Their eye isn't yours: weaker assistants overrate and
            underrate, so check before you pitch. They are paid every Monday, plus expenses while on a task, and they improve with time in the field. Your
            reputation decides how good a scout will work for you, and how many you can employ (with an agency, its offices decide that). Staff placed at an agency office broker deals there instead.
          </p>
        </div>
      </header>

      <Panel title="Your assistants">
        {staff.assistants.length ? (
          <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-2">
            {staff.assistants.map((a, i) => (
              <AssistantCard key={a.id} a={a} i={i} maxWeeks={staff.maxWeeks} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-mist-400">No staff yet. Hire someone from the list below.</div>
        )}
      </Panel>

      <Panel title="Looking for work" right={<span className="text-[11px] text-mist-400">Refreshes monthly · best available: skill {staff.ceiling}</span>}>
        <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
          {staff.market.map((c, i) => (
            <CandidateCard key={c.id} c={c} i={i} full={full} />
          ))}
          {!staff.market.length && <div className="text-sm text-mist-400">Nobody right now. Check again next month.</div>}
        </div>
      </Panel>
    </div>
  );
}

function SkillBar({ skill, xp, xpToLevel }: { skill: number; xp?: number; xpToLevel?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-grass-400"
          initial={{ width: 0 }}
          animate={{ width: `${(skill / 20) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <span className="num text-[12px] font-semibold">{skill}</span>
      {xp !== undefined && xpToLevel && (
        <span className="text-[10px] text-mist-400" title="Weeks in the field toward his next level">
          {xp}/{xpToLevel} wks
        </span>
      )}
    </div>
  );
}

function useAct() {
  const careerAction = useGame((s) => s.careerAction);
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<unknown>) => {
    setError(undefined);
    return careerAction(fn).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  };
  return { act, error };
}

function CandidateCard({ c, i, full }: { c: AssistantCandidateView; i: number; full: boolean }) {
  const cultureOf = useCultureLookup();
  const { act, error } = useAct();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04 }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
    >
      <div className="flex items-center gap-3">
        <Portrait seed={c.portraitSeed} culture={cultureOf(c.nationalityId)} size={40} age={c.age} className="rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{c.name}</div>
          <div className="text-[11px] text-mist-400">
            {c.age} · knows {c.speciality.name}
          </div>
        </div>
        <div className="text-right">
          <div className="num text-sm font-bold">{formatUSD(c.wage)}</div>
          <div className="text-[10px] text-mist-400">per week</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <SkillBar skill={c.skill} />
        <button className="btn-primary px-3 py-1 text-xs disabled:opacity-40" disabled={full} onClick={() => void act(() => engine.hireAssistant(c.id))}>
          {full ? 'Staff full' : 'Hire'}
        </button>
      </div>
      {error && <div className="mt-1 text-[11px] text-alert-400">{error}</div>}
    </motion.div>
  );
}

function AssistantCard({ a, i, maxWeeks }: { a: AssistantView; i: number; maxWeeks: number }) {
  const cultureOf = useCultureLookup();
  const { act, error } = useAct();
  const [assigning, setAssigning] = useState(false);
  const [confirmFire, setConfirmFire] = useState(false);
  const t = a.task;
  const elapsed = t ? 1 - t.daysLeft / (t.weeks * 7) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
      className={`rounded-xl border p-4 ${t ? 'border-grass-400/25 bg-grass-500/[0.04]' : 'border-flood-400/25 bg-flood-500/[0.04]'}`}
    >
      <div className="flex items-start gap-3">
        <Portrait seed={a.portraitSeed} culture={cultureOf(a.nationalityId)} size={52} age={a.age} className="rounded-lg ring-1 ring-white/10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{a.name}</span>
            <span className="text-[11px] text-mist-400">{a.age}</span>
          </div>
          <div className="text-[11px] text-mist-400">
            Knows {a.speciality.name} · {formatUSD(a.wage)}/wk · {a.reports} reports
          </div>
          <div className="mt-1">
            <SkillBar skill={a.skill} xp={a.xp} xpToLevel={a.xpToLevel} />
          </div>
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${a.office || a.job ? 'bg-violet-500/15 text-violet-300' : t ? 'bg-grass-500/15 text-grass-300' : 'bg-flood-500/15 text-flood-300'}`}
        >
          {a.office ? `Office · ${a.office.label}` : a.job ? 'On a brief' : t ? 'On task' : 'Idle'}
        </span>
      </div>

      {t && !assigning && (
        <div className="mt-3 rounded-lg bg-black/20 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{t.area}</span>
            {t.local && <span className="chip border-grass-400/40 text-grass-300">Home market</span>}
            {t.positions.length ? t.positions.map((p) => <PosBadge key={p} pos={p} />) : <span className="text-[12px] text-mist-400">any position</span>}
            {t.age && (
              <span className="text-[12px] text-mist-400">
                age {t.age[0]}–{t.age[1]}
              </span>
            )}
            {t.maxValue && <span className="text-[12px] text-mist-400">≤ {formatUSD(t.maxValue)}</span>}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-mist-400">
            <span>
              {t.found} found · {formatUSD(t.weeklyExpenses)}/wk expenses
            </span>
            <span>Back {formatDate(t.endsOn)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-grass-400" style={{ width: `${elapsed * 100}%` }} />
          </div>
        </div>
      )}

      {a.job && (
        <div className="mt-3 rounded-lg bg-black/20 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Crest club={a.job.club} size={20} />
            <span className="font-semibold">{a.job.club.name}</span>
            <PosBadge pos={a.job.position} />
            <span className="text-[12px] text-mist-400">{a.job.kind === 'sale' ? `selling ${a.job.player}` : 'brief'}</span>
          </div>
          <div className="mt-1.5 text-[12px] text-mist-300">
            {a.job.kind === 'sale'
              ? a.job.current
                ? `${a.job.current.club} are ${a.job.current.stage === 'agreed' ? 'agreed, waiting for the window' : 'in negotiations'}.`
                : `Offered to ${a.job.pitched} of ${a.job.maxPitches} clubs so far.`
              : a.job.current
                ? `His pick ${a.job.current.player} is ${a.job.current.stage === 'agreed' ? 'agreed, waiting for the window' : 'in negotiations'}.`
                : `${a.job.pitched} of ${a.job.maxPitches} names put forward so far.`}{' '}
            <span className="text-mist-400">{formatUSD(a.job.weeklyExpenses)}/wk expenses</span>
          </div>
        </div>
      )}

      <AnimatePresence>{assigning && <TaskForm a={a} maxWeeks={maxWeeks} onDone={() => setAssigning(false)} />}</AnimatePresence>

      {!assigning && (
        <div className="mt-3 flex flex-wrap gap-2">
          {a.office ? (
            <button className="btn-ghost flex-1 text-xs" onClick={() => void act(() => engine.placeAssistant(a.id, null))}>
              Back to field work
            </button>
          ) : a.job ? (
            <button className="btn-ghost flex-1 text-xs" onClick={() => void act(() => engine.recallJob(a.id))}>
              {a.job.kind === 'sale' ? 'Take the sale back' : 'Take the brief back'}
            </button>
          ) : (
            <button className="btn-primary flex-1 text-xs" onClick={() => setAssigning(true)}>
              {t ? 'New task' : 'Assign a task'}
            </button>
          )}
          {t && (
            <button className="btn-ghost text-xs" onClick={() => void act(() => engine.recallAssistant(a.id))}>
              Recall
            </button>
          )}
          {confirmFire ? (
            <>
              <button className="btn-ghost border-alert-500/40 text-xs text-alert-400" onClick={() => void act(() => engine.fireAssistant(a.id))}>
                Confirm: pay {formatUSD(a.wage)} notice
              </button>
              <button className="btn-ghost text-xs" onClick={() => setConfirmFire(false)}>
                Keep him
              </button>
            </>
          ) : (
            <button className="btn-ghost text-xs text-mist-400" onClick={() => setConfirmFire(true)}>
              Let go
            </button>
          )}
        </div>
      )}
      {error && <div className="mt-2 text-[12px] text-alert-400">{error}</div>}
    </motion.div>
  );
}

function TaskForm({ a, maxWeeks, onDone }: { a: AssistantView; maxWeeks: number; onDone: () => void }) {
  const tree = useEngineQuery(() => engine.getLocationTree(), []);
  const { act, error } = useAct();
  const [scope, setScope] = useState<'country' | 'region' | 'city'>('country');
  const [countryId, setCountryId] = useState<CountryId>(a.speciality.id);
  const [regionId, setRegionId] = useState<string>('');
  const [cityId, setCityId] = useState<string>('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [ageOn, setAgeOn] = useState(false);
  const [age, setAge] = useState<[number, number]>([17, 23]);
  const [valueIdx, setValueIdx] = useState(0);
  const [weeks, setWeeks] = useState(4);
  const [estimate, setEstimate] = useState<TaskEstimateView>();

  const country = tree?.continents.flatMap((c) => c.countries).find((c) => c.id === countryId);
  const region = country?.regions.find((r) => r.id === regionId) ?? country?.regions[0];
  const city = region?.cities.find((c) => c.id === cityId) ?? region?.cities[0];
  const brief: AssistantBrief | undefined =
    country && region && city
      ? {
          location:
            scope === 'country' ? { scope, id: countryId } : scope === 'region' ? { scope, id: region.id as RegionId } : { scope, id: city.id as CityId },
          positions,
          age: ageOn ? age : undefined,
          maxValue: VALUE_CAPS[valueIdx]!.value !== undefined ? usd(VALUE_CAPS[valueIdx]!.value!) : undefined,
        }
      : undefined;
  const key = JSON.stringify([brief, weeks]);
  useEffect(() => {
    if (!brief) return;
    let alive = true;
    const timer = setTimeout(() => engine.estimateTask(a.id, brief, weeks).then((e) => alive && setEstimate(e)), 150);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, a.id]);

  const togglePos = (p: Position) => setPositions((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : ps.length < 3 ? [...ps, p] : ps));
  if (!tree || !country) return <div className="mt-3 text-sm text-mist-400">Loading map…</div>;

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
      <div className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-black/20 p-3">
        <div className="flex gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
          {(['country', 'region', 'city'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`flex-1 rounded-md py-1 text-[11px] font-semibold capitalize ${scope === s ? 'bg-grass-500 text-night-950' : 'text-mist-300 hover:bg-white/[0.06]'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            className={control}
            value={countryId}
            onChange={(e) => {
              setCountryId(e.target.value as CountryId);
              setRegionId('');
              setCityId('');
            }}
            aria-label="Country"
          >
            {tree.continents.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.countries.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.id === a.speciality.id ? ' (his market)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {scope !== 'country' && (
            <select
              className={control}
              value={region?.id}
              onChange={(e) => {
                setRegionId(e.target.value);
                setCityId('');
              }}
              aria-label="Region"
            >
              {country.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          {scope === 'city' && region && (
            <select className={control} value={city?.id} onChange={(e) => setCityId(e.target.value)} aria-label="City">
              {region.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-mist-400">Positions · {positions.length}/3 (none = any)</div>
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
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] text-mist-300">
              <input type="checkbox" checked={ageOn} onChange={(e) => setAgeOn(e.target.checked)} className="accent-grass-500" /> Limit age
            </label>
            <div className={`flex items-center gap-1 ${ageOn ? '' : 'pointer-events-none opacity-40'}`}>
              <input
                type="number"
                className={`${control} text-center`}
                value={age[0]}
                min={15}
                max={age[1]}
                onChange={(e) => setAge([Math.min(Number(e.target.value) || 15, age[1]), age[1]])}
                aria-label="Minimum age"
              />
              <span className="text-mist-400">–</span>
              <input
                type="number"
                className={`${control} text-center`}
                value={age[1]}
                min={age[0]}
                max={40}
                onChange={(e) => setAge([age[0], Math.max(Number(e.target.value) || 40, age[0])])}
                aria-label="Maximum age"
              />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-mist-300">Market value</div>
            <select className={control} value={valueIdx} onChange={(e) => setValueIdx(Number(e.target.value))} aria-label="Maximum value">
              {VALUE_CAPS.map((v, i) => (
                <option key={v.label} value={i}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-mist-300">
              Duration: <b className="num">{weeks}</b> week{weeks > 1 ? 's' : ''}
            </div>
            <input
              type="range"
              min={1}
              max={maxWeeks}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="w-full accent-grass-500"
              aria-label="Weeks"
            />
          </div>
        </div>
        {estimate && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-white/[0.03] px-3 py-2 text-[12px] text-mist-300">
            <span>
              Expenses <b className="num text-mist-100">{formatUSD(estimate.weeklyExpenses)}</b>/wk
            </span>
            <span>
              Total with wages <b className="num text-mist-100">{formatUSD(estimate.total)}</b>
            </span>
            <span>
              <b className="num text-mist-100">{estimate.matches.toLocaleString('en-US')}</b> players fit
            </span>
            {estimate.local && <span className="text-grass-300">His home market: sharper eye, 30% cheaper</span>}
            {estimate.matches === 0 && <span className="text-alert-400">Nobody fits this brief.</span>}
          </div>
        )}
        <div className="flex gap-2">
          <button
            className="btn-primary flex-1 text-xs disabled:opacity-40"
            disabled={!brief || estimate?.matches === 0}
            onClick={() => brief && void act(() => engine.assignTask(a.id, brief, weeks)).then(onDone)}
          >
            Send him ({weeks} wk)
          </button>
          <button className="btn-ghost text-xs" onClick={onDone}>
            Cancel
          </button>
        </div>
        {error && <div className="text-[12px] text-alert-400">{error}</div>}
      </div>
    </motion.div>
  );
}
