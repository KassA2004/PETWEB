import { useEffect, useMemo, useState } from 'react';
import { createAccessoryConfig } from '../../assets/pets/customization/AccessoryTypes';
import { Tabs } from '../../components/ui/tabs';
import type { TabItem } from '../../components/ui/tabs';
import { UserBadge } from '../auth/UserBadge';
import { CustomizerPanel } from '../customization/CustomizerPanel';
import { GoalsPanel } from '../goals/GoalsPanel';
import { PetHabitat } from '../habitat/PetHabitat';
import type { Placement } from '../habitat/PetHabitat';
import { InventoryPanel } from '../inventory/InventoryPanel';
import { PetLibraryPanel } from '../pets/PetLibraryPanel';
import { usePetLibrary } from '../pets/usePetLibrary';
import {
  SEED_GOALS,
  SEED_INVENTORY,
  nextId,
  nextReward,
} from '../../lib/mock/world';
import type { Goal, InventoryItem } from '../../lib/mock/world';

/**
 * The application shell.
 *
 * The world sits on the left as one framed object and the tools sit on the
 * right, because the creature is something that lives in the page rather than
 * something the page is. Everything shares one appearance object: the
 * customizer writes it, the inventory writes it, and the habitat renders it.
 *
 * That object now belongs to `usePetLibrary`, which loads the creature the user
 * last had selected and can save it back. Goals and inventory are still local
 * and in-memory — those endpoints do not exist yet, and this is deliberately
 * the mock that proves what they need to return.
 */

type TabValue = 'goals' | 'inventory' | 'style';

/** Objects that start out already in the room, so it is not bare on day one. */
const INITIAL_PLACEMENTS: Placement[] = [];

export function Dashboard() {
  // The creature, its saved presets, and which one is selected. Survives a
  // reload and a fresh sign-in, which local state never did.
  const library = usePetLibrary();
  const {
    appearance,
    name: petName,
    updateAppearance,
    setName: setPetName,
  } = library;

  const [goals, setGoals] = useState<Goal[]>(SEED_GOALS);
  const [inventory, setInventory] = useState<InventoryItem[]>(SEED_INVENTORY);
  const [placements, setPlacements] = useState<Placement[]>(INITIAL_PLACEMENTS);
  const [tab, setTab] = useState<TabValue>('goals');
  const [celebrate, setCelebrate] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // --- Goals ---------------------------------------------------------------
  const addGoal = (title: string) => {
    setGoals((current) => [{ id: nextId('goal'), title, done: false }, ...current]);
  };

  const removeGoal = (id: string) => {
    setGoals((current) => current.filter((goal) => goal.id !== id));
  };

  const completeGoal = (id: string) => {
    const goal = goals.find((item) => item.id === id);
    if (!goal || goal.done) return;

    const reward = nextReward(inventory);

    if (reward) {
      const item: InventoryItem = {
        ...reward,
        id: nextId('item'),
        earnedFrom: goal.title,
      };
      setInventory((current) => [item, ...current]);
      setToast(`${petName} found a ${reward.label}!`);
    } else {
      setToast(`${petName} is proud of you.`);
    }

    setGoals((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, done: true, rewardLabel: reward?.label }
          : item,
      ),
    );

    // The creature reacting is the actual reward; the item is the souvenir.
    setCelebrate((count) => count + 1);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // --- Inventory -----------------------------------------------------------
  const wearItem = (item: InventoryItem) => {
    if (!item.slot || !item.type) return;
    updateAppearance({
      accessories: {
        ...appearance.accessories,
        [item.slot]: createAccessoryConfig(item.type, { color: item.color }),
      },
    });
  };

  const takeOffItem = (item: InventoryItem) => {
    if (!item.slot) return;
    const next = { ...appearance.accessories };
    delete next[item.slot];
    updateAppearance({ accessories: next });
  };

  const applyDye = (item: InventoryItem) => {
    if (item.role === 'secondary') updateAppearance({ secondaryColor: item.color });
    else if (item.role === 'accent') updateAppearance({ accentColor: item.color });
    else updateAppearance({ primaryColor: item.color });
  };

  // --- Objects in the room -------------------------------------------------
  const placeItem = (item: InventoryItem) => {
    if (!item.objectType) return;
    setPlacements((current) =>
      current.some((placement) => placement.id === item.id)
        ? current
        : [...current, { id: item.id, type: item.objectType! }],
    );
    // Something new dropping into the room is worth looking at.
    setToast(`${item.label} is in the room.`);
  };

  const recallItem = (item: InventoryItem) => {
    setPlacements((current) => current.filter((placement) => placement.id !== item.id));
  };

  // --- Layout --------------------------------------------------------------
  const openGoals = goals.filter((goal) => !goal.done).length;

  const tabs = useMemo<TabItem<TabValue>[]>(
    () => [
      { value: 'goals', label: 'Goals', count: openGoals },
      { value: 'inventory', label: 'Inventory', count: inventory.length },
      { value: 'style', label: 'Style' },
    ],
    [openGoals, inventory.length],
  );

  return (
    <div className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-6 p-4 lg:p-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Digital Pet World</h1>
          <p className="text-sm text-muted-foreground">
            A small creature lives here. Be nice to it.
          </p>
        </div>
        <UserBadge />
      </header>

      <div className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <main className="space-y-3">
          <PetHabitat
            appearance={appearance}
            petName={petName}
            placements={placements}
            celebrate={celebrate}
          />

          {/* Reserved so the layout does not jump when a reward lands. */}
          <div className="min-h-9">
            {toast && (
              <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent">
                <span aria-hidden>✦</span>
                {toast}
              </p>
            )}
          </div>
        </main>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-8 lg:max-h-[calc(100svh-4rem)]">
          <Tabs items={tabs} value={tab} onValueChange={setTab} />

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === 'goals' && (
              <GoalsPanel
                goals={goals}
                onAdd={addGoal}
                onComplete={completeGoal}
                onRemove={removeGoal}
              />
            )}

            {tab === 'inventory' && (
              <InventoryPanel
                items={inventory}
                appearance={appearance}
                placedIds={placements.map((placement) => placement.id)}
                onWear={wearItem}
                onTakeOff={takeOffItem}
                onApplyDye={applyDye}
                onPlace={placeItem}
                onRecall={recallItem}
              />
            )}

            {tab === 'style' && (
              <div className="space-y-4">
                <PetLibraryPanel library={library} />
                <CustomizerPanel
                  appearance={appearance}
                  onChange={updateAppearance}
                  petName={petName}
                  onPetNameChange={setPetName}
                />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
