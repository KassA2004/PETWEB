import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import { SocialBus } from '../realtime/social-bus';
import { CreateFriendRequestDto } from './dto/friend.dto';
import { FriendsService } from './friends.service';
import type { FriendsView } from './friends.service';

/**
 * /api/v1/friends — who this user knows.
 *
 * Every route returns the *whole* picture (`FriendsView`: friends, incoming,
 * outgoing) rather than the one thing that changed, and that is deliberate:
 * accepting a request moves a row from one list to another, so a client that
 * received only the accepted row would have to reconstruct both lists itself
 * and would be wrong the moment two tabs are open. One shape, one source of
 * truth, no client-side reconciliation.
 *
 * Nothing here takes an owner from the request. The session is the owner, and a
 * request that is not yours is a 404 — the same rule the rest of the API keeps.
 */
@Controller({ path: 'friends', version: '1' })
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly bus: SocialBus,
  ) {}

  /**
   * Tell both people to look again.
   *
   * Every route below changes a relationship, and a relationship has two sides:
   * the person who accepted your request should not have to refresh to find out
   * that you did. Published on the bus rather than pushed at the gateway, for
   * the acyclicity reason in `realtime/social-bus.ts`.
   *
   * A hint, never data — the event carries no payload at all. Whoever hears it
   * re-reads `GET /friends`, which is the authoritative answer, so there is no
   * way for the socket to tell somebody they have a friend they do not.
   */
  private announce(...userIds: string[]): void {
    this.bus.publishFriendsChanged({ userIds });
  }

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<FriendsView> {
    return this.friends.list(user.id);
  }

  /** Ask somebody. By username from the search box, or by id from a result. */
  @Post('requests')
  @HttpCode(HttpStatus.OK)
  async request(
    @CurrentUser() user: SessionUser,
    @Body() body: CreateFriendRequestDto,
  ): Promise<FriendsView> {
    if (!body.userId && !body.username) {
      throw new BadRequestException('Name somebody to add, by username or id.');
    }

    const view = body.userId
      ? await this.friends.request(user.id, body.userId)
      : await this.friends.requestByUsername(user.id, body.username!);

    // Everybody now on one of this user's lists, plus the user themselves. The
    // named target is in there either way — as a new outgoing request, or as a
    // friendship if the request crossed one coming the other way.
    this.announce(user.id, ...idsIn(view));
    return view;
  }

  @Post('requests/:friendshipId/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @CurrentUser() user: SessionUser,
    @Param('friendshipId', ParseUUIDPipe) friendshipId: string,
  ): Promise<FriendsView> {
    const view = await this.friends.accept(user.id, friendshipId);
    this.announce(user.id, ...idsIn(view));
    return view;
  }

  @Post('requests/:friendshipId/decline')
  @HttpCode(HttpStatus.OK)
  async decline(
    @CurrentUser() user: SessionUser,
    @Param('friendshipId', ParseUUIDPipe) friendshipId: string,
  ): Promise<FriendsView> {
    const view = await this.friends.decline(user.id, friendshipId);
    this.announce(user.id);
    return view;
  }

  /**
   * Unfriend, or take back a request you sent.
   *
   * Keyed by the *other person*, not by the friendship id, because that is what
   * the interface has in its hand: a row in the friends list knows who it is,
   * not which uuid the relationship happens to have.
   *
   * Returns the remaining picture rather than 204 — see the class comment.
   */
  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<FriendsView> {
    const view = await this.friends.remove(user.id, userId);
    this.announce(user.id, userId);
    return view;
  }
}

/**
 * Everybody on any of the three lists.
 *
 * Used to decide who to nudge after a change. Broader than strictly necessary —
 * it includes people whose view did not change — and that is the cheaper
 * mistake: the event is a hint with no payload, so an unnecessary one costs one
 * client one `GET /friends`, while a *missing* one costs somebody a stale
 * screen until they refresh.
 */
function idsIn(view: FriendsView): string[] {
  return [
    ...view.friends.map((friend) => friend.userId),
    ...view.incoming.map((request) => request.userId),
    ...view.outgoing.map((request) => request.userId),
  ];
}
