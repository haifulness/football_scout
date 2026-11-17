import { motion } from 'motion/react';
import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import { formatUSD } from '../../engine/core/money';
import type { MandateView, MarketView } from '../../engine/views';
import { Collapsible, OvrBadge, Panel, PosBadge, useCultureLookup } from './ui';
import { Crest } from '../visuals/crest';
import { ClubLink } from './club-link';
import { Portrait } from '../visuals/portrait';
import { engine } from '../store/engine-client';
import { useGame } from '../store/game-store';
import { DealStageBadge } from './deal-stage';

const STATUS: Record<MandateView['status'], { label: string; color: string }> = {
  offered: { label: 'Offered', color: '#ffc933' },
  active: { label: 'Selling', color: '#38bdf8' },
  succeeded: { label: 'Sold', color: '#2fcf73' },
  failed: { label: 'Failed', color: '#ef4444' },
  declined: { label: 'Declined', color: '#8aa2ad' },
  expired: { label: 'Lapsed', color: '#8aa2ad' },
};

const mid = (r: [number, number]) => Math.round((r[0] + r[1]) / 2);

/** Freelance market on the Missions screen: clients' sales and the free agents you represent. */
export function MarketSection({ market }: { market: MarketView }) {
  const open = market.mandates.filter((m) => m.status === 'offered' || m.status === 'active');
  const past = market.mandates.filter((m) => m.status !== 'offered' && m.status !== 'active');
  if (!market.freelance && !past.length) return null;

  return (
    <>
      <Panel title={`Selling mandates (${open.filter((m) => m.status === 'active').length}/2 active)`}>
        {open.length ? (
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
            {open.map((m, i) => (
              <MandateCard key={m.id} m={m} i={i} />
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-mist-400">
            {market.freelance
              ? 'No sales on your desk. Clients ask you to sell players they want to move on, about twice a month.'
              : 'Selling mandates are for freelancers.'}
          </div>
        )}
        {past.length > 0 && (
          <Collapsible id="mandates-history" title="Past mandates" count={past.length} inPanel>
            <ul>
              {past.map((m) => (
                <li key={m.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2 text-sm last:border-0">
                  <Crest club={m.club} size={18} />
                  <span className="min-w-0 flex-1 truncate">
                    {m.player.name} for <ClubLink club={m.club} />
                    {m.soldTo && <span className="text-grass-300"> → {m.soldTo}</span>}
                    {m.note && <span className="text-mist-400"> · {m.note}</span>}
                  </span>
                  <span className="num text-[12px] text-mist-400">{m.resolvedOn ? formatDate(m.resolvedOn) : ''}</span>
                  <Status status={m.status} />
                </li>
              ))}
            </ul>
          </Collapsible>
        )}
      </Panel>
      {market.freelance && <RepresentedPanel market={market} />}
    </>
  );
}

const Status = ({ status }: { status: MandateView['status'] }) => (
  <span
    className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
    style={{ color: STATUS[status].color, background: `${STATUS[status].color}18`, boxShadow: `inset 0 0 0 1px ${STATUS[status].color}44` }}
  >
    {STATUS[status].label}
  </span>
);

function MandateCard({ m, i }: { m: MandateView; i: number }) {
  const { careerAction, openRecommend, navigate } = useGame();
  const cultureOf = useCultureLookup();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<unknown>) => careerAction(fn).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  const elapsed = m.daysLeft !== undefined ? 1 - m.daysLeft / (m.weeks * 7) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05 }}
      className={`rounded-xl border p-4 ${m.status === 'offered' ? 'border-flood-400/30 bg-flood-500/5' : 'border-sky-400/25 bg-sky-400/[0.04]'}`}
    >
      <div className="flex items-start gap-3">
        <button onClick={() => navigate({ screen: 'player', id: m.player.id })} className="shrink-0">
          <Portrait
            seed={m.player.portraitSeed}
            culture={cultureOf(m.player.nationalityId)}
            size={52}
            age={m.player.age}
            shirt={m.club.colors.primary}
            trim={m.club.colors.secondary}
            className="rounded-lg ring-1 ring-white/10"
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button className="truncate font-semibold hover:text-flood-300" onClick={() => navigate({ screen: 'player', id: m.player.id })}>
              {m.player.name}
            </button>
            <PosBadge pos={m.player.position} />
            <span className="text-[12px] text-mist-400">{m.player.age} yrs</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-mist-300">
            <Crest club={m.club} size={14} /> <ClubLink club={m.club} /> · <span className="italic">“{m.reason}”</span>
          </div>
        </div>
        <OvrBadge ovr={mid(m.player.ovr)} range={m.player.ovr} size="sm" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Figure label="Asking" value={formatUSD(m.askingFee)} />
        <Figure label="Cut" value={`${m.commissionPct}%`} />
        <Figure label="Commission" value={formatUSD(m.commission)} accent />
      </div>
      {m.status === 'active' && m.deadline !== undefined && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-mist-400">
            <span>Sell by {formatDate(m.deadline)}</span>
            <span className={m.daysLeft! <= 7 ? 'font-bold text-alert-400' : ''}>{m.daysLeft} days left</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${elapsed * 100}%`, background: m.daysLeft! <= 7 ? '#ef4444' : '#38bdf8' }} />
          </div>
        </div>
      )}
      {m.status === 'active' && <BuyerTalks m={m} />}
      {m.status === 'offered' ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-[11px] text-mist-400">
            {m.weeks} weeks once accepted · answer by {formatDate(m.acceptBy)}
          </span>
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => void act(() => engine.acceptMandate(m.id))}>
            Accept
          </button>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => void act(() => engine.declineMandate(m.id))}>
            Decline
          </button>
        </div>
      ) : (
        <button className="btn-primary mt-3 w-full text-xs" onClick={() => openRecommend({ playerId: m.player.id })}>
          Find a buyer (any club)
        </button>
      )}
      {error && <div className="mt-2 text-[12px] text-alert-400">{error}</div>}
    </motion.div>
  );
}

const Figure = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
    <div className={`num text-sm font-bold ${accent ? 'text-flood-300' : ''}`}>{value}</div>
    <div className="text-[10px] uppercase tracking-wider text-mist-400">{label}</div>
  </div>
);

function RepresentedPanel({ market }: { market: MarketView }) {
  const { openRecommend, navigate } = useGame();
  const cultureOf = useCultureLookup();
  return (
    <Panel title={`Players you represent (${market.represented.length}/${market.maxRepresented})`}>
      {market.represented.length ? (
        <ul>
          {market.represented.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-0">
              <Portrait seed={p.portraitSeed} culture={cultureOf(p.nationalityId)} size={36} age={p.age} className="rounded-md" />
              <button className="min-w-0 flex-1 truncate text-left font-semibold hover:text-flood-300" onClick={() => navigate({ screen: 'player', id: p.id })}>
                {p.name} {p.prodigy && <span className="text-flood-300">★</span>}
              </button>
              <PosBadge pos={p.position} />
              <span className="text-[12px] text-mist-400">{p.age} yrs</span>
              <OvrBadge ovr={mid(p.ovr)} range={p.ovr} size="sm" />
              <span className="w-20 text-right text-[12px] text-mist-400">{p.deals ? `${p.deals} open deal${p.deals > 1 ? 's' : ''}` : 'No deals'}</span>
              <button className="btn-ghost px-3 py-1 text-xs" onClick={() => openRecommend({ playerId: p.id })}>
                Pitch
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-6 text-center text-sm text-mist-400">
          Free agents who trust you (rapport {market.representRapport}+) can sign with you. Meet one in his country, then choose “Represent him” on his page.
          You can then pitch him to any club.
        </div>
      )}
    </Panel>
  );
}

/** Which clubs you have pitched him to, and where each stands. */
function BuyerTalks({ m }: { m: MandateView }) {
  const navigate = useGame((s) => s.navigate);
  const live = m.deals.filter((d) => d.stage === 'negotiating' || d.stage === 'agreed').length;
  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20">
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-mist-400">
        <span>Buyers approached ({m.deals.length})</span>
        {live > 0 && <span className="text-sky-300">{live} in talks</span>}
      </div>
      {m.deals.length ? (
        <ul>
          {m.deals.map((d) => (
            <li key={d.dealId} className="flex items-center gap-2 border-t border-white/[0.04] px-3 py-1.5 text-sm">
              <Crest club={d.club} size={18} />
              <button className="min-w-0 flex-1 truncate text-left hover:text-flood-300" onClick={() => navigate({ screen: 'club', id: d.club.id })}>
                {d.club.name}
              </button>
              <span className="num text-[11px] text-mist-400">{formatUSD(d.fee)}</span>
              <DealStageBadge stage={d.stage} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-t border-white/[0.04] px-3 py-2 text-[12px] text-mist-400">No buyers approached yet.</div>
      )}
    </div>
  );
}
