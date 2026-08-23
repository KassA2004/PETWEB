import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pet } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppearanceRejected,
  assertStorableAppearance,
  seedPersonalityData,
  seedStateData,
  speciesFromAppearance,
} from './pet-appearance';
import type { JsonObject } from './pet-appearance';

/** What the API hands back for a pet. `ageDays` is derived, never stored. */
export interface PetView {
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

/** A pet, plus whether it is the one the user currently has selected. */
export interface PetLibraryView {
  pets: PetView[];
  activePetId: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toView(pet: Pet): PetView {
  return {
    id: pet.id,
    ownerId: pet.ownerId,
    environmentId: pet.environmentId,
    name: pet.name,
    species: pet.species,
    appearanceData: pet.appearanceData,
    personalityData: pet.personalityData,
    stateData: pet.stateData,
    createdAt: pet.createdAt.toISOString(),
    updatedAt: pet.updatedAt.toISOString(),
    ageDays: Math.floor((Date.now() - pet.createdAt.getTime()) / DAY_MS),
  };
}

/**
 * Saved pets — the "presets" the creature editor writes to.
 *
 * Two things this owns that the schema alone does not:
 *
 *   ownership   every read and every write is scoped by `ownerId`, and a pet
 *               belonging to someone else is reported as 404 rather than 403,
 *               so the API never confirms that an id exists
 *   selection   which pet the user is currently looking after, which is what
 *               makes a creature survive a reload and a fresh sign-in
 *
 * Deviation from /Docs/API-endpoints/03-pet-endpoints.md §3, recorded here
 * because it is deliberate: the spec caps the MVP at one pet per user. Saved
 * presets are the requested feature, so the cap is gone and the active-pet
 * pointer takes its place — one pet is *selected*, any number are *kept*.
 */
@Injectable()
export class PetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string): Promise<PetLibraryView> {
    const [pets, user] = await Promise.all([
      this.prisma.pet.findMany({
        where: { ownerId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { activePetId: true },
      }),
    ]);

    return { pets: pets.map(toView), activePetId: user?.activePetId ?? null };
  }

  async findOne(ownerId: string, petId: string): Promise<PetView> {
    return toView(await this.owned(ownerId, petId));
  }

  /** The pet the user is looking after, or null if they have not chosen one. */
  async findActive(ownerId: string): Promise<PetView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { activePet: true },
    });

    return user?.activePet ? toView(user.activePet) : null;
  }

  /**
   * Save a creature as a new preset, and select it.
   *
   * Selecting on create is the behaviour the editor wants: you press Save
   * because this is the creature you are making, so it should be the creature
   * in the room when you come back.
   */
  async create(
    ownerId: string,
    input: { name: string; appearanceData: unknown; environmentId?: string },
  ): Promise<PetView> {
    const appearance = this.checkAppearance(input.appearanceData);
    const environmentId = await this.resolveEnvironment(ownerId, input.environmentId);

    const pet = await this.prisma.$transaction(async (tx) => {
      const created = await tx.pet.create({
        data: {
          ownerId,
          environmentId,
          name: input.name.trim(),
          species: speciesFromAppearance(appearance),
          appearanceData: appearance as Prisma.InputJsonValue,
          personalityData: seedPersonalityData(appearance) as Prisma.InputJsonValue,
          stateData: seedStateData() as Prisma.InputJsonValue,
        },
      });

      await tx.user.update({
        where: { id: ownerId },
        data: { activePetId: created.id },
      });

      return created;
    });

    return toView(pet);
  }

  async rename(ownerId: string, petId: string, name: string): Promise<PetView> {
    await this.owned(ownerId, petId);

    const pet = await this.prisma.pet.update({
      where: { id: petId },
      data: { name: name.trim() },
    });

    return toView(pet);
  }

  /**
   * Replace a preset's rig wholesale.
   *
   * The species is re-derived, because changing the body shape changes what the
   * creature is as far as anything reading that column is concerned.
   */
  async replaceAppearance(
    ownerId: string,
    petId: string,
    appearanceData: unknown,
  ): Promise<PetView> {
    await this.owned(ownerId, petId);
    const appearance = this.checkAppearance(appearanceData);

    const pet = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        appearanceData: appearance as Prisma.InputJsonValue,
        species: speciesFromAppearance(appearance),
      },
    });

    return toView(pet);
  }

  /**
   * Choose which saved pet is the live one.
   *
   * Passing no id clears the selection, which is what a user who deleted their
   * last preset ends up with.
   */
  async setActive(ownerId: string, petId: string | null): Promise<PetLibraryView> {
    if (petId) await this.owned(ownerId, petId);

    await this.prisma.user.update({
      where: { id: ownerId },
      data: { activePetId: petId },
    });

    return this.list(ownerId);
  }

  /**
   * Delete a preset.
   *
   * The database nulls `activePetId` for us if this was the selected one
   * (`onDelete: SetNull`), so the only thing left to decide is what to select
   * instead: the most recently touched survivor, because a user who deletes the
   * creature in the room should find another one there rather than an empty
   * room.
   */
  async remove(ownerId: string, petId: string): Promise<PetLibraryView> {
    await this.owned(ownerId, petId);

    await this.prisma.pet.delete({ where: { id: petId } });

    const library = await this.list(ownerId);
    if (library.activePetId || library.pets.length === 0) return library;

    return this.setActive(ownerId, library.pets[0].id);
  }

  // --- Internals ------------------------------------------------------------

  /**
   * Fetch a pet, or refuse to admit it exists.
   *
   * 404 rather than 403 for someone else's pet: a 403 tells an attacker that
   * the id is real, and there is nothing a caller can do with that distinction
   * anyway.
   */
  private async owned(ownerId: string, petId: string): Promise<Pet> {
    const pet = await this.prisma.pet.findFirst({ where: { id: petId, ownerId } });
    if (!pet) throw new NotFoundException('Pet not found');
    return pet;
  }

  private checkAppearance(value: unknown): JsonObject {
    try {
      return assertStorableAppearance(value);
    } catch (error) {
      if (error instanceof AppearanceRejected) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Which room a new pet goes in.
   *
   * Sign-up creates one for every user (`src/auth/auth.ts`), so the fallback is
   * "the one they already have" rather than a special case.
   */
  private async resolveEnvironment(ownerId: string, requested?: string): Promise<string> {
    if (requested) {
      const environment = await this.prisma.environment.findFirst({
        where: { id: requested, ownerId },
        select: { id: true },
      });
      if (!environment) throw new NotFoundException('Environment not found');
      return environment.id;
    }

    const first = await this.prisma.environment.findFirst({
      where: { ownerId },
      orderBy: { name: 'asc' },
      select: { id: true },
    });

    if (first) return first.id;

    // A user with no room at all predates the sign-up hook, or had their room
    // removed. Give them one rather than refusing to save their creature.
    const created = await this.prisma.environment.create({
      data: { ownerId, name: 'Room' },
      select: { id: true },
    });

    return created.id;
  }
}
