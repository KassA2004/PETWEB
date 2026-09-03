import * as React from 'react';
import { cn } from '../../lib/utils';
import type { HomeArt } from './artModule';
import type { HomeCreature } from './creatures';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';

/**
 * When the home page's pictures arrive, and what stands in for them until then.
 *
 * The whole strategy in one line: **the page paints first, the renderer comes
 * second.** A visitor reads a headline and presses a button; none of that needs
 * a WebGL context, and making them wait for one is how a landing page ends up
 * slower than the product it is advertising.
 *
 * ```text
 *   paint  ──→  idle  ──→  import artModule  ──→  pictures fade in
 *     ↑
 *   headline, copy and CTA are already there and already work
 * ```
 *
 * Loaded once for the page and shared through context, so eleven pictures cost
 * one import and one renderer rather than eleven of each.
 *
 * **Every picture holds its final box.** `Picture` is sized by its props, not
 * by its content, so the arrival of an image never moves a word of text. That
 * is the same rule the product's skeletons follow (theme-and-design.md §20.6)
 * and it matters more here, because the thing that would jump is the thing
 * somebody is in the middle of reading.
 */

const ArtContext = React.createContext<HomeArt | null>(null);

/** Run `task` when the browser is idle, or after `timeout` if it never is. */
function whenIdle(task: () => void, timeout = 1200): () => void {
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;

  if (typeof ric === 'function') {
    const handle = ric(task, { timeout });
    return () =>
      (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(
        handle,
      );
  }

  const timer = window.setTimeout(task, Math.min(timeout, 400));
  return () => window.clearTimeout(timer);
}

export function HomeArtProvider({ children }: { children: React.ReactNode }) {
  const [art, setArt] = React.useState<HomeArt | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const stop = whenIdle(() => {
      void import('./artModule')
        .then((module) => {
          if (!cancelled) setArt(module.homeArt);
        })
        .catch(() => {
          // No pictures, and the page still reads. Every one of them is
          // decoration on top of copy that already says the same thing.
        });
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return <ArtContext.Provider value={art}>{children}</ArtContext.Provider>;
}

function useArt(): HomeArt | null {
  return React.useContext(ArtContext);
}

/**
 * One picture, drawn when the renderer is here.
 *
 * `draw` is called with the art module once it loads. It is deliberately a
 * function of the module rather than a URL, because until the module exists
 * there is no URL to have.
 */
function Picture({
  draw,
  width,
  height,
  alt,
  className,
  imgClassName,
  fade = true,
}: {
  draw: (art: HomeArt) => Promise<string>;
  width: number;
  height: number;
  alt: string;
  className?: string;
  imgClassName?: string;
  fade?: boolean;
}) {
  const art = useArt();
  const [src, setSrc] = React.useState<string | null>(null);
  // Held in a ref so an inline `draw` — a new function identity on every render
  // — does not restart a picture that has already been drawn correctly.
  const drawRef = React.useRef(draw);

  React.useEffect(() => {
    drawRef.current = draw;
  });

  React.useEffect(() => {
    if (!art) return;
    let cancelled = false;

    void drawRef.current(art).then(
      (url) => {
        if (!cancelled) setSrc(url);
      },
      () => {
        /* A picture that fails to draw stays a quiet box. */
      },
    );

    return () => {
      cancelled = true;
    };
  }, [art, width, height]);

  return (
    <span
      className={cn('relative block overflow-hidden', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {src && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          draggable={false}
          className={cn(
            'h-full w-full object-contain',
            fade && 'animate-fade-in',
            imgClassName,
          )}
        />
      )}
    </span>
  );
}

/** The room, empty, at 16:9. */
export function RoomPicture({ width, className }: { width: number; className?: string }) {
  return (
    <Picture
      draw={(art) => art.room(width)}
      width={width}
      height={Math.round((width * 9) / 16)}
      alt="A warm little room with a window, a bookshelf and a lamp"
      className={className}
      imgClassName="object-cover"
    />
  );
}

/** One thing that can stand in the room. */
export function ObjectPicture({
  type,
  label,
  size,
  className,
}: {
  type: ObjectType;
  label: string;
  size: number;
  className?: string;
}) {
  return (
    <Picture
      draw={(art) => art.object(type, size)}
      width={size}
      height={size}
      alt={label}
      className={className}
    />
  );
}

/**
 * One thing, standing on the floor of the room picture.
 *
 * The room section's furniture, and the reason it is a component rather than
 * four numbers in a table: *where* a thing goes is a question for the camera
 * (`world/Projection.ts`) and *where inside its own picture its feet are* is a
 * question for the artwork, and neither of those exists until the art module
 * has loaded. `HomeArt.placement` answers both at once.
 *
 * Nothing at all is rendered until then, and that costs nothing: the picture it
 * would be holding a box for has no source yet either, and the box is
 * positioned absolutely over the room, so no text can move when it appears.
 */
export function RoomObject({
  type,
  label,
  x,
  z,
}: {
  type: ObjectType;
  label: string;
  /** Where it stands, in room coordinates. */
  x: number;
  z: number;
}) {
  const art = useArt();
  if (!art) return null;

  const at = art.placement(type, x, z);

  return (
    <span
      className="animate-pop-in absolute"
      style={{
        left: `${at.left}%`,
        bottom: `${at.bottom}%`,
        width: `${at.width}%`,
        transform: 'translateX(-50%)',
      }}
    >
      <ObjectPicture type={type} label={label} size={220} className="w-full drop-shadow-sm" />
    </span>
  );
}

/** A creature, standing still. */
export function CreaturePicture({
  creature,
  size,
  alt,
  className,
}: {
  creature: HomeCreature;
  size: number;
  alt: string;
  className?: string;
}) {
  return (
    <Picture
      draw={(art) => art.portrait(creature, size)}
      width={size}
      height={size}
      alt={alt}
      className={className}
    />
  );
}
