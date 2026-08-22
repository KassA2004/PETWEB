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
  EAR_TYPES,
  EAR_TYPE_KEYS,
  TAIL_TYPES,
  TAIL_TYPE_KEYS,
  WING_TYPES,
  WING_TYPE_KEYS,
} from '../../assets/pets/customization/AppendageTypes';
import type {
  EarType,
  TailType,
  WingType,
} from '../../assets/pets/customization/AppendageTypes';
import { ARCHETYPES, randomAppearance } from '../../assets/pets/customization/Archetypes';
import {
  BODY_TYPES,
  BODY_TYPE_KEYS,
  FOOT_TYPES,
  FOOT_TYPE_KEYS,
} from '../../assets/pets/customization/BodyTypes';
import type { BodyType, FootType } from '../../assets/pets/customization/BodyTypes';
import {
  BROW_TYPES,
  BROW_TYPE_KEYS,
  EYE_TYPES,
  EYE_TYPE_KEYS,
  SNOUT_TYPES,
  SNOUT_TYPE_KEYS,
} from '../../assets/pets/customization/FaceTypes';
import type {
  BrowType,
  EyeType,
  SnoutType,
} from '../../assets/pets/customization/FaceTypes';
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
 * The dials at the top matter more than the thirty below them. Most people do
 * not want to choose an ear type — they want a creature, and then they want to
 * push it toward adorable or toward alarming. That is what Cuteness and Chaos
 * are for; the rest is there for when someone has something specific in mind.
 */

interface CustomizerPanelProps {
  appearance: PetAppearance;
  onChange: (patch: Partial<PetAppearance>) => void;
  petName: string;
  onPetNameChange: (name: string) => void;
}

const options = <T extends string>(
  keys: readonly T[],
  table: Record<T, { label: string }>,
) => keys.map((key) => ({ value: key, label: table[key].label }));

const bodyOptions = options(BODY_TYPE_KEYS, BODY_TYPES);
const footOptions = options(FOOT_TYPE_KEYS, FOOT_TYPES);
const earOptions = options(EAR_TYPE_KEYS, EAR_TYPES);
const wingOptions = options(WING_TYPE_KEYS, WING_TYPES);
const tailOptions = options(TAIL_TYPE_KEYS, TAIL_TYPES);
const topperOptions = options(TOPPER_TYPE_KEYS, TOPPER_TYPES);
const eyeOptions = options(EYE_TYPE_KEYS, EYE_TYPES);
const browOptions = options(BROW_TYPE_KEYS, BROW_TYPES);
const snoutOptions = options(SNOUT_TYPE_KEYS, SNOUT_TYPES);
const patternOptions = PATTERN_KEYS.map((key) => ({
  value: key,
  label: PATTERN_LABELS[key],
}));

export function CustomizerPanel({
  appearance,
  onChange,
  petName,
  onPetNameChange,
}: CustomizerPanelProps) {
  const [cuteness, setCuteness] = useState(0.35);
  const [chaos, setChaos] = useState(0.45);

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
        <SliderRow
          label="Resting mood"
          min={-1}
          max={1}
          step={0.05}
          value={appearance.restingMood}
          format={(value) =>
            value > 0.3 ? 'sunny' : value < -0.3 ? 'unimpressed' : 'even'
          }
          onChange={(restingMood) => onChange({ restingMood })}
        />
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

      <Section title="Body" description="One soft mass. Everything else hangs off it.">
        <ChipRow
          label="Shape"
          options={bodyOptions}
          value={appearance.bodyType}
          onChange={(value) => onChange({ bodyType: value as BodyType })}
        />
        <SliderRow
          label="Size"
          min={0.45}
          max={1.9}
          value={appearance.bodyScale}
          onChange={(bodyScale) => onChange({ bodyScale })}
        />
        <SliderRow
          label="Width"
          min={0.55}
          max={1.8}
          value={appearance.bodyWidth}
          onChange={(bodyWidth) => onChange({ bodyWidth })}
        />
        <SliderRow
          label="Height"
          min={0.55}
          max={1.8}
          value={appearance.bodyHeight}
          onChange={(bodyHeight) => onChange({ bodyHeight })}
        />
        <ChipRow
          label="Feet"
          options={footOptions}
          value={appearance.footType}
          onChange={(value) => onChange({ footType: value as FootType })}
        />
        <SliderRow
          label="Foot size"
          min={0}
          max={2.4}
          value={appearance.footScale}
          onChange={(footScale) => onChange({ footScale })}
        />
      </Section>

      <Section title="Ears" description="Or horns, or antennae, or fins.">
        <ChipRow
          options={earOptions}
          value={appearance.earType}
          onChange={(value) => onChange({ earType: value as EarType })}
        />
        <SliderRow
          label="Size"
          min={0}
          max={2.6}
          value={appearance.earScale}
          onChange={(earScale) => onChange({ earScale })}
        />
        <SliderRow
          label="Spacing"
          min={0.08}
          max={0.6}
          step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          value={appearance.earSpread}
          onChange={(earSpread) => onChange({ earSpread })}
        />
        <SliderRow
          label="Lean"
          min={-0.9}
          max={1.4}
          step={0.02}
          format={(value) => `${Math.round(value * 57)}°`}
          value={appearance.earTilt}
          onChange={(earTilt) => onChange({ earTilt })}
        />
      </Section>

      <Section title="Wings">
        <ChipRow
          options={wingOptions}
          value={appearance.wingType}
          onChange={(value) => onChange({ wingType: value as WingType })}
        />
        <SliderRow
          label="Size"
          min={0}
          max={2.4}
          value={appearance.wingScale}
          onChange={(wingScale) => onChange({ wingScale })}
        />
      </Section>

      <Section title="Tail">
        <ChipRow
          options={tailOptions}
          value={appearance.tailType}
          onChange={(value) => onChange({ tailType: value as TailType })}
        />
        <SliderRow
          label="Size"
          min={0}
          max={2.6}
          value={appearance.tailScale}
          onChange={(tailScale) => onChange({ tailScale })}
        />
      </Section>

      <Section title="Topper" description="The thing growing out of the top.">
        <ChipRow
          options={topperOptions}
          value={appearance.topperType}
          onChange={(value) => onChange({ topperType: value as TopperType })}
        />
        <SliderRow
          label="Size"
          min={0}
          max={2.6}
          value={appearance.topperScale}
          onChange={(topperScale) => onChange({ topperScale })}
        />
      </Section>

      <Section
        title="Face"
        description="The mouth is drawn from how it feels, so there is nothing to pick."
      >
        <ChipRow
          label="Eyes"
          options={eyeOptions}
          value={appearance.eyeType}
          onChange={(value) => onChange({ eyeType: value as EyeType })}
        />
        <SliderRow
          label="Eye size"
          min={0.25}
          max={2.4}
          value={appearance.eyeScale}
          onChange={(eyeScale) => onChange({ eyeScale })}
        />
        <SliderRow
          label="Eye spacing"
          min={0.06}
          max={0.4}
          step={0.005}
          format={(value) => `${Math.round(value * 100)}%`}
          value={appearance.eyeSpacing}
          onChange={(eyeSpacing) => onChange({ eyeSpacing })}
        />
        <SliderRow
          label="Eye height"
          min={0}
          max={1}
          step={0.02}
          format={(value) => (value > 0.6 ? 'low' : value < 0.35 ? 'high' : 'middle')}
          value={appearance.eyeHeight}
          onChange={(eyeHeight) => onChange({ eyeHeight })}
        />
        <ChipRow
          label="Brows"
          options={browOptions}
          value={appearance.browType}
          onChange={(value) => onChange({ browType: value as BrowType })}
        />
        <SliderRow
          label="Brow size"
          min={0.3}
          max={2}
          value={appearance.browScale}
          onChange={(browScale) => onChange({ browScale })}
        />
        <ChipRow
          label="Snout"
          options={snoutOptions}
          value={appearance.snoutType}
          onChange={(value) => onChange({ snoutType: value as SnoutType })}
        />
        <SliderRow
          label="Snout size"
          min={0.3}
          max={2.2}
          value={appearance.snoutScale}
          onChange={(snoutScale) => onChange({ snoutScale })}
        />
        <SliderRow
          label="Mouth width"
          min={0.4}
          max={2}
          value={appearance.mouthWidth}
          onChange={(mouthWidth) => onChange({ mouthWidth })}
        />
        <SliderRow
          label="Mouth weight"
          min={0.5}
          max={2.2}
          value={appearance.mouthWeight}
          onChange={(mouthWeight) => onChange({ mouthWeight })}
        />
        <SliderRow
          label="Teeth"
          min={0}
          max={1}
          step={0.05}
          format={(value) => (value < 0.05 ? 'none' : `${Math.round(value * 100)}%`)}
          value={appearance.fangs}
          onChange={(fangs) => onChange({ fangs })}
        />
      </Section>

      <Section title="Colors">
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
        <SliderRow
          label="Blush"
          min={0}
          max={1}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          value={appearance.blush}
          onChange={(blush) => onChange({ blush })}
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
              onChange={(value) => setAccessory(slot, value as AccessoryType | 'none')}
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
                  min={0.35}
                  max={2.5}
                  value={worn.scale}
                  onChange={(scale) => patchAccessory(slot, { scale })}
                />
              </>
            )}
          </Section>
        );
      })}
    </div>
  );
}
