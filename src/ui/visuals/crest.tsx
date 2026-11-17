import { useId } from 'react';
import type { ClubBadge } from '../../engine/views';
import type { CrestPattern, CrestShape } from '../../engine/model/club';

const SHAPES: Record<CrestShape, string> = {
  shield: 'M50 4 L92 14 V58 C92 88 72 106 50 116 C28 106 8 88 8 58 V14 Z',
  heater: 'M8 8 H92 V52 C92 84 70 104 50 114 C30 104 8 84 8 52 Z',
  round: 'M50 12 A48 48 0 1 1 49.99 12 Z',
  diamond: 'M50 4 L94 60 L50 116 L6 60 Z',
  badge: 'M30 6 H70 L94 30 V90 L70 114 H30 L6 90 V30 Z',
};

function Pattern({ pattern, b }: { pattern: CrestPattern; b: string }) {
  switch (pattern) {
    case 'stripes':
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={10 + i * 20} y={0} width={10} height={120} fill={b} />
          ))}
        </>
      );
    case 'halves':
      return <rect x={50} y={0} width={50} height={120} fill={b} />;
    case 'hoops':
      return (
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={0} y={8 + i * 20} width={100} height={10} fill={b} />
          ))}
        </>
      );
    case 'sash':
      return <path d="M-10 30 L30 -10 L110 90 L70 130 Z" fill={b} />;
    case 'chevron':
      return <path d="M0 40 L50 80 L100 40 V62 L50 102 L0 62 Z" fill={b} />;
    case 'quarters':
      return (
        <>
          <rect x={50} y={0} width={50} height={60} fill={b} />
          <rect x={0} y={60} width={50} height={60} fill={b} />
        </>
      );
    case 'cross':
      return (
        <>
          <rect x={40} y={0} width={20} height={120} fill={b} />
          <rect x={0} y={48} width={100} height={20} fill={b} />
        </>
      );
    default:
      return null;
  }
}

function Emblem({ kind, fill, stroke }: { kind: ClubBadge['crest']['emblem']; fill: string; stroke: string }) {
  const common = { fill, stroke, strokeWidth: 2, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'ball':
      return (
        <g>
          <circle cx={50} cy={64} r={17} {...common} />
          <path d="M50 54 L58 60 L55 70 H45 L42 60 Z" fill={stroke} />
          <path d="M50 47 V54 M58 60 L66 57 M55 70 L60 78 M45 70 L40 78 M42 60 L34 57" stroke={stroke} strokeWidth={1.6} />
        </g>
      );
    case 'star':
      return <path d="M50 44 L56 58 L71 59 L59 69 L63 84 L50 76 L37 84 L41 69 L29 59 L44 58 Z" {...common} />;
    case 'crown':
      return <path d="M30 76 L28 52 L40 62 L50 46 L60 62 L72 52 L70 76 Z M30 80 H70 V86 H30 Z" {...common} />;
    case 'castle':
      return <path d="M32 84 V58 H38 V52 H44 V58 H47 V50 H53 V58 H56 V52 H62 V58 H68 V84 H56 V74 A6 6 0 0 0 44 74 V84 Z" {...common} />;
    case 'eagle':
      return (
        <path
          d="M50 52 C46 52 44 56 44 60 L26 54 L34 64 L28 66 L40 70 L44 78 L50 86 L56 78 L60 70 L72 66 L66 64 L74 54 L56 60 C56 56 54 52 50 52 Z"
          {...common}
        />
      );
    case 'lion':
      return (
        <g>
          <path
            d="M50 46 L56 50 L63 49 L64 56 L70 60 L66 66 L68 73 L61 75 L58 82 L50 80 L42 82 L39 75 L32 73 L34 66 L30 60 L36 56 L37 49 L44 50 Z"
            {...common}
          />
          <circle cx={50} cy={64} r={9} fill={stroke} />
          <circle cx={46.5} cy={62} r={1.4} fill={fill} />
          <circle cx={53.5} cy={62} r={1.4} fill={fill} />
        </g>
      );
    default:
      return null;
  }
}

/** Club crest: a pure function of the club's colours and crest spec. */
export function Crest({ club, size = 40, className }: { club: Pick<ClubBadge, 'colors' | 'crest' | 'shortName'>; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const { primary, secondary, accent } = club.colors;
  const { shape, pattern, emblem } = club.crest;
  const path = SHAPES[shape];
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} className={className} aria-hidden>
      <defs>
        <clipPath id={`c${id}`}>
          <path d={path} />
        </clipPath>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width={100} height={120} fill={primary} />
        <Pattern pattern={pattern} b={secondary} />
        {emblem !== 'none' && <circle cx={50} cy={64} r={24} fill={primary} stroke={accent} strokeWidth={2} opacity={0.95} />}
        <Emblem kind={emblem} fill={accent === primary ? secondary : accent} stroke={darken(primary)} />
        <rect x={0} y={14} width={100} height={20} fill="#000" opacity={0.35} />
        <text x={50} y={29} textAnchor="middle" fontFamily="Barlow Condensed" fontWeight={700} fontSize={15} letterSpacing={2} fill="#fff">
          {club.shortName}
        </text>
        <rect width={100} height={120} fill={`url(#g${id})`} />
      </g>
      <path d={path} fill="none" stroke={secondary === '#ffffff' ? accent : '#ffffff'} strokeOpacity={0.9} strokeWidth={4} />
      <path d={path} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={1} />
    </svg>
  );
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function darken(hex: string, amount = 0.55): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) =>
    Math.round(v * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
