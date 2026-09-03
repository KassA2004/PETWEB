import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { cn } from '../../lib/utils';

/**
 * The shop, before there is a shop.
 *
 * A placeholder, and written as one on purpose — the alternative is worse in
 * both directions. A cart that silently does nothing is a bug the visitor finds
 * for you; a cart that opens an empty grid of products is a shop that is broken
 * rather than one that has not opened yet. So this says the true thing, once,
 * in the product's own voice, and then gets out of the way.
 *
 * It earns its place in the header now rather than later because the room
 * already *has* an economy the user can see: the object catalogue is unlocked
 * against goals finished, minutes focused and memories shared
 * (`lib/progress.ts`), and every locked tile in the Room panel already explains
 * itself. This is where the other half of that will go, and saying so is more
 * honest than a header that pretends the thought has not occurred.
 *
 * **Nothing about it is a shop.** There is no cart state, no product type, no
 * request and no route. It is a button and a paragraph, and if the shop is
 * never built, deleting this file removes it completely.
 *
 * The "Soon" mark rather than a count badge is the whole design decision: a
 * number on a cart means *you have things in it*, and this cart can never have
 * anything in it. A badge that lies about a queue is exactly the kind of small
 * dishonesty that makes an interface feel untrustworthy.
 */
export function ShopButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Shop — coming soon"
        title="Shop — coming soon"
        className={cn(
          'press relative flex shrink-0 items-center rounded-full border border-border',
          'bg-card text-xs font-medium text-muted-foreground',
          'transition-colors hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          // On a phone the header is already carrying the wordmark, the
          // Home/Friends switch and the account in 351 points; the shop takes
          // the same circular footprint the sign-out button next door has.
          compact ? 'size-8 justify-center' : 'gap-1.5 px-2.5 py-1.5',
        )}
      >
        <ShoppingBag aria-hidden className="size-4" />
        {!compact && <span>Shop</span>}

        {/*
          The mark is the same shape a notification badge would be, and says a
          word instead of a number. On a phone the button is icon-only, so the
          mark shrinks to a dot rather than trying to fit three letters into
          sixteen pixels.
        */}
        {compact ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent/70 ring-2 ring-card"
          />
        ) : (
          <span
            aria-hidden
            className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-accent uppercase"
          >
            Soon
          </span>
        )}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="The shop is not open yet"
        description="One day you will be able to buy things for the room. Not today."
        footer={
          <Button className="flex-1" onClick={() => setOpen(false)}>
            All right
          </Button>
        }
      >
        <div className="space-y-4 text-sm text-muted-foreground">
          <p className="prose-lead">
            Everything in the room is earned at the moment. Finish goals, spend time
            focused, keep a few memories, and the catalogue opens up — the Room panel
            says what each locked thing is waiting for.
          </p>
          <p className="prose-lead">
            That is not going away when this opens. A shop should be somewhere to find
            the piece you had your eye on sooner, not the only way to get anything.
          </p>
        </div>
      </Dialog>
    </>
  );
}
