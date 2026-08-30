import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  PARK_MAX_CAPACITY,
  PARK_MIN_CAPACITY,
} from '../park-limits';
import { PASSCODE_MAX, PASSCODE_MIN } from '../passcode';

/**
 * Opening a park.
 *
 * The bounds are declared here *and* re-checked in the service, and that is not
 * duplication: the service is the trust boundary, and it is also reachable from
 * the gateway, which never passes through a ValidationPipe. A rule that only
 * exists in a decorator is a rule the WebSocket path does not have.
 *
 * `whitelist: true` on the global pipe means nothing else declared here
 * survives — which is what stops a client posting a `passcodeHash` of its own.
 */
export class CreateParkDto {
  @IsString()
  @Length(1, 40)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(PARK_MIN_CAPACITY)
  @Max(PARK_MAX_CAPACITY)
  capacity!: number;

  @IsBoolean()
  isPrivate!: boolean;

  /**
   * Required when `isPrivate`, and the service is what enforces that — a
   * conditional validator here would be a second place the rule lives.
   *
   * Never stored as typed and never returned: `passcode.ts` hashes it with
   * scrypt on the way in, and no response shape in this package has a field it
   * could come back through.
   */
  @IsOptional()
  @IsString()
  @Length(PASSCODE_MIN, PASSCODE_MAX)
  passcode?: string;
}

/** Reading a park's chat backwards. `before` is the oldest id already held. */
export class ParkHistoryDto {
  @IsOptional()
  @IsUUID()
  before?: string;
}
