import { Button } from '../../components/ui/button';
import { authClient, useSession } from '../../lib/auth-client';

/**
 * Small overlay for the world view: who's logged in, and a way out.
 * Sits on top of the PixiJS canvas as ordinary DOM — the canvas never needs
 * to know a session exists (/Docs/project-overview.md §10).
 */
export function UserBadge() {
  const { data: session } = useSession();
  if (!session) return null;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-2 text-sm text-card-foreground backdrop-blur">
      <span>{session.user.name}</span>
      <Button variant="ghost" size="sm" className="h-auto px-2 py-1" onClick={() => authClient.signOut()}>
        Sign out
      </Button>
    </div>
  );
}
