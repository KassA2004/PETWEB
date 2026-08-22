/**
 * Color utilities for the procedural asset system.
 *
 * Colors are plain numbers (0xRRGGBB) so they can travel through definitions,
 * be stored in the database, and be handed straight to PixiJS.
 *
 * The palette is bold, warm and slightly soft. Surfaces are shaded with a
 * small, fixed tone ramp derived from one base color (see `tones`), rendered
 * as a soft vertical gradient — light at the top, base through the middle,
 * shade along the bottom (/Docs/theme-and-design.md §9).
 *
 * One base color in, a whole creature part out: that is what keeps a
 * randomized creature looking like it was designed rather than assembled.
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

/**
 * Perceived brightness, 0..1.
 *
 * Weighted for how the eye actually works rather than by averaging channels,
 * because parts need to know whether they are sitting on something dark: a
 * dark eye on a dark creature is not an eye, it is a hole.
 */
export function luminance(color: number): number {
  const { r, g, b } = toRgb(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** CSS rgba() string — gradient stops need per-stop alpha. */
export function rgba(color: number, alpha = 1): string {
  const { r, g, b } = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The tone ramp for one base color.
 *
 * Every shaded surface in the creature system uses exactly these five values,
 * which is what makes a bee's wing, a pig's ear and a random purple blob look
 * like they came out of the same box of crayons.
 *
 *   light  top of the form, catching the window light
 *   base   the color you actually chose
 *   shade  the underside
 *   deep   contact shadow, inner ear, the gap under a belly
 *   line   the soft outline
 */
export interface Tones {
  light: number;
  base: number;
  shade: number;
  deep: number;
  line: number;
}

export function tones(base: number): Tones {
  return {
    light: lighten(base, 0.24),
    base,
    shade: darken(base, 0.15),
    deep: darken(base, 0.34),
    line: darken(base, 0.46),
  };
}
