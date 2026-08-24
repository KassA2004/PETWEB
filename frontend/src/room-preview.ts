/**
 * Scratch harness for looking at the room without the app around it.
 *
 * Not part of the product. It exists because the placement grid and the object
 * artwork can only be verified by looking at them, and going through the
 * dashboard means going through the auth gate and the backend.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { PetRoom } from './scenes/PetRoom';
import { OBJECT_TYPES, renderObject } from './assets/objects/ObjectRenderer';
import type { ObjectType } from './assets/objects/ObjectRenderer';
import { updateLife } from './assets/objects/ObjectLife';
import type { RoomStyle } from './world/RoomStyle';
import { project } from './world/Projection';

const host = document.getElementById('host') as HTMLDivElement;

const app = new Application();
await app.init({
  width: 1280,
  height: 720,
  antialias: true,
  resolution: 1,
  background: 0x1b1420,
});
host.appendChild(app.canvas);

const dev = window as unknown as Record<string, unknown>;
dev.__app = app;

async function snapshot(name: string) {
  app.render();
  const canvas = app.renderer.extract.canvas(app.stage) as HTMLCanvasElement;
  const url = canvas.toDataURL('image/png');
  const response = await fetch('/__snapshot', {
    method: 'POST',
    headers: { 'x-snapshot-name': name },
    body: url,
  });
  return response.text();
}

dev.__cap = snapshot;

/**
 * Drive the ticker by hand.
 *
 * The preview runs in a background tab, where requestAnimationFrame is
 * throttled to nothing — so the world is built and then frozen on frame one,
 * and every snapshot shows the initial state. Pumping `ticker.update` with an
 * advancing clock runs the simulation deterministically instead, which is what
 * a harness wants anyway.
 */
dev.__advance = (seconds: number, step = 1 / 60) => {
  let now = performance.now();
  for (let i = 0; i < Math.round(seconds / step); i++) {
    now += step * 1000;
    app.ticker.update(now);
  }
  return seconds;
};

const mode = new URLSearchParams(location.search).get('mode') ?? 'room';

if (mode === 'gallery') {
  // --- Object gallery ------------------------------------------------------
  const types = (new URLSearchParams(location.search).get('only')?.split(',') ??
    OBJECT_TYPES) as ObjectType[];

  const cols = 5;
  const cellW = 1280 / cols;
  const cellH = 720 / Math.ceil(types.length / cols);

  const stage = new Container();
  app.stage.addChild(stage);

  const backdrop = new Graphics();
  backdrop.rect(0, 0, 1280, 720);
  backdrop.fill({ color: 0xd9c3a5 });
  stage.addChild(backdrop);

  const views: Container[] = [];

  types.forEach((type, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    const cell = new Container();
    cell.position.set(cellW * (col + 0.5), cellH * (row + 0.88));
    // Fit the biggest object in the set into a cell.
    cell.scale.set(Math.min(cellW, cellH) / 300);

    const floor = new Graphics();
    floor.moveTo(-cellW, 0);
    floor.lineTo(cellW, 0);
    floor.stroke({ color: 0x8a6f52, width: 2, alpha: 0.5 });
    cell.addChild(floor);

    const view = renderObject({ type, seed: 7 + index * 13 });
    cell.addChild(view);
    views.push(view);

    stage.addChild(cell);
  });

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS, 50) / 1000;
    const life = { time: performance.now() / 1000, lightsOn: true, now: new Date() };
    for (const view of views) updateLife(view, dt, life);
  });
} else {
  // Everything the room reports, captured rather than played. The mixer is a
  // separate concern (`lib/audio`) and this harness has no user gesture to
  // unlock one with, so what is checked here is that the *events* are right:
  // which ones fire, how hard, and how often.
  const sounds: unknown[] = [];

  const room = new PetRoom(app, {
    fit: 'contain',
    // Mirrors what PetHabitat wires up, so a wall-decor drag can be exercised
    // end to end from this harness too.
    onWallDecorChange: (decor) => room.setStyle({ decor }),
    onArrangementChange: () => {
      (dev.__arrangementChanges as number) =
        ((dev.__arrangementChanges as number) ?? 0) + 1;
    },
    onSound: (event) => {
      sounds.push(event);
    },
  });

  dev.__sounds = sounds;
  dev.__arrangementChanges = 0;
  app.stage.addChild(room.root);

  dev.__room = room;
  dev.__style = (patch: Partial<RoomStyle>) => room.setStyle(patch);
  // For simulating real drags from the console: world -> screen.
  dev.__project = project;
}
