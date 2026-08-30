import { lazy, Suspense, useEffect } from 'react';
import { useSession } from '../../lib/auth-client';

const loadDashboard = () => import('../dashboard/Dashboard');

const AuthScreen = lazy(() =>
  import('./AuthScreen').then((m) => ({ default: m.AuthScreen })),
);
const Dashboard = lazy(() => loadDashboard().then((m) => ({ default: m.Dashboard })));

/**
 * Whether this browser has had a session before.
 *
 * A hint, never a decision: it only chooses what to start downloading, and
 * `get-session` still decides what is rendered. Wrapped because a browser in a
 * privacy mode throws on `localStorage` rather than returning null, and losing
 * a prefetch hint must not take the app down with it.
 */
const RETURNING_KEY = 'petweb.returning';

function hasSignedInBefore(): boolean {
  try {
    return localStorage.getItem(RETURNING_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(RETURNING_KEY, '1');
    else localStorage.removeItem(RETURNING_KEY);
  } catch {
    /* No storage: every visit is a first visit, which is merely slower. */
  }
}

/** The one full-frame message this app shows while it is deciding. */
function Waiting() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

/**
 * The single place the app decides between the landing screen and the world.
 * `GET /api/auth/get-session` returns `200` with `null` rather than `401` for
 * "no session" specifically so this can be a plain data check, not error
 * handling (01-auth-endpoints.md §4).
 *
 * Both branches are code-split. The dashboard carries PixiJS, the physics
 * engine and every customization catalog, and a visitor looking at a login form
 * has no use for any of it — that split saves the signed-out case roughly two
 * thirds of the bundle and is worth keeping.
 *
 * **The split must not become a waterfall, and by default it is one.** `lazy`
 * begins its `import()` when the component *renders*, and the dashboard cannot
 * render until `isPending` is false — so the entire world, 275 kB gzipped
 * across the dashboard chunk and its fifteen dependencies, used to wait for the
 * session round trip to finish before it could even be requested. Nothing was
 * downloading during the one wait every signed-in visit pays.
 *
 * So a returning visitor starts that download on mount instead, in parallel
 * with `get-session`, exactly as the old single-bundle build did via
 * `modulepreload`. `import()` is idempotent and the module registry is shared,
 * so the render below finds it already resolved. A first-time visitor prefetches
 * nothing and keeps the small download.
 */
export function AuthGate() {
  const { data: session, isPending, refetch } = useSession();

  useEffect(() => {
    if (hasSignedInBefore()) void loadDashboard().catch(() => {
      // The lazy boundary will fetch it for real when it renders. A failed
      // prefetch is not something to tell anybody about.
    });
  }, []);

  useEffect(() => {
    if (isPending) return;
    rememberSignedIn(Boolean(session));
  }, [isPending, session]);

  if (isPending) return <Waiting />;

  return (
    <Suspense fallback={<Waiting />}>
      {session ? (
        /*
         * The id, handed down rather than looked up again.
         *
         * `useSession` is a subscription that can refetch, and a refetch flips
         * `isPending` — which, from *this* component, means the branch below
         * unmounts and the whole world is rebuilt. Calling it a second time
         * anywhere under here is therefore not a free read: opening the social
         * panel did exactly that once, and cost a full dashboard remount and
         * five refetched requests. Measured, then fixed by passing the value.
         */
        <Dashboard userId={session.user.id} />
      ) : (
        <AuthScreen onAuthenticated={() => void refetch()} />
      )}
    </Suspense>
  );
}
