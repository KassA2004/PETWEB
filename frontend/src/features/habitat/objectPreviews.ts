import { renderObject } from '../../assets/objects/ObjectRenderer';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import { getWallDecor } from '../../assets/environment/walls/WallDecor';
import type { WallDecorKind } from '../../assets/environment/walls/WallDecor';
import { createFloor } from '../../assets/environment/Floor';
import type { FloorPattern } from '../../assets/environment/Floor';
import { createWallTexture } from '../../assets/environment/walls/WallTextures';
import type { WallTexture } from '../../assets/environment/walls/WallTextures';
import { getWindowView } from '../../assets/environment/window/WindowViews';
import type { WindowViewId } from '../../assets/environment/window/WindowViews';
import { getAmbience, graded } from '../../world/Ambience';
import type { AmbienceId } from '../../world/Ambience';
import { renderPreview } from '../../lib/preview';
import type { Rectangle } from '../../lib/preview';

/**
 * Pictures of everything the Room panel offers.
 *
 * Same argument as the creature's previews next door: the room is drawn by
 * procedural generators, so the preview is that generator's own output rather
 * than an icon somebody drew once. A lamp in the panel is the lamp, made by the
 * function that makes the lamp in the room.
 *
 * Every entry here is a thin wrapper around `renderPreview` — the shared
 * offscreen renderer, the shared cache, and one WebGL context for all of it.
 */

/** A thing that goes on the floor. */
export function renderObjectIcon(type: ObjectType, size = 76): Promise<string> {
  return renderPreview(`object:${type}`, () => renderObject({ type }), { size, fill: 0.82 });
}

/** A thing that hangs on the wall. */
export function renderDecorIcon(kind: WallDecorKind, size = 76): Promise<string> {
  const spec = getWallDecor(kind);

  return renderPreview(
    `decor:${kind}`,
    () =>
      spec.draw(
        60,
        60,
        // The palette a decoration is normally handed by the room. Fixed here,
        // because one that followed the user's paint would make every preview
        // change colour when they repainted — the choice being offered is the
        // *piece*, not the colour it will end up.
        { wall: 0xf0dfcb, tint: 0xe7c9a9, accent: 0xd9552b },
        7,
      ),
    { size, fill: 0.86 },
  );
}

/**
 * A patch of floor.
 *
 * The floor is drawn as a whole room in perspective, so a preview of one is a
 * *crop* of the middle of it — the near edge, where the pattern is biggest and
 * a plank still looks like a plank.
 */
export function renderFloorIcon(
  pattern: FloorPattern,
  color: number,
  size = 76,
): Promise<string> {
  return renderPreview(
    `floor:${pattern}:${color}`,
    () => createFloor({ pattern, color, gridStrength: 0 }),
    {
      size,
      fill: 1,
      focus: (subject): Rectangle => {
        const bounds = subject.getLocalBounds();
        // The front third, centred: the back of a floor is a few pixels tall
        // and every pattern looks identical there.
        const side = Math.min(bounds.width, bounds.height) * 0.55;
        return {
          x: bounds.x + bounds.width / 2 - side / 2,
          y: bounds.y + bounds.height - side * 1.1,
          width: side,
          height: side,
        };
      },
    },
  );
}

/** A patch of wall. */
export function renderWallIcon(
  texture: WallTexture,
  color: number,
  size = 76,
): Promise<string> {
  return renderPreview(
    `wall:${texture}:${color}`,
    () => createWallTexture(texture, color, 5),
    {
      size,
      fill: 1,
      focus: (subject): Rectangle => {
        const bounds = subject.getLocalBounds();
        const side = Math.min(bounds.width, bounds.height) * 0.42;
        return {
          x: bounds.x + bounds.width / 2 - side / 2,
          y: bounds.y + bounds.height / 2 - side / 2,
          width: side,
          height: side,
        };
      },
    },
  );
}

/** What is on the other side of the glass. */
export function renderWindowIcon(view: WindowViewId, size = 76): Promise<string> {
  const spec = getWindowView(view);

  return renderPreview(
    `window:${view}`,
    // The hour's sky is what a view is lit by; noon keeps every view comparable
    // rather than showing six pictures of the same darkness.
    () => spec.draw(70, 70, getAmbience('noon').sky, 4),
    { size, fill: 1 },
  );
}

/** The hour, as the light it makes. */
export function renderAmbienceIcon(id: AmbienceId, tint: number, size = 76): Promise<string> {
  const ambience = getAmbience(id);

  return renderPreview(
    `ambience:${id}:${tint}`,
    () => createWallTexture('plaster', graded(tint, ambience), 3),
    {
      size,
      fill: 1,
      focus: (subject): Rectangle => {
        const bounds = subject.getLocalBounds();
        const side = Math.min(bounds.width, bounds.height) * 0.4;
        return {
          x: bounds.x + bounds.width / 2 - side / 2,
          y: bounds.y + bounds.height / 2 - side / 2,
          width: side,
          height: side,
        };
      },
    },
  );
}
