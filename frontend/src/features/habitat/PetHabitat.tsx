import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import { PetRoom } from '../../scenes/PetRoom';
import type { RoomStatus } from '../../scenes/PetRoom';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { LANES } from '../../world/Lanes';
import {
  AMBIENCE_LIST,
  DEFAULT_AMBIENCE,
  DEFAULT_ROOM_TINT,
  ROOM_TINTS,
  fieldColor,
  getAmbience,
} from '../../world/Ambience';
import type { AmbienceId } from '../../world/Ambience';
import { cn, toCssHex } from '../../lib/utils';

/**
 * The habitat — the creature's home, framed as an object on the page.
 *
 * The world is a small lit box you look into, not a full-screen game. React
 * owns everything around the frame; PixiJS owns everything inside it, and the
 * two never share a tree (/Docs/project-overview.md §10).
 *
 * There are no buttons for making the creature do things. Everything you can do
 * to it, you do to it directly: pick it up, throw it, throw a toy at it, turn
 * off its light. The strip underneath says what those things are, then gets out
 * of the way.
 */

/**
 * Matches the room's own field colour, so the letterboxing disappears.
 *
 * It has to follow the mood: the frame is a window into the room, and a window
 * whose surround stays orange at midnight stops being a window and becomes a
 * picture of one.
 */
function fieldFor(ambience: AmbienceId, tint: number): number {
  return fieldColor({ ambience: getAmbience(ambience), tint });
}

export interface Placement {
  id: string;
  type: ObjectType;
}

interface PetHabitatProps {
  appearance: PetAppearance;
  petName: string;
  /** Objects the inventory has put in the room. */
  placements: Placement[];
  /** Bump this number to make the creature celebrate (a goal was completed). */
  celebrate?: number;
  className?: string;
}

const HINTS = [
  'Drag the creature to pick it up',
  'Drag up and down to move things deeper into the room',
  'Throw a toy — it will chase it',
  'Click the lamp for lights out',
];

export function PetHabitat({
  appearance,
  petName,
  placements,
  celebrate = 0,
  className,
}: PetHabitatProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<PetRoom | null>(null);
  /** Only the value the world is BUILT with; edits arrive via the effect below. */
  const initialAppearance = useRef(appearance);
  const placementsRef = useRef(placements);
  const dragging = useRef(false);

  const [ambience, setAmbience] = useState<AmbienceId>(DEFAULT_AMBIENCE);
  const [tint, setTint] = useState<number>(DEFAULT_ROOM_TINT);

  const [status, setStatus] = useState<RoomStatus>({
    mood: 'settling in',
    behavior: 'idle',
    lightsOn: true,
    ambience: DEFAULT_AMBIENCE,
    tint: DEFAULT_ROOM_TINT,
    holding: null,
    holdingLane: null,
  });

  const field = toCssHex(fieldFor(ambience, tint));

  // Which row of the room the thing in your hand is over. The floor says this
  // too, in the guide under the pointer; saying it in words as well is what
  // makes the room's depth learnable rather than merely visible.
  const laneLabel = status.holdingLane
    ? LANES.find((lane) => lane.id === status.holdingLane)?.label
    : null;

  // --- Mount the world -----------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;

    const start = async () => {
      const instance = new Application();
      await instance.init({
        background: fieldFor(DEFAULT_AMBIENCE, DEFAULT_ROOM_TINT),
        resizeTo: host,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      });

      // React 19 StrictMode mounts effects twice; bail if we lost the race.
      if (disposed) {
        instance.destroy(true);
        return;
      }

      app = instance;
      host.appendChild(instance.canvas);

      const room = new PetRoom(instance, {
        appearance: initialAppearance.current,
        // The frame is a window into the room, so show all of it.
        fit: 'contain',
        onStatus: setStatus,
      });
      instance.stage.addChild(room.root);
      roomRef.current = room;

      // Anything the inventory placed before the world existed.
      for (const placement of placementsRef.current) {
        room.placeObject(placement.id, placement.type);
      }

      if (import.meta.env.DEV) {
        // Handles for poking at the world from the console during development.
        const dev = window as unknown as Record<string, unknown>;
        dev.__petApp = instance;
        dev.__petRoom = room;
      }
    };

    void start();

    return () => {
      disposed = true;
      roomRef.current = null;
      app?.destroy(true, { children: true });
      app = null;
    };
  }, []);

  // --- Mood: the light in the room, and what it is painted -----------------
  // The room redresses itself and repaints the canvas behind it; the page only
  // has to keep the frame around it in step, so the two read as one lit space.
  useEffect(() => {
    roomRef.current?.setAmbience(ambience);
  }, [ambience]);

  useEffect(() => {
    roomRef.current?.setRoomTint(tint);
  }, [tint]);

  // --- Push appearance edits into the world --------------------------------
  useEffect(() => {
    roomRef.current?.setAppearance(appearance);
  }, [appearance]);

  // --- Add and remove placed objects ---------------------------------------
  useEffect(() => {
    const room = roomRef.current;
    const previous = placementsRef.current;
    placementsRef.current = placements;
    if (!room) return;

    for (const placement of placements) {
      if (!room.hasObject(placement.id)) room.placeObject(placement.id, placement.type);
    }

    for (const gone of previous) {
      if (!placements.some((placement) => placement.id === gone.id)) {
        room.removeObject(gone.id);
      }
    }
  }, [placements]);

  // --- Celebrate when something good happens elsewhere in the app ----------
  useEffect(() => {
    if (celebrate === 0) return;
    roomRef.current?.celebrate();
  }, [celebrate]);

  // --- Pointer: this is the whole interaction model -------------------------
  const toCanvas = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = toCanvas(event);
    // Capture, so a throw that leaves the frame still ends properly.
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    roomRef.current?.pointerDown(point.x, point.y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const point = toCanvas(event);
    roomRef.current?.pointerMove(point.x, point.y);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    roomRef.current?.pointerUp();
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="rounded-[2rem] border-8 border-card bg-card p-1 shadow-xl shadow-foreground/10 ring-1 ring-border">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{petName}</h2>
            <span className="text-xs text-muted-foreground">is {status.mood}</span>
          </div>
          <div className="flex items-center gap-2">
            {laneLabel ? (
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[0.65rem] font-medium tracking-wide text-primary uppercase">
                {laneLabel}
              </span>
            ) : null}
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[0.65rem] font-medium tracking-wide uppercase transition-colors',
                status.lightsOn
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-foreground text-background',
              )}
            >
              {status.lightsOn ? 'Lights on' : 'Lights out'}
            </span>
          </div>
        </div>

        <div
          ref={hostRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ backgroundColor: field }}
          className={cn(
            'relative aspect-[16/10] w-full touch-none overflow-hidden rounded-[1.4rem]',
            'transition-colors duration-700',
            status.holding ? 'cursor-grabbing' : 'cursor-grab',
          )}
          role="presentation"
        />

        {/* The vibe strip. It belongs inside the frame because it changes the
            room rather than the application: the light and the paint are part
            of the world, not settings about it (§20 — the interface should
            feel like part of the world). */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3 pb-1">
          <div className="flex flex-wrap items-center gap-1">
            {AMBIENCE_LIST.map((option) => {
              const selected = option.id === ambience;
              return (
                <button
                  key={option.id}
                  type="button"
                  title={option.note}
                  aria-pressed={selected}
                  onClick={() => setAmbience(option.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors outline-none',
                    'focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            {ROOM_TINTS.map((option) => (
              <button
                key={option.color}
                type="button"
                title={option.label}
                aria-label={`Paint the room ${option.label.toLowerCase()}`}
                aria-pressed={option.color === tint}
                onClick={() => setTint(option.color)}
                style={{ background: toCssHex(option.color) }}
                className={cn(
                  'size-5 rounded-full border-2 transition-transform outline-none',
                  'hover:scale-115 focus-visible:ring-2 focus-visible:ring-ring',
                  option.color === tint
                    ? 'scale-110 border-foreground'
                    : 'border-black/10',
                )}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="px-2 text-xs text-muted-foreground">
        {getAmbience(ambience).note}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-muted-foreground">
        {HINTS.map((hint) => (
          <span key={hint} className="flex items-center gap-1.5">
            <span aria-hidden className="text-[0.6rem] text-primary">
              ●
            </span>
            {hint}
          </span>
        ))}
      </div>
    </div>
  );
}
