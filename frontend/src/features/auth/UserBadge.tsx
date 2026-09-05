import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useSession } from '../../lib/auth-client';
import { endSession } from '../../lib/session';
import { cn } from '../../lib/utils';

/**
 * Who's logged in, and a way out. Ordinary DOM in the page header — the
 * canvas never needs to know a session exists (/Docs/project-overview.md §10).
 *
 * **The way to other people is no longer in here.** It used to be a small icon
 * button beside the name, which opened a sheet over the page. Going to see
 * somebody is not an account action and it is not a thing you dismiss — it is
 * one of the two halves the product has — so it now lives in its own switch
 * beside this badge (`Dashboard`'s `ModeSwitch`), where it can say which half
 * you are in rather than merely offering to open something.
 */
export function UserBadge() {
  const { data: session } = useSession();
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (!session) return null;

  return (
    <div className="relative flex shrink-0 items-center gap-1 rounded-full border border-border bg-card py-1 pr-1 pl-3 text-sm text-card-foreground">
      <span className="max-w-32 truncate">{session.user.name}</span>

      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        disabled={leaving}
        onClick={() => {
          setFailed(null);
          setLeaving(true);
          /*
           * One call, and everything it means is inside it (`lib/session.ts`):
           * the socket closed while its cookie is still good, the room silenced,
           * this tab's memory of where it was thrown away, the session revoked
           * on the server, and then a new document so nothing in memory can
           * outlive any of it.
           *
           * It only resolves when the sign-out *failed*, in which case the
           * session is still live and saying "signed out" would be a lie.
           */
          void endSession().then((error) => {
            if (!error) return;
            setLeaving(false);
            setFailed(error);
          });
        }}
        className={cn(
          'press grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground',
          'transition-colors hover:bg-muted hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:opacity-50',
        )}
      >
        <LogOut aria-hidden className="size-4" />
      </button>

      {failed && (
        <p
          role="alert"
          className={cn(
            'absolute top-full right-0 z-10 mt-2 w-64 rounded-lg border border-border',
            'bg-card p-2.5 text-xs text-destructive shadow-lg',
          )}
        >
          You are still signed in — {failed}
        </p>
      )}
    </div>
  );
}
