import { Injectable, NotFoundException } from '@nestjs/common';
import type { EnvironmentObject } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertStorableDefinition } from './object-definition';

/** One object in the room, as the API describes it. */
export interface PlacedObjectView {
  /** The client's own id for it. Stable across saves. */
  key: string;
  type: string;
  col: number;
  row: number;
  /** `{ seed, color, secondaryColor, accentColor }` — the client's own document. */
  definition: unknown;
}

export interface PlacedObjectInput {
  key: string;
  type: string;
  col: number;
  row: number;
  definition?: Record<string, unknown>;
}

function toView(object: EnvironmentObject): PlacedObjectView {
  return {
    key: object.key,
    type: object.type,
    col: object.col,
    row: object.row,
    definition: object.definitionData,
  };
}

/**
 * Where the user has put things.
 *
 * The other half of a saved room. `EnvironmentsService` keeps what the room is
 * made of — the hour, the paint, the wallpaper; this keeps what is standing in
 * it, and between them a returning user gets their room back rather than the
 * one the product shipped.
 *
 * **The arrangement is replaced whole, not patched.**
 *
 * That looks wasteful and is the correct shape for this particular thing. The
 * client is a physics scene: objects are dragged, bumped by the creature and
 * settled onto cells continuously, and the moment worth writing down is "the
 * user let go", at which point the *whole room* is a known-good arrangement.
 * A per-object PATCH would need the client to track which objects are dirty
 * across a simulation that moves things it never asked about — that is a
 * synchronisation problem invented by the API shape, not by the product. It is
 * the same reasoning that makes `PUT /environments/:id/style` a whole document
 * (04-environment-endpoints.md), and a room holds a couple of dozen rows.
 *
 * Ownership is never taken from the request: the environment is looked up by
 * `(id, ownerId)` first, so a room belonging to somebody else is a 404 before
 * any object is read or written.
 */
@Injectable()
export class EnvironmentObjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, environmentId: string): Promise<PlacedObjectView[]> {
    await this.ownedEnvironment(ownerId, environmentId);

    const objects = await this.prisma.environmentObject.findMany({
      where: { environmentId },
      orderBy: [{ row: 'asc' }, { col: 'asc' }],
    });

    return objects.map(toView);
  }

  /**
   * Replace everything in the room with this arrangement.
   *
   * One transaction, so a save that fails half way cannot leave the user's room
   * with the furniture from one arrangement and the toys from another. Deleting
   * and re-inserting rather than diffing: two statements against a couple of
   * dozen rows, and no upsert loop whose failure modes have to be reasoned
   * about.
   */
  async replace(
    ownerId: string,
    environmentId: string,
    objects: PlacedObjectInput[],
  ): Promise<PlacedObjectView[]> {
    await this.ownedEnvironment(ownerId, environmentId);

    // Last one wins on a duplicate key rather than the insert failing: the
    // client's keys are its own, and a room that will not save because of a
    // collision the user cannot see is worse than a room with one fewer chair.
    const byKey = new Map<string, PlacedObjectInput>();
    for (const object of objects) byKey.set(object.key, object);

    const rows = [...byKey.values()].map((object) => ({
      environmentId,
      key: object.key,
      type: object.type,
      col: Math.trunc(object.col),
      row: Math.trunc(object.row),
      definitionData: assertStorableDefinition(object.definition) as Prisma.InputJsonValue,
    }));

    await this.prisma.$transaction([
      this.prisma.environmentObject.deleteMany({ where: { environmentId } }),
      ...(rows.length > 0
        ? [this.prisma.environmentObject.createMany({ data: rows })]
        : []),
      // The room changed even though the style did not, so the timestamp the
      // client reads to know how fresh its copy is has to move too.
      this.prisma.environment.update({
        where: { id: environmentId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return this.list(ownerId, environmentId);
  }

  private async ownedEnvironment(ownerId: string, environmentId: string): Promise<void> {
    const environment = await this.prisma.environment.findFirst({
      where: { id: environmentId, ownerId },
      select: { id: true },
    });

    if (!environment) throw new NotFoundException('Environment not found');
  }
}
