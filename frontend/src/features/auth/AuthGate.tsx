import type { ReactNode } from 'react';
import { useSession } from '../../lib/auth-client';
import { AuthScreen } from './AuthScreen';

interface AuthGateProps {
  children: ReactNode;
}

/**
 * The single place the app decides between the landing screen and the world.
 * `GET /api/auth/get-session` returns `200` with `null` rather than `401` for
 * "no session" specifically so this can be a plain data check, not error
 * handling (01-auth-endpoints.md §4).
 */
export function AuthGate({ children }: AuthGateProps) {
  const { data: session, isPending, refetch } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <AuthScreen onAuthenticated={() => void refetch()} />;
  }

  return <>{children}</>;
}
