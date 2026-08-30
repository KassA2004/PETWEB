/**
 * A colour per person, so a creature on the lawn can be matched to a name in
 * the list beside it.
 *
 * The park's one genuine identification problem: six creatures, all of them
 * somebody's, and no way to tell which is which. The obvious answer — a name
 * floating over each head — is the wrong one here for a reason worth writing
 * down: there is no text in the world at all. Every pixel inside the frame is
 * `Container` and `Graphics`, there are no webfonts, and adding PixiJS's text
 * renderer to draw six labels would put a text engine in the bundle to solve a
 * problem a ring on the floor solves for nothing (AGENTS.md — Performance
 * Rules: *"this project has no images, no webfonts and no third-party
 * scripts"*).
 *
 * So each visitor gets a coloured ring under their feet, drawn like every other
 * marking on the floor (`scenes/room/DepthGuide.ts` draws the drag guide the
 * same way), and the same colour appears as a dot beside their name in the
 * panel. Matching a ring to a dot is instant; reading six small labels in
 * perspective is not.
 *
 * The colour is **deterministic in the user id**, which is what makes it work
 * across clients: everybody in the park sees the same person in the same
 * colour, without the server having to say, and a reconnect does not reshuffle
 * the lawn.
 */

import { PALETTE } from '../../assets/shared/color';

/**
 * The ring colours, in the order they are handed out.
 *
 * Chosen to be distinguishable from each other *and* from the creatures
 * standing in them — no blush and no cream, because those are the two colours a
 * default creature is most likely to be, and a pink ring under a pink blob is a
 * ring nobody sees.
 */
const TINTS = [
  PALETTE.sky,
  PALETTE.mint,
  PALETTE.grape,
  PALETTE.ember,
  0xf2c94c,
  PALETTE.punch,
  0x4fb3a8,
  0xe07a5f,
] as const;

/** A stable small integer for a string. Not a hash for security; a spread. */
function fold(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

/** The ring colour for this person, as a PixiJS tint. */
export function tintFor(userId: string): number {
  return TINTS[fold(userId) % TINTS.length];
}

/** The same colour as CSS, for the dot beside their name. */
export function cssTintFor(userId: string): string {
  return `#${tintFor(userId).toString(16).padStart(6, '0')}`;
}
