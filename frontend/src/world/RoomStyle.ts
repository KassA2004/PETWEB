/**
 * RoomStyle — everything the user has decided about the room, as one record.
 *
 * This exists because of a bug that was really an architecture problem. The
 * hour and the paint colour lived in React state inside `PetHabitat`, so every
 * refresh and every fresh sign-in put the room back to a sunny ember afternoon
 * and threw away whatever the user had chosen. The obvious fix — persist those
 * two values — would have been wrong twice over: two columns for two settings,
 * and then two more the next time the room gained an axis.
 *
 * So the room's appearance is one serialisable value, and it is the *only*
 * thing that has to be saved. It follows the pattern the pet already uses: a
 * plain JSON document, validated on the way in from the database, rendered by
 * code that lives in the frontend forever (see `Backend/src/pets/pet-appearance.ts`
 * for the creature's version of exactly this).
 *
 *   RoomStyle          plain data. Serializable. Belongs in the database.
 *        |
 *        v
 *   resolveMood()      what the light and the surfaces are made of
 *        |
 *        v
 *   createScenery()    the room, rebuilt
 *
 * `normalize` is the trust boundary. Anything arriving from the network is
 * unknown, and a room that failed to render because a column held the string
 * "purple" would be a worse bug than the one this replaced.
 */

import { FLOOR_PATTERNS } from '../assets/environment/Floor';
import type { FloorPattern } from '../assets/environment/Floor';
import { WALL_TEXTURES } from '../assets/environment/walls/WallTextures';
import type { WallTexture } from '../assets/environment/walls/WallTextures';
import { WALL_DECOR_KINDS, getWallDecor } from '../assets/environment/walls/WallDecor';
import type { WallDecorKind } from '../assets/environment/walls/WallDecor';
import {
  DEFAULT_WINDOW_VIEW,
  WINDOW_VIEWS,
} from '../assets/environment/window/WindowViews';
import type { WindowViewId } from '../assets/environment/window/WindowViews';
import {
  AMBIENCE_IDS,
  DEFAULT_AMBIENCE,
  DEFAULT_ROOM_TINT,
  getAmbience,
} from './Ambience';
import type { AmbienceId, RoomMood } from './Ambience';
import {
  WALL_COLUMNS,
  WALL_ROWS,
  normalizeWallFootprint,
  wallCellKey,
  wallCells,
} from './WallGrid';

/** One thing hung on the back wall, at a cell of the wall grid. */
export interface WallDecorPlacement {
  id: string;
  kind: WallDecorKind;
  /** Back-left cell of the piece, on the wall grid. */
  col: number;
  row: number;
}

export interface RoomStyle {
  /** Which hour the room is dressed for. */
  ambience: AmbienceId;
  /** The colour the room is built from. */
  tint: number;
  /** What the floor is made of. */
  floor: FloorPattern;
  /** What the walls are made of. */
  wall: WallTexture;
  /** What is on the other side of the window. */
  window: WindowViewId;
  /** What is hanging up. */
  decor: WallDecorPlacement[];
  /** Whether anybody left a light on. */
  lightsOn: boolean;
  /**
   * Environment props the user has taken out of the room.
   *
   * The room's starting furniture is furnished by the environment definition
   * on every load (`Farmhouse.props`), so "not in the saved arrangement"
   * cannot mean "deleted" — it also means "never moved". This is the
   * difference, and it is the only thing that makes deleting a piece of the
   * starting furniture stick.
   *
   * Ids, not indices. They come from `PlacedProp.id` (`prop-bookshelf`, …),
   * which is stable across loads because it is derived from the type.
   */
  removed: string[];
}

/**
 * The room as it arrives on day one.
 *
 * Furnished rather than bare: an empty room is not a neutral starting point,
 * it is a room that looks broken. Two pieces on the wall is enough to say the
 * wall is a place things go.
 */
export const DEFAULT_ROOM_STYLE: RoomStyle = {
  ambience: DEFAULT_AMBIENCE,
  tint: DEFAULT_ROOM_TINT,
  floor: 'boards',
  wall: 'plaster',
  window: DEFAULT_WINDOW_VIEW,
  // Clear of the window (wall cells 1-2) and of each other, which is the sort
  // of thing that has to be checked by hand exactly once because the grid
  // then keeps it true. The clock hangs here now rather than living as a
  // fixed-position physics prop (see `world/environments/Farmhouse.ts`) — it
  // is ordinary decor, at the same cell it always occupied.
  decor: [
    { id: 'decor-painting', kind: 'painting', col: 4, row: 2 },
    { id: 'decor-shelf', kind: 'shelf', col: 8, row: 1 },
    { id: 'decor-clock', kind: 'clock', col: 6, row: 1 },
  ],
  lightsOn: true,
  removed: [],
};

/* -------------------------------------------------------------------------- */
/* Reading it back out of the database                                        */
/* -------------------------------------------------------------------------- */

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickColor(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 0xffffff
    ? Math.round(value)
    : fallback;
}

function normalizeDecor(value: unknown): WallDecorPlacement[] {
  if (!Array.isArray(value)) return DEFAULT_ROOM_STYLE.decor;

  const seen = new Set<string>();
  const out: WallDecorPlacement[] = [];

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;

    const kind = pick(record.kind, WALL_DECOR_KINDS, 'painting');
    const spec = getWallDecor(kind);
    const size = normalizeWallFootprint(spec.footprint);

    // Clamped in cell units, so a decoration saved before the wall grid
    // changed shape still lands somewhere legal rather than off the wall.
    const col = Math.max(
      0,
      Math.min(WALL_COLUMNS - size.cols, Math.round(Number(record.col) || 0)),
    );
    const row = Math.max(
      0,
      Math.min(WALL_ROWS - size.rows, Math.round(Number(record.row) || 0)),
    );

    const id =
      typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 64
        ? record.id
        : `decor-${kind}-${col}-${row}`;

    if (seen.has(id)) continue;
    seen.add(id);

    out.push({ id, kind, col, row });
    // A wall with forty things on it is not a mood, it is a jumble sale.
    if (out.length >= 12) break;
  }

  return out;
}

function normalizeRemoved(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 64) continue;
    if (out.includes(entry)) continue;
    out.push(entry);
    // A room cannot have more starting furniture than this, so a longer list
    // is a corrupt document rather than a thorough user.
    if (out.length >= 64) break;
  }
  return out;
}

/**
 * Turn whatever the database handed back into a room that will render.
 *
 * Every field falls back independently, so one bad value costs one setting
 * rather than the whole room.
 */
export function normalizeRoomStyle(value: unknown): RoomStyle {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_ROOM_STYLE };
  const record = value as Record<string, unknown>;

  return {
    ambience: pick(record.ambience, AMBIENCE_IDS, DEFAULT_AMBIENCE),
    tint: pickColor(record.tint, DEFAULT_ROOM_TINT),
    floor: pick(record.floor, FLOOR_PATTERNS, DEFAULT_ROOM_STYLE.floor),
    wall: pick(record.wall, WALL_TEXTURES, DEFAULT_ROOM_STYLE.wall),
    window: pick(record.window, WINDOW_VIEWS, DEFAULT_WINDOW_VIEW),
    decor: normalizeDecor(record.decor),
    lightsOn: typeof record.lightsOn === 'boolean' ? record.lightsOn : true,
    removed: normalizeRemoved(record.removed),
  };
}

/** The light and the surface colours the scenery actually builds from. */
export function resolveMood(style: RoomStyle): RoomMood {
  return { ambience: getAmbience(style.ambience), tint: style.tint };
}

/**
 * Which wall cells are taken, and by what.
 *
 * Asked twice: once by the drop, to work out what it has to take down, and
 * once by the drag guide, to shade the cells that are already spoken for
 * *before* the user commits. Those two used to be the same nested loop written
 * out in two places, which is how a guide starts telling a different story
 * from the drop it is supposed to be predicting.
 *
 * @param exceptId the piece being repositioned, which does not clash with
 *   itself.
 */
export function occupiedWallCells(
  decor: WallDecorPlacement[],
  exceptId?: string,
): Map<string, WallDecorPlacement> {
  const occupied = new Map<string, WallDecorPlacement>();

  for (const placement of decor) {
    if (placement.id === exceptId) continue;
    const size = normalizeWallFootprint(getWallDecor(placement.kind).footprint);
    for (const cell of wallCells(placement, size)) {
      occupied.set(wallCellKey(cell), placement);
    }
  }

  return occupied;
}

/**
 * Hang (or move) one piece on the wall grid, resolving whatever it lands on
 * top of.
 *
 * The one place this logic lives: dragging a piece off the palette onto the
 * canvas and clicking a cell in the style panel both end up here, so the two
 * can never disagree about what a clash resolves to.
 *
 * @param existingId When set, this is a reposition — that piece is removed
 *   from its old cell before the clash check runs (so a piece dragged half a
 *   cell over doesn't clash with itself) and keeps its identity at the new
 *   one, rather than becoming a new piece.
 */
export function placeWallDecor(
  decor: WallDecorPlacement[],
  kind: WallDecorKind,
  anchor: { col: number; row: number },
  existingId?: string,
): WallDecorPlacement[] {
  const spec = getWallDecor(kind);
  const size = normalizeWallFootprint(spec.footprint);
  const anchorCol = Math.max(0, Math.min(WALL_COLUMNS - size.cols, Math.round(anchor.col)));
  const anchorRow = Math.max(0, Math.min(WALL_ROWS - size.rows, Math.round(anchor.row)));

  const occupied = occupiedWallCells(decor, existingId);

  // Anything the new piece would cover comes down first. Two things hanging
  // in the same place is not a mood, it is a mistake nobody can undo.
  const clashes = new Set<string>();
  for (const cell of wallCells({ col: anchorCol, row: anchorRow }, size)) {
    const hit = occupied.get(wallCellKey(cell));
    if (hit) clashes.add(hit.id);
  }

  const id = existingId ?? `decor-${kind}-${anchorCol}-${anchorRow}`;

  return [
    ...decor.filter((item) => item.id !== existingId && !clashes.has(item.id)),
    { id, kind, col: anchorCol, row: anchorRow },
  ];
}

/** Whether two styles would produce the same room. */
export function sameRoomStyle(a: RoomStyle, b: RoomStyle): boolean {
  return (
    a.ambience === b.ambience &&
    a.tint === b.tint &&
    a.floor === b.floor &&
    a.wall === b.wall &&
    a.window === b.window &&
    a.lightsOn === b.lightsOn &&
    a.decor.length === b.decor.length &&
    a.decor.every((item, index) => {
      const other = b.decor[index];
      return (
        other !== undefined &&
        item.id === other.id &&
        item.kind === other.kind &&
        item.col === other.col &&
        item.row === other.row
      );
    }) &&
    a.removed.length === b.removed.length &&
    a.removed.every((id, index) => id === b.removed[index])
  );
}

export type { AmbienceId, FloorPattern, WallTexture, WindowViewId, WallDecorKind };
