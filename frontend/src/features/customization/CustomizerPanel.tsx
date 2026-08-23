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
import type {
  TailType,
  WingType,
} from '../../assets/pets/customization/AppendageTypes';
import {
  EAR_TYPES,
  EAR_TYPE_KEYS,
} from '../../assets/pets/customization/EarTypes';
import type { EarType } from '../../assets/pets/customization/EarTypes';
import {
  FOOT_TYPES,
  FOOT_TYPE_KEYS,
} from '../../assets/pets/customization/FootTypes';
import type { FootType } from '../../assets/pets/customization/FootTypes';
import { ARCHETYPES, randomAppearance } from '../../assets/pets/customization/Archetypes';
import {
  BODY_TYPES,
  BODY_TYPE_KEYS,
} from '../../assets/pets/customization/BodyTypes';
import type { BodyType } from '../../assets/pets/customization/BodyTypes';
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
import type {
  BrowType,
  CheekType,
  EyeType,
  MouthType,
  SnoutType,
  TeethType,
} from '../../assets/pets/customization/FaceTypes';
import { getRange } from '../../assets/pets/customization/PetConstraints';
import type { RangedField } from '../../assets/pets/customization/PetConstraints';
import { PATTERN_KEYS, PATTERN_LABELS } from '../../assets/pets/customization/Patterns';
import type { PatternType } from '../../assets/pets/customization/Patterns';
import {
  TOPPER_TYPES,
  TOPPER_TYPE_KEYS,
} from '../../assets/pets/customization/TopperTypes';
import type { TopperType } from '../../assets/pets/customization/TopperTypes';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { Button } from '../../components/ui/button';
import { ChipRow, Section, SliderRow, SwatchRow } from '../../components/ui/controls';
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

/** Turn a type library into chips, carrying each entry's own one-line hint. */
const options = <T extends string>(
  keys: readonly T[],
  table: Record<T, { label: string; hint?: string }>,
) => keys.map((key) => ({ value: key, label: table[key].label, hint: table[key].hint }));

const bodyOptions = options(BODY_TYPE_KEYS, BODY_TYPES);
const footOptions = options(FOOT_TYPE_KEYS, FOOT_TYPES);
const earOptions = options(EAR_TYPE_KEYS, EAR_TYPES);
const wingOptions = options(WING_TYPE_KEYS, WING_TYPES);
const tailOptions = options(TAIL_TYPE_KEYS, TAIL_TYPES);
const topperOptions = options(TOPPER_TYPE_KEYS, TOPPER_TYPES);
const eyeOptions = options(EYE_TYPE_KEYS, EYE_TYPES);
const browOptions = options(BROW_TYPE_KEYS, BROW_TYPES);
const mouthOptions = options(MOUTH_TYPE_KEYS, MOUTH_TYPES);
const teethOptions = options(TEETH_TYPE_KEYS, TEETH_TYPES);
const cheekOptions = options(CHEEK_TYPE_KEYS, CHEEK_TYPES);
const snoutOptions = options(SNOUT_TYPE_KEYS, SNOUT_TYPES);
const patternOptions = PATTERN_KEYS.map((key) => ({
  value: key,
  label: PATTERN_LABELS[key],
}));

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
    const next = { ...appearance.accessories };

    if (value === 'none') {
      delete next[slot];
    } else {
      // Keep the colour the wearer already chose for this slot when swapping
      // items — changing hat shape should not silently reset the colour.
      const current = next[slot];
      next[slot] = createAccessoryConfig(value, {
        color: current?.color,
        scale: current?.scale,
      });
    }

    onChange({ accessories: next });
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
          <ChipRow
            label="Shape"
            options={bodyOptions}
            value={appearance.bodyType}
            onChange={(value) => onChange({ bodyType: value as BodyType })}
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
            <ChipRow
              options={earOptions}
              value={appearance.earType}
              onChange={(value) => onChange({ earType: value as EarType })}
            />
            {dial('earScale', 'Size')}
            {dial('earSpread', 'Spacing', percent)}
            {dial('earTilt', 'Lean', degrees)}
          </Section>

          <Section
            title="Feet"
            description="Drawn into the bottom of the body, never hung off it."
          >
            <ChipRow
              options={footOptions}
              value={appearance.footType}
              onChange={(value) => onChange({ footType: value as FootType })}
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
            <ChipRow
              options={eyeOptions}
              value={appearance.eyeType}
              onChange={(value) => onChange({ eyeType: value as EyeType })}
            />
            {dial('eyeScale', 'Size')}
            {dial('eyeSpacing', 'Spacing', percent)}
            {dial('eyeHeight', 'Height on the face', (value) => (value > 0.6 ? 'low' : value < 0.35 ? 'high' : 'middle'))}
            {dial('pupilScale', 'Pupils', (value) => (value < 0.6 ? 'tiny' : value > 1.4 ? 'huge' : 'normal'))}
            {dial('eyeTilt', 'Tilt', (value) => value > 0.1 ? 'cross' : value < -0.1 ? 'sorry' : 'level')}
          </Section>

          <Section title="Brows">
            <ChipRow
              options={browOptions}
              value={appearance.browType}
              onChange={(value) => onChange({ browType: value as BrowType })}
            />
            {dial('browScale', 'Size')}
          </Section>

          <Section
            title="Mouth"
            description="A shape language, not a mood. The creature still expresses everything."
          >
            <ChipRow
              options={mouthOptions}
              value={appearance.mouthType}
              onChange={(value) => onChange({ mouthType: value as MouthType })}
            />
            {dial('mouthWidth', 'Width')}
            {dial('mouthWeight', 'Line weight')}
            <ChipRow
              label="Teeth"
              options={teethOptions}
              value={appearance.teethType}
              onChange={(value) => onChange({ teethType: value as TeethType })}
            />
            {appearance.teethType !== 'none' && dial('fangs', 'Tooth size', percent)}
          </Section>

          <Section title="Nose and cheeks">
            <ChipRow
              label="Snout"
              options={snoutOptions}
              value={appearance.snoutType}
              onChange={(value) => onChange({ snoutType: value as SnoutType })}
            />
            {dial('snoutScale', 'Snout size')}
            <ChipRow
              label="Cheeks"
              options={cheekOptions}
              value={appearance.cheekType}
              onChange={(value) => onChange({ cheekType: value as CheekType })}
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
          <ChipRow
            label="Markings"
            options={patternOptions}
            value={appearance.pattern}
            onChange={(value) => onChange({ pattern: value as PatternType })}
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
            <ChipRow
              options={wingOptions}
              value={appearance.wingType}
              onChange={(value) => onChange({ wingType: value as WingType })}
            />
            {dial('wingScale', 'Size')}
          </Section>

          <Section title="Tail">
            <ChipRow
              options={tailOptions}
              value={appearance.tailType}
              onChange={(value) => onChange({ tailType: value as TailType })}
            />
            {dial('tailScale', 'Size')}
          </Section>

          <Section title="Topper" description="The thing growing out of the top.">
            <ChipRow
              options={topperOptions}
              value={appearance.topperType}
              onChange={(value) => onChange({ topperType: value as TopperType })}
            />
            {dial('topperScale', 'Size')}
          </Section>

          {ACCESSORY_SLOTS.map((slot) => {
            const worn = appearance.accessories[slot];
            const slotOptions = [
              { value: 'none' as const, label: 'None' },
              ...accessoriesForSlot(slot).map((type) => ({
                value: type,
                label: ACCESSORY_TYPES[type].label,
              })),
            ];

            return (
              <Section key={slot} title={`${ACCESSORY_SLOT_LABELS[slot]} accessory`}>
                <ChipRow
                  options={slotOptions}
                  value={worn?.type ?? 'none'}
                  onChange={(value) =>
                    setAccessory(slot, value as AccessoryType | 'none')
                  }
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
