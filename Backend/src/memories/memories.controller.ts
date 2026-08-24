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
import { CreateMemoryDto, ListMemoriesDto, UpdateMemoryDto } from './dto/memory.dto';
import { MemoriesService } from './memories.service';
import type { MemoryView } from './memories.service';

/**
 * /api/v1/memories — the memory book.
 *
 * There is no create route for `goal_completed`: those are written inside the
 * completion transaction (`POST /goals/:goalId/complete`), which is what makes
 * them trustworthy. This controller owns reading the book and the entries the
 * user writes themselves.
 */
@Controller({ path: 'memories', version: '1' })
export class MemoriesController {
  constructor(private readonly memories: MemoriesService) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query() query: ListMemoriesDto,
  ): Promise<MemoryView[]> {
    return this.memories.list(user.id, query.limit);
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body() body: CreateMemoryDto,
  ): Promise<MemoryView> {
    return this.memories.create(user.id, body);
  }

  @Patch(':memoryId')
  update(
    @CurrentUser() user: SessionUser,
    @Param('memoryId', ParseUUIDPipe) memoryId: string,
    @Body() body: UpdateMemoryDto,
  ): Promise<MemoryView> {
    return this.memories.update(user.id, memoryId, body);
  }

  @Delete(':memoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: SessionUser,
    @Param('memoryId', ParseUUIDPipe) memoryId: string,
  ): Promise<void> {
    return this.memories.remove(user.id, memoryId);
  }
}
