import { LogOut } from 'lucide-react';
import { authClient, useSession } from '../../lib/auth-client';
import { runSignOutTeardowns } from '../../lib/teardown';
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
  if (!session) return null;

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card py-1 pr-1 pl-3 text-sm text-card-foreground">
      <span className="max-w-32 truncate">{session.user.name}</span>

      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => {
          // Close the social socket first, then sign out. In that order: the
          // socket authenticated with the cookie that is about to be cleared,
          // and one that outlives its session on a shared computer is somebody
          // else's connection. Costs nothing for a session that never opened
          // the social panel — see `lib/teardown.ts`.
          runSignOutTeardowns();
          void authClient.signOut();
        }}
        className={cn(
          'press grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground',
          'transition-colors hover:bg-muted hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        )}
      >
        <LogOut aria-hidden className="size-4" />
      </button>
    </div>
  );
}
