import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookHeart, MessageCircle, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/utils';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import { normalizeRoomStyle } from '../../world/RoomStyle';
import { OBJECT_TYPES } from '../../assets/objects/ObjectRenderer';
import type { ObjectType } from '../../assets/objects/ObjectRenderer';
import { PetHabitat } from '../habitat/PetHabitat';
import type { Placement } from '../habitat/PetHabitat';
import { imageSrc } from '../media/api';
import type { Memory } from '../memories/api';
import { fetchProfile, fetchPublicMemories, fetchVisitableRoom } from './api';
import type { PublicUser, VisitableRoom } from './api';
import type { WorldChrome } from './SocialLayer';

/**
 * Visiting somebody.
 *
 * The screen this whole feature is for. You searched a username, and now you
 * are standing in their room, watching their creature potter about in the light
 * they chose, among the furniture they arranged — and beside it, the things
 * they decided to remember.
 *
 * ## It is the real room, in the real window
 *
 * `PetHabitat`, the same component the owner's own dashboard mounts, with the
 * same PixiJS scene, the same physics, the same brain and the same environment
 * (project brief §3: *"the visited environment should use the existing PetWeb
 * environment/pet systems rather than creating a simplified representation"*).
 * Their creature is not a portrait; it is alive, and it is doing whatever it
 * happens to be doing.
 *
 * And it is drawn **where your own room is drawn** — portalled into the
 * dashboard's world column, which the dashboard has emptied for it. That is not
 * only tidier than a canvas inside a panel: it is what stops the page holding
 * two live PixiJS applications, which was the source of the flicker on the way
 * into somebody's room.
 *
 * Three things make it a *visit* rather than a second copy of the dashboard:
 *
 * ```text
 *   readOnly     the scene refuses the pointer entirely
 *                (`PetRoom.setInteractive`) — you can watch, you cannot pick
 *                anything up, and their pet does not come over to your cursor
 *                because its fondness is a relationship with THEM
 *   no saving    there is no `onArrangementChange` and no style write. Nothing
 *                that happens on this screen can reach their database row
 *   public only  their memories come from `/users/:id/memories`, which the
 *                server filters in the query. The private ones are not hidden
 *                here; they were never fetched
 * ```
 *
 * ## Three requests, started together
 *
 * The profile, the room and the memories have no dependency on one another —
 * all three are keyed on a user id this component already has — so they go out
 * at once rather than in a waterfall (AGENTS.md, Performance Rules:
 * *"independent requests start together"*).
 */

interface VisitStageProps {
  userId: string;
  username: string;
  compact: boolean;
  /** How the room is dressed and sized on this screen. See `WorldChrome`. */
  world: WorldChrome;
  /** The dashboard's world column. Null for the first render only. */
  worldHost: HTMLElement | null;
  onClose: () => void;
  /** Offer to message them, when they are a friend. */
  onMessage?: (user: { id: string; username: string }) => void;
}

const OBJECT_TYPE_SET = new Set<string>(OBJECT_TYPES);

/** Whatever their room holds, only if it is still a thing we can draw. */
function isKnownType(type: string): type is ObjectType {
  return OBJECT_TYPE_SET.has(type);
}

export function VisitStage({
  userId,
  username,
  compact,
  world,
  worldHost,
  onClose,
  onMessage,
}: VisitStageProps) {
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [room, setRoom] = useState<VisitableRoom | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const habitatRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      setLoading(true);
      try {
        // Independent, so they start together. The room is the slow one — it
        // carries the arrangement — and waiting for the profile first would put
        // a round trip in front of it for an id we already have.
        const [nextProfile, nextRoom, nextMemories] = await Promise.all([
          fetchProfile(userId, controller.signal),
          fetchVisitableRoom(userId, controller.signal),
          fetchPublicMemories(userId, controller.signal),
        ]);

        if (controller.signal.aborted) return;
        setProfile(nextProfile);
        setRoom(nextRoom);
        setMemories(nextMemories);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'That room could not be opened just now.',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [userId]);

  /*
   * Their room, in the terms the renderer wants.
   *
   * Both halves go through the same normalizers the owner's own client uses —
   * `normalizeRoomStyle` for the style, the catalog check for the objects — so
   * a room saved before a wallpaper existed, or holding an object type that has
   * since been retired, costs one setting or one object rather than the visit.
   */
  const style = useMemo(() => normalizeRoomStyle(room?.sceneData), [room?.sceneData]);

  const placements = useMemo<Placement[]>(
    () =>
      (room?.objects ?? [])
        .filter((object) => isKnownType(object.type))
        .map((object) => ({
          id: object.key,
          type: object.type as ObjectType,
          cell: { col: object.col, row: object.row },
          definition: (object.definition ?? {}) as Record<string, number>,
        })),
    [room?.objects],
  );

  /*
   * Keyed on the appearance *document*, not on the pet.
   *
   * `PetHabitat` pushes this into the scene whenever its identity changes, and
   * the scene answers by rebuilding the rig. A new object every render would
   * rebuild the creature every render.
   */
  const appearance = useMemo(
    () => createPetAppearance((room?.pet?.appearanceData ?? {}) as never),
    [room?.pet?.appearanceData],
  );

  const back = (
    <Button variant="secondary" size="sm" className="h-8 shrink-0 gap-1.5 px-2.5 text-xs" onClick={onClose}>
      <ArrowLeft aria-hidden className="size-3.5" />
      Back
    </Button>
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy="true">
        <p role="status" className="sr-only">
          Opening {username}'s room…
        </p>
        <header className="flex shrink-0 items-center justify-between gap-3">
          <Skeleton className="h-5 w-1/2" />
          {back}
        </header>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? 'That room could not be opened.'}
        </p>
        <Button variant="secondary" className="w-full" onClick={onClose}>
          Back
        </Button>
      </div>
    );
  }

  const isFriend = profile?.relationship === 'friends';

  /*
   * Their room itself, in the dashboard's window. Read-only, and the scene is
   * what enforces that — `readOnly` reaches `PetRoom.setInteractive`, which
   * refuses the pointer at the trust boundary rather than by not attaching a
   * handler.
   */
  const theirRoom =
    worldHost &&
    createPortal(
      <PetHabitat
        ref={habitatRef}
        appearance={appearance}
        petName={room.pet?.name ?? room.username}
        placements={placements}
        roomStyle={style}
        onRoomStyleChange={NO_WRITE}
        readOnly
        compact={compact}
        {...world}
      />,
      worldHost,
    );

  return (
    <>
      {theirRoom}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">{room.name}</h3>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Sparkles aria-hidden className="size-3.5 shrink-0" />
              {room.pet
                ? `${room.pet.name} lives here`
                : `${room.username} has no creature yet`}
            </p>
          </div>

          {back}
        </header>

        {isFriend && onMessage && (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => onMessage({ id: userId, username: room.username })}
          >
            <MessageCircle aria-hidden className="size-4" />
            Message {room.username}
          </Button>
        )}

        {/* --- What they have chosen to remember ---------------------------- */}
        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <h4 className="flex shrink-0 items-center gap-1.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
            <BookHeart aria-hidden className="size-3.5" />
            Shared memories
          </h4>

          {memories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              {room.username} hasn't shared any memories yet.
            </p>
          ) : (
            <ul className="stagger relative min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
              {memories.map((memory) => (
                <li
                  key={memory.id}
                  className={cn('overflow-hidden rounded-xl border border-border bg-card')}
                >
                  {memory.imageUrl && (
                    <div className="h-40 w-full overflow-hidden bg-muted">
                      <img
                        src={imageSrc(memory.imageUrl)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="truncate text-sm font-medium">{memory.title}</p>
                    {memory.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {memory.description}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * The room's style callback, when there is nothing to write it to.
 *
 * A named module-level constant rather than an inline arrow, because
 * `PetHabitat` hands its callbacks to a scene that is built once and keeps the
 * first one forever — an inline `() => {}` would be a new function every render
 * and, while harmless *here*, is exactly the habit the Rendering rules warn
 * about. Naming it also says out loud what it means: a visitor's changes have
 * nowhere to go, by design.
 */
const NO_WRITE = () => undefined;
