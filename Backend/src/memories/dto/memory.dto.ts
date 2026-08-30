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

/**
 * Who else may see a memory.
 *
 * Two values, and `private` is what an omitted field means everywhere — in the
 * column's default, in the service, and in the migration that backfilled every
 * memory written before this existed.
 */
export const MEMORY_VISIBILITIES = ['private', 'public'] as const;

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

  /** Defaults to `private`. */
  @IsOptional()
  @IsIn(MEMORY_VISIBILITIES)
  visibility?: (typeof MEMORY_VISIBILITIES)[number];
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

  /** Show it to visitors, or take it back. */
  @IsOptional()
  @IsIn(MEMORY_VISIBILITIES)
  visibility?: (typeof MEMORY_VISIBILITIES)[number];
}

export class ListMemoriesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
