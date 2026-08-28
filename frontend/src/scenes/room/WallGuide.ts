/**
 * Telling the user what they're about to hang, and where.
 *
 * The floor grid has `DepthGuide`: a footprint that snaps to cells before you
 * let go, so what's highlighted is what you get. The wall grid gets the same
 * promise, and two things the floor guide doesn't need.
 *
 * **The lattice.** The floor draws its own grid into the boards, so the cells
 * a chair can go on are visible before you pick the chair up. The wall has no
 * such thing — plaster is plaster — so the wall grid was invisible until you
 * had already committed to a cell, which is why hanging a picture felt like
 * picking a box at random and hoping. The whole grid appears while a piece is
 * in your hand, with the cells that are already spoken for shaded and the ones
 * that are not hanging space at all (the window) struck out. It goes away
 * again the moment you let go, because a permanent lattice would turn the wall
 * into graph paper.
 *
 * **The art.** The guide draws the *actual decoration* at reduced alpha over
 * the snapped cells, because "which cell" is only half the question a wall
 * placement asks. The other half is "what does that look like there", and the
 * old button grid never answered it until after you'd committed.
 */

import { Container, Graphics } from 'pixi.js';
import { PALETTE, mix } from '../../assets/shared/color';
import type { DecorPalette, WallDecorKind } from '../../assets/environment/walls/WallDecor';
import { getWallDecor } from '../../assets/environment/walls/WallDecor';
import {
  WALL_CELL_1X1,
  WALL_COLUMNS,
  WALL_ROWS,
  wallBox,
  wallCellKey,
  wallCenter,
  wallQuadAt,
} from '../../world/WallGrid';
import type { WallAnchor, WallFootprint } from '../../world/WallGrid';
import { project, scaleAt } from '../../world/Projection';

export interface WallDragTarget {
  anchor: WallAnchor;
  footprint: WallFootprint;
  kind: WallDecorKind;
  seed: number;
  palette: DecorPalette;
  /** Cells already carrying something, so the user can see what is free. */
  occupied: ReadonlySet<string>;
  /** Cells that are not wall at all — the window. */
  reserved: ReadonlySet<string>;
  /** True when this drop would land on a reserved cell and be refused. */
  blocked: boolean;
}

export interface WallGuideView {
  root: Container;
  update(target: WallDragTarget | null): void;
}

function polygonOf(anchor: WallAnchor, footprint: WallFootprint): number[] {
  return wallQuadAt(anchor, footprint).flatMap((point) => [point.x, point.y]);
}

export function createWallGuide(): WallGuideView {
  const root = new Container();
  root.label = 'wall-guide';
  root.alpha = 0;
  root.eventMode = 'none';

  // The lattice: every cell of the wall, drawn once. The cells themselves
  // never move, so only the *shading* of them is ever redrawn.
  const lattice = new Graphics();
  for (let row = 0; row < WALL_ROWS; row++) {
    for (let col = 0; col < WALL_COLUMNS; col++) {
      lattice.poly(polygonOf({ col, row }, WALL_CELL_1X1));
    }
  }
  lattice.stroke({ color: PALETTE.cream, width: 1.5, alpha: 0.22 });
  root.addChild(lattice);

  /** Cells that are taken, and cells that are not wall — drawn over the lattice. */
  const state = new Graphics();
  root.addChild(state);

  const area = new Graphics();
  root.addChild(area);

  const preview = new Container();
  preview.alpha = 0.62;
  root.addChild(preview);

  let drawn: { col: number; row: number; cols: number; rows: number; blocked: boolean } | null =
    null;
  let drawnState: string | null = null;
  let drawnKind: WallDecorKind | null = null;
  let previewArt: Container | null = null;

  return {
    root,

    update(target) {
      root.visible = target !== null;
      if (!target) {
        drawn = null;
        drawnState = null;
        return;
      }

      const { anchor, footprint, kind, seed, palette, occupied, reserved, blocked } = target;
      root.alpha = 1;

      // Which cells are taken changes only when the drag starts or a piece is
      // moved, so the wash is keyed on the sets rather than redrawn per frame.
      const stateKey = `${[...reserved].join(',')}|${[...occupied].join(',')}`;
      if (drawnState !== stateKey) {
        drawnState = stateKey;
        state.clear();

        for (let row = 0; row < WALL_ROWS; row++) {
          for (let col = 0; col < WALL_COLUMNS; col++) {
            const key = wallCellKey({ col, row });
            const polygon = polygonOf({ col, row }, WALL_CELL_1X1);

            if (reserved.has(key)) {
              // Not hanging space. Struck through rather than merely shaded,
              // because "taken" and "not a place at all" are different
              // answers and the user has to be able to tell them apart.
              const quad = wallQuadAt({ col, row }, WALL_CELL_1X1);
              state.poly(polygon);
              state.fill({ color: PALETTE.ink, alpha: 0.22 });
              state.moveTo(quad[0].x, quad[0].y);
              state.lineTo(quad[2].x, quad[2].y);
              state.moveTo(quad[1].x, quad[1].y);
              state.lineTo(quad[3].x, quad[3].y);
              state.stroke({ color: PALETTE.ink, width: 1.5, alpha: 0.3 });
            } else if (occupied.has(key)) {
              // Taken, and refused: a drop here is blocked exactly the way a
              // reserved cell is (`PetRoom.wallDragMove` folds this set into
              // the same `blocked` flag). Shaded rather than only red at the
              // drop point so the refusal is visible before the piece is ever
              // dragged over it, not discovered by trying.
              state.poly(polygon);
              state.fill({ color: PALETTE.cream, alpha: 0.16 });
            }
          }
        }
      }

      if (
        !drawn ||
        drawn.col !== anchor.col ||
        drawn.row !== anchor.row ||
        drawn.cols !== footprint.cols ||
        drawn.rows !== footprint.rows ||
        drawn.blocked !== blocked
      ) {
        drawn = {
          col: anchor.col,
          row: anchor.row,
          cols: footprint.cols,
          rows: footprint.rows,
          blocked,
        };

        // The same red the floor guide uses for a refused placement, so "no"
        // looks the same wherever the user meets it.
        const tone = blocked ? PALETTE.punch : PALETTE.cream;
        const polygon = polygonOf(anchor, footprint);

        area.clear();
        area.poly(polygon);
        area.fill({ color: tone, alpha: blocked ? 0.3 : 0.24 });
        area.poly(polygon);
        area.stroke({ color: tone, width: 2.5, alpha: 0.9 });
      }

      if (drawnKind !== kind) {
        drawnKind = kind;
        previewArt?.destroy({ children: true });

        // Drawn at wall scale up front, the same way the real decor is
        // (`Walls.ts`) — a piece's own stroke widths are authored in screen
        // pixels, so scaling the container afterward instead would draw them
        // too thin for what the final render actually looks like.
        const spec = getWallDecor(kind);
        const box = wallBox(spec.footprint, spec.fill);
        const wallScale = scaleAt(0);
        previewArt = spec.draw((box.width / 2) * wallScale, (box.height / 2) * wallScale, palette, seed);
        preview.addChild(previewArt);
      }

      preview.tint = blocked ? mix(0xffffff, PALETTE.punch, 0.7) : 0xffffff;

      // Centre the preview on the snapped cell. The wall sits at one depth, so
      // this is the same point the real decor is placed at.
      const centre = wallCenter(anchor, footprint);
      const at = project(centre.x, centre.y, 0);
      preview.position.set(at.x, at.y);
    },
  };
}
