import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { imageSrc } from '../media/api';
import { cn } from '../../lib/utils';
import { deleteMemory, fetchMemories } from './api';
import type { Memory } from './api';
import { Skeleton } from '../../components/ui/skeleton';
import { useDelayedVisible } from '../../lib/useDelayedVisible';

/**
 * The memory book.
 *
 * Everything the user chose to keep, newest first. Most entries arrive by
 * finishing something — the completion flow writes them — so this panel is
 * mostly a reader, and the one thing it can do is take an entry away.
 *
 * It reloads when `refreshToken` changes rather than holding a subscription:
 * the only thing that adds to the book is a goal completion, the dashboard
 * knows when one happened, and a bump of a number is a great deal less
 * machinery than a store for a list nobody edits.
 */

interface MemoriesPanelProps {
  /** Bump to reload — a goal was just completed. */
  refreshToken: number;
}

function when(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function MemoriesPanel({ refreshToken }: MemoriesPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
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

  const remove = useCallback(async (id: string) => {
    setRemoving(id);
    try {
      await deleteMemory(id);
      if (alive.current) setMemories((current) => current.filter((m) => m.id !== id));
    } catch {
      if (alive.current) setError('That memory could not be removed.');
    } finally {
      if (alive.current) setRemoving(null);
    }
  }, []);

  const showSkeleton = useDelayedVisible(loading, { delay: 150, minVisible: 400 });

  if (showSkeleton) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="sr-only">
          Loading your memories…
        </p>
        {[0, 1, 2].map((row) => (
          <div key={row} className="overflow-hidden rounded-xl border border-border bg-card">
            <Skeleton className="h-48 w-full rounded-none" />
            <div className="space-y-1.5 p-3">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loading) return null;

  if (error && memories.length === 0) {
    return (
      <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="animate-rise space-y-2 rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Nothing kept yet.</p>
        <p className="text-xs text-muted-foreground">
          Finish a goal and you'll be asked whether you want to remember it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
              'group overflow-hidden rounded-xl border border-border bg-card',
              'transition-shadow hover:shadow-sm',
            )}
          >
            {memory.imageUrl && (
              <div className="h-48 w-full overflow-hidden bg-muted">
                <img
                  src={imageSrc(memory.imageUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{memory.title}</p>
                {memory.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {memory.description}
                  </p>
                )}
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  {memory.type === 'goal_completed' ? 'Finished' : 'Kept'} ·{' '}
                  {when(memory.createdAt)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void remove(memory.id)}
                disabled={removing === memory.id}
                aria-label={`Remove ${memory.title}`}
                className={cn(
                  'press shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity',
                  'group-hover:opacity-100 hover:text-destructive',
                  'focus-visible:opacity-100 focus-visible:outline-none disabled:opacity-50',
                )}
              >
                {removing === memory.id ? '…' : 'Remove'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
