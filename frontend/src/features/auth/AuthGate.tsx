import { lazy, Suspense, useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { useSession } from '../../lib/auth-client';
import { navigate, useRoute } from '../../lib/useRoute';

const loadDashboard = () => import('../dashboard/Dashboard');
const loadHome = () => import('../home/Home');

const AuthScreen = lazy(() =>
  import('./AuthScreen').then((m) => ({ default: m.AuthScreen })),
);
const Dashboard = lazy(() => loadDashboard().then((m) => ({ default: m.Dashboard })));

/**
 * The front door, and the reason it is split from the form behind it.
 *
 * The home page is the *only* thing most first-time visitors will ever see, and
 * it needs none of the form validation, none of `better-auth`'s client and none
 * of the world. Its own chunk keeps a visit that ends at the headline as cheap
 * as a visit that ends at the headline should be.
 */
const Home = lazy(() => loadHome().then((m) => ({ default: m.Home })));

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

/**
 * How long the session request is given before the page stops pretending.
 *
 * `get-session` either answers or it does not, and the failure that actually
 * happens is neither: a backend that is not running, or an API host that has
 * moved, leaves the request hanging until the operating system gives up — a
 * minute and a half on Windows — and `useSession` reports `isPending` the whole
 * time. There is no error to render, so the front door used to sit on the word
 * "Loading…" indefinitely, which is the least useful thing a product can do
 * with a problem it already knows about.
 *
 * Eight seconds is long enough that no real session round trip trips it and
 * short enough that nobody is left wondering.
 */
const SESSION_PATIENCE_MS = 8000;

/**
 * The one full-frame state this app shows while it is deciding.
 *
 * The wordmark rather than the word "Loading", and it fades in after a beat:
 * a signed-in visitor with a warm cache goes past this in under a hundred
 * milliseconds, and flashing a splash at them is the interface stuttering
 * rather than reassuring. `animation-delay` does that with no state and no
 * timer — the element is in the tree the whole time and simply has nothing to
 * show yet.
 */
function Waiting() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-svh flex-col items-center justify-center gap-3"
    >
      <p
        className="animate-fade-in text-lg font-semibold tracking-tight opacity-0"
        style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}
      >
        Pocus
      </p>
      <span
        aria-hidden
        className="animate-fade-in h-1 w-24 overflow-hidden rounded-full bg-foreground/10 opacity-0"
        style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}
      >
        <span className="petweb-loader-sweep block h-full w-1/2 rounded-full bg-primary" />
      </span>
    </div>
  );
}

/**
 * The world could not be reached.
 *
 * Separate from a *refused* session, which is not an error at all — the API
 * answers "nobody is signed in" with a 200 and a null, deliberately
 * (01-auth-endpoints.md §4). This is the other thing: nothing answered. The
 * only honest offer is to try again, so that is the only control.
 */
function Unreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="animate-rise w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl shadow-black/10">
        <h1 className="text-lg font-semibold tracking-tight">
          We cannot reach your world
        </h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-sm text-muted-foreground">
          Nothing is answering right now. Your creature, your room and everything
          you have kept are all still there — this is the connection, not you.
        </p>
        <Button className="mt-5 w-full" onClick={onRetry}>
          Try again
        </Button>
      </div>
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
  const { data: session, isPending, error, refetch } = useSession();
  const [route] = useRoute();

  /*
   * Start downloading the branch this visitor is going to get, now.
   *
   * `lazy` begins its `import()` when the component *renders*, and neither
   * branch can render until `get-session` comes back — so the whole waterfall
   * used to be: entry chunk, then a network round trip, and only then the first
   * byte of the screen the visitor was always going to see.
   *
   * The hint decides which one, and it is only ever a hint: `get-session` still
   * decides what is *rendered*. A returning visitor gets the world started
   * early, as before; a first-time one now gets the home page started early,
   * which is the page they came for.
   */
  useEffect(() => {
    const prefetch = hasSignedInBefore() ? loadDashboard : loadHome;
    void prefetch().catch(() => {
      // The lazy boundary will fetch it for real when it renders. A failed
      // prefetch is not something to tell anybody about.
    });
  }, []);

  useEffect(() => {
    if (isPending) return;
    rememberSignedIn(Boolean(session));
  }, [isPending, session]);

  /*
   * Whether the session request has been pending long enough to call it.
   *
   * Reset whenever `isPending` goes back to true, so pressing Try again gives
   * the next attempt the full patience rather than failing instantly on the
   * timer the last one left behind.
   */
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isPending) return;

    const timer = window.setTimeout(() => setTimedOut(true), SESSION_PATIENCE_MS);

    return () => {
      window.clearTimeout(timer);
      // Cleared on the way out rather than on the way in, so a later refetch —
      // the one `onAuthenticated` fires — starts from patient again instead of
      // inheriting a verdict from a wait that has already ended.
      setTimedOut(false);
    };
  }, [isPending]);

  /*
   * Nothing answered, and it said so.
   *
   * Distinct from the two ordinary outcomes — a session, or a 200 carrying
   * `null` because nobody is signed in — and worth its own screen for a
   * returning visitor, who would otherwise be shown the marketing page and
   * invited to start a world they already have. A first-time visitor on a
   * working network never sees this; `error` is only set when the request
   * itself failed.
   */
  if (!isPending && error && !session) {
    return <Unreachable onRetry={() => window.location.reload()} />;
  }

  if (isPending) {
    return timedOut ? (
      // A reload rather than `refetch`: a request that never answered has left
      // a socket hanging that the client has no handle on, and the thing the
      // user means by "try again" is the whole page.
      <Unreachable onRetry={() => window.location.reload()} />
    ) : (
      <Waiting />
    );
  }

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
      ) : route === 'home' ? (
        <Home />
      ) : (
        <AuthScreen
          mode={route === 'login' ? 'login' : 'register'}
          /*
           * The address bar follows the form rather than the form following a
           * piece of component state: switching between "create an account" and
           * "log in" is a navigation, so the back button undoes it and a link to
           * either one opens the right thing.
           */
          onModeChange={(next) => navigate(next === 'login' ? 'login' : 'join')}
          onAuthenticated={() => {
            // Back to the root before the session lands, so a signed-in visitor
            // is never sitting on /join looking at their own world.
            navigate('home');
            void refetch();
          }}
        />
      )}
    </Suspense>
  );
}
