import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from '../../lib/audio';

/**
 * Dragging a goal into the Focus slot.
 *
 * There is no "Move to Focus" button, and that is the feature rather than a
 * flourish: choosing what to spend an hour on should cost a deliberate
 * movement, not a click you can make by accident while reading the list. So
 * the goal is a thing you pick up and put somewhere.
 *
 * Written with `window` listeners rather than HTML5 drag-and-drop or pointer
 * capture, which is the same conclusion the wall-decor drag reached
 * (`PetHabitat.beginWallDrag`) and for overlapping reasons:
 *
 * ```text
 *   HTML5 dnd       does not exist on touch. Half the product's screens
 *   pointer capture redelivers only to the element that set it, so the drop
 *                   target can never hear the pointer
 *   window          hears everything, everywhere, until it is told to stop
 * ```
 *
 * **A drag does not begin on contact.** It begins after the pointer has moved
 * far enough to mean it, which is what lets a list row still be scrolled on a
 * phone and still be picked up with a mouse. Until that threshold nothing has
 * happened at all — no ghost, no sound, no state.
 */

export interface DraggedGoal {
  id: string;
  title: string;
}

export interface GoalDrag {
  /** What is in the user's hand, or null. */
  goal: DraggedGoal | null;
  /** Where the pointer is, in client coordinates, for drawing the ghost. */
  at: { x: number; y: number };
  /** True while the pointer is over the slot. */
  over: boolean;
  /** The Focus slot registers itself here so the drag can hit-test it. */
  slotRef: React.RefObject<HTMLDivElement | null>;
  /** Call from a goal row's `onPointerDown`. */
  begin: (goal: DraggedGoal, event: React.PointerEvent) => void;
}

/** How far the pointer has to travel before this counts as a drag, in pixels. */
const THRESHOLD = 6;

export function useGoalDrag(onDrop: (goal: DraggedGoal) => void): GoalDrag {
  const [goal, setGoal] = useState<DraggedGoal | null>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const [over, setOver] = useState(false);

  const slotRef = useRef<HTMLDivElement | null>(null);
  /** Read by the window listeners, which are set up once and never re-bound. */
  const drop = useRef(onDrop);
  useEffect(() => {
    drop.current = onDrop;
  }, [onDrop]);

  /** Everything about the gesture in progress, including the not-yet-a-drag part. */
  const gesture = useRef<{
    goal: DraggedGoal;
    from: { x: number; y: number };
    started: boolean;
    over: boolean;
    cleanup: () => void;
  } | null>(null);

  const isOverSlot = (x: number, y: number): boolean => {
    const rect = slotRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const begin = useCallback((next: DraggedGoal, event: React.PointerEvent) => {
    // Left button (or any touch/pen contact) only. A right-click that started a
    // drag would be a small horror.
    if (event.button !== 0 || gesture.current) return;

    const from = { x: event.clientX, y: event.clientY };

    const move = (moved: PointerEvent) => {
      const state = gesture.current;
      if (!state) return;

      const point = { x: moved.clientX, y: moved.clientY };

      if (!state.started) {
        if (Math.hypot(point.x - state.from.x, point.y - state.from.y) < THRESHOLD) {
          return;
        }
        state.started = true;
        setGoal(state.goal);
        // The sound belongs to the moment it comes off the list, not to the
        // press — a press that turns out to be a scroll never made a noise.
        sfx.grab();

        // Make sure there is somewhere to put it.
        //
        // On a phone the panel is one long column and the slot is at the top of
        // it, so a user who has scrolled down to a goal may be holding
        // something with nowhere to drop it. `nearest` is deliberate: it does
        // nothing at all when the slot is already visible, which is the desktop
        // case and most of the mobile one.
        //
        // A sticky slot was the other answer and is the wrong one here — the
        // creature's frame is already sticky at the top of a small screen, so a
        // second sticky element would dock underneath it and be covered by it.
        slotRef.current?.scrollIntoView({ block: 'nearest' });
      }

      // Text selection while dragging turns the whole list blue and is the
      // clearest possible tell that a drag was bolted on afterwards.
      moved.preventDefault();

      setAt(point);
      const nowOver = isOverSlot(point.x, point.y);
      if (nowOver !== state.over) {
        state.over = nowOver;
        setOver(nowOver);
        // A small tick on the way in only. Leaving is silent, because a
        // pointer wandering across an edge would otherwise chatter.
        if (nowOver) sfx.hover();
      }
    };

    const end = (released: PointerEvent) => {
      const state = gesture.current;
      state?.cleanup();

      if (state?.started && isOverSlot(released.clientX, released.clientY)) {
        drop.current(state.goal);
      } else if (state?.started) {
        // Put back. Quieter than a drop, and distinct from it, because
        // "nothing happened" has to sound different from "something did".
        sfx.close();
      }
    };

    const cancel = () => gesture.current?.cleanup();

    const onKey = (event_: KeyboardEvent) => {
      if (event_.key === 'Escape') cancel();
    };

    const cleanup = () => {
      gesture.current = null;
      setGoal(null);
      setOver(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
    };

    gesture.current = { goal: next, from, started: false, over: false, cleanup };

    // Not passive: `move` calls preventDefault to stop the browser selecting
    // text and scroll-chaining the page under the drag.
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
  }, []);

  // A drag must not outlive the panel it started in.
  useEffect(() => () => gesture.current?.cleanup(), []);

  return { goal, at, over, slotRef, begin };
}
