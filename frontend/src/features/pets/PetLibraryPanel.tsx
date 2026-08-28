import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Section } from '../../components/ui/controls';
import { Skeleton } from '../../components/ui/skeleton';
import { useDelayedVisible } from '../../lib/useDelayedVisible';
import { cn } from '../../lib/utils';
import { PetPortrait } from './PetPortrait';
import { SavePetDialog } from './SavePetDialog';
import type { PetLibraryState } from './usePetLibrary';

interface PetLibraryPanelProps {
  library: PetLibraryState;
}

/**
 * Saved creatures, at the top of the Style tab.
 *
 * It sits above the sliders rather than below them because of what it answers:
 * "which creature am I editing" comes before "what colour are its ears". The
 * row of portraits is the answer, and clicking one puts that creature in the
 * room.
 *
 * The save controls are deliberately two buttons, not one. **Save as preset**
 * makes a new creature; **Update** overwrites the one you started from. A single
 * button would have to guess which you meant, and would be wrong exactly when it
 * matters — the first time you tweak a preset you were fond of.
 */
export function PetLibraryPanel({ library }: PetLibraryPanelProps) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const {
    appearance,
    name,
    pets,
    activePetId,
    activePet,
    loading,
    busy,
    error,
    dismissError,
    unsaved,
    savePreset,
    updateActive,
    select,
    remove,
  } = library;

  const showSkeleton = useDelayedVisible(loading, { delay: 150, minVisible: 400 });

  return (
    <Section
      title="Your creatures"
      description={
        pets.length === 0
          ? 'Save this one and it will still be here next time you sign in.'
          : 'Pick one to bring it into the room.'
      }
    >
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={dismissError}
            className="shrink-0 underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {showSkeleton ? (
        <div className="grid grid-cols-3 gap-2" aria-busy="true">
          <p role="status" className="sr-only">
            Looking for your creatures…
          </p>
          {[0, 1, 2, 3].map((slot) => (
            <Skeleton key={slot} className="size-16 rounded-xl" />
          ))}
        </div>
      ) : loading ? null : (
        pets.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {pets.map((pet) => {
              const isActive = pet.id === activePetId;

              return (
                <li key={pet.id} className="relative">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    disabled={busy}
                    onClick={() => void select(pet.id)}
                    title={`${pet.name} — ${pet.species}`}
                    className={cn(
                      'flex w-full flex-col items-center gap-1 rounded-xl border p-2 transition-colors',
                      'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:border-primary/50',
                    )}
                  >
                    <PetPortrait appearance={pet.appearance} size={64} alt={pet.name} />
                    <span className="w-full truncate text-center text-xs font-medium">
                      {pet.name}
                    </span>
                  </button>

                  {/* Deletion asks twice, in place. A modal on top of a modal
                      to remove one row would be heavier than the action. */}
                  {confirmDelete === pet.id ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-card/95 p-1 text-center">
                      <span className="text-[0.65rem] leading-tight text-muted-foreground">
                        Delete {pet.name}?
                      </span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setConfirmDelete(null);
                            void remove(pet.id);
                          }}
                          className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium text-destructive underline underline-offset-2"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded px-1.5 py-0.5 text-[0.65rem] text-muted-foreground underline underline-offset-2"
                        >
                          Keep
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete ${pet.name}`}
                      onClick={() => setConfirmDelete(pet.id)}
                      className="absolute right-1 top-1 rounded-full bg-card/80 px-1.5 text-xs leading-5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [li:hover_&]:opacity-100"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}

      {unsaved && (
        <p className="text-xs text-muted-foreground">
          You have changes {activePet ? `to ${activePet.name}` : ''} that are not saved yet.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          className="flex-1"
          disabled={busy}
          onClick={() => setSaveOpen(true)}
        >
          Save as preset
        </Button>

        {activePet && (
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            disabled={busy || !unsaved}
            onClick={() => void updateActive().catch(() => undefined)}
            title={`Overwrite ${activePet.name} with the current creature`}
          >
            {busy ? 'Saving…' : 'Update'}
          </Button>
        )}
      </div>

      {/* Mounted only while open, so the dialog's own state starts clean each
          time rather than needing an effect to reset it. */}
      {saveOpen && (
        <SavePetDialog
          appearance={appearance}
          defaultName={name}
          existingNames={pets.map((pet) => pet.name)}
          onCancel={() => setSaveOpen(false)}
          onSave={async (presetName) => {
            await savePreset(presetName);
            setSaveOpen(false);
          }}
        />
      )}
    </Section>
  );
}
