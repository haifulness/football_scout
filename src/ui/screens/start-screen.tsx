import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate, type GameDate } from '../../engine/core/calendar';
import type { SaveMeta } from '../../persistence/db';
import { engine } from '../store/engine-client';
import { useGame } from '../store/game-store';
import { CareerSetup } from '../components/career-setup';
import { HallOfFame } from '../components/career-end';

const randomSeed = () => Math.floor(Math.random() * 900_000) + 100_000;

function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

export function StartScreen() {
  const { status, progress, newGame, loadSave } = useGame();
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const [setupOpen, setSetupOpen] = useState(false);
  const [saves, setSaves] = useState<SaveMeta[]>();
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = status === 'generating' || status === 'loading';

  const refresh = useCallback(() => {
    engine.listSaves().then(setSaves, () => setSaves([]));
  }, []);
  useEffect(refresh, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      refresh();
    }
  };

  const exportSave = (id: string) =>
    run(async () => {
      const { filename, bytes } = await engine.exportSave(id);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

  const importFile = (file: File) =>
    run(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await engine.importSave(bytes);
      refresh();
    });

  const [latest, ...older] = saves ?? [];

  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto">
      {/* floodlight beams */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-40 -top-40 h-[700px] w-[700px] rotate-12 bg-[conic-gradient(from_200deg_at_20%_20%,rgba(255,224,138,0.18),transparent_25%)] blur-2xl" />
        <div className="absolute -right-40 -top-40 h-[700px] w-[700px] -rotate-12 bg-[conic-gradient(from_120deg_at_80%_20%,rgba(255,224,138,0.14),transparent_25%)] blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(180deg,transparent,rgba(15,77,46,0.35))]" />
      </div>

      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_440px]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
          <div className="panel-title mb-4 tracking-[0.35em] text-flood-400">A career in recruitment</div>
          <h1 className="font-display text-7xl font-bold uppercase leading-[0.9] tracking-tight md:text-8xl">
            Football
            <span className="block bg-gradient-to-r from-grass-300 via-grass-400 to-flood-400 bg-clip-text text-transparent">Scout</span>
          </h1>
          <p className="mt-6 max-w-md text-mist-300">Find the players nobody else has seen. Convince the coaches. Get paid every time they perform.</p>

          <div className="panel mt-8 max-w-md p-5">
            <AnimatePresence mode="wait">
              {busy ? (
                <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex items-baseline justify-between">
                    <span className="panel-title">{status === 'loading' ? 'Loading save' : 'Generating world'}</span>
                    <span className="num text-xl font-bold text-grass-300">{Math.round(progress.fraction * 100)}%</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-grass-500 to-flood-400"
                      animate={{ width: `${progress.fraction * 100}%` }}
                    />
                  </div>
                  <div className="mt-2 truncate text-xs text-mist-400">{progress.label}…</div>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSetupOpen(true);
                  }}
                >
                  <label className="panel-title" htmlFor="seed">
                    New world · seed
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="seed"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      className="num w-full rounded-lg border border-white/10 bg-night-950/60 px-3 py-2 text-lg tracking-widest text-mist-100 outline-none focus:border-grass-400/60"
                    />
                    <button type="button" className="btn-ghost" onClick={() => setSeed(String(randomSeed()))} title="Random seed">
                      ⟳
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-mist-400">42 countries, ~1,600 clubs, ~45,000 players. Saved automatically.</p>
                  <button type="submit" className={`${latest ? 'btn-ghost' : 'btn-primary'} mt-4 w-full py-3 text-base`}>
                    Start a new career
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-3"
        >
          {error && <div className="rounded-lg border border-alert-500/40 bg-alert-500/10 px-4 py-3 text-sm text-alert-400">{error}</div>}

          {latest && (
            <button
              disabled={busy}
              onClick={() => void run(() => loadSave(latest.id))}
              className="panel group relative overflow-hidden p-5 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <div className="absolute inset-0 bg-[radial-gradient(400px_160px_at_100%_0%,rgba(47,207,115,0.16),transparent_70%)]" />
              <div className="relative">
                <div className="panel-title text-grass-300">Continue</div>
                <div className="mt-1 font-display text-3xl font-bold uppercase leading-none">{latest.name}</div>
                <div className="mt-2 text-sm text-mist-300">
                  {formatDate(latest.gameDate as GameDate)} · {latest.seasonLabel} season
                </div>
                <div className="mt-1 text-xs text-mist-400">Saved {timeAgo(latest.updatedAt)}</div>
                <span className="btn-primary absolute bottom-0 right-0 px-4 py-2 text-sm">Continue ▸</span>
              </div>
            </button>
          )}

          <div className="panel">
            <header className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
              <h3 className="panel-title">Saved games</h3>
              <button className="text-xs font-semibold text-mist-300 hover:text-grass-300" onClick={() => fileInput.current?.click()}>
                Import save…
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".fsave,application/octet-stream"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = '';
                }}
              />
            </header>
            {saves === undefined ? (
              <div className="p-6 text-center text-sm text-mist-400">Reading saves…</div>
            ) : saves.length === 0 ? (
              <div className="p-6 text-center text-sm text-mist-400">No saves yet. Generate a world to start a career.</div>
            ) : (
              <ul className="max-h-[320px] overflow-y-auto">
                {[latest!, ...older].map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{s.name}</div>
                      <div className="text-[11px] text-mist-400">
                        {formatDate(s.gameDate as GameDate)} · {timeAgo(s.updatedAt)} · {mb(s.sizeBytes)}
                      </div>
                    </div>
                    {confirmDelete === s.id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-[11px] text-alert-400">Delete forever?</span>
                        <button
                          className="rounded bg-alert-500 px-2 py-1 text-[11px] font-bold text-white"
                          onClick={() =>
                            void run(async () => {
                              await engine.deleteSave(s.id);
                              setConfirmDelete(undefined);
                              refresh();
                            })
                          }
                        >
                          Delete
                        </button>
                        <button className="rounded px-2 py-1 text-[11px] text-mist-300 hover:bg-white/[0.06]" onClick={() => setConfirmDelete(undefined)}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <button
                          disabled={busy}
                          className="rounded px-2 py-1 text-[11px] font-semibold text-grass-300 hover:bg-white/[0.06]"
                          onClick={() => void run(() => loadSave(s.id))}
                        >
                          Load
                        </button>
                        <button
                          className="rounded px-2 py-1 text-[11px] text-mist-300 hover:bg-white/[0.06]"
                          onClick={() => void exportSave(s.id)}
                          title="Download a backup file"
                        >
                          Export
                        </button>
                        <button
                          className="rounded px-2 py-1 text-[11px] text-mist-400 hover:bg-white/[0.06] hover:text-alert-400"
                          onClick={() => setConfirmDelete(s.id)}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-mist-400">
            Saves live in this browser. Export a backup if you clear browser data or switch browsers.
          </p>
          <HallOfFame />
        </motion.section>
      </div>
      <AnimatePresence>
        {setupOpen && (
          <motion.div
            className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-night-950/80 p-6 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div className="panel w-full max-w-3xl p-6" initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }}>
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <div className="panel-title text-flood-400">New career · world #{seed}</div>
                  <h2 className="font-display text-4xl font-bold uppercase leading-none">Who are you?</h2>
                </div>
                <button onClick={() => setSetupOpen(false)} className="text-mist-400 hover:text-mist-100" aria-label="Close">
                  ✕
                </button>
              </div>
              <CareerSetup
                submitLabel="Generate world & start"
                onSubmit={(setup) => {
                  setSetupOpen(false);
                  void run(() => newGame(Number(seed) || randomSeed(), setup));
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
