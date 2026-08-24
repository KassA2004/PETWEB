/**
 * Bed — two cells of floor, a headboard, a mattress, and a blanket somebody
 * has not straightened.
 *
 * The brief's own worked example of the grid: a bed takes two boxes. Every
 * dimension below is a fraction of the box it was handed (`ctx.width`,
 * `ctx.depth`, `ctx.height`), so the artwork is exactly as wide as the two
 * cells it claims and can never drift out of them.
 *
 * The mistake this was redrawn to fix
 * -----------------------------------
 * The first version stacked a headboard, a frame, a mattress and a blanket at
 * the same width, one above the other. Every piece was individually correct
 * and the result read as a layer cake, because things at the same width in a
 * vertical stack are *layers*; nothing in the silhouette said which of them was
 * behind which.
 *
 * So the parts now differ in the plan as well as in height:
 *
 *   headboard  taller than everything and set back, so it is the only thing
 *              breaking the skyline
 *   mattress   narrower than the frame it sits in, with a visible top face
 *   blanket    covers the *foot* of the bed only, and hangs over the front
 *              edge. The turned-back hem across the middle is what makes the
 *              other half read as bedding rather than as a shelf
 *   pillow     big, at the head, and overlapping the headboard
 *
 * Anchored at its floor contact point.
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, tones } from '../../shared/color';
import { createRng, drawSquircle, rngRange } from '../../shared/shapes';
import {
  FLOOR_SQUASH,
  cushion,
  edge,
  floorSlab,
  formFill,
  grain,
  groundShadow,
  post,
  slab,
  topFill,
} from '../shared/Surface';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBed(ctx: ObjectRenderContext): Container {
  const { width, depth, height } = ctx;
  const rng = createRng(ctx.seed + 17);

  const root = new Container();
  root.label = 'bed';

  root.addChild(groundShadow(width, depth, 0.3));

  const half = width / 2;
  const frameY = -height * 0.5;
  const mattressY = -height * 0.86;
  const depthLift = depth * FLOOR_SQUASH * 0.5;

  const woodTones = tones(ctx.secondaryColor);
  const linenTones = tones(lighten(ctx.color, 0.5));
  const blanketTones = tones(ctx.color);

  // --- Headboard, behind everything ---------------------------------------
  // Set back by the room's own foreshortening and drawn first, so the mattress
  // in front of it hides its foot and the join needs no seam.
  const headboard = new Container();
  headboard.y = -depthLift;

  const boardTop = -height * 2;
  const boardBottom = frameY;

  const board = new Graphics();
  drawSquircle(
    board,
    0,
    (boardTop + boardBottom) / 2,
    half * 0.96,
    (boardBottom - boardTop) / 2,
    { roundness: 0.38 },
  );
  board.fill(formFill(woodTones, 0.6));
  drawSquircle(
    board,
    0,
    (boardTop + boardBottom) / 2,
    half * 0.96,
    (boardBottom - boardTop) / 2,
    { roundness: 0.38 },
  );
  edge(board, ctx.secondaryColor, 3, 0.42);
  headboard.addChild(board);

  // Three slats, so the headboard is joinery rather than a plank.
  const slats = new Graphics();
  for (let i = -1; i <= 1; i++) {
    const x = i * half * 0.44;
    slats.roundRect(
      x - half * 0.11,
      boardTop + height * 0.28,
      half * 0.22,
      boardBottom - boardTop - height * 0.6,
      half * 0.06,
    );
  }
  slats.fill({ color: woodTones.deep, alpha: 0.35 });
  headboard.addChild(slats);

  const boardGrain = grain(width * 0.85, height * 0.6, ctx.secondaryColor, ctx.seed, 4);
  boardGrain.y = boardTop + height * 0.4;
  headboard.addChild(boardGrain);

  root.addChild(headboard);

  // --- Legs ---------------------------------------------------------------
  for (const side of [-1, 1]) {
    root.addChild(
      post({
        x: side * half * 0.86,
        top: frameY,
        length: -frameY,
        width: width * 0.055,
        color: darken(ctx.secondaryColor, 0.14),
      }),
    );
  }

  // --- Frame --------------------------------------------------------------
  root.addChild(
    slab({
      y: frameY,
      width,
      depth,
      thickness: height * 0.16,
      color: ctx.secondaryColor,
      roundness: 0.3,
      plain: true,
    }),
  );

  // --- Mattress -----------------------------------------------------------
  // Narrower than the frame, which is what gives the frame an edge to be.
  const mattressW = width * 0.9;
  const mattressD = depth * 0.84;

  root.addChild(
    slab({
      y: mattressY,
      width: mattressW,
      depth: mattressD,
      thickness: height * 0.24,
      color: linenTones.base,
      roundness: 0.55,
    }),
  );

  // --- Blanket ------------------------------------------------------------
  // Only the foot of the bed, hanging over the front edge, with a turned-back
  // hem across the middle. Drawn as its own top face plus a skirt, so it is a
  // thing lying *on* the mattress rather than a stripe painted across it.
  const blanket = new Container();
  const blanketW = mattressW * 0.98;
  const blanketX = half * 0.24;
  const blanketSpan = mattressW * 0.52;

  const skirt = new Graphics();
  skirt.moveTo(blanketX - blanketSpan / 2, mattressY);
  skirt.lineTo(blanketX + blanketSpan / 2, mattressY);
  skirt.lineTo(blanketX + blanketSpan / 2, mattressY + height * 0.34);
  skirt.quadraticCurveTo(
    blanketX,
    mattressY + height * 0.44,
    blanketX - blanketSpan / 2,
    mattressY + height * 0.3,
  );
  skirt.closePath();
  skirt.fill(formFill(blanketTones, 0.4));
  blanket.addChild(skirt);

  const face = new Graphics();
  floorSlab(face, blanketX, mattressY, blanketSpan, mattressD * 0.96, 0.5);
  face.fill(topFill(blanketTones));
  floorSlab(face, blanketX, mattressY, blanketSpan, mattressD * 0.96, 0.5);
  edge(face, ctx.color, 2.5, 0.32);
  blanket.addChild(face);

  // The turned-back hem: the edge of the blanket where it stops, folded over.
  const hem = new Graphics();
  const hemX = blanketX - blanketSpan / 2;
  hem.moveTo(hemX, mattressY - mattressD * FLOOR_SQUASH * 0.5);
  hem.quadraticCurveTo(
    hemX + width * 0.06,
    mattressY,
    hemX,
    mattressY + mattressD * FLOOR_SQUASH * 0.5,
  );
  hem.quadraticCurveTo(
    hemX - width * 0.05,
    mattressY,
    hemX,
    mattressY - mattressD * FLOOR_SQUASH * 0.5,
  );
  hem.closePath();
  hem.fill({ color: lighten(ctx.accentColor, 0.2) });
  hem.stroke({ color: blanketTones.line, width: 2, alpha: 0.3 });
  blanket.addChild(hem);

  // Two soft creases, off-centre, so the blanket looks slept in (§14).
  const creases = new Graphics();
  for (let i = 0; i < 2; i++) {
    const x = blanketX + rngRange(rng, -blanketSpan * 0.3, blanketSpan * 0.3);
    creases.moveTo(x, mattressY - mattressD * FLOOR_SQUASH * 0.3);
    creases.quadraticCurveTo(
      x + rngRange(rng, -8, 8),
      mattressY + height * 0.1,
      x + rngRange(rng, -12, 12),
      mattressY + height * 0.3,
    );
  }
  creases.stroke({ color: blanketTones.deep, width: 2, alpha: 0.28 });
  blanket.addChild(creases);

  root.addChild(blanket);
  void blanketW;

  // --- Pillow -------------------------------------------------------------
  // Big, at the head, tilted back against the board. It is the one shape that
  // says which end you sleep at.
  const pad = cushion({
    x: -half * 0.46,
    y: mattressY - height * 0.16 - depthLift * 0.4,
    width: mattressW * 0.42,
    height: height * 0.4,
    color: lighten(ctx.secondaryColor, 0.62),
    roundness: 0.82,
    seed: ctx.seed + 3,
  });
  pad.rotation = -0.06;
  root.addChild(pad);

  return root;
}
