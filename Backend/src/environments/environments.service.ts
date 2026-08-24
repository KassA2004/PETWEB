import { Injectable, NotFoundException } from '@nestjs/common';
import type { Environment } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertStorableRoomStyle, readStoredRoomStyle } from './room-style';

/** What the API hands back for an environment. */
export interface EnvironmentView {
  id: string;
  ownerId: string;
  name: string;
  /** The room's saved appearance. `{}` means "no preference yet". */
  sceneData: unknown;
  objectCount: number;
  updatedAt: string;
}

function toView(environment: Environment, objectCount = 0): EnvironmentView {
  return {
    id: environment.id,
    ownerId: environment.ownerId,
    name: environment.name,
    sceneData: readStoredRoomStyle(environment.sceneData),
    objectCount,
    updatedAt: environment.updatedAt.toISOString(),
  };
}

/**
 * Environments — the rooms a user owns, and what they look like.
 *
 * The MVP ships one room per user, created during the sign-up bootstrap
 * (`src/auth/auth.ts`), so the interesting route here is `current`: give me the
 * room, whichever one it is. Everything else is scoped by `ownerId` exactly as
 * the pet service is — a room belonging to someone else is reported as 404
 * rather than 403, so the API never confirms that an id exists.
 *
 * What this service is really for
 * -------------------------------
 * Persisting the room's *appearance*. It used to live in React state, which
 * meant every refresh and every fresh sign-in threw away the user's hour, their
 * paint colour and everything they had hung on the walls. A room the user has
 * decorated and cannot get back to is worse than a room with no decoration at
 * all, because the second one never promised anything.
 *
 * Deviation from /Docs/API-endpoints/04-environment-endpoints.md, recorded here
 * because it is deliberate: that spec proposes `backgroundKey`, `width`,
 * `height` and `floorY` columns (11-schema-additions.md §3). The room's
 * dimensions are a property of the camera and are not the database's business
 * (`frontend/src/world/Projection.ts` — every room is the same box seen from
 * the same place), and one `backgroundKey` cannot express an hour, a paint
 * colour, two materials, a window view and a list of wall decorations. One
 * validated JSON document replaces all four.
 */
@Injectable()
export class EnvironmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every room the user owns. */
  async list(ownerId: string): Promise<EnvironmentView[]> {
    const environments = await this.prisma.environment.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { objects: true } } },
    });

    return environments.map((environment) => toView(environment, environment._count.objects));
  }

  /**
   * The room the user is living in.
   *
   * Creates one if the account somehow has none — an account without a room
   * cannot render anything, and failing the request would leave the user
   * staring at an error over a bootstrap detail they did not cause.
   */
  async current(ownerId: string): Promise<EnvironmentView> {
    const existing = await this.prisma.environment.findFirst({
      where: { ownerId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { objects: true } } },
    });

    if (existing) return toView(existing, existing._count.objects);

    const created = await this.prisma.environment.create({
      data: { ownerId, name: 'Room' },
    });

    return toView(created);
  }

  async findOne(ownerId: string, environmentId: string): Promise<EnvironmentView> {
    return toView(await this.owned(ownerId, environmentId));
  }

  /** Rename a room, change what it looks like, or both. */
  async update(
    ownerId: string,
    environmentId: string,
    input: { name?: string; sceneData?: unknown },
  ): Promise<EnvironmentView> {
    await this.owned(ownerId, environmentId);

    const data: Prisma.EnvironmentUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.sceneData !== undefined) {
      data.sceneData = assertStorableRoomStyle(input.sceneData) as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.environment.update({
      where: { id: environmentId },
      data,
    });

    return toView(updated);
  }

  /** Replace the room's appearance. The editor always submits a whole style. */
  async replaceScene(
    ownerId: string,
    environmentId: string,
    sceneData: unknown,
  ): Promise<EnvironmentView> {
    return this.update(ownerId, environmentId, { sceneData });
  }

  /**
   * Fetch a room, or 404.
   *
   * Scoped by owner, and a room belonging to someone else is a 404 rather than
   * a 403 so the API never confirms that an id exists.
   */
  private async owned(ownerId: string, environmentId: string): Promise<Environment> {
    const environment = await this.prisma.environment.findFirst({
      where: { id: environmentId, ownerId },
    });

    if (!environment) throw new NotFoundException('Environment not found');
    return environment;
  }
}
