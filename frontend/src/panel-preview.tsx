/**
 * Scratch harness for the room style panel.
 *
 * Not part of the product. The panel lives inside the habitat, which lives
 * behind the auth gate, so this mounts it on its own with local state — enough
 * to check that it renders, that the tabs switch, and that the wall grid hangs
 * and removes things.
 */

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RoomStylePanel } from './features/habitat/RoomStylePanel';
import { DEFAULT_ROOM_STYLE } from './world/RoomStyle';
import { NO_PROGRESS } from './lib/progress';
import type { UserProgress } from './lib/progress';
import type { RoomStyle } from './world/RoomStyle';
import './index.css';

export function Harness() {
  const [style, setStyle] = useState<RoomStyle>(DEFAULT_ROOM_STYLE);
  const [editing, setEditing] = useState(false);
  const [placed, setPlaced] = useState<string[]>([]);
  /*
   * The harness has no session, so it has no progress either.
   *
   * Left at zero deliberately rather than faked high: this is the state a brand
   * new account is in, and it is the one worth being able to look at — every
   * locked tile padlocked, and the modal reachable from any of them.
   */
  const [progress] = useState<UserProgress>(NO_PROGRESS);

  return (
    <div className="bg-background text-foreground min-h-screen p-6">
      <div className="border-border bg-card mx-auto max-w-md rounded-2xl border">
        <RoomStylePanel
          style={style}
          onChange={(patch) => setStyle((current) => ({ ...current, ...patch }))}
          onWallDragStart={(kind) => console.log('wall drag started:', kind)}
          onHangWallDecor={() => true}
          onPlaceObject={(type) => setPlaced((current) => [...current, type])}
          editing={editing}
          onEditingChange={setEditing}
          progress={progress}
        />
      </div>

      <pre
        id="state"
        className="text-muted-foreground mx-auto mt-6 max-w-3xl text-xs"
      >
        {JSON.stringify({ editing, placed, style }, null, 2)}
      </pre>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
