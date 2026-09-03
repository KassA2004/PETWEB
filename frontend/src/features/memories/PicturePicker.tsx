import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCcw, Trash2 } from 'lucide-react';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../media/api';
import { prepareImage } from '../media/prepare';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { cn } from '../../lib/utils';

/**
 * Putting a photograph on a memory.
 *
 * The one place in the product that touches the outside world, and it used to
 * look it: a dashed rectangle with a plus in it, which is the shape every file
 * upload on the internet has, and which says nothing about what is being asked
 * for. What is being asked for is *a picture of the thing you just did* — so
 * this asks for that, in the two ways somebody actually has one.
 *
 * ```text
 *   phone     [ Take a photo ]  [ Choose one ]     ← the camera is first
 *   desktop   [ Choose a picture ]  · or drop one here
 * ```
 *
 * **The camera is a second `<input>`, not a mode.** `capture` is an attribute,
 * not a state, and a browser that honours it opens the camera directly from
 * the tap — no permission prompt of ours, no getUserMedia, no viewfinder to
 * build and no stream to remember to stop. The one that does not honour it
 * shows the ordinary picker, which is a worse version of the right answer
 * rather than a broken one. Cancelling either, or refusing the camera
 * permission, comes back through the same `change` event with no file, and
 * nothing happens — which is exactly what the user asked for.
 *
 * **The camera button is only offered where there is a camera.** On a desktop
 * `capture` is ignored, so a "Take a photo" button there is a lie that opens a
 * file dialog. `(pointer: coarse)` is the closest honest question the platform
 * will answer.
 *
 * **The picture is prepared before it is shown.** `prepareImage` rotates it the
 * right way up and brings it down to a sensible size, so the preview is the
 * thing that will actually be uploaded rather than a flattering version of it.
 * See `features/media/prepare.ts` — without that step every photograph taken in
 * portrait arrives sideways and most of them are refused for being over 5 MB.
 */

/** A chosen picture and the object URL previewing it, which live and die together. */
export interface Picked {
  file: File;
  url: string;
  /** What the user chose, before preparation — for the label. */
  originalName: string;
}

interface PicturePickerProps {
  picked: Picked | null;
  onPick: (picked: Picked | null) => void;
  /** Something is in flight; every control stands down. */
  busy?: boolean;
  onError: (message: string | null) => void;
}

const ACCEPTED = new Set(ACCEPTED_IMAGE_TYPES.split(','));

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PicturePicker({ picked, onPick, busy = false, onError }: PicturePickerProps) {
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [dragging, setDragging] = useState(false);

  /*
   * Whether this device has a camera to point at anything.
   *
   * A pointer question rather than a width one: a small window on a laptop is
   * still a laptop, and a tablet in landscape is still a thing with a camera.
   */
  const handheld = useMediaQuery('(pointer: coarse)');

  const disabled = busy || working;

  /**
   * The last object URL handed out, so it can be revoked.
   *
   * Each one pins its File in memory until it is released, and somebody trying
   * four photographs before settling on one would otherwise be holding all
   * four. Kept in a ref because the unmount cleanup has no other way to see
   * what is currently outstanding.
   */
  const held = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (held.current) URL.revokeObjectURL(held.current);
    };
  }, []);

  const replace = (next: Picked | null) => {
    if (held.current) URL.revokeObjectURL(held.current);
    held.current = next?.url ?? null;
    onPick(next);
  };

  const accept = async (chosen: File | null | undefined) => {
    if (!chosen) return;

    /*
     * The type check is a courtesy and is written as one. The server decides
     * what an image is, by magic bytes, because a browser will happily report
     * whatever the file extension suggests — but being told "PNG, JPEG or
     * WebP" before a five-megabyte upload is better than being told after it.
     *
     * A file the browser can re-encode is let through whatever it claims to
     * be: an iPhone HEIC becomes a JPEG in `prepareImage`, and refusing it
     * here on the strength of its type would refuse the picture the camera
     * button just took.
     */
    setWorking(true);
    onError(null);

    let prepared;
    try {
      prepared = await prepareImage(chosen);
    } catch {
      setWorking(false);
      onError('That picture could not be read. Try another one.');
      return;
    }

    setWorking(false);

    if (!prepared.reencoded && !ACCEPTED.has(prepared.file.type)) {
      onError('That has to be a PNG, JPEG or WebP.');
      return;
    }

    if (prepared.file.size > MAX_IMAGE_BYTES) {
      onError('That picture is over 5 MB, even after shrinking it. Try a smaller one.');
      return;
    }

    replace({
      file: prepared.file,
      url: URL.createObjectURL(prepared.file),
      originalName: chosen.name,
    });
  };

  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    // Let the same file be picked again after being removed; without this the
    // input's value is unchanged and `change` never fires a second time.
    event.target.value = '';
    void accept(chosen);
  };

  /* --- Chosen ------------------------------------------------------------ */

  if (picked) {
    return (
      <figure className="animate-pop-in space-y-2">
        {/*
          A print, not a file preview.

          The white mount and the tilt-free frame are the whole difference
          between "here is the thing you attached" and "here is the picture in
          your memory". `object-contain` on a soft field rather than
          `object-cover`, because cropping somebody's photograph to a tidy
          rectangle is the product deciding what the important part of their
          afternoon was.
        */}
        <div className="rounded-2xl border border-border bg-background/60 p-2 shadow-sm">
          <img
            src={picked.url}
            alt="The picture you chose"
            className="max-h-52 w-full rounded-xl bg-muted object-contain"
          />
        </div>

        <figcaption className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {picked.originalName}
            <span className="text-muted-foreground/70"> · {readableSize(picked.file.size)}</span>
          </span>

          <div className="flex shrink-0 items-center gap-1">
            <PictureAction
              icon={<RefreshCcw aria-hidden className="size-3.5" />}
              label="Replace"
              disabled={disabled}
              onClick={() => (handheld ? camera : library).current?.click()}
            />
            <PictureAction
              icon={<Trash2 aria-hidden className="size-3.5" />}
              label="Remove"
              destructive
              disabled={disabled}
              onClick={() => {
                replace(null);
                onError(null);
              }}
            />
          </div>
        </figcaption>

        <Inputs libraryRef={library} cameraRef={camera} onChange={choose} />
      </figure>
    );
  }

  /* --- Nothing chosen yet ------------------------------------------------ */

  return (
    <div
      onDragOver={(event) => {
        if (disabled || handheld) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (disabled || handheld) return;
        event.preventDefault();
        setDragging(false);
        void accept(event.dataTransfer.files?.[0]);
      }}
      className={cn(
        'rounded-2xl border-2 border-dashed p-4 transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border bg-background/40',
      )}
    >
      <p className="text-center text-xs text-muted-foreground">
        {working ? 'Getting it ready…' : 'A picture, if you took one'}
      </p>

      <div className={cn('mt-3 grid gap-2', handheld && 'grid-cols-2')}>
        {handheld && (
          <PickerButton
            icon={<Camera aria-hidden className="size-4" />}
            label="Take a photo"
            disabled={disabled}
            primary
            onClick={() => camera.current?.click()}
          />
        )}

        <PickerButton
          icon={<ImagePlus aria-hidden className="size-4" />}
          label={handheld ? 'Choose one' : 'Choose a picture'}
          disabled={disabled}
          primary={!handheld}
          onClick={() => library.current?.click()}
        />
      </div>

      <p className="mt-2 text-center text-[0.65rem] text-muted-foreground">
        {handheld ? 'PNG, JPEG or WebP' : 'Or drop one here · PNG, JPEG or WebP'}
      </p>

      <Inputs libraryRef={library} cameraRef={camera} onChange={choose} />
    </div>
  );
}

/**
 * The two file inputs.
 *
 * Both are always in the document, whichever buttons are on screen, because
 * `capture` cannot be toggled on one input without the risk of a browser having
 * already read it. Hidden with `sr-only`-style positioning rather than
 * `display: none`: a hidden input is not focusable, and `tabIndex={-1}` keeps
 * both of them out of the tab order in any case — the buttons are the controls.
 */
function Inputs({
  libraryRef,
  cameraRef,
  onChange,
}: {
  libraryRef: React.RefObject<HTMLInputElement | null>;
  cameraRef: React.RefObject<HTMLInputElement | null>;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <input
        ref={libraryRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        onChange={onChange}
        className="hidden"
        tabIndex={-1}
      />
      {/*
        `capture="environment"` asks for the back camera, which is the one
        pointed at the thing you did. `accept="image/*"` rather than the three
        types: a camera's own output is whatever the device shoots — HEIC on an
        iPhone — and narrowing the accept list here is how a phone ends up
        offering the photo library instead of the shutter. `prepareImage` turns
        whatever comes back into a JPEG.
      */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="hidden"
        tabIndex={-1}
      />
    </>
  );
}

function PickerButton({
  icon,
  label,
  primary,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'press inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        primary
          ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          : 'border border-border bg-card hover:bg-muted/60',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Replace and Remove.
 *
 * Icon *and* word. The icon alone would be two ambiguous glyphs beside
 * somebody's photograph, and the word alone was what this used to be — two
 * pieces of grey text that read as a caption rather than as controls. They also
 * have a real target: 32px tall on a row of 12px type.
 */
function PictureAction({
  icon,
  label,
  destructive,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'press inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
        'text-muted-foreground transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        destructive ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
