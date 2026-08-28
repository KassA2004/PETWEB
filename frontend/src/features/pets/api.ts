/**
 * The pet endpoints, typed.
 *
 * One thing worth naming: `appearanceData` comes back from the database as
 * whatever was stored, which may have been written by an older version of the
 * editor. Every read runs it through `createPetAppearance`, which fills in
 * fields that did not exist when it was saved and clamps the ones that did. So
 * a preset saved before, say, the mouth library existed still loads — it just
 * gets the default mouth. That is the whole migration strategy for appearance
 * data, and it is why the backend stores the payload verbatim instead of
 * validating its shape (Backend/src/pets/pet-appearance.ts).
 */

import { createPetAppearance } from '../../assets/pets/customization/PetAppearance';
import type { PetAppearance } from '../../assets/pets/customization/PetAppearance';
import { apiRequest } from '../../lib/api';

/** A saved pet, as the API returns it. */
export interface PetRecord {
  id: string;
  ownerId: string;
  environmentId: string;
  name: string;
  species: string;
  appearanceData: unknown;
  personalityData: unknown;
  stateData: unknown;
  createdAt: string;
  updatedAt: string;
  ageDays: number;
}

/** A preset as the library returns it — only what the grid and the room need. */
export interface PetSummary {
  id: string;
  name: string;
  species: string;
  appearanceData: unknown;
  updatedAt: string;
}

/** A saved pet with its appearance already resolved into a renderable one. */
export interface SavedPet extends Omit<PetSummary, 'appearanceData'> {
  appearance: PetAppearance;
}

export interface PetLibrary {
  pets: SavedPet[];
  activePetId: string | null;
}

interface RawLibrary {
  pets: PetSummary[];
  activePetId: string | null;
}

function toSavedPet(record: PetSummary | PetRecord): SavedPet {
  return {
    id: record.id,
    name: record.name,
    species: record.species,
    updatedAt: record.updatedAt,
    appearance: createPetAppearance(
      (record.appearanceData ?? {}) as Partial<PetAppearance>,
    ),
  };
}

function toLibrary(raw: RawLibrary): PetLibrary {
  return { pets: raw.pets.map(toSavedPet), activePetId: raw.activePetId };
}

/** Every preset the user has saved, and which one is selected. */
export async function fetchPetLibrary(signal?: AbortSignal): Promise<PetLibrary> {
  return toLibrary(await apiRequest<RawLibrary>('/pets', { signal }));
}

/** The creature that should be in the room, or null if there is not one yet. */
export async function fetchActivePet(signal?: AbortSignal): Promise<SavedPet | null> {
  const record = await apiRequest<PetRecord | null>('/pets/active', { signal });
  return record ? toSavedPet(record) : null;
}

/** Save the creature currently being edited as a new preset, and select it. */
export async function createPet(input: {
  name: string;
  appearance: PetAppearance;
}): Promise<SavedPet> {
  const record = await apiRequest<PetRecord>('/pets', {
    method: 'POST',
    body: { name: input.name, appearanceData: input.appearance },
  });

  return toSavedPet(record);
}

/** Commit the current edits onto an existing preset. */
export async function updatePetAppearance(
  petId: string,
  appearance: PetAppearance,
): Promise<SavedPet> {
  const record = await apiRequest<PetRecord>(`/pets/${petId}/appearance`, {
    method: 'PUT',
    body: { appearanceData: appearance },
  });

  return toSavedPet(record);
}

export async function renamePet(petId: string, name: string): Promise<SavedPet> {
  const record = await apiRequest<PetRecord>(`/pets/${petId}`, {
    method: 'PATCH',
    body: { name },
  });

  return toSavedPet(record);
}

/** Choose which saved preset is live. */
export async function selectPet(petId: string | null): Promise<PetLibrary> {
  return toLibrary(
    await apiRequest<RawLibrary>('/pets/active', {
      method: 'PUT',
      body: { petId },
    }),
  );
}

/** Delete a preset. Returns what is left, including the new selection. */
export async function deletePet(petId: string): Promise<PetLibrary> {
  return toLibrary(await apiRequest<RawLibrary>(`/pets/${petId}`, { method: 'DELETE' }));
}
