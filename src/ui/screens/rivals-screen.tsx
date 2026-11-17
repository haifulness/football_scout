import { motion } from 'motion/react';
import { Fragment, useState } from 'react';
import type { RivalRow } from '../../engine/views';
import { Loading, Panel, useCultureLookup } from '../components/ui';
import { Crest } from '../visuals/crest';
import { ClubLink } from '../components/club-link';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

export function RivalsScreen() {
  const view = useEngineQuery(() => engine.getRivals(), []);
  const [localOnly, setLocalOnly] = useState(true);
  if (!view) return <Loading label="Asking around" />;
  const chases = view.rivals
    .filter((r) => r.chase)
    .sort((a, b) => Number(b.chase!.yours) - Number(a.chase!.yours) || Number(b.chase!.advanced) - Number(a.chase!.advanced));
  const rows = view.rivals.filter((r) => !localOnly || r.local);
  const total = view.rivals.length + 1;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end gap-6">
        <div className="min-w-0 flex-1">
          <div className="panel-title text-violet-300">The scouting circuit</div>
          <h1 className="font-display text-5xl font-bold uppercase leading-none">Rivals</h1>
          <p className="mt-2 max-w-2xl text-sm text-mist-400">
            Other scouts chase players for their clubs, sometimes the same ones you are working on. The first deal to complete wins. Rumours tell you who is
            after whom; a chase marked advanced can close the moment a transfer window opens. Better-known rivals also hold the jobs and clients you want.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-white/[0.08] bg-night-900 px-6 py-4 text-center"
        >
          <div className="panel-title text-[10px]">Your standing</div>
          <div className="num font-display text-5xl font-bold leading-none text-flood-300">#{view.you.rank}</div>
          <div className="mt-1 text-[12px] text-mist-400">
            of {total} scouts · reputation {view.you.reputation}
          </div>
        </motion.div>
      </header>

      <Panel
        title={`Known chases (${chases.length})`}
        right={view.threats ? <span className="text-[11px] font-semibold text-alert-400">{view.threats} on your players</span> : undefined}
      >
        {chases.length ? (
          <ul>
            {chases.map((r, i) => (
              <ChaseRow key={r.id} r={r} i={i} />
            ))}
          </ul>
        ) : (
          <div className="p-6 text-center text-sm text-mist-400">No rumours yet. Chases leak into the news as rivals get further along.</div>
        )}
      </Panel>

      <Panel
        title="Scouts by reputation"
        right={
          <label className="flex items-center gap-2 text-[12px] text-mist-300">
            <input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.target.checked)} />
            Your country only
          </label>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-mist-400">
              <th className="px-4 py-2">#</th>
              <th className="py-2">Scout</th>
              <th className="py-2">Works for</th>
              <th className="py-2">Reputation</th>
              <th className="py-2 text-right">Signings</th>
              <th className="px-4 py-2 text-right">Steals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const index = view.rivals.indexOf(r);
              const ahead = index < view.you.rank - 1;
              const youHere = !ahead && !rows.some((x) => view.rivals.indexOf(x) >= view.you.rank - 1 && rows.indexOf(x) < rows.indexOf(r));
              return (
                <Fragment key={r.id}>
                  {youHere && <YouRow name={view.you.name} reputation={view.you.reputation} rank={view.you.rank} />}
                  <ScoutRow r={r} rank={index + (ahead ? 1 : 2)} />
                </Fragment>
              );
            })}
            {!rows.some((x) => view.rivals.indexOf(x) >= view.you.rank - 1) && (
              <YouRow name={view.you.name} reputation={view.you.reputation} rank={view.you.rank} />
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ChaseRow({ r, i }: { r: RivalRow; i: number }) {
  const navigate = useGame((s) => s.navigate);
  const cultureOf = useCultureLookup();
  const c = r.chase!;
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.03 }}
      className={`flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-0 ${c.yours ? 'bg-alert-500/[0.05]' : ''}`}
    >
      <Portrait seed={r.portraitSeed} culture={cultureOf(r.nationalityId)} size={32} age={45} className="rounded-md" />
      <span className="w-40 truncate font-semibold">{r.name}</span>
      <span className="text-mist-400">→</span>
      <button className="truncate font-semibold hover:text-flood-300" onClick={() => navigate({ screen: 'player', id: c.player.id })}>
        {c.player.name}
      </button>
      <span className="text-mist-400">for</span>
      <Crest club={c.club} size={18} />
      <span className="min-w-0 flex-1 truncate">
        <ClubLink club={c.club} />
      </span>
      {c.yours && <span className="chip border-alert-500/40 text-alert-400">Your player</span>}
      <span className={`text-[12px] ${c.advanced ? 'font-semibold text-alert-400' : 'text-mist-400'}`}>{c.advanced ? 'Advanced' : 'Early'}</span>
    </motion.li>
  );
}

function RepBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      <span className="num w-6 text-[12px]">{value}</span>
    </div>
  );
}

function YouRow({ name, reputation, rank }: { name: string; reputation: number; rank: number }) {
  return (
    <tr className="border-y border-flood-400/30 bg-flood-500/[0.08]">
      <td className="num px-4 py-2 font-bold text-flood-300">{rank}</td>
      <td className="py-2 font-semibold text-flood-200">{name} (you)</td>
      <td className="py-2 text-mist-400">–</td>
      <td className="py-2">
        <RepBar value={reputation} color="#ffc933" />
      </td>
      <td className="py-2 text-right text-mist-400">–</td>
      <td className="px-4 py-2 text-right text-mist-400">–</td>
    </tr>
  );
}

function ScoutRow({ r, rank }: { r: RivalRow; rank: number }) {
  const cultureOf = useCultureLookup();
  return (
    <tr className="border-b border-white/[0.04]">
      <td className="num px-4 py-2 text-mist-400">{rank}</td>
      <td className="py-2">
        <span className="flex items-center gap-2">
          <Portrait seed={r.portraitSeed} culture={cultureOf(r.nationalityId)} size={26} age={45} className="rounded" />
          <span className="font-medium">{r.name}</span>
          {r.chase && <span className="text-[11px] text-violet-300">👁</span>}
        </span>
      </td>
      <td className="py-2">
        {r.employer ? (
          <span className="flex items-center gap-1.5">
            <Crest club={r.employer} size={16} /> <span className="truncate">{r.employer.name}</span>
          </span>
        ) : (
          <span className="text-mist-300">
            Freelance · {r.clients} client{r.clients === 1 ? '' : 's'}
          </span>
        )}
      </td>
      <td className="py-2">
        <RepBar value={r.reputation} color="#a78bfa" />
      </td>
      <td className="num py-2 text-right">{r.signings}</td>
      <td className={`num px-4 py-2 text-right ${r.steals ? 'font-bold text-alert-400' : 'text-mist-400'}`}>{r.steals}</td>
    </tr>
  );
}
