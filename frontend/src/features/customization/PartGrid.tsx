import { useMemo } from 'react';
import { OptionGrid } from '../../components/ui/option-grid';
import type { GridOption } from '../../components/ui/option-grid';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { renderOptionPreview } from './previews';
import type { PreviewFocus } from './previews';

/**
 * One customization category, shown as pictures.
 *
 * The bridge between the type libraries (`EAR_TYPES` and friends, which are
 * tables of `{ label, hint }`) and `OptionGrid`, which knows nothing about
 * creatures. Everything a category needs to say is here: what the options are,
 * what choosing one *does to the appearance*, and which part of the resulting
 * creature is worth looking at.
 *
 * The patch is a function rather than a field name because the categories are
 * not all scalar: an accessory writes a whole `accessories` object and has a
 * "none", while an ear type writes one string. One shape covers both.
 *
 * Scale, for context: eyes have 39 options, bodies 24, mouths 24, ears 22. None
 * of those fit a grid — which is the entire reason `OptionGrid` pages.
 */

interface PartGridProps<T extends string> {
  label?: string;
  /** The option keys, in display order. */
  keys: readonly T[];
  /** The library they come from, for labels and hover hints. */
  table: Record<T, { label: string; hint?: string }>;
  /** What picking one does. */
  patch: (value: T) => Partial<PetAppearance>;
  /** Which part of the creature the choice shows up in. */
  focus: PreviewFocus;
  value: T;
  onChange: (value: T) => void;
  /** The creature the options are previewed on. */
  appearance: PetAppearance;
  columns?: number;
  rows?: number;
}

export function PartGrid<T extends string>({
  label,
  keys,
  table,
  patch,
  focus,
  value,
  onChange,
  appearance,
  columns,
  rows,
}: PartGridProps<T>) {
  /**
   * Rebuilt when the creature changes, and only then.
   *
   * Every option previews on the *current* appearance, so dragging the body
   * width slider legitimately redraws all forty tiles — but a new closure per
   * render with an unchanged appearance would re-run each tile's effect for
   * nothing. `lib/preview` caches on the far side, so the cost of getting this
   * wrong is small; it is still worth getting right.
   */
  const options = useMemo<GridOption<T>[]>(
    () =>
      keys.map((key) => ({
        value: key,
        label: table[key].label,
        hint: table[key].hint,
        preview: () => renderOptionPreview(appearance, patch(key), focus),
      })),
    // `patch` is defined inline by every call site and would defeat the memo;
    // it is a pure function of `key`, so the appearance is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys, table, focus, appearance],
  );

  return (
    <OptionGrid
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      columns={columns}
      rows={rows}
    />
  );
}
