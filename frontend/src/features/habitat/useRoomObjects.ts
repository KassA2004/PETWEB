import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import type { PlacedObjectSnapshot } from '../../scenes/PetRoom';
import { fetchCurrentRoomObjects, saveRoomObjects } from './api';
import type { PlacedObject } from './api';

/**
 * Where the furniture is, and keeping it there.
 *
 * The half of a saved room that `useRoomStyle` does not cover: that one keeps
 * what the room is *made of*, this keeps what is *standing in it*. Together
 * they are the difference between signing in to your room and signing in to the
 * room the product ships.
 *
 * **Why this hook does not hold the objects in React state.**
 *
 * It holds them in a ref, and hands the loaded arrangement back through a
 * callback exactly once. The scene is the live copy: a chair is dragged, the
 * creature knocks a ball across the floor, a toy settles half a second after
 * being dropped — all of that happens inside PixiJS at sixty frames a second,
 * and mirroring it into React state would re-render the entire dashboard every
 * time the ball moved. The one thing React needs to know is whether the save is
 * failing, and that is one boolean.
 *
 * **When it saves.** Never per frame. `PetRoom` reports `onArrangementChange`
 * only on settled placements — something set down, added or removed — and this
 * debounces even those, because a user rearranging a corner produces a run of
 * them a second apart.
 *
 * **When it takes the snapshot matters more than it looks.** The arrangement is
 * read the moment the change is reported, not when the debounced write finally
 * fires. Reading it late is the obvious design and it is wrong: React unmounts
 * children before parents, so on a page teardown the PixiJS scene is already
 * gone by the time this hook's cleanup runs, `snapshot()` answers "nothing", and
 * the last thing the flush does is helpfully save an empty room over the one the
 * user spent the evening arranging. Snapshotting eagerly costs a map over a
 * couple of dozen entities per *settled placement*, which is nothing, and it
 * means the pending write always describes a room that really existed.
 */

/** How long after the last change before writing, in milliseconds. */
const SAVE_DELAY = 900;

export interface RoomObjectsState {
  /** First load still in flight. */
  loading: boolean;
  saving: boolean;
  /** Set when the arrangement is not reaching the server. */
  error: string | null;
  /** The scene changed. Call it from `PetRoom`'s `onArrangementChange`. */
  changed: () => void;
  /** Write anything pending right now, e.g. before the page goes away. */
  flush: () => void;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.isUnauthorized
      ? 'Sign in again to keep your room.'
      : 'Your furniture is not being saved.';
  }
  if (error instanceof TypeError) {
    return 'Cannot reach the server. Your furniture is not being saved.';
  }
  return 'Your furniture is not being saved.';
}

/** Two arrangements that would rebuild the same room. */
function same(a: PlacedObject[], b: PlacedObject[]): boolean {
  if (a.length !== b.length) return false;

  const key = (object: PlacedObject) =>
    `${object.key}:${object.type}:${object.col}:${object.row}:${JSON.stringify(object.definition ?? {})}`;

  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((value, index) => value === right[index]);
}

export function useRoomObjects(options: {
  /** Which room. Null until `useRoomStyle` has loaded it. */
  environmentId: string | null;
  /** The scene, asked for its current arrangement when a save is due. */
  snapshot: () => PlacedObjectSnapshot[];
  /** Called once, with whatever was saved last time. */
  onLoaded: (objects: PlacedObject[]) => void;
}): RoomObjectsState {
  const { environmentId, snapshot, onLoaded } = options;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** What the server last confirmed, so an unchanged room is never written. */
  const persisted = useRef<PlacedObject[]>([]);
  /** The arrangement waiting to be written, captured when it changed. */
  const pending = useRef<PlacedObject[] | null>(null);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  // Read through refs so the callbacks below never change identity — they are
  // handed to a PixiJS scene that is built once, and a new function every
  // render would mean the scene held a stale one.
  const snapshotRef = useRef(snapshot);
  const onLoadedRef = useRef(onLoaded);
  const environmentRef = useRef(environmentId);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);
  useEffect(() => {
    environmentRef.current = environmentId;
  }, [environmentId]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // --- Load ----------------------------------------------------------------
  // Loads immediately, without waiting for `useRoomStyle` to hand over an id:
  // the server resolves the current room itself. The id is still needed to
  // *save*, but a save is debounced by 900 ms and only ever follows a user
  // action, so it is always in hand long before the first write.
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const objects = await fetchCurrentRoomObjects(controller.signal);
        if (controller.signal.aborted) return;

        persisted.current = objects;
        onLoadedRef.current(objects);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (!(cause instanceof ApiError && cause.isUnauthorized)) {
          setError(messageFor(cause));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  // --- Save ----------------------------------------------------------------
  const write = useCallback(async () => {
    const environment = environmentRef.current;
    const objects = pending.current;

    // Nothing captured means nothing changed since the last write. It also
    // means a teardown flush has nothing to say, which is exactly right.
    if (!environment || !objects) return;
    pending.current = null;

    if (same(objects, persisted.current)) return;

    // Optimistic: the scene already shows the arrangement, and it is the copy
    // the user is looking at. A failure below leaves the room exactly as they
    // arranged it and says so, rather than snapping the furniture back to
    // whatever the server last managed to store — which would be the product
    // punishing them for its own network.
    if (alive.current) setSaving(true);

    try {
      const confirmed = await saveRoomObjects(environment, objects);
      persisted.current = confirmed;
      if (alive.current) setError(null);
    } catch (cause) {
      if (alive.current) setError(messageFor(cause));
    } finally {
      if (alive.current) setSaving(false);
    }
  }, []);

  const changed = useCallback(() => {
    // Read the room now, while it certainly still exists.
    pending.current = snapshotRef.current().map((object) => ({
      key: object.key,
      type: object.type,
      col: object.col,
      row: object.row,
      definition: object.definition,
    }));

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void write();
    }, SAVE_DELAY);
  }, [write]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    void write();
  }, [write]);

  // Anything still pending when the page goes away is written immediately.
  // Without this the last thing the user moved is the thing that gets lost,
  // which is exactly the thing they will look for next time.
  useEffect(() => {
    const onHide = () => {
      if (timer.current !== null) flush();
    };

    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        void write();
      }
    };
  }, [flush, write]);

  return { loading, saving, error, changed, flush };
}
