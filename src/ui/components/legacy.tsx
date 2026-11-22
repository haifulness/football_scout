import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { formatDate } from '../../engine/core/calendar';
import type { LegacyView, PlacementForm } from '../../engine/views';
import { engine } from '../store/engine-client';
import { useEngineQuery, useGame } from '../store/game-store';
import { Crest } from '../visuals/crest';
import { WorldMap, type MapPin } from '../visuals/world-map';
import { Panel } from './ui';
import { useSize } from './use-size';

export const FORM_STYLE: Record<PlacementForm, { color: string; label: string }> = {
  star: { color: 'var(--color-flood-400)', label: 'Starring' },
  good: { color: 'var(--color-good-400)', label: 'Doing well' },
  ok: { color: 'var(--color-sky-400)', label: 'Holding his own' },
  poor: { color: 'var(--color-alert-400)', label: 'Struggling' },
  bench: { color: '#94a3b8', label: 'Barely playing' },
  gone: { color: '#64748b', label: 'Moved on' },
};

const ROLE_LABEL = { employer: 'Employer', client: 'Client', placed: 'Placed', missions: 'Missions' } as const;

/** Your career on the map and on the wall: where your players went, and every club you've worked with. */
export function Legacy() {
  const v = useEngineQuery(() => engine.getLegacy(), []);
  if (!v) return null;
  return (
    <>
      <WorkMap v={v} />
      <ClubWall v={v} />
    </>
  );
}

function WorkMap({ v }: { v: LegacyView }) {
  const world = useGame((s) => s.world);
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<string>();
  const pins: MapPin[] = useMemo(
    () => v.pins.map((p) => ({ id: p.cityId, lat: p.lat, lon: p.lon, color: FORM_STYLE[p.form].color, count: p.players.length, faded: p.form === 'gone' })),
    [v],
  );
  const shown = v.pins.find((p) => p.cityId === hover);
  return (
    <section className="panel relative overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="panel-title">Your work around the world</div>
        <span className="text-[12px] text-mist-400">
          {v.placements} placement{v.placements === 1 ? '' : 's'} in {v.countries} countr{v.countries === 1 ? 'y' : 'ies'}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-mist-400">
          {(Object.keys(FORM_STYLE) as PlacementForm[]).map((f) => (
            <span key={f} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: FORM_STYLE[f].color, opacity: f === 'gone' ? 0.4 : 1 }} />
              {FORM_STYLE[f].label}
            </span>
          ))}
        </span>
      </div>
      <div ref={ref} className="relative h-[380px]">
        {world && size.width > 0 && (
          <WorldMap world={world} width={size.width} height={size.height} cities={[]} pins={pins} onPinHover={setHover} />
        )}
        {!v.pins.length && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-mist-400">
            Every player you place gets a pin here, coloured by how he's doing.
          </div>
        )}
        <AnimatePresence>
          {shown && (
            <motion.div
              key={shown.cityId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="panel pointer-events-none absolute right-4 top-4 w-72 p-3"
            >
              <div className="font-semibold">
                {shown.cityName}, {shown.countryName}
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {shown.players.map((p) => (
                  <li key={p.playerId + p.signedOn} className="flex items-center gap-2 text-[12px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FORM_STYLE[p.form].color }} />
                    <span className="truncate font-semibold">{p.name}</span>
                    <Crest club={p.club} size={14} />
                    <span className="ml-auto shrink-0 text-mist-400">
                      {p.form === 'gone' ? `signed ${formatDate(p.signedOn)}` : p.avg !== undefined ? `${p.apps} apps · ${p.avg.toFixed(2)}` : FORM_STYLE[p.form].label}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function ClubWall({ v }: { v: LegacyView }) {
  const navigate = useGame((s) => s.navigate);
  const reduce = useReducedMotion();
  return (
    <Panel title="Club wall" right={<span className="text-[12px] text-mist-400">{v.wall.length} clubs you've worked with or placed players at</span>}>
      {v.wall.length ? (
        <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {v.wall.map((w, i) => (
            <motion.li
              key={w.club.id}
              initial={reduce ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i, 30) * 0.03 }}
              whileHover={reduce ? undefined : { y: -3 }}
            >
              <button
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center hover:border-white/15"
                onClick={() => navigate({ screen: 'club', id: w.club.id })}
                title={`${w.club.name}, ${w.cityName} (${w.countryName})`}
              >
                <div className="relative">
                  <Crest club={w.club} size={52} />
                  {w.placements > 0 && (
                    <span className="num absolute -right-2 -top-1 rounded-full bg-grass-400 px-1.5 text-[10px] font-bold text-night-950">{w.placements}</span>
                  )}
                </div>
                <span className="line-clamp-2 text-[12px] font-semibold leading-tight">{w.club.name}</span>
                <span className="text-[10px] text-mist-400">{w.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</span>
              </button>
            </motion.li>
          ))}
        </ul>
      ) : (
        <div className="p-6 text-center text-sm text-mist-400">Clubs you work for and place players at hang their crest here.</div>
      )}
    </Panel>
  );
}
