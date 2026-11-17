import { motion } from 'motion/react';
import { useState } from 'react';
import type { CountryId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import { COUNTRIES, CONTINENTS } from '../../engine/data/geography';
import { BLOCKED_PLAYER_NAMES, culture } from '../../engine/data/names';
import type { Background, CareerSetup as Setup, Difficulty } from '../../engine/model/scout';
import { BACKGROUNDS, STARTING_MONEY } from '../../engine/systems/scouting';
import type { ScenarioId } from '../../engine/model/scenario';
import { SCENARIOS } from '../../engine/systems/scenarios';

const SKILL_LABEL = {
  judgingAbility: 'Judging ability',
  judgingPotential: 'Judging potential',
  network: 'Network',
  dataAnalysis: 'Data analysis',
  negotiation: 'Negotiation',
} as const;
const DIFFICULTY: Record<Difficulty, string> = {
  easy: 'Comfortable savings, forgiving start.',
  normal: 'Enough for a few searches. Spend wisely.',
  hard: 'Nearly broke. Every dollar counts.',
};

/** A random name that fits a nationality (never a real player's). */
function randomName(nationality: string): string {
  const names = culture(COUNTRIES.find((c) => c.code === nationality)?.culture ?? 'english');
  const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)]!;
  for (let i = 0; i < 20; i++) {
    const n = `${pick(names.first)} ${pick(names.last)}`;
    if (!BLOCKED_PLAYER_NAMES.has(n)) return n;
  }
  return 'Sam Rivera';
}

/** Name, nationality, home market, background and difficulty for a new scout. */
export function CareerSetup({ onSubmit, submitLabel, busy }: { onSubmit: (setup: Setup) => void; submitLabel: string; busy?: boolean }) {
  const [nationality, setNationality] = useState<CountryId>('eng' as CountryId);
  const [name, setName] = useState(() => randomName('eng'));
  // Your own typing sticks; until then the name follows the nationality.
  const [nameTouched, setNameTouched] = useState(false);
  const [home, setHome] = useState<CountryId>('eng' as CountryId);
  const [homeTouched, setHomeTouched] = useState(false);
  const [background, setBackground] = useState<Background>('analyst');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [scenario, setScenario] = useState<ScenarioId>();
  const def = scenario ? SCENARIOS[scenario] : undefined;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name: name.trim() || randomName(nationality), nationality, homeCountry: home, background, difficulty: def?.difficulty ?? difficulty, scenario });
      }}
    >
      <div>
        <div className="panel-title mb-2 text-[11px]">Mode</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={`chip ${!scenario ? 'border-grass-400/60 text-grass-300' : 'text-mist-300'}`}
            onClick={() => setScenario(undefined)}
          >
            Free career
          </button>
          {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => (
            <button
              type="button"
              key={id}
              className={`chip ${scenario === id ? 'border-violet-400/60 text-violet-200' : 'text-mist-300'}`}
              onClick={() => setScenario(id)}
            >
              {SCENARIOS[id].name}
            </button>
          ))}
        </div>
        {def ? (
          <div className="mt-2 rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-3 text-[12px]">
            <div className="text-mist-300">{def.tagline}</div>
            <div className="mt-1 font-semibold text-violet-200">Goal: {def.goal}</div>
            <ul className="mt-1 list-disc pl-4 text-mist-400">
              {def.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="mt-1 text-mist-400">Winning or losing ends the career. Its score goes into the hall of fame, with a bonus for winning early.</div>
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-mist-400">An open-ended career: play as long as you like and retire when you choose.</div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 sm:col-span-1">
          <span className="panel-title text-[11px]">Your name</span>
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={name}
              maxLength={40}
              onFocus={(e) => !nameTouched && e.target.select()}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              placeholder="e.g. Sam Rivera"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-night-950/70 px-3 py-2 text-sm text-mist-100 outline-none focus:border-grass-400/60"
            />
            <button
              type="button"
              title="Random name"
              aria-label="Random name"
              className="btn-ghost shrink-0 px-2.5"
              onClick={() => {
                setName(randomName(nationality));
                setNameTouched(false);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="block">
                <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="5" cy="5" r="1.2" fill="currentColor" />
                <circle cx="11" cy="5" r="1.2" fill="currentColor" />
                <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                <circle cx="5" cy="11" r="1.2" fill="currentColor" />
                <circle cx="11" cy="11" r="1.2" fill="currentColor" />
              </svg>
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="nat">
          <span className="panel-title text-[11px]">Nationality</span>
          <CountrySelect
            id="nat"
            value={nationality}
            onChange={(v) => {
              setNationality(v);
              if (!homeTouched) setHome(v);
              if (!nameTouched) setName(randomName(v));
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="home">
          <span className="panel-title text-[11px]">Home market{scenario === 'shoestring' && <span className="ml-1 normal-case text-violet-300">(set by the scenario)</span>}</span>
          <CountrySelect
            disabled={scenario === 'shoestring'}
            id="home"
            value={home}
            onChange={(v) => {
              setHome(v);
              setHomeTouched(true);
            }}
          />
        </label>
      </div>

      <div>
        <div className="panel-title mb-2 text-[11px]">Background</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(BACKGROUNDS) as Background[]).map((b) => {
            const info = BACKGROUNDS[b];
            const active = b === background;
            return (
              <motion.button
                type="button"
                key={b}
                onClick={() => setBackground(b)}
                whileTap={{ scale: 0.98 }}
                className={`rounded-xl border p-3 text-left transition-colors ${active ? 'border-grass-400/60 bg-grass-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{info.label}</span>
                  {active && <span className="text-xs text-grass-300">Selected</span>}
                </div>
                <div className="mt-1 text-[12px] text-grass-300">+ {info.strength}</div>
                <div className="text-[12px] text-alert-400">− {info.weakness}</div>
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {(Object.keys(SKILL_LABEL) as (keyof typeof SKILL_LABEL)[]).map((k) => (
                    <div key={k} title={SKILL_LABEL[k]}>
                      <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className="h-full rounded-full bg-flood-400" style={{ width: `${(info.skills[k] / 20) * 100}%` }} />
                      </div>
                      <div className="mt-0.5 truncate text-[9px] text-mist-400">{SKILL_LABEL[k].split(' ')[0]}</div>
                    </div>
                  ))}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {def ? (
        <div className="text-[12px] text-mist-400">
          Difficulty: <span className="font-semibold capitalize text-mist-200">{def.difficulty}</span> (set by the scenario)
        </div>
      ) : (
      <div>
        <div className="panel-title mb-2 text-[11px]">Difficulty</div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDifficulty(d)}
              className={`rounded-xl border p-3 text-left transition-colors ${d === difficulty ? 'border-flood-400/60 bg-flood-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-semibold capitalize">{d}</span>
                <span className="num text-sm text-flood-300">{formatUSD(STARTING_MONEY[d])}</span>
              </div>
              <div className="mt-1 text-[11px] text-mist-400">{DIFFICULTY[d]}</div>
            </button>
          ))}
        </div>
      </div>
      )}

      <button type="submit" disabled={busy} className="btn-primary py-3 text-base">
        {submitLabel}
      </button>
    </form>
  );
}

const GROUPED = Object.entries(CONTINENTS).map(([code, label]) => ({
  label,
  countries: COUNTRIES.filter((c) => c.continent === code).sort((a, b) => a.name.localeCompare(b.name)),
}));

function CountrySelect({ value, onChange, id, disabled }: { value: string; onChange: (v: CountryId) => void; id: string; disabled?: boolean }) {
  return (
    <select
      id={id}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as CountryId)}
      className="w-full rounded-lg border border-white/10 bg-night-950/70 px-3 py-2 text-sm text-mist-100 outline-none focus:border-grass-400/60 disabled:opacity-50"
    >
      {GROUPED.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
