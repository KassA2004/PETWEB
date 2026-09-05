import { useMemo, useState } from 'react';
import {
  FLOOR_PATTERNS,
  FLOOR_PATTERN_LABELS,
} from '../../assets/environment/Floor';
import {
  WALL_TEXTURES,
  WALL_TEXTURE_LABELS,
} from '../../assets/environment/walls/WallTextures';
import { WALL_DECOR_LIST } from '../../assets/environment/walls/WallDecor';
import type { WallDecorKind } from '../../assets/environment/walls/WallDecor';
import { WINDOW_VIEW_LIST } from '../../assets/environment/window/WindowViews';
import {
  OBJECT_CATEGORY_LABELS,
  OBJECT_TYPES,
  getObjectTraits,
} from '../../assets/objects/ObjectRenderer';
import type { ObjectCategory, ObjectType } from '../../assets/objects/ObjectRenderer';
import { AMBIENCE_LIST, ROOM_TINTS } from '../../world/Ambience';
import { SoundControls } from './SoundControls';
import {
  renderAmbienceIcon,
  renderDecorIcon,
  renderFloorIcon,
  renderObjectIcon,
  renderWallIcon,
  renderWindowIcon,
} from './objectPreviews';
import { OptionGrid } from '../../components/ui/option-grid';
import type { GridOption } from '../../components/ui/option-grid';
import { Section } from '../../components/ui/controls';
import { Tabs } from '../../components/ui/tabs';
import type { TabItem } from '../../components/ui/tabs';
import { Armchair, Palette } from 'lucide-react';
import { LockedDialog } from '../progress/LockedDialog';
import { ProgressStats } from '../progress/ProgressStats';
import { describeRequirement, meetsRequirement } from '../../lib/progress';
import type { UserProgress } from '../../lib/progress';
import type { RoomStyle } from '../../world/RoomStyle';
import { sfx } from '../../lib/audio';
import { cn, toCssHex } from '../../lib/utils';

/**
 * The room panel — what the room is made of, and what is standing in it.
 *
 * This is now the user's whole object store as well as the decorating
 * controls. There is no separate inventory: an inventory is a list of things
 * you own but cannot see, and every one of those things was already either a
 * piece of furniture (which belongs in the room) or a hat (which belongs on the
 * creature). Removing it removed a screen and lost nothing.
 *
 * ## Two questions, not seven chips
 *
 * It used to be a wrapping row of seven identical capsules — Objects, Hour,
 * Paint, Surfaces, View, Walls, Sound — which is a list of everything the panel
 * can do, sorted by nothing. Two of them were catalogues of *things you put in
 * the room*, four were *what the room is like*, and one was the application's
 * audio mixer. Capsules cannot say that, and adding an eighth would not have
 * helped.
 *
 * ```text
 *   FURNITURE     what stands in the room and hangs on its walls
 *     Furniture · Decor · Toys · On the wall
 *
 *   THE ROOM      what the room itself is made of
 *     Hour · Paint · Surfaces · View · Sound
 * ```
 *
 * The first tab was called "Things" and is now called Furniture, on request.
 * It is the broader word that is wrong, not the narrower one: "things" names a
 * category by admitting there isn't one, and the tab's own first section — the
 * one that opens under it — has always been the furniture. Decor and toys read
 * as furnishings; nobody reads a chair as a thing.
 *
 * Two tabs — the same control the application navigates with, so this reads as
 * the product rather than as a widget — and inside each, named sections in the
 * same `Section` frame the creature editor uses.
 *
 * **Wall pieces are objects.** They were the odd one out: a catalogue of things
 * you own, filed beside the clock and the paint because they happen to attach
 * to a wall. They are now the fourth object category, next to Furniture, Decor
 * and Toys. That also fixed something worse than untidiness — the old Walls
 * chip was *removed entirely on a small screen* (it needs a pointer to drag),
 * so nobody on a phone could hang anything at all. As a catalogue tile it is
 * tapped like every other object, and the drag stays for a pointer that has one.
 *
 * Every choice here is shown as the thing it makes, drawn by the same
 * generators the room runs on (`objectPreviews.ts`). Nothing in this panel is a
 * word where a picture would do.
 */

type PanelTab = 'furniture' | 'room';

const PANEL_TABS: TabItem<PanelTab>[] = [
  { value: 'furniture', label: 'Furniture', icon: Armchair },
  { value: 'room', label: 'The Room', icon: Palette },
];

interface RoomStylePanelProps {
  style: RoomStyle;
  onChange: (patch: Partial<RoomStyle>) => void;
  /** Shown quietly when the room cannot be saved. */
  error?: string | null;
  /** Pick a palette piece up; the habitat frame carries the drag from here. */
  onWallDragStart: (kind: WallDecorKind) => void;
  /** Put a wall piece up without a drag. False when the wall is full. */
  onHangWallDecor: (kind: WallDecorKind) => boolean;
  /** Put one of these in the room. */
  onPlaceObject: (type: ObjectType) => void;
  /** Whether the room is in its editing state. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /**
   * What the user has earned, which decides half the catalogue.
   *
   * Passed in rather than fetched here: the dashboard already holds it (it has
   * to, so it can ask again the moment a session ends or a goal is finished),
   * and a panel that fetched its own copy would be a second request for a
   * number the page above it is already holding.
   */
  progress: UserProgress;
  /** True until the first progress read lands. Keeps zeroes from reading as facts. */
  progressLoading?: boolean;
  /**
   * Small screen: the wall pieces are tapped rather than dragged.
   *
   * They used to be *absent* here, which was the wrong answer to a real
   * problem: dragging a painting onto a wall needs a pointer and a canvas
   * bigger than a thumb. The catalogue answers it properly — a tile you press,
   * the same as every other object — so a phone can decorate a wall now, and
   * the drag remains the nicer gesture where there is a pointer to do it with.
   */
  compact?: boolean;
  className?: string;
}

/** The catalog, grouped the way the simulation already groups it. */
const OBJECTS_BY_CATEGORY = OBJECT_TYPES.reduce<Record<string, ObjectType[]>>(
  (groups, type) => {
    const category = getObjectTraits(type).category;
    (groups[category] ??= []).push(type);
    return groups;
  },
  {},
);

const OBJECT_LABELS: Record<ObjectType, string> = OBJECT_TYPES.reduce(
  (labels, type) => ({ ...labels, [type]: getObjectTraits(type).label }),
  {} as Record<ObjectType, string>,
);

export function RoomStylePanel({
  style,
  onChange,
  error,
  onWallDragStart,
  onHangWallDecor,
  onPlaceObject,
  editing,
  onEditingChange,
  progress,
  progressLoading = false,
  compact = false,
  className,
}: RoomStylePanelProps) {
  const [tab, setTab] = useState<PanelTab>('furniture');
  /**
   * The object whose lock is being explained.
   *
   * Kept as the type rather than as a boolean so the dialog can go on drawing
   * the right thing through its own exit animation; `Dialog` unmounts itself a
   * beat after `open` goes false, and clearing this on close would blank the
   * panel mid-fade.
   */
  const [locked, setLocked] = useState<ObjectType | null>(null);

  /**
   * Place it, or explain why not.
   *
   * The gate is here rather than inside the grid, because this is the only
   * place that knows both what the user has done and what the object costs -
   * and because the tile's job is to report a press, not to decide what a press
   * means. Note what it does *not* do: nothing already standing in the room is
   * touched. A counter that falls (unsharing a memory does exactly that) can
   * lock a tile again; it can never take back the furniture.
   */
  const place = (type: ObjectType) => {
    const requirement = getObjectTraits(type).unlock;

    if (requirement && !meetsRequirement(progress, requirement)) {
      setLocked(type);
      return;
    }

    sfx.drop();
    onPlaceObject(type);
  };

  return (
    <div className={cn('space-y-3 px-3 pt-3 pb-1', className)}>
      <Tabs items={PANEL_TABS} value={tab} onValueChange={setTab} dense={compact} />

      {error && (
        <p role="status" className="text-[0.65rem] text-muted-foreground">
          {error}
        </p>
      )}

      {tab === 'furniture' && (
        <div className="space-y-3">
          <EditRoomSwitch
            editing={editing}
            onEditingChange={onEditingChange}
          />

          <Section
            title="What you have done"
            description="Time served and goals kept. Some of the catalogue is earned with it."
          >
            <ProgressStats progress={progress} loading={progressLoading} />
          </Section>

          <ObjectsSection onPlace={place} progress={progress} />

          {/*
            No list of what is already up, and no ✕ beside each of them.

            There used to be one — a row of pills reading "Painting ✕" — and it
            was a second way to do something the room already does better. A
            piece comes down the same way a chair goes away: turn Edit room on,
            pick it up, lift it out of the top of the frame. One gesture for
            every object in the product, learned once, with the room itself
            showing the refusal or the discard as it happens. The pills could
            not show which painting was which (they were all called "Painting"),
            they duplicated a control the frame already had, and they were the
            only destructive action in the panel that worked without edit mode
            being on at all.
          */}
          <Section
            title="On the wall"
            description={
              compact
                ? 'Tap a piece and it goes up in the first free space. Turn on Edit room to move or remove one.'
                : 'Drag a piece onto the wall in the frame, or tap it to hang it. Turn on Edit room to move or remove one.'
            }
          >
            <WallCatalog
              compact={compact}
              onWallDragStart={onWallDragStart}
              onHangWallDecor={onHangWallDecor}
            />
          </Section>
        </div>
      )}

      {tab === 'room' && (
        <div className="space-y-3">
          <Section title="Hour" description="What time it is, and the light that makes.">
            <HourSection style={style} onChange={onChange} />
          </Section>

          <Section title="Paint" description="The colour everything in the room is lit through.">
            <div
              role="radiogroup"
              aria-label="Room colour"
              className="flex flex-wrap items-center gap-1.5"
            >
            {ROOM_TINTS.map((option) => (
              <button
                key={option.color}
                type="button"
                role="radio"
                title={option.label}
                aria-label={`Paint the room ${option.label.toLowerCase()}`}
                aria-checked={option.color === style.tint}
                onClick={() => onChange({ tint: option.color })}
                style={{ background: toCssHex(option.color) }}
                className={cn(
                  'press size-8 rounded-full border-2 outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  option.color === style.tint
                    ? 'scale-110 border-foreground'
                    : 'border-black/10 hover:border-foreground/40',
                )}
              />
            ))}
            </div>
          </Section>

          <Section title="Surfaces" description="What the floor and the walls are made of.">
            <SurfacesSection style={style} onChange={onChange} />
          </Section>

          <Section title="View" description="What is on the other side of the glass.">
            <WindowSection style={style} onChange={onChange} />
          </Section>

          <Section title="Sound" description="The room's own noise, and everything else.">
            <SoundControls />
          </Section>
        </div>
      )}

      <LockedDialog
        open={locked !== null}
        onClose={() => setLocked(null)}
        item={
          locked && getObjectTraits(locked).unlock
            ? {
                label: OBJECT_LABELS[locked],
                requirement: getObjectTraits(locked).unlock!,
                // The same function the tile behind it used, so `lib/preview`
                // has the image cached and the modal opens on an object rather
                // than on a skeleton.
                preview: () => renderObjectIcon(locked),
              }
            : null
        }
        progress={progress}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Objects                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything that can stand on the floor, grouped the way the simulation
 * already groups it.
 *
 * One `Section` per category rather than one section with three headings
 * inside it, so each catalogue is the same object on the page as "Hour" or
 * "Paint" — which is what makes the two tabs read as one system.
 */
function ObjectsSection({
  onPlace,
  progress,
}: {
  onPlace: (type: ObjectType) => void;
  progress: UserProgress;
}) {
  const categories = Object.keys(OBJECTS_BY_CATEGORY) as ObjectCategory[];

  return (
    <>
      {categories.map((category) => (
        <Section key={category} title={OBJECT_CATEGORY_LABELS[category]}>
          {/*
            A catalog, not a selection: there is no "current object", so the
            tiles are buttons that add rather than radios that choose. Reusing
            `OptionGrid` would have meant one of them always looking chosen.
          */}
          <CatalogGrid
            types={OBJECTS_BY_CATEGORY[category]}
            onPlace={onPlace}
            progress={progress}
          />
        </Section>
      ))}
    </>
  );
}

/**
 * Edit mode, as a switch rather than a mode you fall into.
 *
 * The two states want opposite things from a click: normally, clicking the lamp
 * turns the light off, and while editing, dragging it out of the frame throws
 * it away. A room where those are the same gesture is a room that eats your
 * furniture.
 */
function EditRoomSwitch({
  editing,
  onEditingChange,
}: {
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  return (
      <button
        type="button"
        role="switch"
        aria-checked={editing}
        onClick={() => onEditingChange(!editing)}
        className={cn(
          'press flex w-full items-center gap-3 rounded-xl border p-3 text-left outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring',
          editing
            ? 'border-primary bg-primary/10'
            : 'border-border bg-card hover:border-primary/40',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
            editing ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 size-4 rounded-full bg-card shadow transition-transform duration-200',
              editing ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Edit room</span>
          {/*
            What the switch does, in both states — not a count.

            This used to read "N things in the room", and N was the number of
            *saved placements*, which on a brand new account is zero while
            eleven pieces of furniture are visibly standing there: the room
            furnishes itself from `world/environments` and only writes rows once
            something is deliberately moved. A number a user can see is wrong is
            worse than no number, and a switch's second line is better spent
            saying what turning it on will do.
          */}
          <span className="block text-xs text-muted-foreground">
            {editing
              ? 'Drag anything out of the frame to put it away.'
              : 'Turn on to move things around, or take them out.'}
          </span>
        </span>
      </button>
  );
}

/**
 * The picture grid for things you can add. Paged, like every other grid.
 *
 * Locked things are **in it**, dimmed and padlocked, rather than hidden until
 * earned. A catalogue that grows items you have never seen cannot be something
 * you work towards - you would have to already know the Bean Bag existed to
 * want it - and the grid pages the same way either way, so showing them costs
 * the layout nothing.
 */
function CatalogGrid({
  types,
  onPlace,
  progress,
}: {
  types: readonly ObjectType[];
  onPlace: (type: ObjectType) => void;
  progress: UserProgress;
}) {
  const options = useMemo<GridOption<ObjectType>[]>(
    () =>
      types.map((type) => {
        const requirement = getObjectTraits(type).unlock;
        const locked = requirement !== undefined && !meetsRequirement(progress, requirement);

        return {
          value: type,
          label: OBJECT_LABELS[type],
          // The hint is the tile's tooltip *and* its accessible name when it is
          // locked, so the requirement has to be legible on its own here -
          // "Locked" alone would be a state with no way out of it.
          hint: locked
            ? `Locked — ${describeRequirement(requirement)} to unlock`
            : `Put ${OBJECT_LABELS[type].toLowerCase()} in the room`,
          locked,
          preview: () => renderObjectIcon(type),
        };
      }),
    [types, progress],
  );

  return (
    <OptionGrid
      options={options}
      // Nothing is ever "the selected object" — the value is deliberately a key
      // no option has, so every tile renders unselected.
      value={'' as ObjectType}
      // The sound belongs with the placement, not with the press: a locked tile
      // opens a modal, and the modal has its own voice.
      onChange={onPlace}
      columns={4}
      rows={2}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* The room's own surfaces                                                    */
/* -------------------------------------------------------------------------- */

function HourSection({
  style,
  onChange,
}: {
  style: RoomStyle;
  onChange: (patch: Partial<RoomStyle>) => void;
}) {
  const options = useMemo<GridOption<string>[]>(
    () =>
      AMBIENCE_LIST.map((option) => ({
        value: option.id,
        label: option.label,
        hint: option.note,
        preview: () => renderAmbienceIcon(option.id, style.tint),
      })),
    [style.tint],
  );

  return (
    <OptionGrid
      options={options}
      value={style.ambience}
      onChange={(ambience) => onChange({ ambience: ambience as RoomStyle['ambience'] })}
      columns={4}
    />
  );
}

function SurfacesSection({
  style,
  onChange,
}: {
  style: RoomStyle;
  onChange: (patch: Partial<RoomStyle>) => void;
}) {
  const floors = useMemo<GridOption<string>[]>(
    () =>
      FLOOR_PATTERNS.map((pattern) => ({
        value: pattern,
        label: FLOOR_PATTERN_LABELS[pattern],
        preview: () => renderFloorIcon(pattern, style.tint, style.ambience),
      })),
    // The hour as well as the paint: a floor is previewed in the light it will
    // be seen in, so repainting *or* changing the hour redraws these tiles.
    [style.tint, style.ambience],
  );

  const walls = useMemo<GridOption<string>[]>(
    () =>
      WALL_TEXTURES.map((texture) => ({
        value: texture,
        label: WALL_TEXTURE_LABELS[texture],
        preview: () => renderWallIcon(texture, style.tint, style.ambience),
      })),
    [style.tint, style.ambience],
  );

  return (
    <div className="space-y-4">
      <OptionGrid
        label="Floor"
        options={floors}
        value={style.floor}
        onChange={(floor) => onChange({ floor: floor as RoomStyle['floor'] })}
        columns={4}
      />
      <OptionGrid
        label="Walls"
        options={walls}
        value={style.wall}
        onChange={(wall) => onChange({ wall: wall as RoomStyle['wall'] })}
        columns={4}
      />
    </div>
  );
}

function WindowSection({
  style,
  onChange,
}: {
  style: RoomStyle;
  onChange: (patch: Partial<RoomStyle>) => void;
}) {
  const options = useMemo<GridOption<string>[]>(
    () =>
      WINDOW_VIEW_LIST.map((view) => ({
        value: view.id,
        label: view.label,
        hint: view.note,
        preview: () => renderWindowIcon(view.id),
      })),
    [],
  );

  return (
    <OptionGrid
      options={options}
      value={style.window}
      onChange={(view) => onChange({ window: view as RoomStyle['window'] })}
      columns={4}
    />
  );
}

/**
 * The wall pieces, as a catalogue.
 *
 * Four to a row like every other object grid, because that is what it is now.
 * The tile does two things depending on what it is being pressed with, and the
 * split is the whole reason wall decor was unreachable on a phone before:
 *
 * ```text
 *   a pointer   press and move — the piece comes off the palette and follows
 *               the cursor onto the wall, which is the nicer gesture and the
 *               one that lets you choose the spot
 *   a thumb     a plain tap — the room finds the first free space and hangs it
 * ```
 *
 * Both end in the same place. Neither is a secret: the section's description
 * says which one this device has.
 */
function WallCatalog({
  compact,
  onWallDragStart,
  onHangWallDecor,
}: {
  compact: boolean;
  onWallDragStart: (kind: WallDecorKind) => void;
  onHangWallDecor: (kind: WallDecorKind) => boolean;
}) {
  const [full, setFull] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-4 gap-2">
        {WALL_DECOR_LIST.map((spec) => (
          <DecorTile
            key={spec.kind}
            kind={spec.kind}
            label={spec.label}
            hint={
              compact
                ? `Hang ${spec.label.toLowerCase()} on the wall`
                : `Drag ${spec.label.toLowerCase()} onto the wall, or tap to hang it`
            }
            draggable={!compact}
            onPickUp={() => onWallDragStart(spec.kind)}
            onHang={() => setFull(!onHangWallDecor(spec.kind))}
          />
        ))}
      </div>

      {/*
        Said out loud rather than left as a tile that quietly does nothing. A
        wall with no room left is a fine state to be in; a control with no
        feedback is not.
      */}
      {full && (
        <p role="status" className="text-[0.65rem] text-muted-foreground">
          No space left on the wall — take something down first.
        </p>
      )}
    </div>
  );
}

/**
 * One wall piece, previewed as itself.
 *
 * Both gestures live on one control. On a pointer device the press *starts a
 * drag* — the piece leaves the palette immediately, which is what makes the
 * drag feel like picking something up rather than like a delayed click — and a
 * plain click that never moved falls through to hanging it in the first free
 * space. On a touch device there is no drag at all and the tap is the whole
 * interaction.
 *
 * A `<button>` throughout, so it is in the tab order and answers to Enter and
 * Space, which a draggable `<div>` never was.
 */
function DecorTile({
  kind,
  label,
  hint,
  draggable,
  onPickUp,
  onHang,
}: {
  kind: WallDecorKind;
  label: string;
  hint: string;
  draggable: boolean;
  onPickUp: () => void;
  onHang: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useMemo(() => {
    void renderDecorIcon(kind).then(setSrc);
  }, [kind]);

  return (
    <button
      type="button"
      title={hint}
      aria-label={hint}
      onPointerDown={(event) => {
        // A mouse or pen picks it up. A finger does not: the frame is a third
        // of a phone screen and the finger covers the thing being dragged.
        if (!draggable || event.pointerType === 'touch') return;
        sfx.grab();
        onPickUp();
      }}
      onClick={onHang}
      className={cn(
        'group flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-1.5',
        'outline-none select-none',
        draggable ? 'cursor-grab touch-none active:cursor-grabbing' : 'touch-manipulation',
        'transition-[transform,border-color,box-shadow] duration-150 ease-out',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm active:scale-[0.97]',
        'focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-muted/40">
        {src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            className="animate-fade-in h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <span className="size-full animate-pulse rounded-lg bg-muted/60" />
        )}
      </span>
      <span className="w-full truncate text-center text-[0.6rem] text-muted-foreground">
        {label}
      </span>
    </button>
  );
}
