import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request bodies for the memory endpoints.
 *
 * `type` is restricted to the two the user is allowed to author. The system
 * types — `goal_completed` and the milestones — are written inside the
 * transaction of the action that caused them and never by a client call, which
 * is what keeps the history trustworthy (08-memory-endpoints.md §2).
 */
export const USER_MEMORY_TYPES = ['snapshot', 'note'] as const;

export class CreateMemoryDto {
  @IsIn(USER_MEMORY_TYPES)
  type!: (typeof USER_MEMORY_TYPES)[number];

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  /** A path from `POST /media/uploads`. Checked in the service. */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  imageUrl?: string;
}

export class UpdateMemoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}

export class ListMemoriesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
