import { useMemo } from 'react';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import { PetPortrait } from '../pets/PetPortrait';
import { cn } from '../../lib/utils';
import type { PublicPet } from './api';

/**
 * A person, shown as their creature.
 *
 * The one component every list in the social layer is built from — search
 * results, friends, requests, park members, conversations — and it exists so
 * that all five agree about what a person looks like. They used to be five
 * slightly different rows; five slightly different rows is what a social layer
 * bolted onto the side looks like.
 *
 * **The creature is the identity.** Not an avatar, not initials in a circle,
 * not a colour block with a letter in it: the actual pet, drawn by the actual
 * renderer, in the actual style the world draws it in
 * (`features/pets/renderPortrait.ts`, one offscreen WebGL context for every
 * thumbnail in the product). That is the same rule the customizer follows —
 * *show the thing* (theme-and-design.md §20.1) — applied to people, and it is
 * most of what stops this reading as a contact list.
 *
 * A person with no creature yet gets a quiet placeholder rather than a stand-in
 * pet: an account that has not been to the creator has not decided who they
 * are, and inventing one for them would be the product answering on their
 * behalf.
 */

interface PersonRowProps {
  username: string;
  pet: PublicPet | null;
  /** One line under the name — a status, a preview, a relationship. */
  detail?: string;
  /** A colour dot before the name, matching a ring on the lawn. */
  tint?: string;
  /** Buttons on the right. */
  actions?: React.ReactNode;
  /** Makes the whole row a button. */
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

/** Small enough to be a list, large enough for a creature to be recognisable. */
const PORTRAIT = 52;

export function PersonRow({
  username,
  pet,
  detail,
  tint,
  actions,
  onClick,
  selected = false,
  className,
}: PersonRowProps) {
  /*
   * The appearance is normalized once per row rather than on every render.
   *
   * `PetPortrait` keys its cache on the object it is handed, and
   * `createPetAppearance` returns a new one every call — so without this every
   * re-render of the enclosing list (a keystroke in the search box, a socket
   * event) would miss the cache and redraw every creature on the screen.
   */
  const appearance = useMemo(
    () => (pet ? createPetAppearance(pet.appearanceData as never) : null),
    [pet],
  );

  const body = (
    <>
      <div className="shrink-0">
        {appearance ? (
          <PetPortrait
            appearance={appearance}
            size={PORTRAIT}
            alt={`${username}'s creature`}
          />
        ) : (
          <div
            aria-hidden
            className="flex items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground"
            style={{ width: PORTRAIT, height: PORTRAIT }}
          >
            <span className="text-lg">·</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {tint && (
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: tint }}
            />
          )}
          {username}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {detail ?? (pet ? pet.name : 'No creature yet')}
        </p>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </>
  );

  const shell = cn(
    'flex w-full items-center gap-3 rounded-xl border p-2.5 transition-colors',
    selected ? 'border-primary/50 bg-primary/5' : 'border-border bg-card',
    onClick && 'press text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    className,
  );

  if (!onClick) return <div className={shell}>{body}</div>;

  return (
    <button type="button" onClick={onClick} className={shell}>
      {body}
    </button>
  );
}
