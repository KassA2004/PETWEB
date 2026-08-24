import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES } from '../durations';

/**
 * Starting a session.
 *
 * Two fields, and neither of them is an owner or a start time. The global
 * ValidationPipe runs with `whitelist: true`, so a client that posts
 * `ownerId`, `startedAt` or `status` has those stripped before the handler sees
 * them — which is what stops the clock from being something the browser gets a
 * say in (12-focus-endpoints.md §5).
 *
 * The bounds are declared twice on purpose: here, so a bad request is a 422
 * with a field name, and again in the service, so the rule holds for any caller.
 */
export class StartFocusDto {
  @IsUUID()
  goalId!: string;

  @IsInt()
  @Min(MIN_FOCUS_MINUTES)
  @Max(MAX_FOCUS_MINUTES)
  durationMinutes!: number;
}
