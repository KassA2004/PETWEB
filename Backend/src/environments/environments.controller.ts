import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import { ReplaceObjectsDto, ReplaceSceneDto, UpdateEnvironmentDto } from './dto/environment.dto';
import { EnvironmentObjectsService } from './environment-objects.service';
import type { PlacedObjectView } from './environment-objects.service';
import { EnvironmentsService } from './environments.service';
import type { EnvironmentView } from './environments.service';

/**
 * /api/v1/environments — the rooms the user owns.
 *
 * Every route is scoped to the session user by the service; nothing here takes
 * an owner id from the request, so there is no way to ask for someone else's
 * room in the first place.
 *
 * Route ordering matters: `/environments/current` is declared before
 * `/environments/:environmentId` so the literal segment is not swallowed as a
 * UUID param — the same trap `/pets/active` sits behind
 * (03-pet-endpoints.md §2).
 */
@Controller({ path: 'environments', version: '1' })
export class EnvironmentsController {
  constructor(
    private readonly environments: EnvironmentsService,
    private readonly objects: EnvironmentObjectsService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<EnvironmentView[]> {
    return this.environments.list(user.id);
  }

  /**
   * The room the creature is living in.
   *
   * The MVP ships one room per user, so this is the route the client actually
   * uses on load: it does not have to know the id, and it cannot get it wrong.
   */
  @Get('current')
  current(@CurrentUser() user: SessionUser): Promise<EnvironmentView> {
    return this.environments.current(user.id);
  }

  /**
   * What is standing in the room, without having to know which room it is.
   *
   * The same list as `GET /environments/:id/objects`, resolved from the session
   * instead of from a path parameter, so the client can ask for its furniture in
   * parallel with everything else rather than one round trip behind the room.
   */
  @Get('current/objects')
  async listCurrentObjects(
    @CurrentUser() user: SessionUser,
  ): Promise<PlacedObjectView[]> {
    const environmentId = await this.environments.currentId(user.id);
    return this.objects.list(user.id, environmentId);
  }

  @Get(':environmentId')
  findOne(
    @CurrentUser() user: SessionUser,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ): Promise<EnvironmentView> {
    return this.environments.findOne(user.id, environmentId);
  }

  /** Rename, restyle, or both. */
  @Patch(':environmentId')
  update(
    @CurrentUser() user: SessionUser,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Body() body: UpdateEnvironmentDto,
  ): Promise<EnvironmentView> {
    return this.environments.update(user.id, environmentId, body);
  }

  /**
   * Replace what the room looks like.
   *
   * PUT, not PATCH, and it has its own route for the same reason the pet's
   * appearance does: the room editor always submits a complete style, and a
   * rename must never be able to clobber a room.
   *
   * `/style` rather than `/scene`, because `GET /environments/:id/scene` is
   * spoken for — that is the full render payload (04-environment-endpoints.md
   * §4), which is a different thing that happens to read from the same column.
   */
  @Put(':environmentId/style')
  replaceScene(
    @CurrentUser() user: SessionUser,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Body() body: ReplaceSceneDto,
  ): Promise<EnvironmentView> {
    return this.environments.replaceScene(user.id, environmentId, body.sceneData);
  }

  /** What is standing in the room. */
  @Get(':environmentId/objects')
  listObjects(
    @CurrentUser() user: SessionUser,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
  ): Promise<PlacedObjectView[]> {
    return this.objects.list(user.id, environmentId);
  }

  /**
   * Replace the arrangement.
   *
   * PUT and whole-document, for the same reason `/style` is: the client is a
   * physics scene that is always holding a complete, known-good arrangement,
   * and asking it to work out which objects are dirty would invent a
   * synchronisation problem the product does not have. See
   * `environment-objects.service.ts` for the longer version.
   */
  @Put(':environmentId/objects')
  replaceObjects(
    @CurrentUser() user: SessionUser,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @Body() body: ReplaceObjectsDto,
  ): Promise<PlacedObjectView[]> {
    return this.objects.replace(user.id, environmentId, body.objects);
  }
}
