import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { imageSrc } from '../media/api';
import { cn } from '../../lib/utils';
import { deleteMemory, fetchMemories, setMemoryVisibility } from './api';
import type { Memory } from './api';
import { PetPortrait } from '../pets/PetPortrait';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { Skeleton } from '../../components/ui/skeleton';
import { useDelayedVisible } from '../../lib/useDelayedVisible';

/**
 * The memory book.
 *
 * Everything the user chose to keep, newest first. Most entries arrive by
 * finishing something — the completion flow writes them — so this panel is
 * mostly a reader, and the two things it can do are share an entry and take one
 * away.
 *
 * It reloads when `refreshToken` changes rather than holding a subscription:
 * the only thing that adds to the book is a goal completion, the dashboard
 * knows when one happened, and a bump of a number is a great deal less
 * machinery than a store for a list nobody edits.
 *
 * ## The shape of an entry, and why it changed
 *
 * This was a list of rows: a cropped strip of photograph, a truncated title, a
 * line of grey 10px type reading "Finished · today", and a Remove link that
 * only existed on hover. It read as a table of files. What it is meant to be is
 * the thing the signed-out page promises — *a diary you did not have to
 * remember to write* — so an entry is now a small page:
 *
 * ```text
 *   ┌──────────────────────────────────┐
 *   │  the photograph, if there is one │
 *   ├──────────────────────────────────┤
 *   │ ╭────╮   TODAY                   │
 *   │ │ :) │   Wrote 300 words         │
 *   │ ╰────╯   Twenty-five minutes…    │
 *   │                                  │
 *   │ [ Just for you ]         [bin]   │
 *   └──────────────────────────────────┘
 * ```
 *
 * The date is an eyebrow rather than a footnote, because in a diary the date is
 * the first thing on the page; the title is allowed to wrap instead of being
 * truncated, because it is a sentence about somebody's day and not a filename;
 * and the creature is there, at 40px, because it was. That is the home page's
 * memory card (`features/home/sections.tsx`) with a photograph added, which is
 * deliberate — the same object, in the two places it is shown.
 *
 * Two things that were broken rather than merely plain:
 *
 * **Remove was invisible on a phone.** It was `opacity-0 group-hover:opacity-100`,
 * and a touch screen has no hover, so on the device most of these photographs
 * are taken on there was no way to delete one at all.
 *
 * **And it was one tap from gone.** No confirmation, no undo, on the one kind
 * of row in this product that cannot be recreated. It now asks, inline, in the
 * space the button was in — a dialog for this would be heavier than the thing
 * it is protecting.
 */

interface MemoriesPanelProps {
  /** Bump to reload — a goal was just completed. */
  refreshToken: number;
  /**
   * The creature, for the byline on each page.
   *
   * The working appearance rather than a per-memory snapshot, and the copy is
   * written to be true of that: the portrait is a byline for the book, not a
   * photograph of who was in the room on the day. Storing a rig per memory
   * would be a schema change to illustrate a caption.
   */
  appearance?: PetAppearance;
  /**
   * A memory started or stopped being public.
   *
   * Reported upward because "how many memories you have shared" is one of the
   * three counters the object catalogue is unlocked against, and this panel is
   * the only place in the product where that number changes on its own. It
   * fires on a *successful* change only — a toggle the server refused has
   * changed nothing to report.
   *
   * Deliberately not "a memory changed": renaming one is not an event anybody
   * above needs, and a callback that fires for everything is one that callers
   * stop trusting.
   */
  onSharedChange?: () => void;
}

/**
 * When it happened, in the words somebody would use.
 *
 * Relative while relative is more useful than a date, and the visitor's own
 * locale after that — a hard-coded American date on a European screen is the
 * smallest possible way to say "this was not made for you".
 */
function when(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    // Only once it stops being obvious. A year on every entry is noise for the
    // eleven months of them that are from this one.
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function MemoriesPanel({
  refreshToken,
  appearance,
  onSharedChange,
}: MemoriesPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  /** The memory whose Remove has been pressed once and is asking. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The memory whose visibility is in flight, so its switch can be gated. */
  const [sharing, setSharing] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const items = await fetchMemories(controller.signal);
        if (controller.signal.aborted) return;
        setMemories(items);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (!(cause instanceof ApiError && cause.isUnauthorized)) {
          setError('Your memories could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [refreshToken]);

  const remove = useCallback(
    async (memory: Memory) => {
      setRemoving(memory.id);
      setConfirming(null);
      try {
        await deleteMemory(memory.id);
        if (!alive.current) return;
        setMemories((current) => current.filter((m) => m.id !== memory.id));
        // Deleting a shared memory un-shares it. Only then, though: throwing
        // away something nobody could see moves no counter.
        if (memory.visibility === 'public') onSharedChange?.();
      } catch {
        if (alive.current) setError('That memory could not be removed.');
      } finally {
        if (alive.current) setRemoving(null);
      }
    },
    [onSharedChange],
  );

  /**
   * Show a memory to visitors, or take it back.
   *
   * Optimistic in neither direction: the switch waits for the server, because
   * the one thing worse than a slow toggle is a toggle that says "shared" for a
   * second and then quietly is not. The server is the only thing that decides
   * what a visitor can see, and the interface should agree with it rather than
   * predict it.
   */
  const toggleShared = useCallback(
    async (memory: Memory) => {
      setSharing(memory.id);
      const next = memory.visibility === 'public' ? 'private' : 'public';

      try {
        const updated = await setMemoryVisibility(memory.id, next);
        if (!alive.current) return;
        setMemories((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        onSharedChange?.();
      } catch {
        if (alive.current) setError('That could not be changed. Try again in a moment.');
      } finally {
        if (alive.current) setSharing(null);
      }
    },
    [onSharedChange],
  );

  const showSkeleton = useDelayedVisible(loading, { delay: 150, minVisible: 400 });

  if (showSkeleton) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="sr-only">
          Loading your memories…
        </p>
        {[0, 1, 2].map((row) => (
          <div key={row} className="overflow-hidden rounded-2xl border border-border bg-card">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="flex items-start gap-3 p-4">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-2.5 w-1/4" />
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loading) return null;

  if (error && memories.length === 0) {
    return (
      <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (memories.length === 0) return <EmptyBook appearance={appearance} />;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Kept · {memories.length}
        </h3>
        <p className="text-[0.65rem] text-muted-foreground">Newest first</p>
      </div>

      {error && (
        <p className="animate-shake rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </p>
      )}

      <ul className="stagger space-y-3">
        {memories.map((memory) => (
          <li
            key={memory.id}
            className={cn(
              'group overflow-hidden rounded-2xl border border-border bg-card',
              'shadow-lg shadow-black/5 transition-shadow hover:shadow-xl hover:shadow-black/10',
            )}
          >
            {memory.imageUrl && (
              /*
                A photograph, cropped to one shape.
                Four-by-three for every entry, because a column of pictures at
                whatever aspect each phone happened to shoot reads as a folder
                rather than as an album — and the alternative, letterboxing a
                portrait photo into a landscape box, is worse: two grey bands
                either side of the thing somebody wanted to keep.
              */
              <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                <img
                  src={imageSrc(memory.imageUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="p-4">
              <div className="flex items-start gap-3">
                {appearance && (
                  <PetPortrait
                    appearance={appearance}
                    size={40}
                    alt=""
                    className="shrink-0 rounded-full bg-background/60"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-accent uppercase">
                    {when(memory.createdAt)}
                    {memory.type === 'goal_completed' && ' · Finished'}
                  </p>
                  <h4 className="mt-1 text-sm leading-snug font-semibold text-balance">
                    {memory.title}
                  </h4>
                  {memory.description && (
                    <p className="prose-lead mt-1 text-xs text-muted-foreground">
                      {memory.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                {/*
                  Whether anybody else can see it, and a way to change your
                  mind. Stated in words as well as an icon: "shared" and
                  "private" are the two things a person actually wants to know
                  about a memory of their own life, and a small symbol alone
                  makes that a guess.
                */}
                <button
                  type="button"
                  onClick={() => void toggleShared(memory)}
                  disabled={sharing === memory.id}
                  aria-pressed={memory.visibility === 'public'}
                  className={cn(
                    'press inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full px-2.5',
                    'text-[0.65rem] font-medium transition-colors disabled:opacity-50',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    memory.visibility === 'public'
                      ? 'bg-primary/15 text-primary hover:bg-primary/25'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  )}
                >
                  {memory.visibility === 'public' ? (
                    <Eye aria-hidden className="size-3.5 shrink-0" />
                  ) : (
                    <EyeOff aria-hidden className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {sharing === memory.id
                      ? 'Saving…'
                      : memory.visibility === 'public'
                        ? 'Visitors can see this'
                        : 'Just for you'}
                  </span>
                </button>

                {confirming === memory.id ? (
                  <span className="flex shrink-0 items-center gap-1 text-[0.65rem]">
                    <span className="text-muted-foreground">Remove?</span>
                    <button
                      type="button"
                      onClick={() => void remove(memory)}
                      className="press rounded-full bg-destructive/10 px-2 py-1 font-medium text-destructive hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className="press rounded-full px-2 py-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(memory.id)}
                    disabled={removing === memory.id}
                    aria-label={`Remove ${memory.title}`}
                    className={cn(
                      'press grid size-8 shrink-0 place-items-center rounded-full',
                      'text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      'disabled:opacity-50',
                    )}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A book with nothing in it yet.
 *
 * The old one was two grey sentences in a dashed box, which is what an empty
 * state looks like when it is written as an apology. This one is the first page
 * of the book: the creature, waiting, and the one sentence that says how a page
 * gets written. Same information, and it now looks like part of the product
 * rather than a gap in it.
 */
function EmptyBook({ appearance }: { appearance?: PetAppearance }) {
  return (
    <div className="animate-rise rounded-2xl border border-dashed border-border bg-card/50 px-5 py-8 text-center">
      {appearance ? (
        <PetPortrait appearance={appearance} size={88} alt="" className="mx-auto opacity-90" />
      ) : (
        <div className="mx-auto size-[88px]" aria-hidden />
      )}

      <p className="mt-3 text-sm font-semibold">Nothing kept yet.</p>
      <p className="mx-auto mt-1 max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
        Finish a goal and you will be asked whether to remember it — a line about
        what you did, and a picture if you took one.
      </p>
    </div>
  );
}
