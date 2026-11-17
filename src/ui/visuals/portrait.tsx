import { memo, useId } from 'react';
import { Rng } from '../../engine/core/rng';

const SKIN = ['#f5d6c3', '#ecc4a7', '#dcab88', '#c8925f', '#ab7448', '#8d5b38', '#6c4228', '#4b2d1c'];
const HAIR = { black: '#141110', darkBrown: '#2e1d14', brown: '#5a3a24', lightBrown: '#8a6040', blonde: '#c9a35f', red: '#9a4a24', grey: '#9c9a96' };
type HairColor = keyof typeof HAIR;
type HairStyle = 'buzz' | 'short' | 'sidePart' | 'quiff' | 'curly' | 'afro' | 'twists' | 'long' | 'bun' | 'bald';

interface Look {
  skin: number[];
  hair: Partial<Record<HairColor, number>>;
  styles: Partial<Record<HairStyle, number>>;
}

/** Population-level appearance tendencies per name culture; every look stays possible everywhere. */
const LOOKS: Record<string, Look> = {
  european: {
    skin: [3, 4, 3, 1, 0.5, 0.4, 0.3, 0.2],
    hair: { brown: 4, darkBrown: 4, lightBrown: 2, blonde: 2, black: 1.5, red: 0.4 },
    styles: { short: 4, sidePart: 3, quiff: 3, buzz: 2, curly: 1, long: 0.8, bun: 0.6, bald: 0.4, afro: 0.3 },
  },
  latin: {
    skin: [1, 2, 3, 3, 2, 1, 0.6, 0.4],
    hair: { black: 4, darkBrown: 4, brown: 2, lightBrown: 0.5, blonde: 0.3 },
    styles: { short: 4, quiff: 3, curly: 2, sidePart: 2, buzz: 2, long: 1, bun: 1, afro: 0.6, twists: 0.4, bald: 0.3 },
  },
  african: { skin: [0, 0.05, 0.1, 0.3, 0.8, 2, 3, 3], hair: { black: 8, darkBrown: 2 }, styles: { buzz: 4, afro: 2, twists: 2, short: 2, curly: 2, bald: 1 } },
  mena: {
    skin: [0.4, 1.5, 3, 3, 1.5, 0.6, 0.3, 0.2],
    hair: { black: 6, darkBrown: 4, brown: 1 },
    styles: { short: 4, quiff: 3, curly: 2, buzz: 2, sidePart: 2, bald: 0.5 },
  },
  eastAsian: {
    skin: [2, 4, 3, 1, 0.3, 0, 0, 0],
    hair: { black: 8, darkBrown: 3, brown: 0.6 },
    styles: { short: 4, sidePart: 3, quiff: 2, buzz: 2, long: 0.6 },
  },
  mixed: {
    skin: [2, 2.5, 2.5, 2, 1.5, 1.2, 1, 0.8],
    hair: { black: 4, darkBrown: 4, brown: 3, lightBrown: 1, blonde: 1 },
    styles: { short: 4, buzz: 3, quiff: 2, sidePart: 2, curly: 2, afro: 1, twists: 1 },
  },
};

const CULTURE_LOOK: Record<string, keyof typeof LOOKS> = {
  english: 'mixed',
  spanish: 'latin',
  portuguese: 'latin',
  german: 'european',
  italian: 'european',
  french: 'mixed',
  dutch: 'mixed',
  turkish: 'mena',
  nordic: 'european',
  slavic_south: 'european',
  slavic_west: 'european',
  greek: 'european',
  arabic: 'mena',
  japanese: 'eastAsian',
  korean: 'eastAsian',
  chinese: 'eastAsian',
  african_en: 'african',
  african_fr: 'african',
};

function weightedKey<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K {
  const keys = Object.keys(weights) as K[];
  return rng.weighted(keys, (k) => weights[k] ?? 0);
}

interface Props {
  seed: number;
  culture?: string;
  size?: number;
  shirt?: string;
  trim?: string;
  age?: number;
  className?: string;
}

/** Deterministic head-and-shoulders portrait: the same seed always draws the same person. */
export const Portrait = memo(function Portrait({ seed, culture = 'english', size = 64, shirt = '#24363f', trim = '#ffffff', age = 25, className }: Props) {
  const uid = useId().replace(/:/g, '');
  const rng = new Rng(seed);
  const look = LOOKS[CULTURE_LOOK[culture] ?? 'mixed']!;
  const skinIdx = rng.weighted(
    SKIN.map((_, i) => i),
    (i) => look.skin[i] ?? 0,
  );
  const skin = SKIN[skinIdx]!;
  const skinShade = shade(skin, -0.18);
  let hairColor = HAIR[weightedKey(rng, look.hair)];
  if (age >= 38 && rng.chance(0.6)) hairColor = HAIR.grey;
  const style: HairStyle = age >= 50 && rng.chance(0.35) ? 'bald' : weightedKey(rng, look.styles);

  const jaw = rng.float(0, 1); // 0 narrow – 1 broad
  const faceW = 30 + jaw * 6;
  const faceTop = 26 + rng.float(-1.5, 1.5);
  const chinY = 74 + rng.float(-2, 2);
  const eyeY = 51 + rng.float(-1.5, 1.5);
  const eyeGap = 10 + rng.float(-1, 1.2);
  const browTilt = rng.float(-1.5, 1.5);
  const browThick = rng.float(1.6, 3);
  const noseLen = rng.float(7, 11);
  const noseW = rng.float(3.5, 6) + (skinIdx >= 5 ? 1 : 0);
  const mouthW = rng.float(7, 10);
  const lip = rng.float(0, 1);
  const beard = age >= 19 ? weightedKey(rng, { none: 5, stubble: 3, full: 1.4, goatee: 1, moustache: 0.4 }) : 'none';
  const eyeColor = skinIdx <= 1 && rng.chance(0.4) ? (rng.chance(0.5) ? '#4a6a8a' : '#5f7a4a') : '#2b1b12';

  const L = 50 - faceW / 2;
  const R = 50 + faceW / 2;
  const face = `M${L} ${faceTop + 18} C${L} ${faceTop} ${R} ${faceTop} ${R} ${faceTop + 18} L${R - 1} ${eyeY + 8} C${R - 2} ${chinY - 8} ${50 + 6 + jaw * 3} ${chinY} 50 ${chinY} C${50 - 6 - jaw * 3} ${chinY} ${L + 2} ${chinY - 8} ${L + 1} ${eyeY + 8} Z`;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="30%" r="80%">
          <stop offset="0" stopColor={shade(shirt, 0.15)} stopOpacity="0.55" />
          <stop offset="1" stopColor="#05080a" stopOpacity="1" />
        </radialGradient>
        <radialGradient id={`face${uid}`} cx="42%" cy="40%" r="65%">
          <stop offset="0" stopColor={shade(skin, 0.08)} />
          <stop offset="0.7" stopColor={skin} />
          <stop offset="1" stopColor={skinShade} />
        </radialGradient>
        <linearGradient id={`shirt${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={shade(shirt, 0.12)} />
          <stop offset="1" stopColor={shade(shirt, -0.35)} />
        </linearGradient>
        <clipPath id={`clip${uid}`}>
          <rect width="100" height="100" rx="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip${uid})`}>
        <rect width="100" height="100" fill={`url(#bg${uid})`} />
        {/* shoulders & shirt */}
        <path d={`M8 100 C10 84 24 80 38 78 L62 78 C76 80 90 84 92 100 Z`} fill={`url(#shirt${uid})`} />
        <path d="M40 78 L50 90 L60 78" fill="none" stroke={trim} strokeWidth={2.5} strokeLinejoin="round" />
        {/* neck */}
        <path d={`M42 ${chinY - 6} L42 80 C46 84 54 84 58 80 L58 ${chinY - 6} Z`} fill={skinShade} />
        {/* back hair (long styles) */}
        {style === 'long' && (
          <path
            d={`M${L - 4} ${faceTop + 16} C${L - 6} ${faceTop - 6} ${R + 6} ${faceTop - 6} ${R + 4} ${faceTop + 16} L${R + 3} ${eyeY + 22} L${L - 3} ${eyeY + 22} Z`}
            fill={hairColor}
          />
        )}
        {style === 'afro' && <ellipse cx={50} cy={faceTop + 6} rx={faceW / 2 + 9} ry={20} fill={hairColor} />}
        {/* ears */}
        <ellipse cx={L} cy={eyeY + 4} rx={3.6} ry={6} fill={skinShade} />
        <ellipse cx={R} cy={eyeY + 4} rx={3.6} ry={6} fill={skinShade} />
        {/* face */}
        <path d={face} fill={`url(#face${uid})`} />
        {/* beard */}
        {beard === 'stubble' && (
          <path
            d={`M${L + 2} ${eyeY + 10} C${L + 4} ${chinY - 4} ${R - 4} ${chinY - 4} ${R - 2} ${eyeY + 10} C${R - 3} ${chinY} 50 ${chinY + 1} 50 ${chinY + 1} C50 ${chinY + 1} ${L + 3} ${chinY} ${L + 2} ${eyeY + 10} Z`}
            fill={hairColor}
            opacity={0.22}
          />
        )}
        {beard === 'full' && (
          <path
            d={`M${L + 1} ${eyeY + 7} C${L + 3} ${chinY + 2} ${R - 3} ${chinY + 2} ${R - 1} ${eyeY + 7} L${R - 4} ${eyeY + 12} C${R - 8} ${eyeY + 20} ${L + 8} ${eyeY + 20} ${L + 4} ${eyeY + 12} Z`}
            fill={hairColor}
            opacity={0.92}
          />
        )}
        {beard === 'goatee' && (
          <path
            d={`M44 ${chinY - 8} C44 ${chinY + 1} 56 ${chinY + 1} 56 ${chinY - 8} C54 ${chinY - 5} 46 ${chinY - 5} 44 ${chinY - 8} Z`}
            fill={hairColor}
            opacity={0.9}
          />
        )}
        {(beard === 'moustache' || beard === 'goatee' || beard === 'full') && (
          <path
            d={`M${50 - mouthW / 2 - 1} ${eyeY + noseLen + 5} C47 ${eyeY + noseLen + 2.5} 53 ${eyeY + noseLen + 2.5} ${50 + mouthW / 2 + 1} ${eyeY + noseLen + 5}`}
            stroke={hairColor}
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
          />
        )}
        {/* eyes */}
        {[-1, 1].map((side) => (
          <g key={side}>
            <ellipse cx={50 + ((side * eyeGap) / 2) * 1.05} cy={eyeY} rx={3.6} ry={1.9} fill="#f4efe9" />
            <circle cx={50 + ((side * eyeGap) / 2) * 1.05} cy={eyeY} r={1.6} fill={eyeColor} />
            <circle cx={50 + ((side * eyeGap) / 2) * 1.05 - 0.5} cy={eyeY - 0.5} r={0.45} fill="#fff" />
            <path
              d={`M${50 + ((side * eyeGap) / 2) * 1.05 - 4} ${eyeY - 0.6} Q${50 + ((side * eyeGap) / 2) * 1.05} ${eyeY - 3.4} ${50 + ((side * eyeGap) / 2) * 1.05 + 4} ${eyeY - 0.6}`}
              stroke={shade(skin, -0.45)}
              strokeWidth={0.9}
              fill="none"
            />
            <path
              d={`M${50 + side * (eyeGap / 2 - 3.5)} ${eyeY - 5 + (side > 0 ? browTilt : -browTilt) * 0.3} Q${50 + (side * eyeGap) / 2} ${eyeY - 7.2} ${50 + side * (eyeGap / 2 + 4.5)} ${eyeY - 5.2 + (side > 0 ? -browTilt : browTilt) * 0.3}`}
              stroke={hairColor === HAIR.grey ? '#6b6560' : hairColor}
              strokeWidth={browThick}
              strokeLinecap="round"
              fill="none"
            />
          </g>
        ))}
        {/* nose */}
        <path
          d={`M49 ${eyeY + 2} L${48.4 - noseW * 0.1} ${eyeY + noseLen} Q50 ${eyeY + noseLen + 2} ${51.6 + noseW * 0.1} ${eyeY + noseLen}`}
          stroke={shade(skin, -0.3)}
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx={50 - noseW / 2 + 0.6} cy={eyeY + noseLen + 0.4} rx={1} ry={0.6} fill={shade(skin, -0.45)} />
        <ellipse cx={50 + noseW / 2 - 0.6} cy={eyeY + noseLen + 0.4} rx={1} ry={0.6} fill={shade(skin, -0.45)} />
        {/* mouth */}
        <path
          d={`M${50 - mouthW / 2} ${eyeY + noseLen + 7} Q50 ${eyeY + noseLen + 8.2 + lip} ${50 + mouthW / 2} ${eyeY + noseLen + 7}`}
          stroke={shade(skin, -0.5)}
          strokeWidth={1.2}
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${50 - mouthW / 2 + 1.5} ${eyeY + noseLen + 7.8} Q50 ${eyeY + noseLen + 10 + lip * 1.5} ${50 + mouthW / 2 - 1.5} ${eyeY + noseLen + 7.8}`}
          fill={shade(skin, -0.22)}
          opacity={0.7}
        />
        {/* front hair */}
        <Hair style={style} color={hairColor} L={L} R={R} top={faceTop} rng={rng} />
        {/* rim light */}
        <path d={face} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={1.2} />
      </g>
    </svg>
  );
});

function Hair({ style, color, L, R, top, rng }: { style: HairStyle; color: string; L: number; R: number; top: number; rng: Rng }) {
  const w = R - L;
  switch (style) {
    case 'bald':
      return (
        <path
          d={`M${L + 1} ${top + 20} C${L} ${top + 14} ${L + 2} ${top + 12} ${L + 3} ${top + 16} M${R - 1} ${top + 20} C${R} ${top + 14} ${R - 2} ${top + 12} ${R - 3} ${top + 16}`}
          stroke={color}
          strokeWidth={2}
          opacity={0.5}
          fill="none"
        />
      );
    case 'buzz':
      return (
        <path
          d={`M${L} ${top + 18} C${L - 1} ${top - 2} ${R + 1} ${top - 2} ${R} ${top + 18} C${R - 3} ${top + 8} ${L + 3} ${top + 8} ${L} ${top + 18} Z`}
          fill={color}
          opacity={0.85}
        />
      );
    case 'short':
      return (
        <path
          d={`M${L - 1} ${top + 20} C${L - 3} ${top - 5} ${R + 3} ${top - 5} ${R + 1} ${top + 20} C${R - 2} ${top + 10} ${50 + w * 0.15} ${top + 7} 50 ${top + 8} C${50 - w * 0.2} ${top + 7} ${L + 2} ${top + 11} ${L - 1} ${top + 20} Z`}
          fill={color}
        />
      );
    case 'sidePart':
      return (
        <path
          d={`M${L - 1} ${top + 21} C${L - 3} ${top - 6} ${R + 3} ${top - 6} ${R + 1} ${top + 19} C${R - 4} ${top + 8} ${L + w * 0.35} ${top + 4} ${L + w * 0.3} ${top + 7} C${L + w * 0.2} ${top + 10} ${L + 2} ${top + 12} ${L - 1} ${top + 21} Z`}
          fill={color}
        />
      );
    case 'quiff':
      return (
        <path
          d={`M${L - 1} ${top + 19} C${L - 2} ${top - 2} ${L + w * 0.3} ${top - 10} ${50 + w * 0.2} ${top - 8} C${R + 2} ${top - 6} ${R + 3} ${top + 4} ${R + 1} ${top + 18} C${R - 3} ${top + 9} ${L + 4} ${top + 9} ${L - 1} ${top + 19} Z`}
          fill={color}
        />
      );
    case 'curly': {
      const curls = Array.from({ length: 9 }, (_, i) => ({
        x: L + (i / 8) * w,
        y: top + 2 + Math.sin(i * 1.7) * 2 + (i === 0 || i === 8 ? 10 : 0),
        r: 5 + rng.float(0, 1.5),
      }));
      return (
        <g fill={color}>
          {curls.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={c.r} />
          ))}
          <path d={`M${L} ${top + 14} C${L} ${top} ${R} ${top} ${R} ${top + 14} Z`} />
        </g>
      );
    }
    case 'afro':
      return (
        <path
          d={`M${L - 2} ${top + 18} C${L - 3} ${top + 6} ${R + 3} ${top + 6} ${R + 2} ${top + 18} C${R - 4} ${top + 12} ${L + 4} ${top + 12} ${L - 2} ${top + 18} Z`}
          fill={color}
        />
      );
    case 'twists': {
      const n = 8;
      return (
        <g stroke={color} strokeWidth={3.2} strokeLinecap="round">
          <path d={`M${L} ${top + 16} C${L - 1} ${top - 2} ${R + 1} ${top - 2} ${R} ${top + 16} Z`} fill={color} stroke="none" />
          {Array.from({ length: n }, (_, i) => {
            const x = L + 1 + (i / (n - 1)) * (w - 2);
            return <path key={i} d={`M${x} ${top + 4} L${x + (x < 50 ? -2 : 2)} ${top - 6}`} />;
          })}
        </g>
      );
    }
    case 'long':
      return (
        <path
          d={`M${L - 2} ${top + 22} C${L - 4} ${top - 6} ${R + 4} ${top - 6} ${R + 2} ${top + 22} C${R - 2} ${top + 8} ${L + 2} ${top + 8} ${L - 2} ${top + 22} Z`}
          fill={color}
        />
      );
    case 'bun':
      return (
        <g fill={color}>
          <circle cx={50} cy={top - 5} r={6} />
          <path
            d={`M${L - 1} ${top + 18} C${L - 2} ${top - 4} ${R + 2} ${top - 4} ${R + 1} ${top + 18} C${R - 3} ${top + 7} ${L + 3} ${top + 7} ${L - 1} ${top + 18} Z`}
          />
        </g>
      );
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))))
      .toString(16)
      .padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
