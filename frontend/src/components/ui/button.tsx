import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { audio, sfx } from '../../lib/audio';
import { cn } from '../../lib/utils';

/**
 * The button, with feedback.
 *
 * Three things were added to what was a purely visual component, and each one
 * is here rather than at the call sites because a call site that has to
 * remember them will not:
 *
 * **Press.** `.press` (src/index.css) gives a 3% squash on `:active`. It is not
 * visible as movement; it is felt as give, which is the entire point.
 *
 * **Sound.** A sixty-millisecond click on the UI channel, and — importantly —
 * *not the same sound for every button*. A destructive action gets a lower,
 * flatter tone, because an animation or a noise that is identical whatever
 * happened is decoration rather than feedback.
 *
 * **The unlock.** Browsers will not start an AudioContext outside a gesture, so
 * the first button press in the session is also what turns the audio on. Doing
 * it here means no screen has to remember to.
 *
 * `silent` opts out, for the handful of controls where a click would be noise:
 * a colour swatch being dragged along, a tab being arrowed through.
 */

const buttonVariants = cva(
  'press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
        ghost: 'bg-transparent text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** For controls where a click would be noise rather than feedback. */
  silent?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, silent = false, onPointerDown, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      // Pointer-down, not click: the sound belongs to the press, and waiting
      // for the release puts it after the thing it is acknowledging.
      void audio.unlock();
      if (!silent) {
        if (variant === 'destructive') sfx.refuse();
        else sfx.click();
      }
      onPointerDown?.(event);
    };

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        onPointerDown={handlePointerDown}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
