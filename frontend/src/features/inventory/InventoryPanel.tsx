import { ACCESSORY_SLOT_LABELS } from '../../assets/pets/customization/AccessoryTypes';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { cn, toCssHex } from '../../lib/utils';
import { INVENTORY_GROUPS, groupOf } from '../../lib/mock/world';
import type { InventoryItem } from '../../lib/mock/world';

/**
 * Inventory — everything the creature owns, grouped by what it is.
 *
 * Every item does something. Objects go into the room and can then be dragged
 * and thrown around; wearables go onto the creature; dyes repaint it. An item
 * you cannot use is just a row in a table, so there are none of those here.
 *
 * Mock: the list lives in memory and resets on reload.
 */

interface InventoryPanelProps {
  items: InventoryItem[];
  appearance: PetAppearance;
  /** Ids of objects currently sitting in the room. */
  placedIds: string[];
  onWear: (item: InventoryItem) => void;
  onTakeOff: (item: InventoryItem) => void;
  onApplyDye: (item: InventoryItem) => void;
  onPlace: (item: InventoryItem) => void;
  onRecall: (item: InventoryItem) => void;
}

export function InventoryPanel({
  items,
  appearance,
  placedIds,
  onWear,
  onTakeOff,
  onApplyDye,
  onPlace,
  onRecall,
}: InventoryPanelProps) {
  const isWorn = (item: InventoryItem) =>
    item.kind === 'wearable' &&
    item.slot !== undefined &&
    appearance.accessories[item.slot]?.type === item.type;

  const isApplied = (item: InventoryItem) => {
    if (item.kind !== 'dye') return false;
    if (item.role === 'secondary') return appearance.secondaryColor === item.color;
    if (item.role === 'accent') return appearance.accentColor === item.color;
    return appearance.primaryColor === item.color;
  };

  const isPlaced = (item: InventoryItem) => placedIds.includes(item.id);

  const actionFor = (item: InventoryItem) => {
    if (item.kind === 'object') {
      return isPlaced(item)
        ? { label: 'Take back', active: true, onClick: () => onRecall(item) }
        : { label: 'Put in room', active: false, onClick: () => onPlace(item) };
    }

    if (item.kind === 'dye') {
      return {
        label: isApplied(item) ? 'Applied' : 'Apply',
        active: isApplied(item),
        onClick: () => onApplyDye(item),
      };
    }

    return isWorn(item)
      ? { label: 'Take off', active: true, onClick: () => onTakeOff(item) }
      : { label: 'Wear', active: false, onClick: () => onWear(item) };
  };

  const subtitleFor = (item: InventoryItem) => {
    if (item.kind === 'wearable' && item.slot) return ACCESSORY_SLOT_LABELS[item.slot];
    if (item.kind === 'dye') return 'Dye';
    return isPlaced(item) ? 'In the room' : 'Packed away';
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {items.length} things. Objects you put in the room can be picked up,
        dragged and thrown.
      </p>

      {INVENTORY_GROUPS.map((group) => {
        const groupItems = items.filter((item) => groupOf(item) === group.key);
        if (groupItems.length === 0) return null;

        return (
          <section key={group.key} className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label} · {groupItems.length}
            </h3>

            <ul className="grid grid-cols-2 gap-2">
              {groupItems.map((item) => {
                const action = actionFor(item);

                return (
                  <li
                    key={item.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-xl border p-3 transition-colors',
                      action.active
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-0.5 size-6 shrink-0 rounded-lg border border-black/10"
                        style={{ background: toCssHex(item.color) }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.label}</p>
                        <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                          {subtitleFor(item)}
                        </p>
                      </div>
                    </div>

                    {item.earnedFrom && (
                      <p className="truncate text-[0.65rem] text-muted-foreground">
                        from “{item.earnedFrom}”
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={action.onClick}
                      disabled={item.kind === 'dye' && action.active}
                      className={cn(
                        'mt-auto rounded-lg px-2 py-1.5 text-xs font-medium transition-colors outline-none',
                        'focus-visible:ring-2 focus-visible:ring-ring',
                        action.active
                          ? 'bg-muted text-muted-foreground hover:bg-muted/70'
                          : 'bg-primary text-primary-foreground hover:opacity-90',
                      )}
                    >
                      {action.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
