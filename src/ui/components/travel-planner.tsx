import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { formatUSD } from '../../engine/core/money';
import type { TravelQuoteView } from '../../engine/views';
import { WorldMap } from '../visuals/world-map';
import { engine } from '../store/engine-client';
import { useGame } from '../store/game-store';
import { useSize } from './use-size';

const BAND_LABEL = {
  here: 'You are here',
  region: 'Short drive',
  country: 'Domestic trip',
  continent: 'Flight',
  intercontinental: 'Long-haul flight',
} as const;

/** Trip confirmation with a route map; plays the flight while the journey happens. */
export function TravelPlanner() {
  const { travelTarget, closeTravel, travel, world, advancing } = useGame();
  const [quote, setQuote] = useState<TravelQuoteView>();
  const [phase, setPhase] = useState<'confirm' | 'flying'>('confirm');
  const [error, setError] = useState<string>();
  const [mapRef, size] = useSize<HTMLDivElement>();

  useEffect(() => {
    setQuote(undefined);
    setError(undefined);
    setPhase('confirm');
    if (travelTarget) engine.quoteTravel(travelTarget).then(setQuote, (e) => setError(String(e?.message ?? e)));
  }, [travelTarget]);

  const go = async () => {
    if (!travelTarget) return;
    setPhase('flying');
    setError(undefined);
    try {
      await Promise.all([travel(travelTarget), new Promise((r) => setTimeout(r, 1700))]);
      closeTravel();
    } catch (e) {
      setPhase('confirm');
      setError(e instanceof Error ? e.message : 'The trip could not be booked.');
    }
  };

  return (
    <AnimatePresence>
      {travelTarget && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-night-950/80 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => phase === 'confirm' && closeTravel()}
        >
          <motion.div
            className="panel w-full max-w-3xl overflow-hidden"
            initial={{ y: 24, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div ref={mapRef} className="relative h-[300px] bg-night-950/60">
              {world && size.width > 0 && quote && (
                <WorldMap
                  world={world}
                  width={size.width}
                  height={size.height}
                  cities={[]}
                  fit={[quote.from, quote.to]}
                  arc={phase === 'flying' ? { from: quote.from, to: quote.to } : undefined}
                  you={phase === 'confirm' ? quote.from : undefined}
                />
              )}
              <div className="absolute left-4 top-3 panel-title text-flood-400">{quote ? BAND_LABEL[quote.band] : 'Planning trip'}</div>
            </div>
            <div className="flex flex-wrap items-end gap-6 p-5">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-mist-400">{quote ? `${quote.from.name} →` : '…'}</div>
                <div className="font-display text-4xl font-bold uppercase leading-none">{quote?.to.name ?? '…'}</div>
                <div className="text-sm text-mist-300">{quote?.to.countryName}</div>
              </div>
              {quote && quote.band !== 'here' && (
                <div className="flex gap-5 text-right">
                  <Stat label="Fare" value={formatUSD(quote.cost)} warn={!quote.affordable} />
                  <Stat label="Journey" value={`${quote.days}d`} />
                  <Stat label="Hotel / night" value={quote.nightly ? formatUSD(quote.nightly) : 'Home'} />
                  <Stat label="Distance" value={`${quote.distanceKm.toLocaleString('en-US')} km`} />
                </div>
              )}
            </div>
            {error && <div className="mx-5 mb-3 rounded-lg border border-alert-500/40 bg-alert-500/10 px-3 py-2 text-sm text-alert-400">{error}</div>}
            <div className="flex justify-end gap-2 border-t border-white/[0.05] bg-black/20 px-5 py-3">
              <button className="btn-ghost" onClick={closeTravel} disabled={phase === 'flying'}>
                Cancel
              </button>
              <button
                className="btn-primary min-w-40"
                onClick={() => void go()}
                disabled={!quote || quote.band === 'here' || !quote.affordable || advancing || phase === 'flying'}
              >
                {phase === 'flying' ? 'Travelling…' : quote && !quote.affordable ? 'Not enough money' : 'Book trip'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const Stat = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wider text-mist-400">{label}</div>
    <div className={`num text-xl font-bold ${warn ? 'text-alert-400' : ''}`}>{value}</div>
  </div>
);
