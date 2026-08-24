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
 * ```text
 *   Objects    the catalog. Tap one and it lands in the room
 *   Hour       what time it is, previewed as the light it makes
 *   Paint      the room's colour
 *   Surfaces   floor and wall, previewed as patches of the real material
 *   View       what is outside the window
 *   Walls      what is hanging up, dragged onto the wall in the frame
 *   Sound      the mixer
 * ```
 *
 * Every choice here is shown as the thing it makes, drawn by the same
 * generators the room runs on (`objectPreviews.ts`). Nothing in this panel is a
 * word where a picture would do.
 */

type Section = 'objects' | 'light' | 'colour' | 'surfaces' | 'window' | 'walls' | 'sound';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'objects', label: 'Objects' },
  { id: 'light', label: 'Hour' },
  { id: 'colour', label: 'Paint' },
  { id: 'surfaces', label: 'Surfaces' },
  { id: 'window', label: 'View' },
  { id: 'walls', label: 'Walls' },
  { id: 'sound', label: 'Sound' },
];

interface RoomStylePanelProps {
  style: RoomStyle;
  onChange: (patch: Partial<RoomStyle>) => void;
  /** Shown quietly when the room cannot be saved. */
  error?: string | null;
  /** Pick a palette piece up; the habitat frame carries the drag from here. */
  onWallDragStart: (kind: WallDecorKind) => void;
  /** Put one of these in the room. */
  onPlaceObject: (type: ObjectType) => void;
  /** Whether the room is in its editing state. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** How many things are standing in the room, for the editing hint. */
  objectCount: number;
  /**
   * Small screen: hide the controls that need a pointer and a big canvas.
   *
   * Wall decor is hung by dragging a piece onto the wall in the frame and
   * watching it land. On a phone the frame is a third of the screen and the
   * finger doing the dragging covers the thing being dragged, so the control is
   * not "smaller" there — it does not work there. Everything that is a choice
   * rather than a gesture stays.
   */
  compact?: boolean;
  className?: string;
}

function Chip({
  selected,
  title,
  onClick,
  children,
}: {
  selected: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
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
  onPlaceObject,
  editing,
  onEditingChange,
  objectCount,
  compact = false,
  className,
}: RoomStylePanelProps) {
  const [section, setSection] = useState<Section>('objects');
  const sections = compact
    ? SECTIONS.filter((option) => option.id !== 'walls')
    : SECTIONS;

  const takeDown = (id: string) => {
    onChange({ decor: style.decor.filter((item) => item.id !== id) });
  };

  return (
    <div className={cn('px-3 pt-3 pb-1', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 pb-2">
        {sections.map((option) => (
          <Chip
            key={option.id}
            selected={option.id === section}
            onClick={() => setSection(option.id)}
          >
            {option.label}
          </Chip>
        ))}

        <span className="ml-auto text-[0.65rem] text-muted-foreground">
          {error ?? null}
        </span>
      </div>

      <div className="pt-3">
        {section === 'objects' && (
          <ObjectsSection
            editing={editing}
            onEditingChange={onEditingChange}
            objectCount={objectCount}
            onPlaceObject={onPlaceObject}
          />
        )}

        {section === 'light' && (
          <HourSection style={style} onChange={onChange} />
        )}

        {section === 'colour' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {ROOM_TINTS.map((option) => (
              <button
                key={option.color}
                type="button"
                title={option.label}
                aria-label={`Paint the room ${option.label.toLowerCase()}`}
                aria-pressed={option.color === style.tint}
                onClick={() => onChange({ tint: option.color })}
                style={{ background: toCssHex(option.color) }}
                className={cn(
                  'size-7 rounded-full border-2 transition-transform outline-none',
                  'hover:scale-115 focus-visible:ring-2 focus-visible:ring-ring',
                  option.color === style.tint
                    ? 'scale-110 border-foreground'
                    : 'border-black/10',
                )}
              />
            ))}
          </div>
        )}

        {section === 'surfaces' && (
          <SurfacesSection style={style} onChange={onChange} />
        )}

        {section === 'window' && (
          <WindowSection style={style} onChange={onChange} />
        )}

        {section === 'walls' && !compact && (
          <WallsSection
            style={style}
            onWallDragStart={onWallDragStart}
            onTakeDown={takeDown}
          />
        )}

        {section === 'sound' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <SoundControls />
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Objects                                                                    */
/* -------------------------------------------------------------------------- */

function ObjectsSection({
  editing,
  onEditingChange,
  objectCount,
  onPlaceObject,
}: {
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  objectCount: number;
  onPlaceObject: (type: ObjectType) => void;
}) {
  const categories = Object.keys(OBJECTS_BY_CATEGORY) as ObjectCategory[];

  return (
    <div className="space-y-4">
      {/*
        Edit mode is a switch rather than a mode you fall into, because the two
        states want opposite things from a click: normally, clicking the lamp
        turns the light off, and while editing, dragging it out of the frame
        throws it away. A room where those are the same gesture is a room that
        eats your furniture.
      */}
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
          <span className="block text-xs text-muted-foreground">
            {editing
              ? 'Drag anything out of the frame to put it away.'
              : `${objectCount} ${objectCount === 1 ? 'thing' : 'things'} in the room.`}
          </span>
        </span>
      </button>

      {categories.map((category) => (
        <section key={category} className="space-y-1.5">
          <h4 className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
            {OBJECT_CATEGORY_LABELS[category]}
          </h4>

          {/*
            A catalog, not a selection: there is no "current object", so the
            tiles are buttons that add rather than radios that choose. Reusing
            `OptionGrid` would have meant one of them always looking chosen.
          */}
          <CatalogGrid
            types={OBJECTS_BY_CATEGORY[category]}
            onPlace={onPlaceObject}
          />
        </section>
      ))}
    </div>
  );
}

/** The picture grid for things you can add. Paged, like every other grid. */
function CatalogGrid({
  types,
  onPlace,
}: {
  types: readonly ObjectType[];
  onPlace: (type: ObjectType) => void;
}) {
  const options = useMemo<GridOption<ObjectType>[]>(
    () =>
      types.map((type) => ({
        value: type,
        label: OBJECT_LABELS[type],
        hint: `Put ${OBJECT_LABELS[type].toLowerCase()} in the room`,
        preview: () => renderObjectIcon(type),
      })),
    [types],
  );

  return (
    <OptionGrid
      options={options}
      // Nothing is ever "the selected object" — the value is deliberately a key
      // no option has, so every tile renders unselected.
      value={'' as ObjectType}
      onChange={(type) => {
        sfx.drop();
        onPlace(type);
      }}
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
        preview: () => renderFloorIcon(pattern, style.tint),
      })),
    [style.tint],
  );

  const walls = useMemo<GridOption<string>[]>(
    () =>
      WALL_TEXTURES.map((texture) => ({
        value: texture,
        label: WALL_TEXTURE_LABELS[texture],
        preview: () => renderWallIcon(texture, style.tint),
      })),
    [style.tint],
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

function WallsSection({
  style,
  onWallDragStart,
  onTakeDown,
}: {
  style: RoomStyle;
  onWallDragStart: (kind: WallDecorKind) => void;
  onTakeDown: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
          Drag onto the wall
        </p>

        {/*
          Pointer-down rather than click, because the piece has to start moving
          with the cursor immediately — the same gesture as picking a chair up
          off the floor. These are not `OptionGrid` tiles for that reason: a
          tile is something you press, and this is something you pick up.
        */}
        <div className="grid grid-cols-4 gap-2">
          {WALL_DECOR_LIST.map((spec) => (
            <DecorTile
              key={spec.kind}
              kind={spec.kind}
              label={spec.label}
              hint={spec.note}
              onPickUp={() => onWallDragStart(spec.kind)}
            />
          ))}
        </div>
      </div>

      {style.decor.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
            Hanging up
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {style.decor.map((placement) => {
              const spec = WALL_DECOR_LIST.find((item) => item.kind === placement.kind);
              return (
                <li key={placement.id}>
                  <button
                    type="button"
                    title="Take it down"
                    onClick={() => onTakeDown(placement.id)}
                    className={cn(
                      'press rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium',
                      'text-foreground outline-none',
                      'hover:border-destructive/50 hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                  >
                    {spec?.label ?? placement.kind} ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-[0.65rem] text-muted-foreground">
        Drag a piece onto the wall in the frame to hang it — you'll see it there as you
        move it. Drag an already-hung piece to move it, or take one down above.
      </p>
    </div>
  );
}

/** One draggable wall piece, previewed as itself. */
function DecorTile({
  kind,
  label,
  hint,
  onPickUp,
}: {
  kind: WallDecorKind;
  label: string;
  hint: string;
  onPickUp: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useMemo(() => {
    void renderDecorIcon(kind).then(setSrc);
  }, [kind]);

  return (
    <button
      type="button"
      title={hint}
      onPointerDown={() => {
        sfx.grab();
        onPickUp();
      }}
      className={cn(
        'group flex cursor-grab touch-none flex-col items-center gap-1 rounded-xl border border-border bg-card p-1.5',
        'outline-none select-none active:cursor-grabbing',
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
