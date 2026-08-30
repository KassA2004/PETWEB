import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import { MemoriesService } from '../memories/memories.service';
import type { MemoryView } from '../memories/memories.service';
import { SearchUsersDto, UpdateUsernameDto } from './dto/user.dto';
import { UsersService } from './users.service';
import type { MeView, PublicUserView, VisitableRoomView } from './users.service';

/**
 * /api/v1/users — profiles, and finding other people.
 *
 * `02-user-endpoints.md` specified `/users/me` and `/users/me/bootstrap` for
 * the MVP and marked the two social reads `[LATER]`. The MVP shipped without
 * this controller at all — the client took its username from the Better Auth
 * session — and the social layer is what finally needs it, because a name you
 * can change and other people can search for is not something the auth
 * library owns.
 *
 * Deviation from that document, recorded rather than made silently:
 * `/users/me/bootstrap` is **not** built. It exists in the spec to collapse a
 * five-call waterfall that the client does not have — `Dashboard` already
 * fires its loads in parallel (see `useRoomStyle`, `useGoals`, `useFocus`,
 * `usePetLibrary`) — so adding it now would be one more endpoint to keep
 * correct in exchange for nothing measurable. It stays specified, unbuilt.
 *
 * Route ordering matters, as it does on `/pets/active`: `/users/search` is
 * declared before `/users/:userId` so the literal segment is not swallowed as
 * a UUID param.
 */
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly memories: MemoriesService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: SessionUser): Promise<MeView> {
    return this.users.me(user.id);
  }

  /** Change the name other people find you by. */
  @Patch('me')
  updateMe(
    @CurrentUser() user: SessionUser,
    @Body() body: UpdateUsernameDto,
  ): Promise<MeView> {
    return this.users.setUsername(user.id, body.username);
  }

  /**
   * Find people by the start of their username.
   *
   * Prefix, not substring — see `UsersService.search`. Returns at most a dozen,
   * each already carrying where the searcher stands with them, so the results
   * list can offer Add or Accept without a request per row.
   */
  @Get('search')
  search(
    @CurrentUser() user: SessionUser,
    @Query() query: SearchUsersDto,
  ): Promise<PublicUserView[]> {
    return this.users.search(user.id, query.q);
  }

  @Get(':userId')
  profile(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<PublicUserView> {
    return this.users.publicProfile(user.id, userId);
  }

  /**
   * Somebody's public memories.
   *
   * The filter is in the query (`MemoriesService.listPublic`), not in the
   * response mapping: a private memory is never read, rather than read and then
   * left out. That distinction is the entire difference between a visibility
   * feature and a hidden field.
   */
  @Get(':userId/memories')
  publicMemories(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<MemoryView[]> {
    return this.memories.listPublic(userId);
  }

  /**
   * Somebody's room, to visit.
   *
   * The style, the furniture and the creature — the same three things the
   * owner's own client draws the room from, so the visit renders through
   * `PetHabitat` rather than through a second simplified viewer.
   */
  @Get(':userId/room')
  room(@Param('userId', ParseUUIDPipe) userId: string): Promise<VisitableRoomView> {
    return this.users.visitableRoom(userId);
  }
}
