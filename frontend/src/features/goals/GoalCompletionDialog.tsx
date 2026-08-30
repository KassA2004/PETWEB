import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, uploadImage } from '../media/api';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { CompletionMemory, Goal } from './api';

/**
 * Finishing something.
 *
 * The only place in the product where a click does not immediately do the
 * thing, and the delay is the feature. Ticking a box is over in a moment;
 * finishing something you set out to do a fortnight ago is worth being asked
 * about, and the question — *would you like to remember this?* — is the
 * difference between a to-do list and a record of a year.
 *
 * ```text
 *                 tick the goal
 *                       ↓
 *              ┌── this dialog ──┐
 *              │                 │
 *          add a picture      skip it
 *              │                 │
 *          preview it            │
 *              └────── ↓ ────────┘
 *                   Complete
 *                       ↓
 *          upload (if any) → complete → memory
 * ```
 *
 * Three rules it exists to keep:
 *
 * **The goal is not finished until this says so.** Closing, cancelling or
 * pressing Escape leaves it exactly as it was. The tick is a request to open
 * this, not a state change.
 *
 * **The picture is optional at every step.** No picture completes the goal, and
 * a picture that fails to upload offers to complete it anyway — the thing the
 * user actually did happened in the real world, and refusing to record it
 * because a file did not transfer would be the product losing the plot.
 *
 * **One completion per press.** The button is gated while a request is in
 * flight, and the server treats a repeat as the same request
 * (`Memory.goalId` is unique), so even a double submit that gets through
 * cannot produce two memories.
 */

interface GoalCompletionDialogProps {
  /** The goal being finished, or null when the dialog is closed. */
  goal: Goal | null;
  onCancel: () => void;
  /**
   * Do it. Resolves to the completed goal, or null if the server refused — in
   * which case the dialog stays up with the error rather than closing on a
   * failure the user cannot see.
   */
  onConfirm: (memory?: CompletionMemory) => Promise<Goal | null>;
}

export function GoalCompletionDialog({
  goal,
  onCancel,
  onConfirm,
}: GoalCompletionDialogProps) {
  return (
    <Dialog
      open={goal !== null}
      onClose={onCancel}
      title={goal ? `Finished "${goal.title}"?` : 'Finished?'}
      description="Would you like to add a picture to remember this? It's optional."
      className="max-w-md"
    >
      {/*
        Keyed on the goal, so every completion starts clean.
        A `useEffect` resetting six pieces of state when the prop changes is
        the same thing written worse: React already has a way to say "this is
        a different one now", and it is the key.
      */}
      {goal && (
        <CompletionForm
          key={goal.id}
          goal={goal}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </Dialog>
  );
}

type Stage = 'asking' | 'uploading' | 'saving';

/** A chosen file and the object URL previewing it, which live and die together. */
interface Picked {
  file: File;
  url: string;
}

function CompletionForm({
  goal,
  onCancel,
  onConfirm,
}: {
  goal: Goal;
  onCancel: () => void;
  onConfirm: (memory?: CompletionMemory) => Promise<Goal | null>;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [note, setNote] = useState('');
  /**
   * Whether anybody who looks this account up may see the memory.
   *
   * **Off.** Private is the default here, in the DTO, in the column and in the
   * migration that backfilled every memory written before this existed — four
   * places agreeing, because this is the one setting in the product that must
   * never fail open. A memory is something somebody kept for themselves until
   * they say otherwise.
   *
   * Asked here rather than in the memory book because this is the only moment
   * the user is actually thinking about the thing they just finished. A
   * visibility switch buried in a list is a switch nobody ever finds — and the
   * book can still change it afterwards, which is what keeps this decision
   * cheap to make.
   */
  const [share, setShare] = useState(false);
  const [stage, setStage] = useState<Stage>('asking');
  const [error, setError] = useState<string | null>(null);
  /** Set once an upload has failed, so the retry can offer to give up on it. */
  const [uploadFailed, setUploadFailed] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const busy = stage !== 'asking';

  /**
   * Object URLs leak, and this is where.
   *
   * Each one pins its File in memory until it is revoked, so a user who tries
   * four photographs before settling on one has four of them held. The URL is
   * created in the event handler that chose the file — a side effect belongs in
   * the handler that caused it — and revoked the moment it is replaced, cleared,
   * or the form goes away.
   */
  const latest = useRef<Picked | null>(null);

  useEffect(() => {
    return () => {
      if (latest.current) URL.revokeObjectURL(latest.current.url);
    };
  }, []);

  /** Swap the chosen picture, revoking whatever it replaces. */
  const replace = (next: Picked | null) => {
    // Written here rather than during render: the ref is the unmount cleanup's
    // only view of what is currently held, and the one place it changes is the
    // one place the picture changes.
    latest.current = next;
    setPicked((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return next;
    });
  };

  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    // Let the same file be picked again after being removed; without this the
    // input's value is unchanged and `change` never fires a second time.
    event.target.value = '';
    if (!chosen) return;

    if (chosen.size > MAX_IMAGE_BYTES) {
      setError('That picture is over 5 MB. Try a smaller one.');
      return;
    }

    setError(null);
    setUploadFailed(false);
    replace({ file: chosen, url: URL.createObjectURL(chosen) });
  };

  /** @param withPicture false to finish without the picture that just failed. */
  const submit = async (withPicture: boolean) => {
    if (busy) return;

    setError(null);
    let imageUrl: string | undefined;

    if (picked && withPicture) {
      setStage('uploading');
      try {
        imageUrl = (await uploadImage(picked.file)).url;
      } catch (cause) {
        setStage('asking');
        setUploadFailed(true);
        setError(
          cause instanceof ApiError ? cause.message : 'That picture could not be uploaded.',
        );
        // Deliberately stops here, with the goal still open. The user is never
        // left wondering which half went through.
        return;
      }
    }

    setStage('saving');

    const trimmed = note.trim();
    const keepMemory = Boolean(imageUrl) || trimmed.length > 0;

    const completed = await onConfirm(
      keepMemory
        ? {
            title: goal.title,
            description: trimmed,
            imageUrl,
            visibility: share ? 'public' : 'private',
          }
        : undefined,
    );

    if (!completed) {
      setStage('asking');
      setError('That could not be saved. Try again in a moment.');
      return;
    }

    // Success closes the dialog from above; nothing to do here but stop
    // looking like it is still working, in case the unmount is a frame late.
    setStage('asking');
  };

  const confirmLabel =
    stage === 'uploading'
      ? 'Uploading…'
      : stage === 'saving'
        ? 'Saving…'
        : picked
          ? 'Complete with this picture'
          : 'Complete';

  return (
    <div className="space-y-4">
      {picked ? (
        <figure className="animate-pop-in space-y-2">
          <img
            src={picked.url}
            alt="The picture you chose"
            className="max-h-56 w-full rounded-xl border border-border object-cover"
          />
          <figcaption className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {picked.file.name}
            </span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                className="press rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  replace(null);
                  setUploadFailed(false);
                }}
                disabled={busy}
                className="press rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </figcaption>
        </figure>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className={cn(
            'press flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border',
            'p-6 text-sm text-muted-foreground outline-none',
            'hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50',
          )}
        >
          <span aria-hidden className="text-xl">
            ＋
          </span>
          Add a picture
          <span className="text-[0.65rem]">PNG, JPEG or WebP · up to 5 MB</span>
        </button>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        onChange={choose}
        className="hidden"
        tabIndex={-1}
      />

      <div className="space-y-1">
        <label
          htmlFor="completion-note"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          A note, if you want one
        </label>
        <Input
          id="completion-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="How did it go?"
          maxLength={500}
          disabled={busy}
        />
      </div>

      {/*
        Only offered once there is a memory to share. A switch above an empty
        note is a question about something that does not exist yet, and the
        answer to it would be silently discarded — the completion sends no
        memory at all when there is nothing in it.
      */}
      {(picked || note.trim()) && (
        <label
          className={cn(
            'animate-rise flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
            share ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/40',
          )}
        >
          <input
            type="checkbox"
            checked={share}
            onChange={(event) => setShare(event.target.checked)}
            disabled={busy}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Let visitors see this one</span>
            <span className="block text-xs text-muted-foreground">
              {share
                ? 'Anyone who looks you up will find it. You can take it back later.'
                : 'Kept to yourself. Only you will see it in your book.'}
            </span>
          </span>
        </label>
      )}

      {error && (
        <div className="animate-shake space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-xs text-destructive">{error}</p>
          {uploadFailed && (
            <button
              type="button"
              onClick={() => void submit(false)}
              disabled={busy}
              className="press text-xs font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
            >
              Complete it without the picture
            </button>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={busy}>
          Not yet
        </Button>
        <Button className="flex-1" onClick={() => void submit(true)} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
