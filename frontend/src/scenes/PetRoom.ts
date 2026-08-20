/**
 * PetRoom — The Cozy Farmhouse Test Scene.
 *
 * This visual test scene validates the end-to-end procedural pipeline
 * within a warm, rustic, and tightly structured spatial layout.
 *
 * Layer order:
 *   background -> floor -> walls -> light pool
 *     -> depth-sorted props and pet -> atmosphere -> edge bands
 */

import { Application, Container } from 'pixi.js';
import { createAtmosphere } from '../assets/environment/Atmosphere';
import type { AtmosphereView } from '../assets/environment/Atmosphere';
import { createBackground } from '../assets/environment/Background';
import { createFloor } from '../assets/environment/Floor';
import { createLighting } from '../assets/environment/Lighting';
import { createWalls } from '../assets/environment/Walls';
import { renderObject } from '../assets/objects/ObjectRenderer';
import type { ObjectDefinition } from '../assets/objects/ObjectRenderer';
import { PetRenderer } from '../assets/pets/PetRenderer';
import type { PetAppearanceInput } from '../assets/pets/customization/PetAppearance';
import { PetAnimationController } from '../animation/PetAnimationController';
import type { PetStateName } from '../animation/PetAnimationController';

/** Design resolution */
const ROOM_WIDTH = 1280;
const ROOM_HEIGHT = 720;

/** 
 * Lowering the floor gives the room a loftier farmhouse feel with larger walls.
 */
const FLOOR_Y = 480;

/** 
 * A sunset/golden hour light source coming from a large rustic window on the left.
 */
const LIGHT_X = ROOM_WIDTH * 0.15;

/** 
 * The pet is positioned in the cozy center-right, closer to their bed and toys.
 */
const PET_X = ROOM_WIDTH * 0.65;
const PET_Y = FLOOR_Y + 160;
const PET_SCALE = 0.88;

interface PlacedObject {
  definition: ObjectDefinition;
  x: number;
  y: number;
  scale?: number;
}

/**
 * Farmhouse Composition:
 * Arranged to feel like a warm, lived-in nook. Props are clustered functionally
 * rather than scattered.
 */
const PROPS: PlacedObject[] = [
  // A large, warm woven rug anchoring the center space
  { definition: { type: 'rug', seed: 42, scale: 1.2 }, x: ROOM_WIDTH * 0.5, y: FLOOR_Y + 140 },
  
  // A chunky rustic table and chair forming a study nook near the center-left
  { definition: { type: 'table', seed: 101, scale: 1.1 }, x: ROOM_WIDTH * 0.40, y: FLOOR_Y + 80 },
  { definition: { type: 'chair', seed: 102 }, x: ROOM_WIDTH * 0.48, y: FLOOR_Y + 105 },
  
  // A tall farmhouse plant catching the direct sunlight from the window
  { definition: { type: 'plant', seed: 77, scale: 1.15 }, x: ROOM_WIDTH * 0.08, y: FLOOR_Y + 40 },
  
  // A warm corner lamp illuminating the pet's sleeping area on the right
  { definition: { type: 'lamp', seed: 88 }, x: ROOM_WIDTH * 0.85, y: FLOOR_Y + 50 },
  
  // The pet's cozy oversized bed tucked safely in the corner
  { definition: { type: 'bed', seed: 24, scale: 1.1 }, x: ROOM_WIDTH * 0.82, y: FLOOR_Y + 120 },
  
  // Toys scattered organically near the bed and rug
  { definition: { type: 'plush', seed: 55 }, x: ROOM_WIDTH * 0.72, y: FLOOR_Y + 180 },
  { definition: { type: 'ball', seed: 12 }, x: ROOM_WIDTH * 0.45, y: FLOOR_Y + 200 },
  
  // A woven basket in the foreground holding extra farmhouse knick-knacks
  { definition: { type: 'basket', seed: 19, scale: 1.05 }, x: ROOM_WIDTH * 0.25, y: FLOOR_Y + 210 },
];

export interface PetRoomOptions {
  appearance?: PetAppearanceInput;
  petX?: number;
  petY?: number;
  petScale?: number;
}

export class PetRoom {
  readonly root: Container;
  readonly pet: PetRenderer;
  readonly animation: PetAnimationController;

  private app: Application;
  private stageLayer: Container;
  private atmosphere: AtmosphereView;
  private tick: (ticker: { deltaMS: number }) => void;

  constructor(app: Application, options: PetRoomOptions = {}) {
    this.app = app;

    this.root = new Container();
    this.root.label = 'pet-room';

    // --- Environment -------------------------------------------------------
    this.root.addChild(createBackground({ width: ROOM_WIDTH, height: ROOM_HEIGHT }));
    this.root.addChild(createFloor({ width: ROOM_WIDTH, height: ROOM_HEIGHT, floorY: FLOOR_Y }));

    // Adjusting window location to match our new farmhouse light source
    this.root.addChild(
      createWalls({
        width: ROOM_WIDTH,
        floorY: FLOOR_Y,
        windowX: LIGHT_X,
        windowY: FLOOR_Y * 0.35, 
      }),
    );

    // Casting a longer, warmer light pool across the wider floor
    const lighting = createLighting({
      width: ROOM_WIDTH,
      height: ROOM_HEIGHT,
      lightX: LIGHT_X + 200,
      lightY: FLOOR_Y + (ROOM_HEIGHT - FLOOR_Y) * 0.6,
    });
    this.root.addChild(lighting.ambient);

    // --- Props and pet -----------------------------------------------------
    this.stageLayer = new Container();
    this.stageLayer.label = 'props';
    this.stageLayer.sortableChildren = true;
    this.root.addChild(this.stageLayer);

    this.pet = new PetRenderer(options.appearance ?? {});
    const petY = options.petY ?? PET_Y;
    this.pet.root.position.set(options.petX ?? PET_X, petY);
    this.pet.root.scale.set(options.petScale ?? PET_SCALE);
    this.pet.root.zIndex = petY;
    this.stageLayer.addChild(this.pet.root);

    for (const prop of PROPS) {
      const view = renderObject(prop.definition);
      view.position.set(prop.x, prop.y);
      if (prop.scale) view.scale.set(prop.scale);
      
      // Ensure the rug always anchors the scene dynamically
      view.zIndex = prop.definition.type === 'rug' ? -10000 : prop.y;
      this.stageLayer.addChild(view);
    }

    // --- Atmosphere and edge bands ----------------------------------------
    this.atmosphere = createAtmosphere({
      width: ROOM_WIDTH,
      height: ROOM_HEIGHT,
    });
    
    this.root.addChild(this.atmosphere.root);
    this.root.addChild(lighting.overlay);

    // --- Animation ---------------------------------------------------------
    this.animation = new PetAnimationController(this.pet.rig);

    this.tick = (ticker) => {
      this.animation.update(ticker.deltaMS);
      this.atmosphere.update(Math.min(ticker.deltaMS, 100) / 1000);
    };
    this.app.ticker.add(this.tick);

    this.layout();
    this.app.renderer.on('resize', this.onResize);
  }

  setState(state: PetStateName): void {
    this.animation.setState(state);
  }

  setAppearance(appearance: PetAppearanceInput): void {
    const rig = this.pet.setAppearance(appearance);
    this.animation.setRig(rig);
  }

  private onResize = () => {
    this.layout();
  };

  private layout(): void {
    const { width, height } = this.app.screen;
    const scale = Math.max(width / ROOM_WIDTH, height / ROOM_HEIGHT);

    this.root.scale.set(scale);
    this.root.position.set(
      (width - ROOM_WIDTH * scale) / 2,
      (height - ROOM_HEIGHT * scale) / 2,
    );
  }

  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.app.renderer.off('resize', this.onResize);
    this.root.destroy({ children: true });
  }
}