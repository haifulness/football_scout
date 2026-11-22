import { useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { CountryId } from '../../engine/core/ids';
import { formatUSD } from '../../engine/core/money';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Money, Panel } from './ui';

/** Pay to get your name around one market, at the price of more eyes on your mistakes. */
export function CampaignPanel() {
  const v = useEngineQuery(() => engine.getCampaign(), []);
  const { careerAction } = useGame();
  const [country, setCountry] = useState<CountryId>();
  const [weeks, setWeeks] = useState(6);
  const [error, setError] = useState<string>();
  if (!v || v.blocked) return null;
  const pick = v.markets.find((m) => m.id === country) ?? v.markets[0];
  const act = (fn: () => Promise<unknown>) => {
    setError(undefined);
    return careerAction(fn).catch((e) => setError(e instanceof Error ? e.message : 'That did not work.'));
  };
  const a = v.active;
  return (
    <Panel
      title="Profile campaign"
      right={a ? <span className="text-[11px] font-semibold text-flood-300">In the spotlight</span> : <span className="text-[11px] text-mist-400">Raise your profile in one market</span>}
    >
      <div className="flex flex-col gap-3 p-4 text-sm">
        {a ? (
          <>
            <div>
              Running in <span className="font-semibold">{a.country.name}</span> until {formatDate(a.endsOn)} ({a.weeksLeft} week{a.weeksLeft === 1 ? '' : 's'} left),{' '}
              {formatUSD(a.weeklyCost)} a week. Spent <Money value={a.spent} /> so far, {a.invites} club invitation{a.invites === 1 ? '' : 's'}.
            </div>
            <p className="text-[12px] text-mist-400">
              Clubs there may invite you to scout for them, your clients ask for briefs {v.boostPct}% more often, and players ask your advice more often. While
              it runs, a failed brief or an offer you ignore costs you {v.spotlight}× the usual standing.
            </p>
            <div>
              <button className="btn-ghost text-xs" onClick={() => void act(() => engine.stopCampaign())}>
                Stop the campaign
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[12px] text-mist-400">
              Adverts, interviews, a word in the right ears. Clubs in the market may invite you to scout for them (even ones that have never met you), your
              clients ask for briefs {v.boostPct}% more often, and players ask your advice more often. But you're in the spotlight: a failed brief or an offer
              you ignore costs you {v.spotlight}× the usual standing.
            </p>
            {v.last && (
              <p className="text-[12px] text-mist-400">
                Last campaign: {v.last.country.name}, ended {formatDate(v.last.endedOn!)}. Cost {formatUSD(v.last.spent)}, {v.last.invites} invitation
                {v.last.invites === 1 ? '' : 's'}.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] text-mist-400">
                Market
                <select
                  value={pick?.id}
                  onChange={(e) => setCountry(e.target.value as CountryId)}
                  className="rounded-lg border border-white/10 bg-night-950/70 px-3 py-2 text-sm text-mist-100 outline-none focus:border-grass-400/60"
                >
                  {v.markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.home ? ' (home)' : ''} · {formatUSD(m.weeklyCost)}/wk
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-mist-400">
                {weeks} weeks
                <input type="range" min={v.weeks[0]} max={v.weeks[1]} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-40" />
              </label>
              {pick && (
                <button className="btn-primary text-xs" onClick={() => void act(() => engine.startCampaign(pick.id, weeks))}>
                  Run it: {formatUSD(pick.weeklyCost * weeks)} in all
                </button>
              )}
            </div>
          </>
        )}
        {error && <div className="text-sm text-alert-400">{error}</div>}
      </div>
    </Panel>
  );
}
