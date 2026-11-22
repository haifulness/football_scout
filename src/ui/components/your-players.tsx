import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { CareerView, PlacementView } from '../../engine/views';
import { Portrait } from '../visuals/portrait';
import { Crest } from '../visuals/crest';
import { Panel, PosBadge, useCultureLookup } from './ui';
import { useGame } from '../store/game-store';

const MOOD = {
  happy: { label: 'Happy', cls: 'border-good-400/30 text-good-300' },
  restless: { label: 'Restless', cls: 'border-flood-400/35 text-flood-300' },
  'wants-out': { label: 'Wants out', cls: 'border-alert-400/40 text-alert-400' },
} as const;
const VERDICT = {
  hit: { label: 'Hit', cls: 'border-good-400/30 bg-good-400/10 text-good-300' },
  solid: { label: 'Solid', cls: 'border-white/15 text-mist-200' },
  flop: { label: 'Flop', cls: 'border-alert-400/40 bg-alert-500/10 text-alert-400' },
} as const;

/** Every player you placed and how it's going: minutes, rating, mood, and what the club thinks of him. */
export function YourPlayersPanel({ c }: { c: CareerView }) {
  const [showEnded, setShowEnded] = useState(false);
  const current = c.players.filter((p) => p.active);
  const ended = c.players.filter((p) => !p.active);
  const list = showEnded ? c.players : current;
  const { hits, solid, flops } = c.record;
  return (
    <Panel
      title={`Your players (${current.length})`}
      right={
        <span className="flex items-center gap-2 text-[11px] text-mist-400">
          {hits + solid + flops > 0 && (
            <span>
              <b className="text-good-300">{hits}</b> hit{hits === 1 ? '' : 's'} · <b className="text-mist-200">{solid}</b> solid · <b className="text-alert-400">{flops}</b> flop
              {flops === 1 ? '' : 's'}
            </span>
          )}
          {ended.length > 0 && (
            <button className="font-semibold text-mist-300 hover:text-grass-300" onClick={() => setShowEnded((x) => !x)}>
              {showEnded ? 'Hide past' : `Show past (${ended.length})`}
            </button>
          )}
        </span>
      }
    >
      {list.length === 0 ? (
        <div className="p-6 text-center text-sm text-mist-400">
          {c.players.length ? 'None of your players are still at the club you brought them to.' : 'No one yet. Every player you place shows up here: how he plays, how he feels, and how he reflects on you.'}
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {list.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </ul>
      )}
      <p className="border-t border-white/[0.05] px-4 py-2 text-[11px] text-mist-400">
        Six months in, and again after his first season, each player is judged a hit or a flop. Hits raise your standing at his club and your name; flops cost you there.
        A visit steadies a restless player before he asks to leave.
      </p>
    </Panel>
  );
}

function Row({ p }: { p: PlacementView }) {
  const cultureOf = useCultureLookup();
  const navigate = useGame((s) => s.navigate);
  const st = p.story;
  return (
    <li>
      <button
        onClick={() => p.player && navigate({ screen: 'player', id: p.player.id })}
        className={`flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-left hover:bg-white/[0.03] ${p.active ? '' : 'opacity-60'}`}
      >
        <span className="flex min-w-[200px] flex-1 items-center gap-2.5">
          {p.player && (
            <Portrait
              seed={p.player.portraitSeed}
              culture={cultureOf(p.player.nationalityId)}
              size={32}
              age={p.player.age}
              shirt={p.club.colors.primary}
              trim={p.club.colors.secondary}
              className="rounded"
            />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{p.player?.name ?? 'Retired'}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-mist-400">
              <PosBadge pos={p.position} />
              <Crest club={p.club} size={14} />
              <span className="truncate">{p.club.shortName}</span>
              <span>· since {formatDate(p.signedOn)}</span>
            </span>
          </span>
        </span>

        <span className="w-[150px]">
          <span className="flex justify-between text-[11px] text-mist-400">
            <span>Minutes</span>
            <span className="num text-mist-200">
              {st.games ? `${Math.round(st.share * 100)}%` : '–'}
              {st.rating !== undefined && <span className="text-mist-400"> · {st.rating.toFixed(1)}</span>}
            </span>
          </span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full bg-grass-400" style={{ width: `${Math.round(st.share * 100)}%` }} />
          </span>
        </span>

        <span className="flex w-[190px] flex-wrap items-center gap-1 text-[11px]">
          {st.mood && <span className={`chip ${MOOD[st.mood].cls}`}>{MOOD[st.mood].label}</span>}
          {st.settlingDays !== undefined && <span className="chip border-flood-400/25 text-flood-300">Settling · {st.settlingDays}d</span>}
          {st.verdict ? <span className={`chip ${VERDICT[st.verdict].cls}`}>{VERDICT[st.verdict].label}</span> : p.active && <span className="text-mist-400">Not judged yet</span>}
          {!p.active && <span className="text-mist-400">{p.endReason}</span>}
        </span>

        <span className="num w-[80px] text-right text-sm font-semibold">{formatUSD(p.bonus + p.matchTotal)}</span>
      </button>
    </li>
  );
}
