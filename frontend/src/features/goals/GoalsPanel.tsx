import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../lib/utils';
import type { Goal } from '../../lib/mock/world';

/**
 * Goals — the bridge between real life and the world.
 *
 * Completing something out here is what puts something new in there
 * (/Docs/project-overview.md §2). The reward and the creature's reaction are
 * handled by the dashboard; this panel only owns the list.
 *
 * Mock: nothing is persisted and nothing is sent anywhere yet.
 */

interface GoalsPanelProps {
  goals: Goal[];
  onAdd: (title: string) => void;
  onComplete: (id: string) => void;
  onRemove: (id: string) => void;
}

export function GoalsPanel({ goals, onAdd, onComplete, onRemove }: GoalsPanelProps) {
  const [draft, setDraft] = useState('');

  const open = goals.filter((goal) => !goal.done);
  const done = goals.filter((goal) => goal.done);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    onAdd(title);
    setDraft('');
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Something you'll actually do today"
          maxLength={80}
          aria-label="New goal"
        />
        <Button type="submit" disabled={!draft.trim()}>
          Add
        </Button>
      </form>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          To do{open.length > 0 && ` · ${open.length}`}
        </h3>

        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nothing on the list. Your creature is delighted and slightly suspicious.
          </p>
        ) : (
          <ul className="space-y-2">
            {open.map((goal) => (
              <li
                key={goal.id}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <button
                  type="button"
                  onClick={() => onComplete(goal.id)}
                  aria-label={`Complete ${goal.title}`}
                  className={cn(
                    'size-5 shrink-0 rounded-full border-2 border-muted-foreground/40 transition-colors outline-none',
                    'hover:border-primary hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                />
                <span className="flex-1 text-sm">{goal.title}</span>
                <button
                  type="button"
                  onClick={() => onRemove(goal.id)}
                  aria-label={`Remove ${goal.title}`}
                  className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Done today · {done.length}
          </h3>
          <ul className="space-y-2">
            {done.map((goal) => (
              <li
                key={goal.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[0.6rem] text-primary-foreground">
                  ✓
                </span>
                <span className="flex-1 text-sm text-muted-foreground line-through">
                  {goal.title}
                </span>
                {goal.rewardLabel && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.65rem] font-medium text-accent">
                    +{goal.rewardLabel}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
