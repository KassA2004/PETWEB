import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import { CreateParkDto, ParkHistoryDto } from './dto/park.dto';
import { ParksService } from './parks.service';
import type { ParkMessageView, ParkView } from './parks.service';

/**
 * /api/v1/parks — finding a park and opening one.
 *
 * **Joining is not here.** It happens over the socket (`SocialGateway`), and
 * that is a deliberate split rather than an omission:
 *
 *   a REST join would admit somebody who then never connects, so the park
 *   would hold a slot for a browser that closed during the request — and the
 *   only way to notice would be the sweeper, minutes later
 *
 *   the socket *is* the presence. Admitting on connect means the thing that
 *   grants the slot and the thing that would notice it going away are the same
 *   object, and there is no state where one exists without the other
 *
 * What is left for REST is what REST is good at: a list, and a create. Chat
 * history is here too, because catching up on what you missed is a request for
 * a page of rows, not a live event.
 */
@Controller({ path: 'parks', version: '1' })
export class ParksController {
  constructor(private readonly parks: ParksService) {}

  /** What is open right now. Private parks by name only — never a credential. */
  @Get()
  list(): Promise<ParkView[]> {
    return this.parks.list();
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body() body: CreateParkDto,
  ): Promise<ParkView> {
    return this.parks.create(user.id, body);
  }

  /**
   * What was said, before you arrived or while you were away.
   *
   * Members only, checked in the service. Newest page first by cursor: pass the
   * oldest id you already hold as `before` to walk backwards.
   */
  @Get(':parkId/messages')
  history(
    @CurrentUser() user: SessionUser,
    @Param('parkId', ParseUUIDPipe) parkId: string,
    @Query() query: ParkHistoryDto,
  ): Promise<ParkMessageView[]> {
    return this.parks.history(user.id, parkId, query.before);
  }
}
