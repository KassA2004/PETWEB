import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import { StartFocusDto } from './dto/focus.dto';
import { FOCUS_PRESETS, MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES } from './durations';
import { FocusService } from './focus.service';
import type { FocusSessionView, FocusStateView } from './focus.service';
import type { AffectionView } from '../affection/affection.service';

/** A session, and what it did to the creature. Every write answers with both. */
interface FocusResultView {
  session: FocusSessionView;
  affection: AffectionView;
}

/** The lengths on offer, so the interface never hard-codes the rule. */
interface FocusOptionsView extends FocusStateView {
  presets: readonly number[];
  minMinutes: number;
  maxMinutes: number;
}

/**
 * /api/v1/focus - the one slot.
 *
 * Singular on purpose. There is no list route and no history route, because
 * there is nothing in this product that shows a user a table of their own
 * sessions: the rows exist so the creature can have an opinion, not so anybody
 * can be scored (the brief's guardrails, and project-overview.md section 6 -
 * this is not a productivity application with a pet attached).
 *
 * Every route is scoped to the session user inside the service. Nothing here
 * reads an owner from a body or a query, so asking for somebody else's session
 * is not a thing the API has a shape for.
 */
@Controller({ path: 'focus', version: '1' })
export class FocusController {
  constructor(private readonly focus: FocusService) {}

  /**
   * What is happening right now.
   *
   * The recovery endpoint: called on load, on reconnect and when the tab comes
   * back, and it is the only one the client needs to put a half-finished
   * session back together. It also resolves anything that ran out while the
   * app was closed, which is why a GET here is allowed to change data - the
   * alternative is a timer that lies until somebody presses something.
   */
  @Get()
  async current(@CurrentUser() user: SessionUser): Promise<FocusOptionsView> {
    const state = await this.focus.current(user.id);

    return {
      ...state,
      presets: FOCUS_PRESETS,
      minMinutes: MIN_FOCUS_MINUTES,
      maxMinutes: MAX_FOCUS_MINUTES,
    };
  }

  /** Commit to a length. The clock starts here, on this machine. */
  @Post('sessions')
  start(
    @CurrentUser() user: SessionUser,
    @Body() body: StartFocusDto,
  ): Promise<FocusResultView> {
    return this.focus.start(user.id, body);
  }

  /**
   * The time is up.
   *
   * Refused with `FOCUS_NOT_FINISHED` and the true remaining seconds if it is
   * not, which is a resynchronisation rather than an error - see
   * `FocusService.complete`.
   */
  @Post('sessions/:sessionId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: SessionUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<FocusResultView> {
    return this.focus.complete(user.id, sessionId);
  }

  /** Stopping early. Always allowed, never interrogated. */
  @Post('sessions/:sessionId/abort')
  @HttpCode(HttpStatus.OK)
  abort(
    @CurrentUser() user: SessionUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<FocusResultView> {
    return this.focus.abort(user.id, sessionId);
  }
}
