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
