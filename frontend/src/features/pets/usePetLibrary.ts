import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { ApiError } from '../../lib/api';
import {
  createPet,
  deletePet,
  fetchPetLibrary,
  renamePet,
  selectPet,
  updatePetAppearance,
} from './api';
import type { SavedPet } from './api';

/**
 * The creature the user is looking after, and the ones they have saved.
 *
 * This owns the *working copy* — the appearance the editor writes to and the
 * room renders — as well as the saved presets, because the two are the same
 * question asked twice. Splitting them would mean the dashboard holding an
 * appearance and this hook holding an opinion about whether it matches, with a
 * callback between them.
 *
 * Two decisions worth naming.
 *
 * **Saving is explicit.** Edits are not written back on a debounce. A preset is
 * a snapshot the user named, and silently overwriting "Blorb" because somebody
 * dragged a slider while looking at him is the kind of autosave people learn to
 * fear. `unsaved` says the working copy has drifted; Save and Update commit it.
 *
 * **The editor works with the backend down.** A failed load leaves the default
 * creature in the room and an error on the panel, rather than an empty screen —
 * you can still play with the sliders, you just cannot keep the result.
 */

export interface PetLibraryState {
  /** The creature currently being edited and rendered. */
  appearance: PetAppearance;
  name: string;
  updateAppearance: (patch: Partial<PetAppearance>) => void;
  setName: (name: string) => void;

  pets: SavedPet[];
  activePetId: string | null;
  activePet: SavedPet | null;

  /** First load still in flight. */
  loading: boolean;
  /** A write is in flight. */
  busy: boolean;
  error: string | null;
  dismissError: () => void;

  /** The working copy differs from the saved preset it came from. */
  unsaved: boolean;

  savePreset: (name: string) => Promise<void>;
  updateActive: () => Promise<void>;
  select: (petId: string) => Promise<void>;
  remove: (petId: string) => Promise<void>;
}

const DEFAULT_NAME = 'Blorb';

/** Two appearances are the same creature when they serialize the same way. */
function sameAppearance(a: PetAppearance, b: PetAppearance): boolean {
  // Both sides have been through `createPetAppearance`, so key order is fixed
  // by the defaults object and a string compare is sound.
  return JSON.stringify(a) === JSON.stringify(b);
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.isUnauthorized ? 'Sign in again to save your creature.' : error.message;
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError when it cannot reach the server at all.
    return 'Cannot reach the server. Your creature is not being saved.';
  }
  return error instanceof Error ? error.message : fallback;
}

export function usePetLibrary(): PetLibraryState {
  const [appearance, setAppearance] = useState<PetAppearance>(() => createPetAppearance());
  const [name, setName] = useState(DEFAULT_NAME);

  const [pets, setPets] = useState<SavedPet[]>([]);
  const [activePetId, setActivePetId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Whether the working copy has been adopted from a preset yet.
   *
   * Guards the one race that matters: the user starts editing before the
   * library has loaded, and the response then throws their work away. If they
   * have touched anything, the load fills the preset list but leaves the
   * creature alone.
   */
  const touched = useRef(false);

  const adopt = useCallback((pet: SavedPet | null) => {
    if (!pet) return;
    setAppearance(pet.appearance);
    setName(pet.name);
    touched.current = false;
  }, []);

  // --- First load -----------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const library = await fetchPetLibrary(controller.signal);
        if (controller.signal.aborted) return;

        setPets(library.pets);
        setActivePetId(library.activePetId);

        const active = library.pets.find((pet) => pet.id === library.activePetId) ?? null;
        if (!touched.current) adopt(active);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(messageFor(cause, 'Could not load your saved creatures.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [adopt]);

  // --- Editing --------------------------------------------------------------
  const updateAppearance = useCallback((patch: Partial<PetAppearance>) => {
    touched.current = true;
    setAppearance((current) => createPetAppearance({ ...current, ...patch }));
  }, []);

  const changeName = useCallback((next: string) => {
    touched.current = true;
    setName(next);
  }, []);

  // --- Writes ---------------------------------------------------------------
  /** Run a write, keeping `busy` and `error` honest whatever happens. */
  const run = useCallback(async <T,>(work: () => Promise<T>, fallback: string): Promise<T> => {
    setBusy(true);
    setError(null);

    try {
      return await work();
    } catch (cause) {
      const message = messageFor(cause, fallback);
      setError(message);
      // Rethrown so a dialog can show the failure in place and stay open. The
      // original is kept as the cause — the message is written for a person,
      // and the stack is what a developer needs.
      throw new Error(message, { cause });
    } finally {
      setBusy(false);
    }
  }, []);

  const savePreset = useCallback(
    async (presetName: string) => {
      const saved = await run(
        () => createPet({ name: presetName, appearance }),
        'Could not save the preset.',
      );

      // Saving selects, so the creature you just named is the one in the room.
      setPets((current) => [saved, ...current.filter((pet) => pet.id !== saved.id)]);
      setActivePetId(saved.id);
      setName(saved.name);
      setAppearance(saved.appearance);
      touched.current = false;
    },
    [appearance, run],
  );

  /** Commit the working copy onto the preset it came from. */
  const updateActive = useCallback(async () => {
    if (!activePetId) return;

    const current = pets.find((pet) => pet.id === activePetId);
    const renamed = current && current.name !== name.trim() && name.trim().length > 0;

    const saved = await run(async () => {
      if (renamed) await renamePet(activePetId, name.trim());
      return updatePetAppearance(activePetId, appearance);
    }, 'Could not update the preset.');

    setPets((list) => list.map((pet) => (pet.id === saved.id ? saved : pet)));
    setAppearance(saved.appearance);
    setName(saved.name);
    touched.current = false;
  }, [activePetId, appearance, name, pets, run]);

  const select = useCallback(
    async (petId: string) => {
      const library = await run(() => selectPet(petId), 'Could not switch creature.');

      setPets(library.pets);
      setActivePetId(library.activePetId);
      adopt(library.pets.find((pet) => pet.id === library.activePetId) ?? null);
    },
    [adopt, run],
  );

  const remove = useCallback(
    async (petId: string) => {
      const library = await run(() => deletePet(petId), 'Could not delete the preset.');

      setPets(library.pets);
      setActivePetId(library.activePetId);

      // Deleting the creature in the room hands you the next one; deleting any
      // other preset leaves what you are looking at alone.
      if (petId === activePetId) {
        adopt(library.pets.find((pet) => pet.id === library.activePetId) ?? null);
      }
    },
    [activePetId, adopt, run],
  );

  // --- Derived --------------------------------------------------------------
  const activePet = useMemo(
    () => pets.find((pet) => pet.id === activePetId) ?? null,
    [pets, activePetId],
  );

  // Only meaningful once there is a preset to have drifted from. With nothing
  // saved yet the panel's job is "save this creature", not "you have unsaved
  // changes" — which would be true of the default blob on a first visit and
  // would teach the user to ignore the warning.
  const unsaved = useMemo(() => {
    if (!activePet) return false;
    return !sameAppearance(appearance, activePet.appearance) || name.trim() !== activePet.name;
  }, [activePet, appearance, name]);

  return {
    appearance,
    name,
    updateAppearance,
    setName: changeName,

    pets,
    activePetId,
    activePet,

    loading,
    busy,
    error,
    dismissError: useCallback(() => setError(null), []),

    unsaved,

    savePreset,
    updateActive,
    select,
    remove,
  };
}
