import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { STRENGTH_FILL, alpha, ramp } from '../theme/color';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldTopo from 'world-atlas/countries-110m.json';
import type { CountrySummary, WorldSummary } from '../../engine/views';

const topo = worldTopo as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const LAND = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
// Antarctica only eats vertical space.
LAND.features = LAND.features.filter((f) => f.properties.name !== 'Antarctica');



interface Props {
  world: WorldSummary;
  width: number;
  height: number;
  /** Zoom to this country's map id. */
  focus?: string;
  highlight?: string;
  onSelect?: (c: CountrySummary) => void;
  onHover?: (c: CountrySummary | undefined) => void;
  cities?: { id: string; name: string; lat: number; lon: number; clubs: number; bestTier?: number }[];
  showCityLabels?: boolean;
  /** Your current location. */
  you?: { lat: number; lon: number };
  /** A journey to animate (flight arc). */
  arc?: { from: { lat: number; lon: number }; to: { lat: number; lon: number } };
  /** Zoom to frame these points (with generous padding), e.g. a journey. */
  fit?: { lat: number; lon: number }[];
  /** Markers for your own work (placements): coloured, sized, popping in one after another. */
  pins?: MapPin[];
  onPinHover?: (id: string | undefined) => void;
}

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  color: string;
  /** How many players: grows the pin. */
  count: number;
  /** Faded (nobody there any more). */
  faded?: boolean;
}

export function WorldMap({ world, width, height, focus, highlight, onSelect, onHover, cities, showCityLabels, you, arc, fit, pins, onPinHover }: Props) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string>();
  const byMapId = useMemo(() => {
    const m = new Map<string, CountrySummary[]>();
    for (const c of world.countries) m.set(c.mapId, [...(m.get(c.mapId) ?? []), c]);
    return m;
  }, [world]);

  const { path, projection } = useMemo(() => {
    const projection = geoNaturalEarth1();
    const target = fit?.length ? framePoints(fit) : focus ? LAND.features.find((f) => String((f as { id?: string }).id) === focus) : undefined;
    projection.fitExtent(
      [
        [12, 12],
        [width - 12, height - 12],
      ],
      (target ?? LAND) as GeoPermissibleObjects,
    );
    return { path: geoPath(projection), projection };
  }, [width, height, focus, fit && JSON.stringify(fit)]);

  const dots = cities ?? world.clubCities;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block select-none">
      <defs>
        <radialGradient id="map-glow" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="#0f2a22" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--color-night-950)" stopOpacity="0" />
        </radialGradient>
        <filter id="dot-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width={width} height={height} fill="url(#map-glow)" />
      <g>
        {LAND.features.map((f, i) => {
          const id = String((f as { id?: string }).id ?? i);
          const playable = byMapId.get(id);
          const strength = playable ? Math.max(...playable.map((c) => c.strength)) : 0;
          const isHover = hover === id || highlight === id;
          return (
            <path
              key={id + i}
              d={path(f) ?? undefined}
              fill={playable ? STRENGTH_FILL[strength] : 'var(--color-night-850)'}
              stroke={isHover ? 'var(--color-flood-400)' : playable ? alpha('var(--color-grass-400)', '33') : '#ffffff0d'}
              strokeWidth={isHover ? 1.4 : 0.5}
              className={playable && onSelect ? 'cursor-pointer transition-[fill] duration-200' : undefined}
              style={isHover && playable ? { fill: focus ? ramp(0.38) : 'var(--color-grass-300)', filter: `drop-shadow(0 0 10px ${alpha('var(--color-grass-400)', '73')})` } : undefined}
              onMouseEnter={() => {
                if (!playable) return;
                setHover(id);
                onHover?.(playable[0]);
              }}
              onMouseLeave={() => {
                setHover(undefined);
                onHover?.(undefined);
              }}
              onClick={() => playable && onSelect?.(playable[0]!)}
            />
          );
        })}
      </g>
      <g pointerEvents="none">
        {dots.map((c, i) => {
          const p = projection([c.lon, c.lat]);
          if (!p) return null;
          const elite = 'bestTier' in c && c.bestTier === 1;
          const r = focus ? 2.4 + Math.min(c.clubs, 4) * 0.9 : 1 + Math.min(c.clubs, 4) * 0.35;
          return (
            <g key={c.id}>
              {elite && !reduce && (
                <motion.circle
                  cx={p[0]}
                  cy={p[1]}
                  r={r}
                  fill="none"
                  stroke="var(--color-flood-400)"
                  strokeWidth={1}
                  initial={{ r, opacity: 0.8 }}
                  animate={{ r: r * 4.5, opacity: 0 }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: (i % 7) * 0.3 }}
                />
              )}
              <circle
                cx={p[0]}
                cy={p[1]}
                r={r}
                fill={c.clubs ? (elite ? 'var(--color-flood-400)' : 'var(--color-mist-100)') : 'var(--color-mist-400)'}
                opacity={c.clubs ? 0.9 : 0.4}
                filter="url(#dot-glow)"
              />
              {showCityLabels && c.clubs > 0 && (
                <text
                  x={p[0] + r + 3}
                  y={p[1] + 3}
                  fontSize={10}
                  fill="var(--color-mist-300)"
                  fontFamily="Inter Variable"
                  style={{ paintOrder: 'stroke' }}
                  stroke="var(--color-night-950)"
                  strokeWidth={3}
                >
                  {c.name}
                </text>
              )}
            </g>
          );
        })}
      </g>
      {pins && (
        <g>
          {pins.map((pin, i) => {
            const p = projection([pin.lon, pin.lat]);
            if (!p) return null;
            const r = 4.5 + Math.min(pin.count, 6) * 1.2;
            return (
              <motion.g
                key={pin.id}
                transform={`translate(${p[0]},${p[1]})`}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 40) * 0.05 }}
                onMouseEnter={() => onPinHover?.(pin.id)}
                onMouseLeave={() => onPinHover?.(undefined)}
                className="cursor-pointer"
              >
                <motion.circle
                  r={r}
                  fill={pin.color}
                  fillOpacity={pin.faded ? 0.25 : 0.9}
                  stroke="var(--color-night-950)"
                  strokeWidth={1.5}
                  filter={pin.faded ? undefined : 'url(#dot-glow)'}
                  initial={reduce ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: Math.min(i, 40) * 0.05, type: 'spring', stiffness: 260, damping: 14 }}
                />
                {pin.count > 1 && (
                  <text textAnchor="middle" y={3.5} fontSize={9} fontWeight={700} fill="var(--color-night-950)" pointerEvents="none">
                    {pin.count}
                  </text>
                )}
              </motion.g>
            );
          })}
        </g>
      )}
      {arc && <FlightArc projection={projection} from={arc.from} to={arc.to} />}
      {you && <YouMarker projection={projection} at={you} />}
    </svg>
  );
}

type Projection = ReturnType<typeof geoNaturalEarth1>;

/** Curved great-circle-ish arc, drawn on, with a dot travelling along it. */
function FlightArc({ projection, from, to }: { projection: Projection; from: { lat: number; lon: number }; to: { lat: number; lon: number } }) {
  const reduce = useReducedMotion();
  const a = projection([from.lon, from.lat]);
  const b = projection([to.lon, to.lat]);
  if (!a || !b) return null;
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const c: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - Math.max(20, dist * 0.35)];
  const d = `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}`;
  return (
    <g pointerEvents="none">
      <path d={d} fill="none" stroke="var(--color-flood-400)" strokeOpacity={0.18} strokeWidth={6} />
      <motion.path
        d={d}
        fill="none"
        stroke="var(--color-flood-400)"
        strokeWidth={2}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: [0.45, 0, 0.2, 1] }}
        style={{ filter: `drop-shadow(0 0 6px ${alpha('var(--color-flood-400)', 'cc')})` }}
      />
      <circle cx={a[0]} cy={a[1]} r={4} fill="var(--color-mist-100)" />
      <motion.circle
        cx={b[0]}
        cy={b[1]}
        fill="none"
        stroke="var(--color-grass-400)"
        strokeWidth={2}
        initial={{ r: 2, opacity: 0 }}
        animate={{ r: [2, 18], opacity: [0, 1, 0] }}
        transition={{ delay: 1.2, duration: 1.2, repeat: reduce ? 0 : Infinity }}
      />
      <motion.circle cx={b[0]} cy={b[1]} r={5} fill="var(--color-grass-400)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.3, type: 'spring' }} />
    </g>
  );
}

function YouMarker({ projection, at }: { projection: Projection; at: { lat: number; lon: number } }) {
  const reduce = useReducedMotion();
  const p = projection([at.lon, at.lat]);
  if (!p) return null;
  return (
    <g pointerEvents="none" transform={`translate(${p[0]},${p[1]})`}>
      <motion.circle
        r={6}
        fill="none"
        stroke="var(--color-grass-400)"
        strokeWidth={1.5}
        animate={reduce ? { r: 6, opacity: 0.9 } : { r: [6, 16], opacity: [0.9, 0] }}
        transition={{ duration: 1.8, repeat: reduce ? 0 : Infinity }}
      />
      <path d="M0,-14 C5,-14 8,-10 8,-6 C8,-1 0,6 0,6 C0,6 -8,-1 -8,-6 C-8,-10 -5,-14 0,-14 Z" fill="var(--color-grass-400)" stroke="var(--color-night-950)" strokeWidth={1.5} />
      <circle cy={-6} r={2.5} fill="var(--color-night-950)" />
    </g>
  );
}

/** A padded bounding box around points, as a GeoJSON polygon the projection can fit. */
function framePoints(points: { lat: number; lon: number }[]): GeoPermissibleObjects {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const pad = Math.max(6, (Math.max(...lats) - Math.min(...lats) + Math.max(...lons) - Math.min(...lons)) * 0.35);
  const s = Math.max(-80, Math.min(...lats) - pad),
    n = Math.min(80, Math.max(...lats) + pad);
  const w = Math.max(-179, Math.min(...lons) - pad),
    e = Math.min(179, Math.max(...lons) + pad);
  return {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [w, n],
        [e, n],
        [e, s],
        [w, s],
      ],
    ],
  } as GeoPermissibleObjects;
}
