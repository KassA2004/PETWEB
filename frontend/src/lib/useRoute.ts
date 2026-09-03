import { useCallback, useEffect, useState } from 'react';

/**
 * Where in the product the address bar says we are.
 *
 * Three places, and the reason they are *places* rather than component state is
 * the Web Interface Guidelines' rule that the URL reflects state: somebody who
 * lands on the sign-in form should be able to send that link to a friend, get
 * back to it with the back button, and refresh it without being returned to the
 * top of the marketing page.
 *
 * ```text
 *   /        home       what this is, for somebody who has not signed in
 *   /join    register   make an account
 *   /login   sign in    come back to one
 * ```
 *
 * **Hand-rolled rather than a router, and the bar for that is the bundle.** A
 * routing library is a dependency, a context and a few kilobytes for three
 * static paths with no parameters, no nesting and no data loading — and every
 * one of those kilobytes lands on the *signed-out* page, which is the one page
 * in this product that is supposed to be small. `history.pushState` is the
 * whole mechanism a router would be wrapping.
 *
 * Navigation is still `<a href>` (`components/ui/link.tsx`), so a middle click
 * opens a tab, a right click offers to copy the address, and a crawler sees
 * links. `navigate` only intercepts the plain left click.
 */

export type Route = 'home' | 'join' | 'login';

const PATHS: Record<Route, string> = {
  home: '/',
  join: '/join',
  login: '/login',
};

/** The route a path means. Anything unrecognised is the home page. */
export function routeFor(pathname: string): Route {
  if (pathname === PATHS.join) return 'join';
  if (pathname === PATHS.login) return 'login';
  return 'home';
}

/** The path a route is at. */
export function pathFor(route: Route): string {
  return PATHS[route];
}

/**
 * Go somewhere, and put it in the address bar.
 *
 * Exported as a plain function as well as through the hook because the click
 * handler on a link is not a component: `<Link>` calls this directly.
 */
export function navigate(route: Route): void {
  const path = pathFor(route);
  if (window.location.pathname === path) return;

  window.history.pushState({}, '', path);

  /*
   * A client-side navigation does not reset the scroll, because there is no
   * document load to reset it. Somebody who reads to the bottom of the home
   * page and presses "Start Your World" would otherwise arrive at the sign-up
   * form already scrolled past it.
   *
   * Only here, and deliberately not in the `popstate` listener: the browser
   * restores the old position itself when somebody goes *back*, which is what
   * going back is supposed to do.
   */
  window.scrollTo(0, 0);

  // `pushState` does not fire `popstate` — nothing would hear about the
  // navigation without this. One event, so every listener updates at once
  // rather than each subscriber being handed a setter.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** The current route, and a way to change it. */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => routeFor(window.location.pathname));

  useEffect(() => {
    const sync = () => setRoute(routeFor(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return [route, useCallback((next: Route) => navigate(next), [])];
}
