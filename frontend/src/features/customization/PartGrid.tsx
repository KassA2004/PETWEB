import { useMemo } from 'react';
import { OptionGrid } from '../../components/ui/option-grid';
import type { GridOption } from '../../components/ui/option-grid';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { previewKey } from './catalogue';
import { PREVIEW_BASE, renderOptionPreview } from './previews';
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
 *
 * Every prop but `label`, `value` and `onChange` comes from one category object
 * in `catalogue.ts`, spread in whole. That is not a tidiness preference: the
 * background prewarm draws these same tiles from those same objects, and a
 * category described twice is a prewarm that fills the cache with keys the grid
 * never asks for.
 */

interface PartGridProps<T extends string> {
  label?: string;
  /**
   * What this category is.
   *
   * Namespaces the preview cache. Six categories frame on `face`, and several
   * of them share option names — without this, Brows' "None" and Teeth's "None"
   * are one cache entry and one of them shows the other's picture.
   */
  id: string;
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
  columns?: number;
  rows?: number;
}

export function PartGrid<T extends string>({
  label,
  id,
  keys,
  table,
  patch,
  focus,
  value,
  onChange,
  columns,
  rows,
}: PartGridProps<T>) {
  /**
   * Never rebuilt, because nothing it depends on moves.
   *
   * Previews are drawn on `PREVIEW_BASE`, a module constant, so editing the
   * creature cannot invalidate a tile's cache key. Two rules keep this true and
   * both are load-bearing: `keys` and `table` must be stable references from
   * the call site (a table built inline inside a `.map` is a new object every
   * render and this memo never holds), and `patch` must be a pure function of
   * `key` alone. Fold live state into `patch` and every tile in the grid
   * rebuilds its rig on every keystroke — measured at 15 rig rebuilds per step
   * of the accessory size slider, which is what this shape replaced.
   */
  const options = useMemo<GridOption<T>[]>(
    () =>
      keys.map((key) => ({
        value: key,
        label: table[key].label,
        hint: table[key].hint,
        preview: () =>
          renderOptionPreview(
            PREVIEW_BASE,
            patch(key),
            focus,
            undefined,
            previewKey(id, key),
          ),
      })),
    // `patch` comes from the category object and is a pure function of `key`,
    // so it is deliberately not a dependency: including it would be harmless
    // now and a memo that never holds the moment somebody passes a closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, keys, table, focus],
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
