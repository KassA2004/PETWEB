import * as React from 'react';
import { cn, toCssHex } from '../../lib/utils';

/**
 * The customizer's vocabulary: a labelled slider, a chip row, and a color
 * swatch row. Three controls cover the entire creature editor, which is the
 * point — every appearance value is either a number, a choice from a short
 * list, or a color.
 */

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** How the number is shown, e.g. `1.2×`. Defaults to one decimal. */
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 0.05,
  format,
  onChange,
}: SliderRowProps) {
  const id = React.useId();
  const shown = format ? format(value) : `${value.toFixed(2).replace(/0$/, '')}×`;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm text-foreground">
          {label}
        </label>
        <span className="text-xs tabular-nums text-muted-foreground">{shown}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipRowProps<T extends string> {
  label?: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChipRowProps<T>) {
  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm text-foreground">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SwatchRowProps {
  label: string;
  colors: readonly number[];
  value: number;
  onChange: (color: number) => void;
}

export function SwatchRow({ label, colors, value, onChange }: SwatchRowProps) {
  const id = React.useId();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground">{label}</p>
        {/* The native picker is the escape hatch: the swatches are the fast
            path, this is the "no, I want THAT green" path. */}
        <label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
        >
          Custom
          <span
            className="size-5 rounded-md border border-border"
            style={{ background: toCssHex(value) }}
          />
          <input
            id={id}
            type="color"
            className="sr-only"
            value={toCssHex(value)}
            onChange={(event) =>
              onChange(Number.parseInt(event.target.value.slice(1), 16))
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Use ${toCssHex(color)}`}
            aria-pressed={color === value}
            onClick={() => onChange(color)}
            style={{ background: toCssHex(color) }}
            className={cn(
              'size-7 rounded-lg border-2 transition-transform outline-none',
              'hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring',
              color === value
                ? 'border-foreground shadow-sm'
                : 'border-black/10',
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
