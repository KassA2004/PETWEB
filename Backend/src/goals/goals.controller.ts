import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import {
  CompleteGoalDto,
  CreateGoalDto,
  ListGoalsDto,
  UpdateGoalDto,
} from './dto/goal.dto';
import { MAX_OPEN_GOALS } from './goal-limit';
import { GoalsService } from './goals.service';
import type { GoalCompletionView, GoalView } from './goals.service';

/** What the list route returns: the goals, and how much room is left. */
interface GoalListView {
  items: GoalView[];
  openCount: number;
  /** So the interface never has to hard-code the cap it is enforcing. */
  maxOpen: number;
}

/**
 * /api/v1/goals — the user's goals.
 *
 * Every route is scoped to the session user by the service; nothing here takes
 * an owner id from the request, so there is no way to ask for someone else's
 * goals in the first place.
 */
@Controller({ path: 'goals', version: '1' })
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query() query: ListGoalsDto,
  ): Promise<GoalListView> {
    const items = await this.goals.list(user.id, query.status ?? 'all');

    return {
      items,
      openCount: items.filter((goal) => goal.status === 'open').length,
      maxOpen: MAX_OPEN_GOALS,
    };
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body() body: CreateGoalDto,
  ): Promise<GoalView> {
    return this.goals.create(user.id, body);
  }

  @Get(':goalId')
  findOne(
    @CurrentUser() user: SessionUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
  ): Promise<GoalView> {
    return this.goals.findOne(user.id, goalId);
  }

  @Patch(':goalId')
  update(
    @CurrentUser() user: SessionUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() body: UpdateGoalDto,
  ): Promise<GoalView> {
    return this.goals.update(user.id, goalId, body);
  }

  /**
   * Finish it, and optionally keep a memory of the day.
   *
   * The body is optional in every direction: no body completes the goal, a
   * `memory` without an `imageUrl` keeps a note, and an `imageUrl` has to be a
   * path the media endpoints handed out.
   */
  @Post(':goalId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: SessionUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() body: CompleteGoalDto,
  ): Promise<GoalCompletionView> {
    return this.goals.complete(user.id, goalId, body);
  }

  @Post(':goalId/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(
    @CurrentUser() user: SessionUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
  ): Promise<GoalView> {
    return this.goals.reopen(user.id, goalId);
  }

  @Delete(':goalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: SessionUser,
    @Param('goalId', ParseUUIDPipe) goalId: string,
  ): Promise<void> {
    return this.goals.remove(user.id, goalId);
  }
}
