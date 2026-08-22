/**
 * Bed — a side-view profile of a mattress, frame, blanket, and pillow.
 *
 * Completely redesigned into a "dynamic flat design" style. It uses 
 * sharp, hard-edged geometric intersections, distinct drop shadows, 
 * and solid color blocking to create depth and structure rather than 
 * relying on soft gradients or floating blobs.
 *
 * Anchored at its floor contact point (center-bottom).
 */

import { Container, Graphics } from 'pixi.js';
import { darken, lighten, outline } from '../../shared/color';
import { drawSquircle } from '../../shared/shapes';
import { createContactShadow } from '../../environment/Shadows';
import type { ObjectRenderContext } from '../ObjectRenderer';

export function createBed(ctx: ObjectRenderContext): Container {
  const root = new Container();
  root.label = 'bed';

  // Widen and raise the proportions to fit a detailed side profile
  const w = 260 * ctx.scale;
  const h = 130 * ctx.scale;

  // 1. Floor Shadow
  root.addChild(createContactShadow({ width: w * 0.95, strength: 0.3 }));

  // ==========================================
  // 2. FRAME & LEGS (ctx.secondaryColor)
  // ==========================================
  const woodColor = ctx.secondaryColor;
  const woodDark = darken(woodColor, 0.3);
  const woodOutline = outline(woodColor);

  // Front-Left and Front-Right Legs
  const legs = new Graphics();
  // Left Leg
  drawSquircle(legs, -w * 0.35, -h * 0.1, w * 0.03, h * 0.1, { roundness: 0.4 });
  // Right Leg
  drawSquircle(legs, w * 0.35, -h * 0.1, w * 0.03, h * 0.1, { roundness: 0.4 });
  legs.fill({ color: woodDark });
  legs.stroke({ color: woodOutline, width: 3 });
  root.addChild(legs);

  // Headboard (Tall, left-aligned)
  const headboard = new Graphics();
  drawSquircle(headboard, -w * 0.43, -h * 0.45, w * 0.04, h * 0.45, { roundness: 0.4 });
  headboard.fill({ color: woodColor });
  headboard.stroke({ color: woodOutline, width: 3 });
  
  // Flat highlight on the inside edge of the headboard
  headboard.rect(-w * 0.41, -h * 0.85, w * 0.015, h * 0.8);
  headboard.fill({ color: lighten(woodColor, 0.2) });
  root.addChild(headboard);

  // Main Frame Base
  const frame = new Graphics();
  drawSquircle(frame, 0, -h * 0.22, w * 0.45, h * 0.08, { roundness: 0.3 });
  frame.fill({ color: woodColor });
  frame.stroke({ color: woodOutline, width: 3 });
  root.addChild(frame);

  // ==========================================
  // 3. MATTRESS (ctx.color)
  // ==========================================
  // We use two layers to create a sharp, flat geometric shadow on the lower half
  const mattressColor = ctx.color;
  const mattressDark = darken(mattressColor, 0.2);
  const mattressOutline = outline(mattressColor);

  const mattress = new Graphics();
  
  // Base shadow half
  drawSquircle(mattress, w * 0.02, -h * 0.36, w * 0.42, h * 0.14, { roundness: 0.5 });
  mattress.fill({ color: mattressDark });
  mattress.stroke({ color: mattressOutline, width: 3 });

  // Top highlight half (shifted slightly up)
  drawSquircle(mattress, w * 0.02, -h * 0.39, w * 0.42, h * 0.11, { roundness: 0.5 });
  mattress.fill({ color: mattressColor });
  
  root.addChild(mattress);

  // ==========================================
  // 4. BLANKET (ctx.accentColor)
  // ==========================================
  const blanketColor = ctx.accentColor;
  const blanketLight = lighten(blanketColor, 0.2);
  const blanketOutline = outline(blanketColor);

  // Flat cast shadow of the blanket wrapping onto the mattress
  const blanketCastShadow = new Graphics();
  drawSquircle(blanketCastShadow, w * 0.18, -h * 0.36, w * 0.28, h * 0.145, { roundness: 0.5 });
  blanketCastShadow.fill({ color: darken(mattressColor, 0.4) });
  root.addChild(blanketCastShadow);

  const blanket = new Graphics();
  
  // Main draped blanket (hangs slightly below the mattress)
  drawSquircle(blanket, w * 0.22, -h * 0.35, w * 0.24, h * 0.16, { roundness: 0.4 });
  blanket.fill({ color: blanketColor });
  blanket.stroke({ color: blanketOutline, width: 3 });
  root.addChild(blanket);

  // Folded hem edge (creates a clean vertical break)
  const blanketFold = new Graphics();
  drawSquircle(blanketFold, -w * 0.02, -h * 0.35, w * 0.035, h * 0.165, { roundness: 0.3 });
  blanketFold.fill({ color: blanketLight });
  blanketFold.stroke({ color: blanketOutline, width: 3 });
  root.addChild(blanketFold);

  // ==========================================
  // 5. PILLOW (Lightened ctx.color)
  // ==========================================
  const pillowColor = lighten(ctx.color, 0.7);
  const pillowDark = darken(pillowColor, 0.15);
  
  // Create a separate container for the pillow to apply a tilt against the headboard
  const pillowContainer = new Container();
  pillowContainer.x = -w * 0.32;
  pillowContainer.y = -h * 0.45;
  pillowContainer.rotation = 0.25; // Tilted ~14 degrees

  const pillow = new Graphics();
  
  // Pillow bottom shadow
  drawSquircle(pillow, 0, 0, w * 0.12, h * 0.09, { roundness: 0.6 });
  pillow.fill({ color: pillowDark });
  pillow.stroke({ color: outline(pillowColor), width: 3 });

  // Pillow top flat highlight
  drawSquircle(pillow, 0, -h * 0.02, w * 0.11, h * 0.07, { roundness: 0.6 });
  pillow.fill({ color: pillowColor });

  pillowContainer.addChild(pillow);
  root.addChild(pillowContainer);

  return root;
}