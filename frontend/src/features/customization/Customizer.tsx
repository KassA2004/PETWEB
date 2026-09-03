import { lazy, Suspense } from 'react';
import type { CustomizerPanelProps } from './CustomizerPanel';
import { CustomizerSkeleton } from './CustomizerSkeleton';
import { loadedCustomizerPanel } from './customizerModule';

/**
 * The creature editor, however it happens to be available.
 *
 * ```text
 *   warmed   the component, rendered outright. No boundary, no wait
 *   cold     the skeleton, then the panel, exactly as before
 * ```
 *
 * The code splitting is unchanged: a signed-out visitor downloads none of this,
 * and a signed-in one downloads it in the background once the room is up. What
 * changes is only what happens at the click — see `customizerModule.ts` for the
 * second this is here to remove.
 */

/**
 * Not on the load path: the dashboard opens on Goals, and nothing in the room
 * needs the part catalogs to draw. This is the largest thing behind a tab the
 * user may never press.
 */
const LazyCustomizerPanel = lazy(() =>
  import('./CustomizerPanel').then((m) => ({ default: m.CustomizerPanel })),
);

export function Customizer(props: CustomizerPanelProps) {
  /*
   * Read during render on purpose. It only ever goes from null to a component —
   * never back — and the read happens on the render caused by the tab click, by
   * which time the warm-up has long since finished. Somebody who beats it to
   * the click reads null and gets the boundary, which is the honest answer.
   */
  /*
   * `static-components` reads this as a component built during render, and the
   * failure it guards against — a new component type each render, remounting
   * and losing its state — cannot happen here: this is one module export, the
   * same object every time, for the life of the page.
   */
  const Warm = loadedCustomizerPanel();
  // eslint-disable-next-line react-hooks/static-components
  if (Warm) return <Warm {...props} />;

  return (
    <Suspense fallback={<CustomizerSkeleton />}>
      <LazyCustomizerPanel {...props} />
    </Suspense>
  );
}
