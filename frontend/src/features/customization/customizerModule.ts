import type { ComponentType } from 'react';
import type { CustomizerPanelProps } from './CustomizerPanel';

/**
 * The editor's chunk, and whether it is already here.
 *
 * Split out from `Customizer.tsx` because a module that exports a component and
 * a function exports neither to fast refresh. What it holds is one variable and
 * the reason for it:
 *
 * `lazy` alone does not stop the boundary suspending. Fetching the chunk early
 * is not enough — `lazy` only learns about a module when *it* renders, so a
 * first click still commits a fallback and waits for a retry. Measured on a
 * quiet page with the chunk already sitting in the module registry: the
 * skeleton at 34ms and **the panel at 994ms**. A second of nothing, spent
 * looking at a grey outline of the thing you asked for.
 *
 * So the background warm-up (`features/dashboard/prefetch`) resolves the module
 * through here and keeps the component itself, and `Customizer` renders that
 * directly rather than through a boundary.
 */

let resolved: ComponentType<CustomizerPanelProps> | null = null;

/**
 * Fetch the editor's chunk, and hold on to the component.
 *
 * `import()` is idempotent and the module registry is shared, so calling this
 * after the boundary has already loaded the chunk costs nothing.
 */
export async function loadCustomizerPanel(): Promise<void> {
  const module = await import('./CustomizerPanel');
  resolved = module.CustomizerPanel;
}

/** The editor, if it is already in memory. */
export function loadedCustomizerPanel(): ComponentType<CustomizerPanelProps> | null {
  return resolved;
}
