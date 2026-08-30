import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MEMORY_VISIBILITIES } from '../../memories/dto/memory.dto';

/**
 * Request bodies for the goal endpoints.
 *
 * The global ValidationPipe runs with `whitelist: true`, so any field not
 * declared here is stripped before a handler sees it. That is what stops a
 * client from posting `ownerId` or `status` and having it mean anything —
 * ownership comes from the session and status comes from the completion route.
 */
export class CreateGoalDto {
  @IsString()
  @Length(1, 80)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}

/**
 * The memory half of a completion.
 *
 * Optional at every level: no body at all completes the goal, a body with no
 * `memory` completes the goal, and a `memory` with no `imageUrl` still makes a
 * memory — a note about the day is worth keeping even without a picture.
 */
export class CompletionMemoryDto {
  @IsOptional()
  @IsString()
  @Length(0, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  /**
   * A path returned by `POST /media/uploads`, not a URL the client made up.
   *
   * Checked properly in the service against the media package's own rules —
   * `@IsUrl` would reject the relative path the media package actually returns,
   * and accepting an arbitrary absolute URL would let a memory embed a remote
   * image the product never stored.
   */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  imageUrl?: string;

  /**
   * Whether anybody else may see this memory. Defaults to `private`.
   *
   * Asked at the moment the memory is made rather than afterwards, because
   * that is the only moment the user is actually thinking about the thing they
   * just finished. A visibility setting buried in a list is one nobody ever
   * finds, and a memory that is public by default is a promise the product
   * never made.
   */
  @IsOptional()
  @IsIn(MEMORY_VISIBILITIES)
  visibility?: (typeof MEMORY_VISIBILITIES)[number];
}

export class CompleteGoalDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CompletionMemoryDto)
  memory?: CompletionMemoryDto;
}

export class ListGoalsDto {
  @IsOptional()
  @IsIn(['open', 'completed', 'all'])
  status?: 'open' | 'completed' | 'all';
}

/** Unused today; declared so `whitelist` has something to strip against. */
export class ReopenGoalDto {
  @IsOptional()
  @IsBoolean()
  keepMemory?: boolean;
}
