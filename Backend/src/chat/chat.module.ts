import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { SocialBusModule } from '../realtime/social-bus';
import { UsersModule } from '../users/users.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * Direct messages between friends.
 *
 * Imports `FriendsModule` because a friendship *is* the authorization for a
 * message, and `SocialBusModule` so the REST fallback can reach whoever is
 * connected without depending on the gateway that depends on this.
 */
@Module({
  imports: [FriendsModule, UsersModule, SocialBusModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
