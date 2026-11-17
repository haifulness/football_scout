import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { TrophyKind } from '../../engine/model/goals';
import type { CareerSummary } from '../../engine/systems/career-end';
import type { HallEntry } from '../../persistence/db';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Cup } from './trophy-reveal';
import { CountUp, Panel } from './ui';

const TROPHY_NAME: Record<TrophyKind, string> = {
  'scout-world': 'World Scout of the Year',
  'scout-country': 'Scout of the Year',
  signing: 'Signing of the Season',
  'clean-sweep': 'Clean sweep',
};

/** The end of a career, whether you retired or went broke: the summary, the score, and where it ranks. */
export function CareerEnd() {
  const { scout, quitToMenu } = useGame();
  const reduce = useReducedMotion();
  const [result, setResult] = useState<{ summary: CareerSummary; rank: number; entries: number }>();
  const [error, setError] = useState<string>();
  const over = !!scout?.careerOver;
  useEffect(() => {
    if (!over) return;
    engine.endOfCareer().then(setResult, (e) => setError(e instanceof Error ? e.message : 'Could not record the career.'));
  }, [over]);
  if (!scout?.careerOver) return null;
  const s = result?.summary;
  const retired = scout.careerOver.kind === 'retired';
  const scenarioWon = scout.scenario?.status === 'won';
  const scenarioLost = scout.scenario?.status === 'lost';
  const top = s ? Math.max(1, ...s.breakdown.map((l) => Math.abs(l.points))) : 1;

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-night-950/92 p-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="panel my-auto w-full max-w-3xl p-8"
        initial={reduce ? false : { scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 18 }}
      >
        <div className={`panel-title ${retired || scenarioWon ? 'text-flood-400' : 'text-alert-400'}`}>
          {formatDate(scout.careerOver.date)} · {scout.scenario ? scout.scenario.name : retired ? 'Retired' : 'Bankrupt'}
        </div>
        <h2 className="mt-1 font-display text-5xl font-bold uppercase leading-none">
          {scenarioWon ? 'Scenario won' : scenarioLost ? 'Scenario lost' : retired ? 'A career to remember' : 'Career over'}
        </h2>
        <p className="mt-2 text-mist-300">{scout.careerOver.reason}</p>
        {error && <p className="mt-3 text-sm text-alert-400">{error}</p>}
        {!s && !error && <p className="mt-6 text-sm text-mist-400">Adding up your career…</p>}

        {s && result && (
          <>
            <div className="mt-6 grid gap-6 md:grid-cols-[220px_1fr]">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-flood-400/25 bg-flood-500/[0.06] p-5 text-center">
                <div className="panel-title text-[11px]">Final score</div>
                <div className="num font-display text-6xl font-bold leading-none text-flood-300">
                  {reduce ? s.score : <CountUp value={s.score} />}
                </div>
                <div className="mt-2 text-sm">
                  Hall of fame: <span className="font-bold">#{result.rank}</span>
                  <span className="text-mist-400"> of {result.entries}</span>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5">
                {s.breakdown.map((l, i) => (
                  <li key={l.label} className="grid grid-cols-[130px_1fr_54px] items-center gap-2 text-[12px]">
                    <span className="text-mist-300" title={l.detail}>
                      {l.label}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.span
                        className={`block h-full rounded-full ${l.points >= 0 ? 'bg-flood-400' : 'bg-alert-500'}`}
                        initial={reduce ? false : { width: 0 }}
                        animate={{ width: `${(Math.abs(l.points) / top) * 100}%` }}
                        transition={{ delay: 0.2 + i * 0.08, duration: 0.6 }}
                      />
                    </span>
                    <span className="num text-right font-semibold">
                      {l.points >= 0 ? '+' : ''}
                      {l.points}
                    </span>
                    <span className="col-span-3 -mt-1 text-[11px] text-mist-400">{l.detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Seasons">{s.seasons}</Tile>
              <Tile label="Earned">{formatUSD(s.earned, { compact: true })}</Tile>
              <Tile label="Placements">{s.placements}</Tile>
              <Tile label="Reputation">{s.reputation}</Tile>
              <Tile label="Prodigies found">{s.prodigies}</Tile>
              <Tile label="Season goals">{s.goalsReached}</Tile>
              <Tile label="Report accuracy">{s.accuracy === undefined ? '–' : `${Math.round(s.accuracy * 100)}%`}</Tile>
              <Tile label="Money at the end">{formatUSD(s.money, { compact: true })}</Tile>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <div className="panel-title mb-2 text-[11px]">Best find</div>
                {s.bestFind ? (
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <div className="font-semibold">{s.bestFind.name}</div>
                    <div className="text-[12px] text-mist-400">
                      {s.bestFind.how === 'placed' ? 'You placed him' : 'You discovered him'} · rated {s.bestFind.ovr} now
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-mist-400">No placements or discoveries this time.</div>
                )}
                {s.stars.length > 0 && (
                  <div className="mt-2 text-[12px] text-mist-300">
                    Stars you found ({s.stars.length}): {s.stars.map((x) => `${x.name} (${x.ovr})`).join(', ')}
                  </div>
                )}
                {s.agency && (
                  <div className="mt-2 text-[12px] text-mist-300">
                    {s.agency.name}: {s.agency.brokered} deals brokered, {formatUSD(s.agency.earned)} earned.
                  </div>
                )}
              </div>
              <div>
                <div className="panel-title mb-2 text-[11px]">Trophies</div>
                {(Object.keys(s.trophies) as TrophyKind[]).some((k) => s.trophies[k]) ? (
                  <ul className="flex flex-wrap gap-3">
                    {(Object.keys(s.trophies) as TrophyKind[])
                      .filter((k) => s.trophies[k])
                      .map((k) => (
                        <li key={k} className="flex items-center gap-2 text-sm">
                          <Cup kind={k} size={36} />
                          <span>
                            {TROPHY_NAME[k]}
                            {s.trophies[k] > 1 && <span className="text-mist-400"> × {s.trophies[k]}</span>}
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className="text-sm text-mist-400">The cabinet stayed empty.</div>
                )}
              </div>
            </div>
          </>
        )}

        <button className="btn-primary mt-8 w-full" onClick={() => void quitToMenu()}>
          Back to the main menu
        </button>
      </motion.div>
    </motion.div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="text-[11px] text-mist-400">{label}</div>
      <div className="num font-display text-2xl font-bold">{children}</div>
    </div>
  );
}

/** Career screen: end it on your own terms. */
export function RetirePanel() {
  const { careerAction } = useGame();
  const summary = useEngineQuery(() => engine.getCareerSummary(), []);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  if (!summary || summary.kind !== 'active') return null;
  return (
    <Panel title="Retire" right={<span className="text-[12px] text-mist-400">Your score if you stopped today: {summary.score}</span>}>
      <div className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="max-w-xl text-mist-400">
          Hang up the notebook whenever you like. Your career ends today: you get its summary and final score, and it goes into the hall of fame. The save
          stays, but nothing more happens in it.
        </span>
        <span className="ml-auto" />
        {error && <span className="text-[12px] text-alert-400">{error}</span>}
        {confirm ? (
          <>
            <button className="btn-ghost border-alert-500/40 text-xs text-alert-400" onClick={() => void careerAction(() => engine.retire()).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'))}>
              Yes, retire now
            </button>
            <button className="btn-ghost text-xs" onClick={() => setConfirm(false)}>
              Keep going
            </button>
          </>
        ) : (
          <button className="btn-ghost text-xs" onClick={() => setConfirm(true)}>
            Retire…
          </button>
        )}
      </div>
    </Panel>
  );
}

/** Start screen: the best careers played in this browser. */
export function HallOfFame() {
  const [entries, setEntries] = useState<HallEntry[]>();
  useEffect(() => {
    engine.getHallOfFame().then(setEntries, () => setEntries([]));
  }, []);
  if (!entries?.length) return null;
  return (
    <div className="panel">
      <div className="flex items-center border-b border-white/[0.06] px-4 py-3">
        <h3 className="panel-title">Hall of fame</h3>
        <span className="ml-auto text-[11px] text-mist-400">across all your careers</span>
      </div>
      <ol className="max-h-64 overflow-y-auto">
        {entries.map((e, i) => (
          <li key={e.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2 text-sm last:border-0">
            <span className={`num w-5 text-right font-bold ${i === 0 ? 'text-flood-300' : 'text-mist-400'}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {e.name}
                {e.scenario && <span className="ml-1.5 text-[11px] font-normal text-violet-300">{e.scenario}</span>}
              </div>
              <div className="truncate text-[11px] text-mist-400">
                {e.seasons} seasons · {e.placements} placements · {e.trophies} trophies · {e.scenario ? (e.scenarioResult === 'won' ? 'won' : 'lost') : e.kind === 'bankrupt' ? 'went bankrupt' : 'retired'}
                {e.bestFind ? ` · best find ${e.bestFind.name} (${e.bestFind.ovr})` : ''}
              </div>
            </div>
            <span className="num font-display text-xl font-bold">{e.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
