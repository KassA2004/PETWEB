import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN } from '../../users/username';

/**
 * Ask somebody to be friends.
 *
 * By username or by id, and exactly one of them: the search results carry ids,
 * while somebody typing a name into the box has only the name. The service
 * refuses a body with neither.
 *
 * Note the interaction with the global ValidationPipe's `whitelist: true`:
 * nothing else declared here means nothing else survives, which is what stops a
 * client posting a `status` and friending itself into existence.
 */
export class CreateFriendRequestDto {
  @IsOptional()
  @IsString()
  @Length(USERNAME_MIN, USERNAME_MAX)
  @Matches(USERNAME_PATTERN)
  username?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
