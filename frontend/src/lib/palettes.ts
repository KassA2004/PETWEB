/**
 * Swatch sets for the customizer.
 *
 * These are shortcuts, not limits: every color control also has a native color
 * picker, so the palette exists to make the good-looking choices one click away
 * rather than to fence the user in.
 */

import { PALETTE } from '../assets/shared/color';

/** The creature's main color. Saturated enough to hold the whole silhouette. */
export const COAT_COLORS = [
  PALETTE.blush,
  PALETTE.punch,
  PALETTE.ember,
  0xf2c94c,
  PALETTE.mint,
  PALETTE.sky,
  PALETTE.grape,
  PALETTE.sand,
  PALETTE.cream,
  0xf0f4f8,
  0x8d99ae,
  PALETTE.ink,
] as const;

/** Belly patches and markings: lighter, so they read against the coat. */
export const SOFT_COLORS = [
  PALETTE.cream,
  0xfff7ec,
  0xffd9e2,
  0xffe6b8,
  0xd9f2e6,
  0xd8e8fb,
  0xe8ddfa,
  PALETTE.sand,
  0xf7c7a3,
  0xbfae9c,
] as const;

/** Cheeks and small details: warm and bright. */
export const ACCENT_COLORS = [
  PALETTE.punch,
  PALETTE.blush,
  PALETTE.ember,
  0xf2c94c,
  PALETTE.mint,
  PALETTE.sky,
  PALETTE.grape,
  0xffffff,
  PALETTE.ink,
] as const;

/** Accessories can be anything, so this is the widest set. */
export const ACCESSORY_COLORS = [
  PALETTE.ink,
  PALETTE.punch,
  PALETTE.blush,
  PALETTE.ember,
  0xf2c94c,
  PALETTE.mint,
  PALETTE.sky,
  PALETTE.grape,
  PALETTE.sand,
  PALETTE.cream,
  0xffffff,
  0x2f6f4e,
] as const;

/** Iris colours, for the eye types that show one. */
export const EYE_COLORS = [
  0x5b3a2e,
  0x2f4858,
  0x3d6b4f,
  0x6b3f6b,
  0x8a5a2b,
  0x1f1f2e,
  0xf2c94c,
  0xc94a4a,
] as const;
