/**
 * Color utilities for the procedural asset system.
 *
 * Colors are plain numbers (0xRRGGBB) so they can travel through definitions,
 * be stored in the database, and be handed straight to PixiJS.
 *
 * The palette is flat and graphic: a small set of bold, warm, slightly soft
 * colors. Nothing in this project uses gradients — every surface is one flat
 * fill, optionally with a second flat shape on top for shade or shine
 * (/Docs/theme-and-design.md).
 */

export const PALETTE = {
  /** Pet pink — the default creature color. */
  blush: 0xff8fb4,
  /** Deeper pink, for shade under the blush. */
  punch: 0xef5f8c,
  /** Warm orange, the default room color. */
  ember: 0xd9552b,
  /** Darker orange, for the big background shapes. */
  emberDeep: 0xb03f21,
  /** Wicker, wood, basketry. */
  sand: 0xd7a86e,
  /** Paper cream — highlights, bedding, light surfaces. */
  cream: 0xfdeacd,
  mint: 0x74c9a8,
  sky: 0x7bb6e8,
  grape: 0x9b7fd4,
  /** Near-black plum. Eyes, mouths, outlines — never pure black. */
  ink: 0x3d2233,
} as const;

/** Everything dark in this world leans warm plum rather than grey. */
export const SHADOW_TINT = PALETTE.ink;

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

/** Move a color toward white — the flat "shine" tone. */
export function lighten(color: number, amount: number): number {
  return mix(color, 0xffffff, amount);
}

/** Move a color toward the shared shadow tone — the flat "shade" tone. */
export function darken(color: number, amount: number): number {
  return mix(color, SHADOW_TINT, amount);
}

/**
 * The line color for a given fill.
 *
 * Outlines are a darker version of whatever they surround, never a black
 * comic-book line (/Docs/theme-and-design.md section 13).
 */
export function outline(color: number, amount = 0.34): number {
  return darken(color, amount);
}
