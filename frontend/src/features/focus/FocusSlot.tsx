import { cn } from '../../lib/utils';
import { formatRemaining } from './useFocus';
import type { FocusHandle } from './useFocus';
import type { DraggedGoal } from './useGoalDrag';

/**
 * The one slot.
 *
 * Four states and no more, because the whole feature is one question — *what
 * is the one thing?* — and an interface that could show two answers at once
 * would be answering a different question.
 *
 * ```text
 *   away       you are standing somewhere else, and there is one way back
 *   empty      a dashed shape the size of the thing that goes in it
 *   waiting    something is in your hand and it could go here
 *   running    a name, a countdown, and a way out that is not a button
 * ```
 *
 * While it is running this is the only thing in the panel, and it is
 * deliberately almost empty: no progress bar, no "3 of 4 sessions", no
 * percentage. A ring that fills up is a thing to watch, and the entire point of
 * the hour is that the user is not watching.
 */

/** Somewhere the user is standing that an hour cannot be started from. */
export interface AwayFrom {
  /** What the place is called, in the user's words: "a park". */
  label: string;
  /** The one thing to do about it. */
  leave: () => void;
}

interface FocusSlotProps {
  focus: FocusHandle;
  /** The goal being worked on, when there is one. */
  goalTitle: string | null;
  /** What is in the user's hand, if anything. */
  dragging: DraggedGoal | null;
  /** True while that hand is over this slot. */
  over: boolean;
  slotRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Set while the world column belongs to a park or a visit.
   *
   * A session started from out there is the feature failing at the only thing
   * it promises. The room going dark is *half* of do-not-disturb; the other
   * half is that nothing can reach you, and a park is a lawn full of other
   * people's creatures with chat arriving in the panel beside it. So the slot
   * refuses, says where you are, and offers the way home — rather than being
   * merely disabled, which would tell the user they cannot have something
   * without telling them why or what to do.
   */
  away?: AwayFrom | null;
}

export function FocusSlot({
  focus,
  goalTitle,
  dragging,
  over,
  slotRef,
  away = null,
}: FocusSlotProps) {
  if (focus.active) {
    return (
      <section
        ref={slotRef}
        aria-label="Focus session in progress"
        className={cn(
          'animate-rise relative overflow-hidden rounded-2xl border border-border',
          // Darker than everything around it, and the only dark surface in the
          // interface: the panel is doing what the room is doing.
          'bg-foreground px-5 py-6 text-background shadow-lg shadow-foreground/20',
        )}
      >
        <p className="text-[0.65rem] font-medium tracking-[0.2em] uppercase opacity-60">
          Focusing on
        </p>

        <p className="mt-1 truncate text-sm font-medium opacity-90">
          {goalTitle ?? 'something'}
        </p>

        {/*
          Tabular figures, or the whole line shuffles sideways every second as
          the digits change width — which is exactly the sort of small movement
          that pulls an eye back to a timer it is meant to be ignoring.

          `role="timer"` rather than a live region, and the distinction is the
          whole of whether this is usable with a screen reader: a polite live
          region around a value that changes every second announces it every
          second. A timer's implicit live setting is `off` — it is there to be
          read when asked for, which is exactly what a countdown you are
          supposed to be ignoring should be.
        */}
        <p
          role="timer"
          aria-label={`${Math.ceil(focus.remaining / 60)} minutes left`}
          className="mt-3 text-4xl font-semibold tabular-nums"
        >
          {formatRemaining(focus.remaining)}
        </p>

        <p className="mt-3 text-xs opacity-60">
          The lights are off and your creature is asleep. Come back when you are done.
        </p>

        {/*
          Stopping early is available, quiet, and not a button. It sits below
          the fold of the card in the same weight as a footnote, because the
          product should never be as easy to leave as it is to start.
        */}
        <button
          type="button"
          onClick={() => void focus.stop()}
          disabled={focus.busy}
          className={cn(
            'press mt-4 text-xs underline underline-offset-4 opacity-50 outline-none',
            'hover:opacity-90 focus-visible:opacity-90 disabled:opacity-30',
          )}
        >
          {focus.busy ? 'Stopping…' : 'Stop early'}
        </button>

        {focus.error && (
          <p role="status" className="animate-shake mt-3 text-xs text-destructive-foreground">
            {focus.error}
          </p>
        )}
      </section>
    );
  }

  /*
   * Standing somewhere else.
   *
   * Checked after `focus.active`, and the order is deliberate: a session that
   * is already running has to keep rendering its countdown whatever else is on
   * screen. It cannot actually happen — the door to the parks is not drawn
   * during a session and the server refuses the reverse — but a slot that
   * hides a running timer because of a state it should not be in is a worse
   * failure than the one it is guarding against.
   */
  if (away) {
    return (
      <section
        ref={slotRef}
        aria-label="Focus"
        className="rounded-2xl border-2 border-dashed border-border p-5 text-center"
      >
        <p className="text-[0.65rem] font-medium tracking-[0.2em] text-muted-foreground uppercase opacity-70">
          Focus
        </p>

        <p className="mt-2 text-sm text-muted-foreground">
          You are out in {away.label}.
        </p>

        <p className="mt-1 text-xs text-muted-foreground opacity-70">
          An hour with the lights off is not much use somewhere people can walk up to
          you.
        </p>

        <button
          type="button"
          onClick={away.leave}
          className={cn(
            'press mt-3 text-xs font-medium text-foreground underline underline-offset-4',
            'outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring',
            'rounded-sm',
          )}
        >
          Head home
        </button>
      </section>
    );
  }

  const armed = dragging !== null;

  return (
    <section
      ref={slotRef}
      aria-label="Focus"
      className={cn(
        'rounded-2xl border-2 border-dashed p-5 text-center duration-200',
        // Named rather than `all`: `transition: all` animates every property
        // that ever changes, including layout ones nobody meant to animate.
        'transition-[border-color,background-color,color,transform]',
        over
          ? // The one moment the slot is allowed to be loud.
            'scale-[1.02] border-primary bg-primary/10 text-foreground'
          : armed
            ? 'border-primary/50 bg-primary/5 text-foreground'
            : 'border-border text-muted-foreground',
      )}
    >
      <p className="text-[0.65rem] font-medium tracking-[0.2em] uppercase opacity-70">
        Focus
      </p>

      <p className="mt-2 text-sm">
        {over
          ? 'Let go'
          : armed
            ? 'Bring it here'
            : 'Drag one thing here when you are ready to work on it'}
      </p>

      {!armed && (
        <p className="mt-1 text-xs opacity-70">One at a time. That is the whole idea.</p>
      )}
    </section>
  );
}

/**
 * The goal, under the pointer, while it is being carried.
 *
 * Fixed rather than absolute, and `pointer-events-none`, so it cannot land
 * under itself and cannot swallow the drop it is illustrating. Rendered by the
 * panel that owns the drag, so there is exactly one of them.
 *
 * **It is positioned by the drag, not by this component.** It used to take a
 * point as a prop and set `left`/`top` from it, which meant a React render and
 * a layout on every pointer move — sixty of each per second, on the gesture a
 * phone performs with a thumb. Now `useGoalDrag` writes a `translate3d` onto
 * the element through `ghostRef` and this renders once per pickup.
 *
 * The centring offset lives in an inner element for the same reason: the outer
 * element's `transform` belongs to the drag, so a `-translate-1/2` on it would
 * be overwritten by the first move.
 */
export function DragGhost({
  goal,
  over,
  elementRef,
}: {
  goal: DraggedGoal;
  over: boolean;
  elementRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={elementRef} aria-hidden className="pointer-events-none fixed top-0 left-0 z-50">
      <div
        className={cn(
          '-translate-x-1/2 -translate-y-1/2 select-none',
          'max-w-56 truncate rounded-xl border px-3 py-2 text-sm shadow-lg',
          'transition-colors duration-150 motion-reduce:transition-none',
          over
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-card text-card-foreground',
        )}
      >
        {goal.title}
      </div>
    </div>
  );
}
