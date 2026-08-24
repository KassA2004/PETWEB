import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  DEFAULT_ROOM_STYLE,
  normalizeRoomStyle,
  sameRoomStyle,
} from '../../world/RoomStyle';
import type { RoomStyle } from '../../world/RoomStyle';
import { fetchCurrentEnvironment, saveRoomStyle } from './api';

/**
 * What the room looks like, and keeping it that way.
 *
 * The bug this fixes is small to describe and was awful to live with: the hour
 * and the paint colour were `useState` inside `PetHabitat`, so every refresh
 * and every fresh sign-in put the room back to a sunny ember afternoon. A room
 * you have decorated and cannot get back to is worse than a room with no
 * decoration at all, because the second one never promised anything.
 *
 * Two decisions, and they are the opposite of the pet's on purpose.
 *
 * **Saving is automatic**, where saving a creature is explicit. A preset is a
 * snapshot somebody named and an autosave over it would be frightening; the
 * room is not a snapshot, it is *the room*. There is one of it, changing it is
 * how you look at it, and a Save button between "I want it to be evening" and
 * it being evening would be an obstacle rather than a safeguard.
 *
 * **The room still works with the backend down.** A failed load leaves the
 * default room and a quiet note, rather than an empty frame — you can still
 * change the light, you just cannot keep the result. That is the same promise
 * the creature editor makes.
 *
 * The write is debounced because the controls are a colour swatch and a row of
 * chips: dragging along them would otherwise be one request per hover.
 */

export interface RoomStyleState {
  style: RoomStyle;
  /**
   * Which room this is, once it has loaded.
   *
   * Exposed so the arrangement can be saved against the same environment
   * (`useRoomObjects`) without fetching `/environments/current` a second time
   * and risking the two halves of one room disagreeing about which room it is.
   */
  environmentId: string | null;
  /** Change one or more axes. Merged, normalized, and saved. */
  update: (patch: Partial<RoomStyle>) => void;
  /** First load still in flight. */
  loading: boolean;
  /** Whether the last write reached the server. */
  saving: boolean;
  /** Set when the room cannot be persisted, so the interface can say so. */
  error: string | null;
}

/** How long to wait after the last change before writing, in milliseconds. */
const SAVE_DELAY = 700;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.isUnauthorized
      ? 'Sign in again to keep your room.'
      : 'Your room is not being saved.';
  }
  if (error instanceof TypeError) {
    return 'Cannot reach the server. Your room is not being saved.';
  }
  return 'Your room is not being saved.';
}

export function useRoomStyle(): RoomStyleState {
  const [style, setStyle] = useState<RoomStyle>(DEFAULT_ROOM_STYLE);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** What the server last confirmed, so an unchanged style is never written. */
  const persisted = useRef<RoomStyle>(DEFAULT_ROOM_STYLE);
  const pending = useRef<RoomStyle | null>(null);
  const timer = useRef<number | null>(null);

  // --- Load ----------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const environment = await fetchCurrentEnvironment(controller.signal);
        if (controller.signal.aborted) return;

        const loaded = normalizeRoomStyle(environment.sceneData);
        setEnvironmentId(environment.id);
        setStyle(loaded);
        persisted.current = loaded;
      } catch (cause) {
        if (controller.signal.aborted) return;
        // A signed-out visitor is not a failure; they simply get the default
        // room and no persistence.
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
  const flush = useCallback(async () => {
    const next = pending.current;
    pending.current = null;

    if (!next || !environmentId) return;
    if (sameRoomStyle(next, persisted.current)) return;

    setSaving(true);
    try {
      await saveRoomStyle(environmentId, next);
      persisted.current = next;
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSaving(false);
    }
  }, [environmentId]);

  const update = useCallback(
    (patch: Partial<RoomStyle>) => {
      setStyle((current) => {
        const next = normalizeRoomStyle({ ...current, ...patch });
        if (sameRoomStyle(current, next)) return current;

        pending.current = next;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          timer.current = null;
          void flush();
        }, SAVE_DELAY);

        return next;
      });
    },
    [flush],
  );

  // Anything still pending when the page goes away is written immediately.
  // Without this, the last change before a reload is the one that gets lost,
  // which is exactly the change the user just made.
  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  return { style, environmentId, update, loading, saving, error };
}
