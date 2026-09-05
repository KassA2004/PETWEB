import { useState } from 'react';
import { Timer } from 'lucide-react';
import { formatMetric } from '../../lib/progress';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { DragGhost, FocusSlot } from '../focus/FocusSlot';
import type { AwayFrom } from '../focus/FocusSlot';
import { FocusSetupDialog } from '../focus/FocusSetupDialog';
import { useGoalDrag } from '../focus/useGoalDrag';
import type { DraggedGoal } from '../focus/useGoalDrag';
import type { FocusHandle } from '../focus/useFocus';
import { affectionLine } from '../focus/affection-words';
import { imageSrc } from '../media/api';
import { sfx } from '../../lib/audio';
import { cn } from '../../lib/utils';
import type { Goal } from './api';
import type { GoalsState } from './useGoals';

/**
 * Goals — the bridge between real life and the world.
 *
 * The panel owns the list, the draft, and now the gesture that connects the two
 * halves of the product: a goal is *carried* into the Focus slot. There is no
 * button for it, on purpose — see `useFocus/useGoalDrag`.
 *
 * ```text
 *   pick a goal up ──→ drop it in Focus ──→ how long? ──→ the room goes dark
 *        │
 *        └── or tick it off, which is a different sentence entirely: finishing
 *            a session means "I did the time", finishing a goal means "I am
 *            done", and a goal can outlive any number of sessions
 * ```
 *
 * The six-goal cap is presented as an intention rather than an error: the field
 * turns into a sentence about finishing something, which is what the cap is
 * for. The server refuses a seventh regardless — the disabled input is a
 * courtesy, not the rule (`Backend/src/goals/goal-limit.ts`).
 *
 * While a session is running the panel is nearly empty. That is the feature:
 * the user committed to one thing, and a list of the other five is exactly the
 * thing they were trying to put down.
 */

interface GoalsPanelProps {
  goals: GoalsState;
  focus: FocusHandle;
  /** For the one line about how the creature is finding all this. */
  petName: string;
  /** Open the completion flow for this goal. */
  onBeginComplete: (goal: Goal) => void;
  /**
   * A goal has just landed in the slot and the length is being chosen.
   *
   * The panel has no way to reach the world — the creature lives in a PixiJS
   * scene the dashboard owns — so it says what happened and the dashboard
   * decides what the creature makes of it. The same direction of dependency the
   * audio system uses, and for the same reason.
   */
  onDropped?: () => void;
  /**
   * Somewhere the user is standing that a session cannot begin from.
   *
   * Passed straight through to the slot, which is the only thing in the panel
   * that changes — the rest of the list is still theirs to read and tick off
   * from a park, and taking it away would be punishing them for being out.
   */
  away?: AwayFrom | null;
}

/**
 * How long has actually gone into this.
 *
 * ```text
 *   ⏱ 1h 20m focused
 * ```
 *
 * Under the title rather than beside it, because it is a fact *about* the goal
 * and not a second column of the list: at the right-hand end it would sit in
 * the same place as the drag handle and the Remove control, and a row where a
 * number and two controls share an edge is a row people press the wrong thing
 * in. Under the title it is a caption, which is what it is.
 *
 * **Absent at zero.** A brand-new goal saying "0m focused" is the interface
 * reporting that nothing has happened yet, on every row, for ever — and the
 * whole feature is about the rows where something *has*. It appears the first
 * time a session on it runs to the end, which makes its arrival a small piece
 * of feedback rather than a field that was always there changing value.
 *
 * The wording comes from `formatMetric`, the same function the progress tiles
 * use, so "1h 20m" means the same thing in both places and neither has its own
 * opinion about when minutes become hours.
 */
function FocusedTime({ minutes }: { minutes: number }) {
  if (minutes <= 0) return null;

  return (
    <span className="mt-0.5 flex items-center gap-1 text-[0.7rem] text-muted-foreground">
      <Timer aria-hidden className="size-3 shrink-0" />
      <span>
        {/*
          The number is the loud half. It is the thing somebody is proud of, and
          at this size the difference between "25m focused" as one grey string
          and "**25m** focused" is the difference between a caption you read and
          one you skim past.
        */}
        <span className="font-medium text-foreground/70">
          {formatMetric('focusMinutes', minutes)}
        </span>{' '}
        focused
      </span>
    </span>
  );
}

export function GoalsPanel({
  goals,
  focus,
  petName,
  onBeginComplete,
  onDropped,
  away = null,
}: GoalsPanelProps) {
  const [draft, setDraft] = useState('');
  /** Dropped in the slot, waiting for a length. Not yet a session. */
  const [pending, setPending] = useState<DraggedGoal | null>(null);

  const { open, completed, atLimit, maxOpen, loading, busy, error, limitReached } =
    goals;

  const drag = useGoalDrag((goal) => {
    // Carried all the way there from a park. The slot says why it will not
    // take it; this is only the sound of it not being taken, because a drop
    // that makes the "yes" noise and then does nothing is worse than silence.
    if (away) {
      sfx.refuse();
      return;
    }

    sfx.drop();
    setPending(goal);
    // Something appeared over the creature's world. It looks up.
    onDropped?.();
  });

  const begin = async (minutes: number) => {
    if (!pending) return;
    // The dialog stays up if the server refuses — closing on a failure the user
    // cannot see is how somebody ends up thinking they are in a session.
    if (await focus.start(pending.id, minutes)) setPending(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || busy) return;

    // The draft is only cleared once the goal actually exists. A failed create
    // that ate the sentence somebody just wrote is the worst small bug in any
    // form, and it is one `if` away.
    const added = await goals.add(title);
    if (added) setDraft('');
  };

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-14 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  const running = focus.active
    ? (goals.goals.find((item) => item.id === focus.session?.goalId) ?? null)
    : null;

  return (
    <div className="space-y-4">
      <FocusSlot
        focus={focus}
        goalTitle={running?.title ?? null}
        dragging={drag.goal}
        over={drag.over}
        slotRef={drag.slotRef}
        away={away}
      />

      {/*
        The hour, while it is running: everything below the slot goes away. Not
        disabled — away. The user committed to one thing, and a list of the
        other five is exactly what they were trying to put down.

        Rendered as a branch inside the same tree rather than as an early
        return, so the setup dialog at the bottom survives the transition and
        gets to play its exit while the room goes dark behind it. An entrance
        with an instant disappearance is worse than neither
        (`Docs/audio-and-feedback.md` §7).
      */}
      {focus.active ? (
        <p className="px-1 text-xs text-muted-foreground">
          Everything else is still here when you get back.
        </p>
      ) : (
        <>
          <form onSubmit={(event) => void submit(event)} className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  atLimit ? 'Finish one first' : "Something you'll actually do today"
                }
                maxLength={80}
                aria-label="New goal"
                disabled={atLimit || busy}
              />
              <Button type="submit" disabled={!draft.trim() || atLimit || busy}>
                {busy ? '…' : 'Add'}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 text-[0.65rem]">
              <span className="text-muted-foreground">
                {open.length} of {maxOpen} open
              </span>
              {atLimit && !limitReached && (
                <span className="text-muted-foreground">
                  Six is the limit, on purpose.
                </span>
              )}
            </div>

            {error && (
              <p
                role="status"
                className={cn(
                  'animate-rise rounded-xl border p-3 text-xs',
                  limitReached
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {error}
              </p>
            )}
          </form>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              To do{open.length > 0 && ` · ${open.length}`}
            </h3>

            {open.length === 0 ? (
              <p className="animate-rise rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nothing on the list. Your creature is delighted and slightly suspicious.
              </p>
            ) : (
              <ul className="stagger space-y-2">
                {open.map((goal) => {
                  const held = drag.goal?.id === goal.id;

                  return (
                    <li
                      key={goal.id}
                      onPointerDown={(event) =>
                        drag.begin({ id: goal.id, title: goal.title }, event)
                      }
                      // `pan-y` rather than `none`: the list still scrolls under a
                      // thumb, and a drag only starts once the pointer has moved
                      // far enough to mean it (`useGoalDrag`).
                      style={{ touchAction: 'pan-y' }}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl border border-border bg-card p-3',
                        'cursor-grab transition-shadow select-none hover:shadow-sm active:cursor-grabbing',
                        // The row does not disappear while it is carried — it stays
                        // in place, faded, so the list does not reflow under the
                        // hand that is holding one of its rows.
                        held && 'opacity-40',
                      )}
                    >
                      {/*
                        A twenty-pixel circle with a thirty-six-pixel hit area.
                        The circle is the right size to look at and the wrong
                        size to hit: negative margin keeps the row's spacing
                        while the padding gives a thumb something to land on.
                      */}
                      <button
                        type="button"
                        onClick={() => onBeginComplete(goal)}
                        disabled={busy}
                        aria-label={`Complete ${goal.title}`}
                        className={cn(
                          'group/check -m-2 grid size-9 shrink-0 place-items-center rounded-full p-2 outline-none',
                          'focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'press size-5 rounded-full border-2 border-muted-foreground/40',
                            'group-hover/check:border-primary group-hover/check:bg-primary/20',
                          )}
                        />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{goal.title}</span>
                        <FocusedTime minutes={goal.focusedMinutes} />
                      </span>

                      {/*
                        The affordance. A row you can pick up has to look like one,
                        and "it is draggable" is not something a tooltip can say to
                        a thumb.
                      */}
                      <span
                        aria-hidden
                        className="text-xs leading-none text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
                      >
                        ⠿
                      </span>

                      {/*
                        Shown on hover — but only where hovering exists. On a
                        touch screen `group-hover` never fires, so this control
                        was permanently invisible and permanently unusable on
                        exactly the devices that cannot right-click either.
                      */}
                      <button
                        type="button"
                        onClick={() => void goals.remove(goal.id)}
                        disabled={busy}
                        aria-label={`Remove ${goal.title}`}
                        className={cn(
                          'press -my-2 rounded-lg px-2 py-2 text-xs text-muted-foreground transition-opacity',
                          'opacity-100 hover:text-destructive',
                          '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
                          'focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                          'focus-visible:outline-none disabled:opacity-50',
                        )}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {completed.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Done · {completed.length}
              </h3>
              <ul className="space-y-2">
                {completed.map((goal) => (
                  <li
                    key={goal.id}
                    className="animate-rise flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3"
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[0.6rem] text-primary-foreground">
                      ✓
                    </span>

                    {goal.memory?.imageUrl && (
                      <img
                        src={imageSrc(goal.memory.imageUrl)}
                        alt=""
                        className="size-8 shrink-0 rounded-lg border border-border object-cover"
                      />
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="animate-strike block truncate text-sm text-muted-foreground line-through">
                        {goal.title}
                      </span>
                      {/*
                        Not struck through, and that is the point of showing it
                        here at all: the goal is done, the hours are not undone.
                        `line-through` on this line would read as the time
                        having been cancelled along with the task.
                      */}
                      <FocusedTime minutes={goal.focusedMinutes} />
                    </span>

                    <button
                      type="button"
                      onClick={() => void goals.reopen(goal.id)}
                      disabled={busy}
                      aria-label={`Reopen ${goal.title}`}
                      className="press text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            The only place a number about the relationship could have gone, and
            it does not go here either. One sentence, in the same grey as
            everything else on the panel — the creature's behaviour is the
            display, and this is a caption for it.
          */}
          <p className="px-1 text-xs text-muted-foreground">
            {affectionLine(petName, focus.affection.level)}
          </p>
        </>
      )}

      {drag.goal && (
        <DragGhost goal={drag.goal} over={drag.over} elementRef={drag.ghostRef} />
      )}

      <FocusSetupDialog
        goal={pending}
        presets={focus.presets}
        minMinutes={focus.minMinutes}
        busy={focus.busy}
        error={focus.error}
        onCancel={() => {
          setPending(null);
          focus.clearError();
        }}
        onConfirm={(minutes) => void begin(minutes)}
      />
    </div>
  );
}
