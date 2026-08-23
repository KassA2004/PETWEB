import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { PetPortrait } from './PetPortrait';

interface SavePetDialogProps {
  /** The creature as it currently stands in the editor. */
  appearance: PetAppearance;
  /** What the name box starts as. */
  defaultName: string;
  /** Names already taken, so the dialog can warn before the round trip. */
  existingNames: string[];
  onCancel: () => void;
  onSave: (name: string) => Promise<void>;
}

const MAX_NAME = 32;

/**
 * Saving the creature you just made.
 *
 * The pet is the middle of the dialog on purpose. A preset list is a list of
 * names, and a name is a poor description of a creature — being shown the thing
 * you are about to name is what makes "Blorb" mean something a week later.
 *
 * The portrait is drawn from the *live* appearance, so it is the creature in
 * the room, not a stale thumbnail.
 *
 * The caller mounts this only while the dialog is open, so the name box, the
 * in-flight flag and any error start fresh every time it is opened — no reset
 * effect, no stale text from a save that was abandoned last week.
 */
export function SavePetDialog({
  appearance,
  defaultName,
  existingNames,
  onCancel,
  onSave,
}: SavePetDialogProps) {
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const duplicate = existingNames.some(
    (existing) => existing.toLowerCase() === trimmed.toLowerCase(),
  );
  const canSave = trimmed.length > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;

    setSaving(true);
    setError(null);

    try {
      await onSave(trimmed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the preset.');
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={saving ? () => undefined : onCancel}
      title="Save this creature"
      description="Presets are saved to your account, so this one will still be here next time."
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={!canSave} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex justify-center">
          <div className="rounded-2xl border border-border bg-muted/30 p-2">
            <PetPortrait appearance={appearance} size={200} alt={trimmed || 'Your creature'} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preset-name">Name</Label>
          <Input
            id="preset-name"
            value={name}
            maxLength={MAX_NAME}
            autoComplete="off"
            placeholder="Blorb"
            onChange={(event) => setName(event.target.value)}
          />
          {duplicate && (
            <p className="text-xs text-muted-foreground">
              You already have a preset called “{trimmed}”. Saving makes a second one.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* A hidden submit so Enter in the name box saves, without adding a
            second visible button next to the two in the footer. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          Save
        </button>
      </form>
    </Dialog>
  );
}
