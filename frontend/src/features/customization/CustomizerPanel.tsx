import { useState } from 'react';
import {
  ACCESSORY_SLOTS,
  ACCESSORY_SLOT_LABELS,
  createAccessoryConfig,
} from '../../assets/pets/customization/AccessoryTypes';
import type {
  AccessorySlot,
  AccessoryType,
} from '../../assets/pets/customization/AccessoryTypes';
import { ARCHETYPES, randomAppearance } from '../../assets/pets/customization/Archetypes';
import { getRange } from '../../assets/pets/customization/PetConstraints';
import type { RangedField } from '../../assets/pets/customization/PetConstraints';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { Button } from '../../components/ui/button';
import { Section, SliderRow, SwatchRow } from '../../components/ui/controls';
import { ACCESSORY_PARTS, PARTS } from './catalogue';
import type { EditorTab } from './catalogue';
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

export interface CustomizerPanelProps {
  appearance: PetAppearance;
  onChange: (patch: Partial<PetAppearance>) => void;
  petName: string;
  onPetNameChange: (name: string) => void;
}

const TABS = [
  { value: 'body', label: 'Body' },
  { value: 'ears', label: 'Ears' },
  { value: 'face', label: 'Face' },
  { value: 'look', label: 'Colour' },
  { value: 'extras', label: 'Extras' },
] as const satisfies readonly { value: EditorTab; label: string }[];

/**
 * What wearing (or removing) an accessory does to an appearance.
 *
 * Not the same thing as what the *tile* shows — see `accessoryPreviewPatch` in
 * `catalogue.ts`, and the reason it is separate. The colour and size the wearer
 * already chose for the slot are kept when swapping items: changing hat *shape*
 * should not silently reset the hat's colour.
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
            {...PARTS.body}
            label="Shape"
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
              {...PARTS.ear}
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
              {...PARTS.foot}
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
              {...PARTS.eye}
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
              {...PARTS.brow}
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
              {...PARTS.mouth}
              value={appearance.mouthType}
              onChange={(mouthType) => onChange({ mouthType })}
            />
            {dial('mouthWidth', 'Width')}
            {dial('mouthWeight', 'Line weight')}
            <PartGrid
              {...PARTS.teeth}
              label="Teeth"
              value={appearance.teethType}
              onChange={(teethType) => onChange({ teethType })}
            />
            {appearance.teethType !== 'none' && dial('fangs', 'Tooth size', percent)}
          </Section>

          <Section title="Nose and cheeks">
            <PartGrid
              {...PARTS.snout}
              label="Snout"
              value={appearance.snoutType}
              onChange={(snoutType) => onChange({ snoutType })}
            />
            {dial('snoutScale', 'Snout size')}
            <PartGrid
              {...PARTS.cheek}
              label="Cheeks"
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
            {...PARTS.pattern}
            label="Markings"
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
              {...PARTS.wing}
              value={appearance.wingType}
              onChange={(wingType) => onChange({ wingType })}
            />
            {dial('wingScale', 'Size')}
          </Section>

          <Section title="Tail">
            <PartGrid
              {...PARTS.tail}
              value={appearance.tailType}
              onChange={(tailType) => onChange({ tailType })}
            />
            {dial('tailScale', 'Size')}
          </Section>

          <Section title="Topper" description="The thing growing out of the top.">
            <PartGrid
              {...PARTS.topper}
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
                  {...ACCESSORY_PARTS[slot]}
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
