import { useEffect, useRef } from 'react';
import { Application, Rectangle } from 'pixi.js';
import { AuthGate } from './features/auth/AuthGate';
import { UserBadge } from './features/auth/UserBadge';
import { PetRoom } from './scenes/PetRoom';

/**
 * Mounts the PixiJS world.
 *
 * React owns the application UI (here: the auth gate and the user badge);
 * PixiJS owns the world and never shares a tree with it
 * (/Docs/project-overview.md §10). This component is the whole boundary
 * between them.
 */
function PetWorld() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;

    const start = async () => {
      const instance = new Application();
      await instance.init({
        // Matches the room's own field color, so any sliver outside the
        // scaled room reads as part of it rather than as a dark border.
        background: 0xd9552b,
        resizeTo: host,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });

      // React 19 StrictMode mounts effects twice; bail if we lost the race.
      if (disposed) {
        instance.destroy(true);
        return;
      }

      app = instance;
      host.appendChild(instance.canvas);

      const room = new PetRoom(instance);
      instance.stage.addChild(room.root);

      if (import.meta.env.DEV) {
        const dev = window as unknown as Record<string, unknown>;
        dev.__petApp = instance;
        dev.__petRoom = room;
        dev.__PixiRectangle = Rectangle;
      }
    };

    void start();

    return () => {
      disposed = true;
      app?.destroy(true, { children: true });
      app = null;
    };
  }, []);

  return (
    <div className="fixed inset-0">
      <div ref={hostRef} className="absolute inset-0" />
      <UserBadge />
    </div>
  );
}

function App() {
  return (
    <AuthGate>
      <PetWorld />
    </AuthGate>
  );
}

export default App;
