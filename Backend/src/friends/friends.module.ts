import { Module } from '@nestjs/common';
import { SocialBusModule } from '../realtime/social-bus';
import { UsersModule } from '../users/users.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

/**
 * Friendships.
 *
 * Exports the service because it is also the authorization boundary for direct
 * messages: `areFriends` is the question `ChatService` asks before it will
 * write a row, and there must be exactly one implementation of it.
 */
@Module({
  imports: [UsersModule, SocialBusModule],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}
