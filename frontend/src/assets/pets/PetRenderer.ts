/**
 * PetRenderer — the public entry point for drawing a pet.
 *
 * Give it an appearance configuration, get back a display object. Nothing above
 * this layer needs to know about rigs, joints or shape generators.
 *
 *   appearance (data)  ->  PetRenderer  ->  PixiJS scene graph
 *
 * It also owns the creature's contact shadow, because the shadow has to track
 * the body size and nothing inside the rig knows about the floor.
 */

import { Container } from 'pixi.js';
import type { Graphics } from 'pixi.js';
import { createContactShadow } from '../environment/Shadows';
import { createPetRig } from './anatomy/PetRig';
import type { PetRig } from './anatomy/PetRig';
import { createPetAppearance } from './customization/PetAppearance';
import type { PetAppearance, PetAppearanceInput } from './customization/PetAppearance';

export class PetRenderer {
  /**
   * Add this to your scene. Its origin sits on the floor, between the feet.
   *
   * It is a stable wrapper around the rig: rebuilding the creature swaps what
   * is inside, so callers never need to re-add anything or update references.
   */
  readonly root: Container;

  private currentRig: PetRig;
  private currentAppearance: PetAppearance;
  private shadow: Graphics;

  constructor(appearance: PetAppearanceInput = {}) {
    this.root = new Container();
    this.root.label = 'pet';

    this.currentAppearance = createPetAppearance(appearance);
    this.currentRig = createPetRig(this.currentAppearance);

    // Shadow first, so it sits behind the feet.
    this.shadow = this.buildShadow();
    this.root.addChild(this.shadow);
    this.root.addChild(this.currentRig.root);
  }

  get rig(): PetRig {
    return this.currentRig;
  }

  get appearance(): PetAppearance {
    return this.currentAppearance;
  }

  /**
   * Rebuild the creature with new appearance values.
   *
   * The rig is regenerated rather than patched, because proportions drive the
   * anchors as well as the artwork — changing `bodyScale` has to move the feet,
   * not just redraw the body.
   *
   * Returns the new rig so an animation controller can be re-bound to it.
   */
  setAppearance(appearance: PetAppearanceInput): PetRig {
    const next = createPetAppearance({ ...this.currentAppearance, ...appearance });

    this.currentRig.destroy();
    this.currentAppearance = next;
    this.currentRig = createPetRig(next);

    this.shadow.destroy();
    this.shadow = this.buildShadow();

    this.root.addChild(this.shadow);
    this.root.addChild(this.currentRig.root);

    return this.currentRig;
  }

  private buildShadow(): Graphics {
    return createContactShadow({
      width: this.currentRig.proportions.shadowWidth,
      strength: 0.22,
    });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** Functional shorthand for callers that do not want to hold a class. */
export function createPetRenderer(appearance: PetAppearanceInput = {}): PetRenderer {
  return new PetRenderer(appearance);
}
