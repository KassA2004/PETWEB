import * as React from 'react';
import { Lock } from 'lucide-react';
import { sfx } from '../../lib/audio';
import { cn, paginate } from '../../lib/utils';
import { Carousel } from './carousel';
import { Skeleton } from './skeleton';

/**
 * A grid of things you can see.
 *
 * The one control every customization category now uses, and it exists to make
 * four failures structurally impossible rather than merely discouraged:
 *
 * ```text
 *   stretched     tiles are a fixed square. Nothing is sized by its content,
 *                 so a long label cannot pull a tile out of shape
 *   deformed      previews are `object-contain` inside that square, so a wide
 *                 asset letterboxes instead of squashing
 *   overcrowded   a page holds `perPage` tiles and no more. The eleventh
 *                 option starts page two rather than shrinking the other ten
 *   inconsistent  every category gets the same tile, the same gap and the same
 *                 columns, because they all get the same component
 * ```
 *
 * A tile is a picture with a caption under it, not a caption with a picture
 * next to it — the asset is the thing being chosen, and the words are there for
 * the cases where two options look similar at 76 pixels.
 */

export interface GridOption<T extends string> {
  value: T;
  label: string;
  /** Shown on hover, and as the accessible description. */
  hint?: string;
  /**
   * The preview, drawn on demand.
   *
   * A function rather than a URL because previews are expensive and there are
   * hundreds of them: this is only called for tiles that are actually on
   * screen, and its result is cached by `lib/preview`.
   */
  preview?: () => Promise<string>;
  /** For options that are a colour rather than a shape. */
  swatch?: string;
  /**
   * Shown, but not yet earned.
   *
   * A locked tile is **still pressable**, and that is the whole design. The
   * alternatives are both worse: hiding it means the user never learns the
   * thing exists, and disabling it means pressing the one thing they want gets
   * them nothing at all — no sound, no focus, no explanation. So it reports the
   * press like any other tile and the grid's owner decides what that means,
   * which in the room panel is "open the modal that says what it costs".
   *
   * The tile itself only changes how it *looks*: dimmed, and wearing a
   * padlock. `hint` is expected to carry the requirement, since that is what
   * both the tooltip and the accessible name are built from.
   */
  locked?: boolean;
}

interface OptionGridProps<T extends string> {
  label?: string;
  options: readonly GridOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Tiles per row. The panel is a fixed-width column, so this is a real
   * constraint rather than a hint — four 76px tiles plus gaps is what fits.
   */
  columns?: number;
  /** Rows per page before the control starts paging. */
  rows?: number;
}

/** How many tiles may sit in the grid before it becomes a carousel. */
const DEFAULT_COLUMNS = 4;
const DEFAULT_ROWS = 2;

export function OptionGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = DEFAULT_COLUMNS,
  rows = DEFAULT_ROWS,
}: OptionGridProps<T>) {
  const perPage = columns * rows;
  const pages = paginate(options, perPage);

  const grid = (page: readonly GridOption<T>[], pageIndex: number) => (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-2 p-0.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {page.map((option) => (
        <OptionTile
          key={option.value}
          option={option}
          selected={option.value === value}
          onSelect={() => onChange(option.value)}
        />
      ))}

      {/*
        Blanks on the last page. Without them a page of three tiles centres its
        three across the full width while the page before it shows eight in
        columns — so sliding between them moves every tile sideways, which reads
        as the grid rearranging itself rather than as a page turning.
      */}
      {pageIndex === pages.length - 1 &&
        page.length < perPage &&
        pages.length > 1 &&
        Array.from({ length: perPage - page.length }, (_, index) => (
          <div key={`blank-${index}`} aria-hidden className="aspect-square" />
        ))}
    </div>
  );

  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm text-foreground">{label}</p>}

      <Carousel label={label ?? 'Options'}>
        {pages.map((page, index) => (
          <React.Fragment key={index}>{grid(page, index)}</React.Fragment>
        ))}
      </Carousel>
    </div>
  );
}

function OptionTile<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: GridOption<T>;
  selected: boolean;
  onSelect: () => void;
}) {
  const locked = option.locked === true;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      // Not `disabled`, and not `aria-disabled`: the control does something
      // when it is pressed, so calling it disabled would be a lie a screen
      // reader repeats. The state is said in words instead.
      title={option.hint ?? option.label}
      // The hint already opens with "Locked", so the name is the thing and then
      // its state — not the word twice.
      aria-label={locked ? `${option.label}. ${option.hint ?? 'Locked'}` : undefined}
      onPointerDown={() => sfx.hover()}
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col items-center gap-1 rounded-xl border p-1.5 outline-none',
        // The whole motion budget for a tile: a lift on hover, a squash on
        // press. Both are transforms, so neither costs a layout.
        'transition-[transform,border-color,background-color,box-shadow] duration-150 ease-out',
        'hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.97]',
        'focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-primary bg-primary/10 shadow-sm'
          : 'border-border bg-card hover:border-primary/40',
        locked && 'border-dashed',
      )}
    >
      <span
        className={cn(
          'relative w-full',
          // Dimmed rather than greyed out. The thing is still recognisably
          // itself — you can see what you are working towards, which is the
          // only reason to show a locked tile at all, and at the 0.4/0.5 this
          // started at you could not: a padlock over a pale ghost is a tile
          // that says "not yet" without ever saying what.
          locked && 'opacity-60 saturate-[0.8] transition-opacity group-hover:opacity-85',
        )}
      >
        <Thumbnail option={option} />
      </span>

      {locked && (
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 grid size-7 -translate-x-1/2 -translate-y-[70%] place-items-center rounded-full bg-card/90 text-muted-foreground shadow-sm ring-1 ring-border"
        >
          <Lock className="size-3.5" strokeWidth={2.5} />
        </span>
      )}

      {/*
        One line, clipped. A caption that wraps makes its tile taller than its
        neighbours, and a grid of tiles at two different heights is the exact
        "visually broken" the brief is about.
      */}
      <span
        className={cn(
          'w-full truncate text-center text-[0.6rem] leading-tight transition-colors',
          selected ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {option.label}
      </span>

      {selected && (
        <span
          aria-hidden
          className="animate-pop-in absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[0.5rem] text-primary-foreground shadow"
        >
          ✓
        </span>
      )}
    </button>
  );
}

/**
 * The picture.
 *
 * Square, `object-contain`, and it holds the previous image while a new one is
 * drawn rather than blanking — otherwise dragging a slider makes every tile in
 * the grid flicker on every frame.
 */
function Thumbnail<T extends string>({ option }: { option: GridOption<T> }) {
  const [src, setSrc] = React.useState<string | null>(null);
  const { preview, swatch } = option;

  React.useEffect(() => {
    if (!preview) return;
    let cancelled = false;

    void preview().then((url) => {
      if (!cancelled) setSrc(url);
    });

    return () => {
      cancelled = true;
    };
  }, [preview]);

  if (swatch) {
    return (
      <span
        aria-hidden
        style={{ background: swatch }}
        className="aspect-square w-full rounded-lg border border-black/10"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-muted/40"
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className="animate-fade-in h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
        />
      ) : (
        <Skeleton className="size-full rounded-lg" />
      )}
    </span>
  );
}
