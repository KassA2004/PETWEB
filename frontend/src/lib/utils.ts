import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Standard shadcn/ui helper: merge conditional classes, letting later Tailwind classes win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 0xRRGGBB -> '#rrggbb', for the places a pet color has to reach CSS. */
export function toCssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Split a list into fixed-size pages.
 *
 * Always returns at least one page, so a caller can render `pages[0]` without
 * checking — an empty category is an empty grid, not a crash.
 */
export function paginate<T>(items: readonly T[], perPage: number): T[][] {
  if (perPage <= 0) return [[...items]];

  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }

  return pages.length > 0 ? pages : [[]];
}

