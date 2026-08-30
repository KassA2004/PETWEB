import { IsString, Length, Matches } from 'class-validator';
import { USERNAME_MAX, USERNAME_MIN, USERNAME_PATTERN } from '../username';

/**
 * Request bodies and queries for the user endpoints.
 *
 * The character set and length are declared here *and* re-checked in the
 * service, which is not belt-and-braces: the service is also called by the
 * sign-up hook, which never passes through a ValidationPipe at all (Better
 * Auth's routes are mounted outside Nest — see main.ts).
 */
export class UpdateUsernameDto {
  @IsString()
  @Length(USERNAME_MIN, USERNAME_MAX)
  @Matches(USERNAME_PATTERN, {
    message: 'Letters, numbers, hyphens and underscores only.',
  })
  username!: string;
}

/**
 * A username search.
 *
 * Two characters minimum, enforced in the service by returning nothing rather
 * than by refusing: a search box that errors while you are still typing the
 * first letter is a search box that argues with you.
 */
export class SearchUsersDto {
  @IsString()
  @Length(1, USERNAME_MAX)
  q!: string;
}
