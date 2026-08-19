/**
 * Color utilities for the procedural asset system.
 *
 * Colors are plain numbers (0xRRGGBB) so they can travel through definitions,
 * be stored in the database, and be handed straight to PixiJS.
 *
 * Palette direction follows /Docs/theme-and-design.md section 3:
 * pastels, muted warm colors, soft blues, dusty pinks, lavender, warm cream.
 */

export const PALETTE = {
  dreamBlue: 0x9fb8da,
  lavender: 0xc3b3e0,
  dustyRose: 0xe8b4c8,
  softPeach: 0xf2c6a8,
  warmCream: 0xf5e6cf,
  mutedMint: 0xa8cfc0,
  softYellow: 0xf5dfa0,
  deepIndigo: 0x3b3358,
  duskViolet: 0x6c5b8f,
  nightBlue: 0x2b2b47,
} as const;

/** Shadows lean deep blue/purple rather than grey (theme doc section 3). */
export const SHADOW_TINT = 0x2f2748;

/** The scene's key light is warm and comes from the upper left. */
export const LIGHT_TINT = 0xfff1d6;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function toRgb(color: number): Rgb {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

export function fromRgb(rgb: Rgb): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (clamp(rgb.r) << 16) | (clamp(rgb.g) << 8) | clamp(rgb.b);
}

/** Blend two colors. `t = 0` returns `a`, `t = 1` returns `b`. */
export function mix(a: number, b: number, t: number): number {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return fromRgb({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/** Move a color toward white. */
export function lighten(color: number, amount: number): number {
  return mix(color, 0xffffff, amount);
}

/**
 * Move a color toward its shadow tone.
 *
 * Deliberately not toward black: theme-and-design.md section 13 asks for
 * "darker versions of surrounding colors" rather than hard black edges.
 */
export function darken(color: number, amount: number): number {
  return mix(color, SHADOW_TINT, amount);
}

/** Tint a color with the warm key light, for rim lights and highlights. */
export function warmLight(color: number, amount: number): number {
  return mix(color, LIGHT_TINT, amount);
}

/** CSS rgba() string — used for gradient stops that need per-stop alpha. */
export function rgba(color: number, alpha: number): string {
  const { r, g, b } = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
