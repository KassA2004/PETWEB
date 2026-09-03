import { renderObjectIcon } from '../habitat/objectPreviews';
import { renderPetPortrait } from '../pets/renderPortrait';
import { HOME_ROOM_STYLE, placeInRoom, renderRoomBackdrop } from './homeArt';
import type { SlotPlacement } from './homeArt';
import { appearanceFor } from './heroCreatures';
import type { HomeCreature } from './creatures';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';

/**
 * Everything on the home page that has to be *rendered*, in one chunk.
 *
 * The boundary exists for one number: PixiJS and the catalogs it draws from are
 * about two thirds of this application's JavaScript, and the signed-out page is
 * the one page in the product that is supposed to be small. `AuthGate` already
 * splits the world away from the visitor who has not signed in; putting the
 * renderer back on the home page's critical path would undo that for everybody
 * who ever looks at the front door.
 *
 * So nothing here is imported statically by the page. `artLoader.ts` fetches
 * this module *after the page has painted*, and every picture that depends on
 * it holds its exact final box until it arrives (theme-and-design.md §20.6 — a
 * placeholder of the wrong size is a layout shift with extra steps).
 *
 * The three things the page needs pictures of, and they are the same three
 * functions the product itself uses:
 *
 * ```text
 *   the room       farmhouse.createScenery   → features/home/homeArt
 *   an object      renderObject              → features/habitat/objectPreviews
 *   a creature     PetRenderer               → features/pets/renderPortrait
 * ```
 */

export interface HomeArt {
  room: (width: number) => Promise<string>;
  object: (type: ObjectType, size: number) => Promise<string>;
  portrait: (creature: HomeCreature, size: number) => Promise<string>;
  /**
   * Where in the room picture a thing standing at (x, z) belongs.
   *
   * Synchronous, and on this side of the boundary for the same reason the
   * pictures are: answering it means measuring the artwork, which means having
   * the renderer. The page holds a floor position — two numbers with no
   * imports — and asks for the geometry once the art is here.
   */
  placement: (type: ObjectType, x: number, z: number) => SlotPlacement;
}

export const homeArt: HomeArt = {
  room: (width) => renderRoomBackdrop(HOME_ROOM_STYLE, width),
  object: (type, size) => renderObjectIcon(type, size),
  portrait: (creature, size) => renderPetPortrait(appearanceFor(creature), size),
  placement: placeInRoom,
};
