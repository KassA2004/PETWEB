import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import type { DraggedGoal } from './useGoalDrag';

/**
 * How long?
 *
 * Opens on the drop and **does not start anything**. Dropping a goal into the
 * slot is the user saying "this one"; the hour does not begin until they have
 * also said how long, and have pressed something that says so. That gap is the
 * whole reason this is a dialog rather than a menu: committing to forty-five
 * minutes should feel like a decision, and a decision you can back out of
 * right up to the moment you make it.
 *
 * ```text
 *   drop ──→ this ──→ Begin ──→ lights out, creature asleep, room locked
 *              │
 *              └──→ Escape / Not yet ──→ nothing happened at all
 * ```
 *
 * The presets and the minimum both come from the server (`/focus`), so the
 * rule and the buttons offering it can never drift apart — and so a client
 * that made up its own number would simply be refused.
 */

interface FocusSetupDialogProps {
  /** The goal that was dropped, or null when the dialog is closed. */
  goal: DraggedGoal | null;
  presets: number[];
  minMinutes: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
}

export function FocusSetupDialog({
  goal,
  presets,
  minMinutes,
  busy,
  error,
  onCancel,
  onConfirm,
}: FocusSetupDialogProps) {
  return (
    <Dialog
      open={goal !== null}
      onClose={busy ? () => undefined : onCancel}
      title={goal ? goal.title : 'Focus'}
      description="How long are you giving it?"
      className="max-w-sm"
    >
      {/* Keyed on the goal, so a second drop never inherits the first one's
          chosen length — the same reasoning as the completion dialog. */}
      {goal && (
        <SetupForm
          key={goal.id}
          presets={presets}
          minMinutes={minMinutes}
          busy={busy}
          error={error}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </Dialog>
  );
}

function SetupForm({
  presets,
  minMinutes,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  presets: number[];
  minMinutes: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
}) {
  const allowed = presets.filter((minutes) => minutes >= minMinutes);
  const options = allowed.length > 0 ? allowed : presets;

  // The second one, not the first: 45 minutes is the length this is actually
  // for, and defaulting to the shortest option quietly recommends it.
  const [minutes, setMinutes] = useState(options[Math.min(1, options.length - 1)]);

  return (
    <div className="space-y-5">
      <div
        role="radiogroup"
        aria-label="Session length"
        className="grid grid-cols-2 gap-2"
      >
        {options.map((option) => {
          const chosen = option === minutes;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={busy}
              onClick={() => setMinutes(option)}
              className={cn(
                'press rounded-xl border px-4 py-3 text-sm font-medium outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                chosen
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:border-primary/50',
              )}
            >
              {option} min
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        The lights go out and your creature settles down for {minutes} minutes. You can
        stop early, but it would rather you did not.
      </p>

      {error && (
        <p
          role="status"
          className="animate-shake rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={busy}>
          Not yet
        </Button>
        <Button className="flex-1" onClick={() => onConfirm(minutes)} disabled={busy}>
          {busy ? 'Starting…' : 'Begin'}
        </Button>
      </div>
    </div>
  );
}
