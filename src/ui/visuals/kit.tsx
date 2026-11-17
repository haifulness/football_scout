import { useId } from 'react';
import type { ClubBadge } from '../../engine/views';
import { luminance } from './crest';

const SHIRT = 'M30 8 L16 14 L3 32 L16 44 L24 38 V94 H76 V38 L84 44 L97 32 L84 14 L70 8 C66 16 58 21 50 21 C42 21 34 16 30 8 Z';

/** Shirt in club colours. Used as player tokens on the formation pitch. */
export function Kit({
  club,
  size = 36,
  number,
  keeper,
}: {
  club: Pick<ClubBadge, 'colors' | 'kit'>;
  size?: number;
  number?: number | string;
  keeper?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const primary = keeper ? '#1f2937' : club.colors.primary;
  const secondary = keeper ? '#f5b301' : club.colors.secondary;
  const pattern = keeper ? 'band' : club.kit.pattern;
  const text = luminance(primary) > 0.6 ? '#0a1014' : '#ffffff';
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <defs>
        <clipPath id={`k${id}`}>
          <path d={SHIRT} />
        </clipPath>
        <linearGradient id={`s${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.65" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#k${id})`}>
        <rect width={100} height={100} fill={primary} />
        {pattern === 'stripes' && [0, 1, 2, 3].map((i) => <rect key={i} x={18 + i * 18} y={0} width={9} height={100} fill={secondary} />)}
        {pattern === 'pinstripes' &&
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={14 + i * 10} y={0} width={2} height={100} fill={secondary} opacity={0.8} />)}
        {pattern === 'hoops' && [0, 1, 2, 3].map((i) => <rect key={i} x={0} y={26 + i * 18} width={100} height={9} fill={secondary} />)}
        {pattern === 'halves' && <rect x={50} y={0} width={50} height={100} fill={secondary} />}
        {pattern === 'sash' && <path d="M10 10 L30 0 L100 80 L90 100 Z" fill={secondary} />}
        {pattern === 'band' && <rect x={0} y={44} width={100} height={12} fill={secondary} />}
        {/* sleeves trim */}
        <path d="M3 32 L16 44 L19 41 L6 29 Z M97 32 L84 44 L81 41 L94 29 Z" fill={secondary} opacity={0.9} />
        <rect width={100} height={100} fill={`url(#s${id})`} />
      </g>
      <path d="M38 12 C42 18 46 20 50 20 C54 20 58 18 62 12" fill="none" stroke={secondary} strokeWidth={4} />
      <path d={SHIRT} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={2} />
      {number !== undefined && (
        <text
          x={50}
          y={68}
          textAnchor="middle"
          fontFamily="Barlow Condensed"
          fontWeight={700}
          fontSize={34}
          fill={text}
          stroke={text === '#ffffff' ? '#000' : '#fff'}
          strokeOpacity={0.25}
          strokeWidth={1}
        >
          {number}
        </text>
      )}
    </svg>
  );
}
