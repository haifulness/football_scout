/**
 * A colour at some opacity, for any CSS colour (a hex or a theme variable). `a` is the old two-digit hex alpha
 * ('1a', '44'...), so call sites read the same as before.
 */
export function alpha(color: string, a: string): string {
  return `color-mix(in srgb, ${color} ${Math.round((parseInt(a, 16) / 255) * 100)}%, transparent)`;
}

/** A step between the panel colour and the theme's main colour (0 → 1), for one-hue strength scales. */
export const ramp = (t: number) => `color-mix(in srgb, var(--color-grass-400) ${Math.round(t * 100)}%, var(--color-night-800))`;

/** League strength on the map, weakest to strongest. */
export const STRENGTH_FILL = ['var(--color-night-700)', ramp(0.22), ramp(0.38), ramp(0.55), ramp(0.75), 'var(--color-grass-400)'];
