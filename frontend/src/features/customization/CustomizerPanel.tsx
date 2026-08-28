import { useState } from 'react';
import {
  ACCESSORY_SLOTS,
  ACCESSORY_SLOT_LABELS,
  ACCESSORY_TYPES,
  accessoriesForSlot,
  createAccessoryConfig,
} from '../../assets/pets/customization/AccessoryTypes';
import type {
  AccessorySlot,
  AccessoryType,
} from '../../assets/pets/customization/AccessoryTypes';
import {
  TAIL_TYPES,
  TAIL_TYPE_KEYS,
  WING_TYPES,
  WING_TYPE_KEYS,
} from '../../assets/pets/customization/AppendageTypes';
import {
  EAR_TYPES,
  EAR_TYPE_KEYS,
} from '../../assets/pets/customization/EarTypes';
import {
  FOOT_TYPES,
  FOOT_TYPE_KEYS,
} from '../../assets/pets/customization/FootTypes';
import { ARCHETYPES, randomAppearance } from '../../assets/pets/customization/Archetypes';
import {
  BODY_TYPES,
  BODY_TYPE_KEYS,
} from '../../assets/pets/customization/BodyTypes';
import {
  BROW_TYPES,
  BROW_TYPE_KEYS,
  CHEEK_TYPES,
  CHEEK_TYPE_KEYS,
  EYE_TYPES,
  EYE_TYPE_KEYS,
  MOUTH_TYPES,
  MOUTH_TYPE_KEYS,
  SNOUT_TYPES,
  SNOUT_TYPE_KEYS,
  TEETH_TYPES,
  TEETH_TYPE_KEYS,
} from '../../assets/pets/customization/FaceTypes';
import { getRange } from '../../assets/pets/customization/PetConstraints';
import type { RangedField } from '../../assets/pets/customization/PetConstraints';
import { PATTERN_KEYS, PATTERN_LABELS } from '../../assets/pets/customization/Patterns';
import type { PatternType } from '../../assets/pets/customization/Patterns';
import {
  TOPPER_TYPES,
  TOPPER_TYPE_KEYS,
} from '../../assets/pets/customization/TopperTypes';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { Button } from '../../components/ui/button';
import { Section, SliderRow, SwatchRow } from '../../components/ui/controls';
import { PartGrid } from './PartGrid';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs } from '../../components/ui/tabs';
import {
  ACCENT_COLORS,
  ACCESSORY_COLORS,
  COAT_COLORS,
  EYE_COLORS,
  SOFT_COLORS,
} from '../../lib/palettes';

/**
 * The creature editor.
 *
 * Every control writes straight into the appearance object the renderer runs
 * on, so there is no preview mode and no apply button: the creature in the
 * habitat *is* the preview, and it changes as you drag.
 *
 * Two rules shape this file.
 *
 * **Sliders read their range from the constraint table.** A slider whose range
 * is wider than the value it writes to is a control that silently does nothing,
 * which is worse than no control at all. `APPEARANCE_RANGES` is the one place
 * those numbers live (../../assets/pets/customization/PetConstraints).
 *
 * **Tabs, not one enormous column.** There are forty controls here. Grouped by
 * what part of the creature they build, each group is short enough to read; in
 * one list, none of them are.
 *
 * The dials at the top still matter more than everything below them. Most
 * people do not want to choose an ear type — they want a creature, and then
 * they want to push it toward adorable or toward alarming.
 */

interface CustomizerPanelProps {
  appearance: PetAppearance;
  onChange: (patch: Partial<PetAppearance>) => void;
  petName: string;
  onPetNameChange: (name: string) => void;
}

type EditorTab = 'body' | 'ears' | 'face' | 'look' | 'extras';

const TABS = [
  { value: 'body', label: 'Body' },
  { value: 'ears', label: 'Ears' },
  { value: 'face', label: 'Face' },
  { value: 'look', label: 'Colour' },
  { value: 'extras', label: 'Extras' },
] as const satisfies readonly { value: EditorTab; label: string }[];

/**
 * Every part category, as pictures rather than as words.
 *
 * `PartGrid` takes the type library, what choosing an option does, and which
 * part of the resulting creature is worth looking at. Nothing here needs a
 * label list any more — the libraries already carry one, and the picture is
 * doing the work the label used to.
 */
const patternTable = Object.fromEntries(
  PATTERN_KEYS.map((key) => [key, { label: PATTERN_LABELS[key] }]),
) as Record<PatternType, { label: string }>;

/**
 * What wearing (or removing) an accessory does to an appearance.
 *
 * Shared by the preview and the actual change, which is the point: a tile that
 * previewed one thing and applied another would be a lie the user only finds
 * out about after clicking. The colour and size the wearer already chose for
 * the slot are kept when swapping items — changing hat *shape* should not
 * silently reset the hat's colour.
 */
function accessoryPatch(
  appearance: PetAppearance,
  slot: AccessorySlot,
  value: AccessoryType | 'none',
): Partial<PetAppearance> {
  const next = { ...appearance.accessories };

  if (value === 'none') {
    delete next[slot];
    return { accessories: next };
  }

  const current = next[slot];
  next[slot] = createAccessoryConfig(value, {
    color: current?.color,
    scale: current?.scale,
  });

  return { accessories: next };
}

/**
 * What the *tile* for an accessory option shows.
 *
 * Deliberately not `accessoryPatch`. That one carries the wearer's current
 * colour and size into the result, which is right for applying a choice and
 * wrong for drawing a catalogue: it makes the picture a function of live state,
 * so every nudge of the size dial gives all three accessory grids a new cache
 * key and rebuilds a full creature rig per tile. Measured at 15 rig rebuilds
 * per slider step.
 *
 * A tile answers "what is this item", so it draws the item at its own defaults
 * on the bare preview creature, and the answer is the same every time.
 */
function accessoryPreviewPatch(
  slot: AccessorySlot,
  value: AccessoryType | 'none',
): Partial<PetAppearance> {
  if (value === 'none') return { accessories: {} };
  return { accessories: { [slot]: createAccessoryConfig(value) } };
}

/**
 * The option list and label table for each slot, built once.
 *
 * Module level because `PartGrid` memoises its options on `keys` and `table` by
 * reference. Built inline inside the `ACCESSORY_SLOTS.map` below they were new
 * objects on every render, the memo never held, and every tile re-requested its
 * preview on every keystroke — the other half of the same bug
 * `accessoryPreviewPatch` fixes.
 *
 * "None" is an option like any other, so it gets a tile like any other — a
 * picture of the creature without one. A bare list that silently omits the way
 * back is a customizer you can put a hat on and not take it off.
 */
type SlotTable = Record<AccessoryType | 'none', { label: string; hint?: string }>;

const SLOT_KEYS = Object.fromEntries(
  ACCESSORY_SLOTS.map((slot) => [slot, ['none' as const, ...accessoriesForSlot(slot)]]),
) as Record<AccessorySlot, (AccessoryType | 'none')[]>;

const SLOT_TABLES = Object.fromEntries(
  ACCESSORY_SLOTS.map((slot) => [
    slot,
    {
      none: { label: 'None' },
      ...Object.fromEntries(
        accessoriesForSlot(slot).map((type) => [type, ACCESSORY_TYPES[type]]),
      ),
    } as SlotTable,
  ]),
) as Record<AccessorySlot, SlotTable>;

const percent = (value: number) => `${Math.round(value * 100)}%`;
const degrees = (value: number) => `${Math.round(value * 57)}°`;

export function CustomizerPanel({
  appearance,
  onChange,
  petName,
  onPetNameChange,
}: CustomizerPanelProps) {
  const [cuteness, setCuteness] = useState(0.35);
  const [chaos, setChaos] = useState(0.45);
  const [tab, setTab] = useState<EditorTab>('body');

  /** Bind a slider to one appearance field. `Dial` itself lives below. */
  const dial = (
    field: DialField,
    label: string,
    format?: (value: number) => string,
  ) => (
    <Dial
      field={field}
      label={label}
      format={format}
      appearance={appearance}
      onChange={onChange}
    />
  );

  const setAccessory = (slot: AccessorySlot, value: AccessoryType | 'none') => {
    onChange(accessoryPatch(appearance, slot, value));
  };

  const patchAccessory = (
    slot: AccessorySlot,
    patch: { color?: number; scale?: number },
  ) => {
    const current = appearance.accessories[slot];
    if (!current) return;

    onChange({
      accessories: { ...appearance.accessories, [slot]: { ...current, ...patch } },
    });
  };

  return (
    <div className="space-y-4">
      <Section
        title="Roll a creature"
        description="Two dials and a button. Everything below is for when you want something specific."
      >
        <SliderRow
          label="Cuteness"
          min={-1}
          max={1}
          step={0.05}
          value={cuteness}
          format={(value) =>
            value > 0.4 ? 'adorable' : value < -0.4 ? 'alarming' : 'in between'
          }
          onChange={setCuteness}
        />
        <SliderRow
          label="Chaos"
          min={0}
          max={1}
          step={0.05}
          value={chaos}
          format={(value) =>
            value > 0.7 ? 'unhinged' : value < 0.3 ? 'sensible' : 'lively'
          }
          onChange={setChaos}
        />

        <Button
          type="button"
          className="w-full"
          onClick={() => onChange(randomAppearance({ cuteness, chaos }))}
        >
          Roll a new creature
        </Button>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {ARCHETYPES.map((archetype) => (
            <button
              key={archetype.key}
              type="button"
              title={archetype.hint}
              onClick={() => onChange(archetype.appearance)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {archetype.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Identity">
        <div className="space-y-1.5">
          <Label htmlFor="pet-name">Name</Label>
          <Input
            id="pet-name"
            value={petName}
            maxLength={32}
            onChange={(event) => onPetNameChange(event.target.value)}
          />
        </div>
        {/* Not an expression — the mood every expression is blended out of. */}
        {dial('restingMood', 'Resting mood', (value) => value > 0.3 ? 'sunny' : value < -0.3 ? 'unimpressed' : 'even')}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => onChange({ seed: Math.floor(Math.random() * 1_000_000) })}
        >
          Reroll quirks
        </Button>
      </Section>

      <Tabs items={TABS} value={tab} onValueChange={setTab} />

      {tab === 'body' && (
        <Section
          title="The mass"
          description="One soft silhouette. Everything else grows out of it."
        >
          <PartGrid
            label="Shape"
            keys={BODY_TYPE_KEYS}
            table={BODY_TYPES}
            patch={(bodyType) => ({ bodyType })}
            focus="whole"
            value={appearance.bodyType}
            onChange={(bodyType) => onChange({ bodyType })}
          />
          {dial('bodyScale', 'Size')}
          {dial('bodyWidth', 'Width')}
          {dial('bodyHeight', 'Height')}
          {dial('asymmetry', 'Wonk', (value) => value < 0.1 ? 'machined' : value > 0.7 ? 'hand-drawn' : 'a little off')}
        </Section>
      )}

      {tab === 'ears' && (
        <>
          <Section title="Ears" description="Or horns, or antennae, or fins.">
            <PartGrid
              keys={EAR_TYPE_KEYS}
              table={EAR_TYPES}
              patch={(earType) => ({ earType })}
              focus="ears"
              value={appearance.earType}
              onChange={(earType) => onChange({ earType })}
            />
            {dial('earScale', 'Size')}
            {dial('earSpread', 'Spacing', percent)}
            {dial('earTilt', 'Lean', degrees)}
          </Section>

          <Section
            title="Feet"
            description="Drawn into the bottom of the body, never hung off it."
          >
            <PartGrid
              keys={FOOT_TYPE_KEYS}
              table={FOOT_TYPES}
              patch={(footType) => ({ footType })}
              focus="feet"
              value={appearance.footType}
              onChange={(footType) => onChange({ footType })}
            />
            {dial('footScale', 'Size')}
          </Section>
        </>
      )}

      {tab === 'face' && (
        <>
          <Section
            title="Eyes"
            description="The biggest single decision about who this creature is."
          >
            <PartGrid
              keys={EYE_TYPE_KEYS}
              table={EYE_TYPES}
              patch={(eyeType) => ({ eyeType })}
              focus="face"
              value={appearance.eyeType}
              onChange={(eyeType) => onChange({ eyeType })}
            />
            {dial('eyeScale', 'Size')}
            {dial('eyeSpacing', 'Spacing', percent)}
            {dial('eyeHeight', 'Height on the face', (value) => (value > 0.6 ? 'low' : value < 0.35 ? 'high' : 'middle'))}
            {dial('pupilScale', 'Pupils', (value) => (value < 0.6 ? 'tiny' : value > 1.4 ? 'huge' : 'normal'))}
            {dial('eyeTilt', 'Tilt', (value) => value > 0.1 ? 'cross' : value < -0.1 ? 'sorry' : 'level')}
          </Section>

          <Section title="Brows">
            <PartGrid
              keys={BROW_TYPE_KEYS}
              table={BROW_TYPES}
              patch={(browType) => ({ browType })}
              focus="face"
              value={appearance.browType}
              onChange={(browType) => onChange({ browType })}
            />
            {dial('browScale', 'Size')}
          </Section>

          <Section
            title="Mouth"
            description="A shape language, not a mood. The creature still expresses everything."
          >
            <PartGrid
              keys={MOUTH_TYPE_KEYS}
              table={MOUTH_TYPES}
              patch={(mouthType) => ({ mouthType })}
              focus="face"
              value={appearance.mouthType}
              onChange={(mouthType) => onChange({ mouthType })}
            />
            {dial('mouthWidth', 'Width')}
            {dial('mouthWeight', 'Line weight')}
            <PartGrid
              label="Teeth"
              keys={TEETH_TYPE_KEYS}
              table={TEETH_TYPES}
              patch={(teethType) => ({ teethType })}
              focus="face"
              value={appearance.teethType}
              onChange={(teethType) => onChange({ teethType })}
            />
            {appearance.teethType !== 'none' && dial('fangs', 'Tooth size', percent)}
          </Section>

          <Section title="Nose and cheeks">
            <PartGrid
              label="Snout"
              keys={SNOUT_TYPE_KEYS}
              table={SNOUT_TYPES}
              patch={(snoutType) => ({ snoutType })}
              focus="face"
              value={appearance.snoutType}
              onChange={(snoutType) => onChange({ snoutType })}
            />
            {dial('snoutScale', 'Snout size')}
            <PartGrid
              label="Cheeks"
              keys={CHEEK_TYPE_KEYS}
              table={CHEEK_TYPES}
              patch={(cheekType) => ({ cheekType })}
              focus="face"
              value={appearance.cheekType}
              onChange={(cheekType) => onChange({ cheekType })}
            />
            {appearance.cheekType !== 'none' && dial('blush', 'Blush', percent)}
          </Section>
        </>
      )}

      {tab === 'look' && (
        <Section title="Colours">
          <SwatchRow
            label="Coat"
            colors={COAT_COLORS}
            value={appearance.primaryColor}
            onChange={(primaryColor) => onChange({ primaryColor })}
          />
          <SwatchRow
            label="Belly"
            colors={SOFT_COLORS}
            value={appearance.secondaryColor}
            onChange={(secondaryColor) => onChange({ secondaryColor })}
          />
          <SwatchRow
            label="Cheeks"
            colors={ACCENT_COLORS}
            value={appearance.accentColor}
            onChange={(accentColor) => onChange({ accentColor })}
          />
          <SwatchRow
            label="Eyes"
            colors={EYE_COLORS}
            value={appearance.eyeColor}
            onChange={(eyeColor) => onChange({ eyeColor })}
          />
          <PartGrid
            label="Markings"
            keys={PATTERN_KEYS}
            table={patternTable}
            patch={(pattern) => ({ pattern })}
            focus="whole"
            value={appearance.pattern}
            onChange={(pattern) => onChange({ pattern })}
          />
          {appearance.pattern !== 'none' && (
            <SwatchRow
              label="Marking colour"
              colors={COAT_COLORS}
              value={appearance.patternColor}
              onChange={(patternColor) => onChange({ patternColor })}
            />
          )}
        </Section>
      )}

      {tab === 'extras' && (
        <>
          <Section title="Wings">
            <PartGrid
              keys={WING_TYPE_KEYS}
              table={WING_TYPES}
              patch={(wingType) => ({ wingType })}
              focus="wings"
              value={appearance.wingType}
              onChange={(wingType) => onChange({ wingType })}
            />
            {dial('wingScale', 'Size')}
          </Section>

          <Section title="Tail">
            <PartGrid
              keys={TAIL_TYPE_KEYS}
              table={TAIL_TYPES}
              patch={(tailType) => ({ tailType })}
              focus="tail"
              value={appearance.tailType}
              onChange={(tailType) => onChange({ tailType })}
            />
            {dial('tailScale', 'Size')}
          </Section>

          <Section title="Topper" description="The thing growing out of the top.">
            <PartGrid
              keys={TOPPER_TYPE_KEYS}
              table={TOPPER_TYPES}
              patch={(topperType) => ({ topperType })}
              focus="topper"
              value={appearance.topperType}
              onChange={(topperType) => onChange({ topperType })}
            />
            {dial('topperScale', 'Size')}
          </Section>

          {ACCESSORY_SLOTS.map((slot) => {
            const worn = appearance.accessories[slot];

            return (
              <Section key={slot} title={`${ACCESSORY_SLOT_LABELS[slot]} accessory`}>
                <PartGrid
                  keys={SLOT_KEYS[slot]}
                  table={SLOT_TABLES[slot]}
                  patch={(value) => accessoryPreviewPatch(slot, value)}
                  focus={slot === 'neck' ? 'whole' : 'head'}
                  value={worn?.type ?? 'none'}
                  onChange={(value) => setAccessory(slot, value)}
                />
                {worn && (
                  <>
                    <SwatchRow
                      label="Color"
                      colors={ACCESSORY_COLORS}
                      value={worn.color}
                      onChange={(color) => patchAccessory(slot, { color })}
                    />
                    <SliderRow
                      label="Size"
                      min={getRange('accessoryScale').min}
                      max={getRange('accessoryScale').max}
                      value={worn.scale}
                      onChange={(scale) => patchAccessory(slot, { scale })}
                    />
                  </>
                )}
              </Section>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Every numeric appearance field a slider may write to. */
type DialField = RangedField & keyof PetAppearance;

interface DialProps {
  field: DialField;
  label: string;
  format?: (value: number) => string;
  appearance: PetAppearance;
  onChange: (patch: Partial<PetAppearance>) => void;
}

/**
 * A slider bound to one appearance field, with the range the clamp uses.
 *
 * Everything numeric goes through here, so a control can never offer a value
 * the creature will refuse.
 */
function Dial({ field, label, format, appearance, onChange }: DialProps) {
  const range = getRange(field);

  return (
    <SliderRow
      label={label}
      min={range.min}
      max={range.max}
      step={range.step ?? 0.05}
      format={format}
      value={appearance[field] as number}
      onChange={(value) => onChange({ [field]: value } as Partial<PetAppearance>)}
    />
  );
}
