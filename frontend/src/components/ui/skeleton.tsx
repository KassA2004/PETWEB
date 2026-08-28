import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * A placeholder the exact shape of the thing that is coming.
 *
 * shadcn/ui's Skeleton, hand-written: this project uses shadcn as a convention
 * rather than through its CLI (there is no `components.json`), so components
 * live here and are styled with the same tokens as everything else.
 *
 * The rule that makes a skeleton worth having: it must occupy the box its real
 * content will occupy. A placeholder of the wrong size is a layout shift with
 * extra steps, and this product already pays close attention to not moving
 * things around under the user (`Docs/theme-and-design.md`).
 *
 * Decorative by default — `aria-hidden`, with the loading state announced once
 * by whatever `role="status"` sits beside it, not by twelve pulsing boxes.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('petweb-skeleton rounded-lg bg-muted/60', className)}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
