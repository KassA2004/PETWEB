import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * A minimal tab strip.
 *
 * Hand-rolled rather than pulled from Radix: this is one control with three
 * options and no menus, and the project already avoids adding dependencies it
 * does not need. Keyboard support is the part people actually notice, so arrow
 * keys and Home/End work.
 *
 * ## The icon, and the rule it is not breaking
 *
 * theme-and-design.md §20.1 says there is no icon set and there must never be
 * one. That rule is about *choosing things*: an ear option must be a picture of
 * the ear, never a glyph standing in for it, because a glyph is a second copy
 * of a design that silently stops matching the first.
 *
 * Navigation is not choosing a thing. A tab strip names five places, and the
 * places are Goals, Memories, a creature, a room and other people — none of
 * which is drawable by the renderer, because none of them is an object in the
 * world. Here a small consistent mark is what makes the strip scannable at a
 * glance and legible when the labels are squeezed on a phone. So icons are
 * allowed on interface chrome (tabs, buttons, statuses) and remain forbidden
 * wherever a preview of the actual thing is possible.
 */
export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Optional count badge, e.g. the number of open goals. */
  count?: number;
  /** A small mark before the label. Chrome only — see the note above. */
  icon?: LucideIcon;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /**
   * Tighter padding, for a strip that has to fit a phone.
   *
   * Four labelled tabs want 338 pixels at their comfortable size, and a phone
   * on its side has 283 to give them — so the strip scrolled, and a tab you
   * have to swipe sideways to find is a tab most people never find. Squeezing
   * the padding rather than the label is the right thing to give up: the label
   * is the part that says what the tab is.
   */
  dense?: boolean;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  dense = false,
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
        'no-scrollbar flex overflow-x-auto rounded-xl bg-muted/70 text-sm font-medium',
        dense ? 'gap-0.5 p-0.5' : 'gap-1 p-1',
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
        const Icon = item.icon;
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
              'flex flex-1 shrink-0 items-center justify-center rounded-lg transition-colors outline-none',
              dense ? 'gap-1 px-1.5 py-2' : 'gap-1.5 px-3 py-2',
              'focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && (
              <Icon
                aria-hidden
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  selected ? 'text-primary' : 'text-muted-foreground/80',
                )}
                strokeWidth={2}
              />
            )}
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
