import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * A minimal tab strip.
 *
 * Hand-rolled rather than pulled from Radix: this is one control with three
 * options and no menus, and the project already avoids adding dependencies it
 * does not need. Keyboard support is the part people actually notice, so arrow
 * keys and Home/End work.
 */
export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Optional count badge, e.g. the number of open goals. */
  count?: number;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  className,
}: TabsProps<T>) {
  const move = (delta: number) => {
    const index = items.findIndex((item) => item.value === value);
    const next = (index + delta + items.length) % items.length;
    onValueChange(items[next].value);
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        // Scrolls rather than overflows. Five tabs fit a sidebar comfortably
        // and do not fit a 375-pixel phone: the strip was pushing the whole
        // page eleven pixels wide, which is the kind of horizontal scroll
        // nobody reports and everybody feels.
        'no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1 text-sm font-medium',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          onValueChange(items[0].value);
        } else if (event.key === 'End') {
          event.preventDefault();
          onValueChange(items[items.length - 1].value);
        }
      }}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              // `flex-1` to share the width when there is enough of it,
              // `shrink-0` so they keep their labels when there is not and the
              // strip scrolls instead of squeezing "Inventory" into six pixels.
              'flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.65rem] leading-none',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted-foreground/20 text-muted-foreground',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const TabPanel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} role="tabpanel" className={cn('outline-none', className)} {...props} />
));
TabPanel.displayName = 'TabPanel';
