import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { DIRECT_MESSAGE_MAX_LENGTH } from '../../parks/park-limits';

/** Reading a thread backwards. `before` is the oldest id already held. */
export class ChatHistoryDto {
  @IsOptional()
  @IsUUID()
  before?: string;
}

/**
 * Sending a message over REST.
 *
 * The socket is the normal path — it delivers to the other person as well as
 * storing the row — and this exists for the case the socket does not cover: a
 * client whose connection has dropped and which would otherwise have to sit on
 * the message until it comes back. Both paths call the same service, so the
 * friendship check and the cap are the same rules either way.
 */
export class SendMessageDto {
  @IsString()
  @Length(1, DIRECT_MESSAGE_MAX_LENGTH)
  body!: string;
}
