import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session-user.interface';
import { ChatHistoryDto, SendMessageDto } from './dto/chat.dto';
import { ChatService } from './chat.service';
import type { ConversationView, DirectMessageView } from './chat.service';
import { SocialBus } from '../realtime/social-bus';

/**
 * /api/v1/chat — the conversation list and its history.
 *
 * Live delivery is the gateway's; this is the part that answers "what did I
 * miss", which is a page of rows and therefore a request rather than an event.
 * The split matters for a reason the brief is explicit about: the socket must
 * never be the *source* of the conversation. It is a delivery mechanism for
 * rows that already exist, and a client that has been offline for an hour
 * catches up by asking for them.
 *
 * `POST .../messages` exists as the fallback path for a client whose socket is
 * down. It calls the same service the gateway does — one friendship check, one
 * cap, one insert — and then publishes the stored row on `SocialBus`, so a
 * recipient who *is* connected still sees it arrive rather than finding it on
 * their next refresh.
 *
 * The bus rather than the gateway, and that is what keeps the modules acyclic:
 * the gateway already depends on `ChatService` for its own authorization, so a
 * controller in this package injecting the gateway would close the loop. See
 * `realtime/social-bus.ts`.
 */
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly bus: SocialBus,
  ) {}

  @Get('conversations')
  conversations(@CurrentUser() user: SessionUser): Promise<ConversationView[]> {
    return this.chat.conversations(user.id);
  }

  /**
   * The messages with one person.
   *
   * Keyed by *who*, not by thread id: the client has a friend in its hand, and
   * making it learn a conversation id first would be a round trip for something
   * the server can resolve from the two user ids it already has.
   */
  @Get('conversations/:userId/messages')
  history(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ChatHistoryDto,
  ): Promise<DirectMessageView[]> {
    return this.chat.history(user.id, userId, query.before);
  }

  @Post('conversations/:userId/messages')
  async send(
    @CurrentUser() user: SessionUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SendMessageDto,
  ): Promise<DirectMessageView> {
    const message = await this.chat.send(user.id, userId, body.body);
    this.bus.publishDirectMessage({ senderId: user.id, recipientId: userId, message });
    return message;
  }
}
