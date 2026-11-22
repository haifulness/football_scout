import { motion } from 'motion/react';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { DealView } from '../../engine/views';
import { DealStageBadge } from '../components/deal-stage';
import { Loading, OvrBadge, Panel, PosBadge, useCultureLookup } from '../components/ui';
import { Crest } from '../visuals/crest';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';

const ACTIVE = new Set(['negotiating', 'agreed']);

export function DealsScreen() {
  const deals = useEngineQuery(() => engine.getDeals(), []);
  const { openRecommend } = useGame();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  if (!deals) return <Loading label="Opening the deal book" />;
  const active = deals.filter((d) => ACTIVE.has(d.stage));
  const history = deals.filter((d) => !ACTIVE.has(d.stage));
  const signed = deals.filter((d) => d.stage === 'completed').length;
  const list = tab === 'active' ? active : history;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <div className="panel-title text-flood-400">
            {signed} signing{signed === 1 ? '' : 's'} so far
          </div>
          <h1 className="font-display text-5xl font-bold uppercase leading-none">Deals</h1>
        </div>
        <button className="btn-primary" onClick={() => openRecommend({})}>
          New recommendation
        </button>
      </header>
      <Panel
        title={
          <span className="flex gap-1">
            {(['active', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1 font-display text-[13px] capitalize tracking-wider ${tab === t ? 'bg-grass-500 text-night-950' : 'text-mist-300 hover:bg-white/[0.06]'}`}
              >
                {t} ({t === 'active' ? active.length : history.length})
              </button>
            ))}
          </span>
        }
      >
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-mist-400">
            {tab === 'active' ? 'No deals in progress. Find a player, travel to a club, and pitch him in person.' : 'No finished deals yet.'}
          </div>
        ) : (
          <ul>
            {list.map((d, i) => (
              <DealRow key={d.id} d={d} i={i} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function DealRow({ d, i }: { d: DealView; i: number }) {
  const { navigate } = useGame();
  const cultureOf = useCultureLookup();
  const [open, setOpen] = useState(i === 0);
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.03, 0.3) }}
      className="border-b border-white/[0.04]"
    >
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
        {d.player ? (
          <Portrait
            seed={d.player.portraitSeed}
            culture={cultureOf(d.player.nationalityId)}
            size={40}
            age={d.player.age}
            shirt={d.club.colors.primary}
            trim={d.club.colors.secondary}
            className="rounded-lg"
          />
        ) : (
          <span className="h-10 w-10" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{d.player?.name ?? 'Retired player'}</span>
            <PosBadge pos={d.position} />
            {d.prospect && <span className="chip text-flood-300">Prospect</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-mist-400">
            {d.seller ? (
              <>
                <Crest club={d.seller} size={14} /> {d.seller.name}
              </>
            ) : (
              'Free agent'
            )}
            <span>→</span>
            <Crest club={d.club} size={14} /> <span className="text-mist-200">{d.club.name}</span>
          </span>
        </span>
        <span className="hidden text-right text-[12px] text-mist-400 md:block">
          {d.stage === 'negotiating' && d.resolvesOn && (
            <>
              Decision by {formatDate(d.resolvesOn)}
              <br />
              <b className="text-mist-100">{Math.round((d.chance ?? 0) * 100)}%</b> he agrees
            </>
          )}
          {d.stage === 'agreed' && 'Completes when the window opens'}
          {d.stage === 'completed' && d.completedOn && (
            <>
              Signed {formatDate(d.completedOn)}
              <br />
              {d.fee ? formatUSD(d.fee) : 'Free transfer'}
            </>
          )}
          {d.stage === 'negotiating' && d.rivals.length > 0 && (
            <span className={`block font-semibold ${d.rivals.some((r) => r.advanced) ? 'text-alert-400' : 'text-violet-300'}`}>
              👁 Rival: {d.rivals[0]!.rivalName} ({d.rivals[0]!.club.name})
            </span>
          )}
          {(d.stage === 'rejected' || d.stage === 'failed' || d.stage === 'hijacked' || d.stage === 'collapsed') && (
            <span className="text-alert-400/80">{d.reason}</span>
          )}
        </span>
        {d.player?.ovrRange && <OvrBadge ovr={Math.round((d.player.ovrRange[0] + d.player.ovrRange[1]) / 2)} range={d.player.ovrRange} size="sm" />}
        <DealStageBadge stage={d.stage} />
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-4 bg-black/20 px-4 py-3 md:grid-cols-[1fr_auto]">
          <ol className="relative space-y-2 border-l border-white/10 pl-4">
            {d.log.map((l, j) => (
              <li key={j} className="relative text-[13px]">
                <span
                  className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full"
                  style={{ background: l.tone === 'good' ? 'var(--color-good-400)' : l.tone === 'bad' ? 'var(--color-alert-500)' : 'var(--color-mist-400)' }}
                />
                <span className="num mr-2 text-[11px] text-mist-400">{formatDate(l.date)}</span>
                <span className={l.tone === 'good' ? 'text-good-300' : l.tone === 'bad' ? 'text-alert-400' : 'text-mist-300'}>{l.text}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2 md:w-52">
            {d.player && (
              <button className="btn-ghost text-xs" onClick={() => navigate({ screen: 'player', id: d.player!.id })}>
                {d.stage === 'negotiating' ? 'Meet him to raise the odds' : 'View player'}
              </button>
            )}
            <button className="btn-ghost text-xs" onClick={() => navigate({ screen: 'club', id: d.club.id })}>
              View {d.club.name}
            </button>
          </div>
        </div>
      )}
    </motion.li>
  );
}
