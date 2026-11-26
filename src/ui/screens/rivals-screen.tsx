import { motion } from 'motion/react';
import { Fragment, useState } from 'react';
import type { NemesisView, RivalRow } from '../../engine/views';
import { formatDate } from '../../engine/core/calendar';
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

      {view.nemesis && <Nemesis n={view.nemesis} you={view.you.name} />}

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
        <RepBar value={reputation} color="var(--color-flood-400)" />
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
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className={`font-medium ${r.nemesis ? 'text-alert-300' : ''}`}>{r.name}</span>
              {r.nemesis && <span className="chip border-alert-500/40 px-1.5 py-0 text-[9px] text-alert-400">Nemesis</span>}
              {r.chase && <span className="text-[11px] text-violet-300">👁</span>}
            </span>
            <span className="flex flex-wrap gap-1">
              {r.style ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-flood-300" title={r.style.blurb}>
                  {r.style.label}
                </span>
              ) : (
                <span className="text-[10px] text-mist-500" title="Cross paths with him (a rumour, a steal, a trade) to learn how he works">
                  Style unknown
                </span>
              )}
              {r.atYourClients > 0 && (
                <span className="text-[10px] font-semibold text-alert-400" title="Players he signed for your clients in the last year">
                  · {r.atYourClients} at your clients
                </span>
              )}
            </span>
          </span>
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

/** Your nemesis: who he is, this season's head-to-head, your record against him, and the rumours he's spreading. */
function Nemesis({ n, you }: { n: NemesisView; you: string }) {
  const cultureOf = useCultureLookup();
  const ahead = n.season.you > n.season.him || (n.season.you === n.season.him && n.season.yourRep >= n.season.hisRep);
  const row = (label: string, a: number | string, b: number | string, good?: boolean) => (
    <tr className="border-t border-white/[0.05]">
      <td className="py-1.5 text-mist-400">{label}</td>
      <td className={`num py-1.5 text-right font-semibold ${good === true ? 'text-good-300' : good === false ? 'text-alert-400' : ''}`}>{a}</td>
      <td className="num py-1.5 text-right font-semibold">{b}</td>
    </tr>
  );
  return (
    <Panel
      title="Your nemesis"
      right={
        <span className="text-[11px] text-mist-400">
          Since {formatDate(n.since)} · seasons {n.won}–{n.lost}
        </span>
      }
    >
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_1.2fr]">
        <div className="flex items-start gap-3">
          <Portrait seed={n.portraitSeed} culture={cultureOf(n.nationalityId)} size={56} age={42} className="rounded-lg" />
          <div className="min-w-0">
            <div className="font-display text-2xl font-bold uppercase leading-none text-alert-300">{n.name}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-flood-300">{n.style.label}</div>
            <div className="mt-1 text-[12px] text-mist-400">{n.style.blurb}</div>
            <div className="mt-1 text-[12px] text-mist-400">He goes after your clubs, your players and your clients, and keeps a step ahead of your reputation.</div>
          </div>
        </div>
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-mist-400">
                <th className="py-1 text-left font-normal">{n.season.label} so far</th>
                <th className="py-1 text-right font-normal" title={you}>
                  You
                </th>
                <th className="py-1 text-right font-normal">{n.name.split(' ').slice(-1)[0]}</th>
              </tr>
            </thead>
            <tbody>
              {row('Signings', n.season.you, n.season.him, n.season.you > n.season.him ? true : n.season.you < n.season.him ? false : undefined)}
              {row('Reputation', n.season.yourRep, n.season.hisRep)}
              {row('Deals he took off you', '–', n.season.steals)}
              {row('Clients he took from you', '–', n.season.clientsTaken)}
            </tbody>
          </table>
          <div className={`mt-2 text-[12px] ${ahead ? 'text-good-300' : 'text-alert-400'}`}>
            {ahead ? 'You lead this season: win it on 1 July for +3 reputation.' : 'He leads this season: lose it and you drop 2 reputation.'}
          </div>
          {n.history.length > 0 && (
            <div className="mt-1 text-[11px] text-mist-400">
              Past seasons: {n.history.map((h) => `${h.year}/${String(h.year + 1).slice(2)} ${h.won ? 'W' : 'L'} ${h.you}–${h.him}`).join(' · ')}
            </div>
          )}
        </div>
      </div>
      {n.smears.length > 0 && (
        <div className="border-t border-white/[0.05] px-4 py-2.5 text-[12px]">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-alert-400">Rumours about you</div>
          <ul className="flex flex-col gap-1">
            {n.smears.map((m) => (
              <li key={m.club.id} className="flex flex-wrap items-center gap-1.5 text-mist-300">
                <Crest club={m.club} size={16} />
                <ClubLink club={m.club} />
                <span className="text-mist-400">
                  · from {m.by} · −{m.amount} standing{m.cleared ? ' (you set it straight)' : ' · meet the coach to clear it'} · fades {formatDate(m.until)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
