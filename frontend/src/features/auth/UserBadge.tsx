import { Button } from '../../components/ui/button';
import { authClient, useSession } from '../../lib/auth-client';

/**
 * Who's logged in, and a way out. Ordinary DOM in the page header — the
 * canvas never needs to know a session exists (/Docs/project-overview.md §10).
 */
export function UserBadge() {
  const { data: session } = useSession();
  if (!session) return null;

  return (
    <div className="flex shrink-0 items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground">
      <span>{session.user.name}</span>
      <Button variant="ghost" size="sm" className="h-auto px-2 py-1" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </div>
  );
}
